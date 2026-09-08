/** Portable story state. Components are deliberately open: campaigns can invent their own mechanics. */
export interface Components extends Record<string, any> {
  exits?: Record<string, string>;
  frontier?: boolean;
  hidden?: boolean;
  open?: boolean;
  sealed?: boolean;
  privateCorrespondence?: boolean;
  readable?: string;
  portable?: boolean;
  container?: boolean;
  locked?: boolean;
  memory?: string[];
  knowledge?: string[];
  goals?: string[];
  actions?: string[];
  private?: unknown;
  secret?: unknown;
}
export type Entity = {
  id: string;
  name: string;
  kind: "place" | "person" | "object";
  description: string;
  location?: string;
  components: Components;
  actions?: string[];
};
export type Relation = {
  id: string;
  from: string;
  to: string;
  kind: string;
  data?: Record<string, any>;
};
export type Behavior = {
  id: string;
  entityId: string;
  trigger: string;
  code: string;
  state: Record<string, any>;
};
export type Story = { premise: string; arc: string[]; commitments: string[] };
export type Campaign = {
  id: string;
  title: string;
  subtitle: string;
  intro: string;
  artDirection: string;
  playerId: string;
  entities: Entity[];
  relations?: Relation[];
  behaviors?: Behavior[];
  story: Story;
};
export type JournalEntry = {
  id: string;
  tick: number;
  actor: string;
  text: string;
  kind: string;
  audience?: string[];
};
export type Scheduled = {
  id: string;
  at: number;
  entityId: string;
  trigger: string;
  payload?: any;
};
export type World = {
  campaign: string;
  title: string;
  subtitle: string;
  artDirection: string;
  playerId: string;
  tick: number;
  revision: number;
  entities: Entity[];
  relations: Relation[];
  behaviors: Behavior[];
  schedule: Scheduled[];
  story: Story;
  journal: JournalEntry[];
  artwork: Record<string, any>;
};
export type View = {
  location: Entity;
  entities: Entity[];
  inventory: Entity[];
  exits: Record<string, string>;
  events: JournalEntry[];
};
export function initialWorld(c: Campaign): World {
  const w: World = {
    campaign: c.id,
    title: c.title,
    subtitle: c.subtitle,
    artDirection: c.artDirection,
    playerId: c.playerId,
    tick: 0,
    revision: 0,
    entities: structuredClone(c.entities),
    relations: structuredClone(c.relations ?? []),
    behaviors: structuredClone(c.behaviors ?? []),
    schedule: [],
    story: structuredClone(c.story),
    journal: [
      {
        id: "opening",
        tick: 0,
        actor: c.playerId,
        text: c.intro,
        kind: "narration",
        audience: [c.playerId],
      },
    ],
    artwork: {},
  };
  validateWorld(w);
  return w;
}
export function validateWorld(w: World) {
  if (
    !w ||
    !Array.isArray(w.entities) ||
    !Array.isArray(w.behaviors) ||
    !Array.isArray(w.journal) ||
    !Array.isArray(w.schedule) ||
    !Array.isArray(w.relations) ||
    !Number.isInteger(w.tick) ||
    w.tick < 0
  )
    throw new Error("Invalid world state");
  const ids = new Set<string>();
  for (const e of w.entities) {
    if (
      !e.id ||
      ids.has(e.id) ||
      !e.name ||
      !e.components ||
      !["place", "person", "object"].includes(e.kind)
    )
      throw new Error("Invalid or duplicate entity " + e.id);
    ids.add(e.id);
  }
  for (const e of w.entities) {
    if (e.location && !ids.has(e.location)) throw new Error("Missing location " + e.location);
    let cursor = e;
    const seen = new Set<string>();
    while (cursor.location) {
      if (seen.has(cursor.id)) throw new Error("Containment cycle");
      seen.add(cursor.id);
      cursor = w.entities.find((x) => x.id === cursor.location)!;
    }
  }
  const player = w.entities.find((e) => e.id === w.playerId);
  if (!player?.location || w.entities.find((e) => e.id === player.location)?.kind !== "place")
    throw new Error("Player needs a place");
  for (const b of w.behaviors)
    if (!ids.has(b.entityId) || typeof b.code !== "string" || !b.state)
      throw new Error("Invalid behavior " + b.id);
  for (const r of w.relations)
    if (!ids.has(r.from) || !ids.has(r.to)) throw new Error("Relation endpoint missing");
  return w;
}
/** This function is self-contained so the identical API runs inside the platform's finite eval. */
export function createWorldAPI(
  world: World,
  actorId: string,
  privileged = false,
  hooks: Record<string, Function> = {}
) {
  const entity = (id: string) => {
    const e = world.entities.find((e) => e.id === id);
    if (!e) throw new Error("Unknown entity " + id);
    return e;
  };
  const actor = () => entity(actorId);
  const place = () => entity(actor().location!);
  const actionText = (verb: string) =>
    actor().name + " " + verb + (actor().name === "You" ? "" : "s");
  const visible = (e: Entity): boolean => {
    if (e.components.hidden && !privileged) return false;
    if (
      e.id === actorId ||
      e.id === actor().location ||
      e.location === actor().location ||
      e.location === actorId
    )
      return true;
    if (e.location) {
      const parent = entity(e.location);
      return parent.kind === "object" && parent.components.open === true && visible(parent);
    }
    return false;
  };
  const publicEntity = (e: Entity) => {
    const copy = structuredClone(e);
    const lifecycle = new Set([
      "enter",
      "leave",
      "take",
      "give",
      "receive",
      "speak",
      "tick",
      "open",
    ]);
    copy.actions = [
      ...new Set([
        ...(e.actions ?? []),
        ...world.behaviors
          .filter((b) => b.entityId === e.id && !lifecycle.has(b.trigger))
          .map((b) => b.trigger),
      ]),
    ];
    if (!privileged && e.id !== actorId) {
      for (const key of ["knowledge", "memory", "goals", "private", "secret"])
        delete copy.components[key];
      if (e.components.sealed || (e.location !== actorId && e.components.privateCorrespondence))
        delete copy.components.readable;
    }
    return copy;
  };
  const accessible = (id: string) => {
    const e = entity(id);
    if (!privileged && !visible(e)) throw new Error("You cannot perceive " + id + " here");
    return e;
  };
  let eventSourceId: string | undefined;
  const emit = (text: string, kind = "action", audience?: string[]) => {
    let source = entity(eventSourceId ?? actorId);
    while (source.kind !== "place" && source.location) source = entity(source.location);
    const event = {
      id: "event-" + world.revision + "-" + world.journal.length,
      tick: world.tick,
      actor: actorId,
      text,
      kind,
      audience:
        audience ??
        world.entities
          .filter((e) => e.kind === "person" && e.location === source.id)
          .map((e) => e.id),
    };
    world.journal.push(event);
    return structuredClone(event);
  };
  const observe = (): View => ({
    location: publicEntity(place()),
    entities: world.entities
      .filter(
        (e) => visible(e) && e.id !== actorId && e.id !== actor().location && e.location !== actorId
      )
      .map(publicEntity),
    inventory: world.entities.filter((e) => e.location === actorId).map(publicEntity),
    exits: { ...(place().components.exits ?? {}) },
    events: structuredClone(
      world.journal.filter((e) => !e.audience || e.audience.includes(actorId)).slice(-30)
    ),
  });
  const invoke = (entityId: string, trigger: string, payload: any = {}) => {
    for (const b of world.behaviors.filter(
      (b) => b.entityId === entityId && b.trigger === trigger
    )) {
      const fn = hooks[b.id];
      if (!fn) throw new Error("Behavior is unavailable: " + b.id);
      const previousSource = eventSourceId;
      eventSourceId = entityId;
      try {
        fn(api, b.state, payload, entity(entityId));
      } finally {
        eventSourceId = previousSource;
      }
    }
  };
  const advance = (ticks = 1) => {
    if (!Number.isInteger(ticks) || ticks < 0 || ticks > 24)
      throw new Error("Wait between zero and 24 moments");
    for (let i = 0; i < ticks; i++) {
      world.tick++;
      for (const due of world.schedule.filter((s) => s.at <= world.tick)) {
        world.schedule = world.schedule.filter((s) => s.id !== due.id);
        invoke(due.entityId, due.trigger, due.payload);
      }
      for (const entityId of new Set(
        world.behaviors.filter((b) => b.trigger === "tick").map((b) => b.entityId)
      ))
        invoke(entityId, "tick", { tick: world.tick });
    }
    return world.tick;
  };
  const api = {
    observe,
    inspect: (id: string) => publicEntity(accessible(id)),
    recall: () => structuredClone(actor().components.memory ?? []),
    relations: (id = actorId) =>
      structuredClone(
        world.relations.filter(
          (r) =>
            (r.from === id || r.to === id) &&
            (privileged || (visible(entity(r.from)) && visible(entity(r.to))))
        )
      ),
    move: (destination: string) => {
      const exits = place().components.exits ?? {};
      if (!Object.values(exits).includes(destination) && !privileged)
        throw new Error("There is no known route there");
      const target = entity(destination);
      if (target.kind !== "place") throw new Error("Destination is not a place");
      if (target.components.frontier) throw new Error("FRONTIER:" + destination);
      invoke(place().id, "leave", { destination });
      actor().location = destination;
      emit(actionText("arrive") + " at " + target.name);
      invoke(destination, "enter", { actorId });
      advance();
      return observe();
    },
    take: (id: string) => {
      const e = accessible(id);
      if (!e.components.portable) throw new Error(e.name + " cannot be carried");
      if (e.location === actorId) return publicEntity(e);
      e.location = actorId;
      emit(actionText("take") + " " + e.name);
      invoke(id, "take", { actorId });
      advance();
      return publicEntity(e);
    },
    give: (id: string, to: string) => {
      const e = entity(id);
      const receiver = accessible(to);
      if (receiver.kind !== "person" && receiver.components.container !== true)
        throw new Error("Choose a person or container");
      if (receiver.components.container && receiver.components.open !== true)
        throw new Error("The container is closed");
      if (e.location !== actorId) throw new Error("You are not carrying " + e.name);
      e.location = to;
      emit(actionText("give") + " " + e.name + " to " + entity(to).name);
      invoke(id, "give", { actorId, to });
      invoke(to, "receive", { actorId, itemId: id });
      advance();
      return publicEntity(e);
    },
    read: (id: string) => {
      const e = accessible(id);
      if (e.components.sealed) throw new Error("The seal must be opened first");
      if (e.components.privateCorrespondence && e.location !== actorId)
        throw new Error("You need custody to read this correspondence");
      if (typeof e.components.readable !== "string") throw new Error("Nothing legible here");
      emit(actionText("read") + " " + e.name, "observation", [actorId]);
      return e.components.readable;
    },
    say: (to: string, text: string) => {
      const receiver = accessible(to);
      if (receiver.kind !== "person") throw new Error("They cannot answer");
      const message = emit(actor().name + ": " + text, "speech", [actorId, to]);
      receiver.components.memory = [
        ...(receiver.components.memory ?? []),
        actor().name + " said: " + text,
      ];
      invoke(to, "speak", { actorId, text });
      advance();
      return message;
    },
    open: (id: string) => {
      const e = accessible(id);
      if (e.components.locked) throw new Error("It is locked");
      if (!e.components.container && !e.components.sealed)
        throw new Error("There is nothing to open");
      e.components.open = true;
      e.components.sealed = false;
      invoke(id, "open", { actorId });
      emit(actionText("open") + " " + e.name);
      advance();
      return publicEntity(e);
    },
    act: (id: string, action: string, payload: any = {}) => {
      accessible(id);
      if (!world.behaviors.some((b) => b.entityId === id && b.trigger === action))
        throw new Error("UNMODELED:" + id + ":" + action);
      invoke(id, action, { ...payload, actorId });
      advance();
      return observe();
    },
    wait: advance,
    remember: (text: string) => {
      actor().components.memory = [...(actor().components.memory ?? []), text];
    },
    narrate: (text: string) => emit(text, "narration", [actorId]),
    // Behavior functions use these causal primitives. Player eval receives the scoped API with these omitted.
    entity,
    emit,
    invoke,
    patch: (id: string, patch: Partial<Entity>) => Object.assign(entity(id), patch),
    relate: (r: Relation) => {
      world.relations = world.relations.filter((x) => x.id !== r.id);
      world.relations.push(r);
    },
    schedule: (entry: Scheduled) => {
      world.schedule = world.schedule.filter((s) => s.id !== entry.id);
      world.schedule.push(entry);
    },
    add: (e: Entity) => {
      if (world.entities.some((x) => x.id === e.id)) throw new Error("Entity already exists");
      world.entities.push(e);
    },
    world,
  };
  if (privileged) return api;
  const {
    entity: _entity,
    emit: _emit,
    invoke: _invoke,
    patch: _patch,
    relate: _relate,
    schedule: _schedule,
    add: _add,
    world: _world,
    ...scoped
  } = api;
  return scoped;
}
export const WORLD_API_GUIDE = `Write JavaScript using the supplied world object. Every method must be qualified: world.observe(), world.inspect(id), world.recall(), world.relations(id?), world.move(placeId), world.take(id), world.give(itemId,personId), world.read(id), world.say(personId,text), world.open(id), world.act(entityId,action,payload?), world.wait(0..24), world.remember(text), world.narrate(text). Example: const before = world.observe(); world.move(before.exits["north"]); return world.observe(); There are no standalone move(), inspect(), or other action functions. Methods are synchronous. world.say records speech; the other person's agent responds only AFTER you call finish_turn. After asking a question, finish your contribution rather than polling, waiting, or simulating their answer. world.wait advances fictional time; it does not run another agent immediately. Observing/reading is free; actions advance fictional time. Return a concise result. Only narrate outcomes the API actually establishes. An UNMODELED or FRONTIER error calls for the builder, not an invented success.`;
export type AdventureRole = "player" | "builder" | "artist" | `person:${string}`;
export type PendingTurn = {
  id: string;
  text: string;
  phase: "player" | "participants" | "builder" | "artist";
  error?: string;
  replies: string[];
  participants: string[];
  attempt: number;
  failedRole?: AdventureRole;
  diagnostic?: string;
  continuationCode?: string;
};
export type ServiceView = {
  world: World;
  view: View;
  pending: PendingTurn | null;
  seated: boolean;
  neededSeats: { role: AdventureRole; name: string }[];
};
