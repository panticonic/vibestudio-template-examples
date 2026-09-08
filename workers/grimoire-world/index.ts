import { runWorldCode } from "@workspace/living-canvas/execution";
import { parse } from "acorn";
import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";
import {
  initialGame,
  pulseGarden,
  visitResident,
  validateGarden,
  finishTurn,
  finished,
  type Game,
  StirSchema,
  type Life,
} from "@workspace/grimoire-engine";

type Seat = { targetId: string; channelId: string; role: "wild" | "moth" };
type Pending = {
  id: string;
  wish: string;
  started: number;
  attempt: number;
  error: string | null;
  life: Life;
  manifestation: string;
  reply: string;
  version: number;
};
type Stored = {
  game: Game;
  seats: Seat[];
  pending: Pending | null;
  revision: number;
  wild: { id: string; revision: number; wish: string; life: Life } | null;
  manifestation: string;
  notice: string;
};

/** One durable story per key. Pending turns survive reloads and agent delivery failures. */
export class GrimoireWorldDO extends DurableObjectBase {
  static override schemaVersion = 4;
  protected override requiredTables() {
    return ["living_garden", "living_receipts", "story_art"];
  }
  protected createTables() {
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS story_art (id TEXT PRIMARY KEY, body TEXT NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS living_receipts (id TEXT PRIMARY KEY, wish TEXT NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS living_garden (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)",
    );
  }
  private load(): Stored {
    this.ensureReady();
    const row = this.sql
      .exec<{ body: string }>("SELECT body FROM living_garden WHERE id=1")
      .toArray()[0];
    return row
      ? JSON.parse(row.body)
      : {
          game: initialGame(),
          seats: [],
          pending: null,
          revision: 0,
          wild: null,
          manifestation: "",
          notice: "",
        };
  }
  private save(state: Stored) {
    this.sql.exec(
      "INSERT INTO living_garden(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      JSON.stringify(state),
    );
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  artCatalog() {
    this.ensureReady();
    return Object.fromEntries(
      this.sql
        .exec<{ id: string; body: string }>("SELECT id,body FROM story_art")
        .toArray()
        .map((row) => {
          const art = JSON.parse(row.body);
          return [row.id, { path: art.path, mimeType: art.mimeType }];
        }),
    );
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  async getArt(input: { ids: string[] }) {
    this.ensureReady();
    if (!Array.isArray(input.ids) || input.ids.length > 6)
      throw new Error("Request at most six images.");
    const entries = await Promise.all(
      input.ids.map(async (id) => {
        const row = this.sql
          .exec<{ body: string }>("SELECT body FROM story_art WHERE id=?", id)
          .toArray()[0];
        if (!row) throw new Error("Unknown artwork.");
        const art = JSON.parse(row.body);
        const data = await this.rpc.call<string | null>(
          "main",
          "blobstore.getText",
          [art.dataRef.digest],
        );
        if (data === null)
          throw new Error("The artwork could not be retrieved.");
        return [id, { path: art.path, mimeType: art.mimeType, data }];
      }),
    );
    return Object.fromEntries(entries);
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async storeArt(input: {
    id: string;
    path: string;
    data: string;
    mimeType: string;
  }) {
    const s = this.load();
    if (
      this.rpcCallerKind !== "do" ||
      this.rpcCallerId !== s.seats.find((p) => p.role === "moth")?.targetId
    )
      throw new Error("Only this world's artist may store artwork.");
    if (!s.pending) throw new Error("No conversation is pending.");
    if (
      !/^[a-z0-9-]{1,100}$/.test(input.id) ||
      input.mimeType !== "image/png" ||
      typeof input.data !== "string" ||
      input.data.length > 16000000 ||
      !input.data.startsWith("iVBOR")
    )
      throw new Error("Invalid PNG artwork.");
    if (
      typeof input.path !== "string" ||
      !input.path.startsWith("panels/grimoire/assets/generated/")
    )
      throw new Error("Artwork must use the game's asset directory.");
    const dataRef = await this.rpc.call<{ digest: string; size: number }>(
      "main",
      "blobstore.putText",
      [input.data],
    );
    if (this.load().pending?.id !== s.pending.id)
      throw new Error("The conversation ended before the artwork was saved.");
    this.sql.exec(
      "INSERT INTO story_art(id,body) VALUES(?,?)",
      input.id,
      JSON.stringify({
        id: input.id,
        path: input.path,
        mimeType: input.mimeType,
        dataRef,
      }),
    );
    return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  reply(input: { turnId: string; text: string }) {
    const s = this.load();
    this.moth(s, input.turnId);
    if (!input.text || input.text.length > 600)
      throw new Error("Keep the reply brief.");
    s.pending!.reply = input.text;
    this.save(s);
    return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async weave(input: { turnId: string; code: string }) {
    const s = this.load();
    this.moth(s, input.turnId);
    if (typeof input.code !== "string" || input.code.length > 24000)
      throw new Error("Keep the enchantment within 24000 characters.");
    const ast = parse(
      "function enchant(garden,events){\n" + input.code + "\n}",
      { ecmaVersion: 2022 },
    );
    if (ast.body.length !== 1 || ast.body[0]?.type !== "FunctionDeclaration")
      throw new Error("Write only the enchantment function body.");
    const result = (await runWorldCode(
      (method, args) => this.rpc.call("main", method, args),
      `const garden=${JSON.stringify(s.pending!.life.garden)},events=[];const enchant=function(garden,events){\n${input.code}\n};enchant(garden,events);return {garden,events};`,
    )) as { garden: unknown; events: unknown };
    const garden = validateGarden(result.garden);
    if (
      !Array.isArray(result.events) ||
      result.events.some((x) => typeof x !== "string" || x.length > 400)
    )
      throw new Error("Describe the observed changes briefly.");
    const current = this.load();
    this.moth(current, input.turnId);
    if (current.pending!.version !== s.pending!.version)
      throw new Error(
        "The garden changed while you were weaving. Read it again.",
      );
    garden.traces = result.events.slice(-8);
    current.pending!.life.garden = garden;
    current.pending!.version++;
    this.save(current);
    return { garden, events: result.events };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async linger(input: { id: string }) {
    this.player();
    const s = this.load();
    if (s.pending) throw new Error("Let this conversation finish first.");
    if (
      this.sql
        .exec("SELECT id FROM living_receipts WHERE id=?", input.id)
        .toArray().length
    )
      return this.getGame();
    const rules = s.game.life.garden.rules;
    for (const rule of rules) {
      const ast = parse(
        "function rule(garden,state,events){\n" + rule.code + "\n}",
        { ecmaVersion: 2022 },
      );
      if (ast.body.length !== 1 || ast.body[0]?.type !== "FunctionDeclaration")
        throw new Error("An enchantment needs repair.");
    }
    const code = `const garden=${JSON.stringify(s.game.life.garden)},events=[];${rules.map((rule, i) => `(function(garden,state,events){\n${rule.code}\n})(garden,garden.rules[${i}].state,events);`).join("\n")}(${pulseGarden.toString()})(garden,events);return garden;`;
    const garden = validateGarden(
      await runWorldCode(
        (method, args) => this.rpc.call("main", method, args),
        code,
      ),
    );
    const current = this.load();
    if (current.revision !== s.revision || current.pending)
      throw new Error("The garden changed; take another moment.");
    current.game.life.garden = garden;
    current.revision++;
    current.notice =
      garden.traces[0] ??
      "A little time passes. The garden keeps its own company.";
    this.ctx.storage.transactionSync(() => {
      this.save(current);
      this.sql.exec(
        "INSERT INTO living_receipts(id,wish) VALUES(?,?)",
        input.id,
        "linger",
      );
    });
    await this.wakeWild(
      "The player lingered and observed: " + garden.traces.join(" "),
    );
    return this.getGame();
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async visit(input: { residentId: string }) {
    this.player();
    const s = this.load();
    if (s.pending) throw new Error("Let this conversation finish first.");
    s.notice = visitResident(s.game.life.garden, input.residentId);
    s.revision++;
    this.save(s);
    return this.getGame();
  }
  private moth(s: Stored, turnId: string) {
    if (
      this.rpcCallerKind !== "do" ||
      this.rpcCallerId !== s.seats.find((p) => p.role === "moth")?.targetId
    )
      throw new Error("Only Moth may weave.");
    if (s.pending?.id !== turnId)
      throw new Error("This conversation has ended.");
  }
  private async wakeWild(wish: string) {
    const s = this.load(),
      seat = s.seats.find((p) => p.role === "wild");
    if (!seat) return;
    s.wild = {
      id: crypto.randomUUID(),
      revision: s.revision,
      wish,
      life: structuredClone(s.game.life),
    };
    this.save(s);
    try {
      await this.rpc.call(seat.targetId, "receiveMoment", [
        {
          channelId: seat.channelId,
          steeringId: "wild:" + this.objectKey + ":" + s.wild.id,
        },
      ]);
    } catch {
      /* The next world-changing visit wakes this independent observer again. */
    }
  }
  private player() {
    if (this.rpcCallerKind === "do")
      throw new Error("Only the player may begin or cancel a turn.");
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  getGame() {
    const s = this.load();
    return {
      game: s.game,
      pending: s.pending,
      seated: s.seats.length === 2,
      notice: s.notice,
      garden: s.pending?.life?.garden ?? s.game.life.garden,
    };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  registerParticipant(input: Seat) {
    this.player();
    if (
      !input.targetId ||
      !input.channelId ||
      !["wild", "moth"].includes(input.role)
    )
      throw new Error("The storyteller did not arrive.");
    const s = this.load();
    s.seats = [...s.seats.filter((p) => p.role !== input.role), input];
    this.save(s);
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async play(input: { id: string; wish: string }) {
    this.player();
    const s = this.load();
    if (typeof input.id !== "string" || input.id.length > 100 || !input.id)
      throw new Error("Invalid turn id.");
    if (
      typeof input.wish !== "string" ||
      !input.wish.trim() ||
      input.wish.length > 500
    )
      throw new Error("Use between 1 and 500 characters.");
    const receipt = this.sql
      .exec<{
        wish: string;
      }>("SELECT wish FROM living_receipts WHERE id=?", input.id)
      .toArray()[0];
    if (receipt) {
      if (receipt.wish !== input.wish.trim())
        throw new Error("A different wish used that turn id.");
      return this.getGame();
    }
    if (s.pending) {
      if (s.pending.id === input.id && s.pending.wish === input.wish.trim())
        return this.getGame();
      throw new Error("A moment is already unfolding.");
    }
    if (finished(s.game)) throw new Error("This story is complete.");
    if (s.seats.length !== 2)
      throw new Error("Your storyteller is still arriving. Please try again.");
    s.pending = {
      id: input.id,
      wish: input.wish.trim(),
      started: Date.now(),
      attempt: 0,
      error: null,
      life: structuredClone(s.game.life),
      manifestation: s.manifestation,
      reply: "",
      version: 0,
    };
    this.save(s);
    await this.deliver();
    return this.getGame();
  }
  private async deliver() {
    const s = this.load();
    if (!s.pending) return;
    const seat = s.seats.find((p) => p.role === "moth");
    if (!seat) return;
    const { id, attempt } = s.pending;
    try {
      await this.rpc.call(seat.targetId, "receiveMoment", [
        {
          channelId: seat.channelId,
          steeringId: `grimoire:${this.objectKey}:${id}:${seat.role}:${attempt}`,
        },
      ]);
    } catch (error) {
      const current = this.load();
      if (current.pending?.id === id && current.pending.attempt === attempt) {
        current.pending.error =
          error instanceof Error ? error.message : String(error);
        this.save(current);
      }
    }
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "read",
  })
  perspective() {
    const s = this.load(),
      seat = s.seats.find((p) => p.targetId === this.rpcCallerId);
    if (this.rpcCallerKind !== "do" || !seat)
      throw new Error("Only a seated agent may read this perspective.");
    if (seat.role === "wild")
      return {
        game: { ...s.game, life: s.wild?.life ?? s.game.life },
        pending: s.wild,
      };
    const { life, ...game } = s.game;
    const { life: privateLife, ...pending } = s.pending ?? { life: null };
    return {
      game: {
        ...game,
        garden: s.pending?.life?.garden ?? life.garden,
        discoveries: life.garden.discoveries,
        manifestation: s.manifestation,
      },
      pending: s.pending ? pending : null,
    };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async stir(input: { id: string; result: unknown }) {
    const s = this.load();
    if (
      this.rpcCallerKind !== "do" ||
      this.rpcCallerId !== s.seats.find((p) => p.role === "wild")?.targetId
    )
      throw new Error("Only the wild may author its private life.");
    if (
      !s.wild ||
      s.wild.id !== input.id ||
      s.wild.revision !== s.revision ||
      s.pending
    )
      return { superseded: true };
    const result = StirSchema.parse(input.result);
    s.game.life.beings = result.beings;
    s.game.life.mysteries = result.mysteries;
    s.manifestation = result.manifestation;
    s.wild = null;
    this.save(s);
    return { ok: true };
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async retry() {
    this.player();
    const s = this.load();
    if (s.pending) {
      s.pending.attempt++;
      s.pending.started = Date.now();
      s.pending.error = null;
      this.save(s);
      await this.deliver();
    }
    return this.getGame();
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  cancel() {
    this.player();
    const s = this.load();
    s.pending = null;
    this.save(s);
    return this.getGame();
  }
  @rpc({
    website: {
      kind: "closed",
      reason:
        "This receiver serves installed workspace applications and their agents.",
    },
    principals: ["host", "user", "code"],
    effect: { kind: "open" },
    tier: "open",
    sensitivity: "write",
  })
  async finish(input: { id: string; result: unknown }) {
    const s = this.load();
    if (
      this.rpcCallerKind !== "do" ||
      this.rpcCallerId !== s.seats.find((p) => p.role === "moth")?.targetId
    )
      throw new Error("Only this story's agent may finish a moment.");
    if (
      this.sql
        .exec("SELECT id FROM living_receipts WHERE id=?", input.id)
        .toArray().length
    )
      return { ok: true };
    if (!s.pending || s.pending.id !== input.id)
      throw new Error(
        "That moment is no longer pending. Do not change the story.",
      );
    s.game = finishTurn(
      s.game,
      input.id,
      s.pending.wish,
      input.result,
      s.pending.life,
    );
    for (const id of s.game.scene.assets ?? [])
      if (
        !this.sql.exec("SELECT id FROM story_art WHERE id=?", id).toArray()
          .length
      )
        throw new Error("Save artwork before using it in a scene.");
    const wish = s.pending.wish;
    s.pending = null;
    s.revision++;
    this.ctx.storage.transactionSync(() => {
      this.save(s);
      this.sql.exec(
        "INSERT INTO living_receipts(id,wish) VALUES(?,?)",
        input.id,
        wish,
      );
    });
    await this.wakeWild(wish);
    return { ok: true };
  }
}
export default {
  fetch() {
    return new Response("grimoire story service");
  },
};
