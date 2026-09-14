import { InteractionSchema, type Interaction } from "@workspace/living-canvas/interactions";
/** Portable story state. Components are deliberately open: campaigns can invent their own mechanics. */
export interface Components extends Record<string, any> {
  interaction?: Interaction;
  exits?: Record<string, string>;
  frontier?: boolean;
  /** Component fields whose public values affect the scene illustration. */
  visualFields?: string[];
  /** Stable physical identity, distinct from current clothing, props, goals and memories. */
  appearance?: string;
  visualAnchors?: string[];
  hidden?: boolean;
  open?: boolean;
  sealed?: boolean;
  privateCorrespondence?: boolean;
  readable?: string;
  portable?: boolean;
  container?: boolean;
  /** An inlet permits deposits while the container remains closed. */
  insertionSlot?: boolean | { maxVolume: number };
  capacity?: number;
  volume?: number;
  opaque?: boolean;
  light?: boolean;
  /** Derived public light output after physical occlusion. */
  effectiveLight?: boolean;
  /** How other participants address the player, whose UI name may be “You”. */
  roleName?: string;
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
    if (e.components.interaction) InteractionSchema.parse(e.components.interaction);
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
  class WorldActionError extends Error {
    override name = "WorldActionError";
    readonly code = "WORLD_ACTION_REFUSED";
  }
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
  const participantName = (e: Entity) =>
    e.id === world.playerId && e.name === "You"
      ? (e.components.roleName ?? "The traveller")
      : e.name;
  const publicEntity = (e: Entity) => {
    const copy = structuredClone(e);
    if (typeof e.components.light === "boolean")
      copy.components.effectiveLight =
        e.components.light &&
        !world.relations.some(
          (r) =>
            r.kind === "covers" &&
            r.to === e.id &&
            entity(r.from).components.opaque === true &&
            entity(r.from).location === e.location
        );
    if (actorId !== world.playerId) copy.name = participantName(e);
    const lifecycle = new Set([
      "enter",
      "leave",
      "take",
      "give",
      "receive",
      "speak",
      "tick",
      "open",
      "change",
      "link",
      "unlink",
      "transfer",
    ]);
    copy.actions = [
      ...new Set([
        ...world.behaviors
          .filter((b) => b.entityId === e.id && !lifecycle.has(b.trigger))
          .map((b) => b.trigger),
      ]),
    ];
    // Authored labels are not executable affordances. The behavior registry owns actions.
    delete copy.components.actions;
    if (!privileged && e.id !== actorId) {
      for (const key of ["knowledge", "memory", "goals", "private", "secret"])
        delete copy.components[key];
      if (e.components.sealed || (e.location !== actorId && e.components.privateCorrespondence))
        delete copy.components.readable;
    }
    return copy;
  };
  const accessible = (id: string) => {
    if (!world.entities.some((e) => e.id === id))
      throw new WorldActionError("Unknown entity " + id);
    const e = entity(id);
    if (!privileged && !visible(e))
      throw new WorldActionError("You cannot perceive " + id + " here");
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
      world.journal
        .filter((e) => !e.audience || e.audience.includes(actorId))
        .slice(-30)
        .map((e) =>
          actorId !== world.playerId && e.actor === world.playerId && e.kind === "speech"
            ? {
                ...e,
                text: e.text.replace(/^You:/, participantName(entity(world.playerId)) + ":"),
              }
            : e
        )
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
      throw new WorldActionError("Wait between zero and 24 moments");
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
  const transfer = (id: string, to: string, verb = "transfer") => {
    const e = accessible(id),
      receiver = accessible(to);
    if (e.kind !== "object" || !e.components.portable)
      throw new WorldActionError(e.name + " cannot be carried");
    if (e.location === to) return publicEntity(e);
    if (
      receiver.kind !== "person" &&
      receiver.kind !== "place" &&
      receiver.components.container !== true
    )
      throw new WorldActionError("Choose a person, place or container");
    let parent: Entity | undefined = receiver;
    while (parent) {
      if (parent.id === id) throw new WorldActionError("An object cannot contain itself");
      parent = parent.location ? entity(parent.location) : undefined;
    }
    const volume = e.components.volume ?? 1;
    if (!Number.isFinite(volume) || volume < 0) throw new Error("Object volume is invalid");
    const slot = receiver.components.insertionSlot;
    if (receiver.components.container && receiver.components.open !== true) {
      if (!slot) throw new WorldActionError("The container is closed");
      if (typeof slot === "object") {
        if (!Number.isFinite(slot.maxVolume) || slot.maxVolume < 0)
          throw new Error("Slot volume is invalid");
        if (volume > slot.maxVolume)
          throw new WorldActionError("The object does not fit through the slot");
      }
    }
    if (receiver.components.capacity !== undefined) {
      if (
        typeof receiver.components.capacity !== "number" ||
        !Number.isFinite(receiver.components.capacity) ||
        receiver.components.capacity < 0
      )
        throw new Error("Container capacity is invalid");
      const used = world.entities
        .filter((item) => item.location === to)
        .reduce((sum, item) => {
          const occupied = item.components.volume ?? 1;
          if (!Number.isFinite(occupied) || occupied < 0)
            throw new Error("Object volume is invalid");
          return sum + occupied;
        }, 0);
      if (used + volume > receiver.components.capacity)
        throw new WorldActionError("There is not enough capacity");
    }
    const from = e.location;
    e.location = to;
    // Physical attachments cease when an endpoint is moved; story relationships persist.
    world.relations = world.relations.filter(
      (r) => !(r.data?.["physical"] === true && (r.from === id || r.to === id))
    );
    const startedAt = world.tick;
    emit(actionText(verb) + " " + e.name + (to === actorId ? "" : " to " + receiver.name));
    invoke(id, "transfer", { actorId, from, to });
    if (to === actorId) invoke(id, "take", { actorId });
    else {
      invoke(id, "give", { actorId, to });
      invoke(to, "receive", { actorId, itemId: id });
    }
    if (world.tick === startedAt) advance();
    return publicEntity(e);
  };
  const changeComponent = (id: string, key: string, value: any) => {
    const e = accessible(id);
    const protectedKeys = [
      "private",
      "secret",
      "knowledge",
      "memory",
      "goals",
      "hidden",
      "exits",
      "frontier",
      "privateCorrespondence",
      "visualFields",
      "effectiveLight",
    ];
    const exposed = publicEntity(e).components;
    if (
      protectedKeys.includes(key) ||
      ["__proto__", "constructor", "prototype"].includes(key) ||
      (Object.hasOwn(e.components, key) && !Object.hasOwn(exposed, key))
    )
      throw new WorldActionError("This component belongs to the world mechanism");
    const previous = e.components[key];
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new WorldActionError("Use a JSON value");
    value = JSON.parse(encoded);
    const opening =
      (key === "open" && value === true && e.components.open !== true) ||
      (key === "sealed" && value === false && e.components.sealed === true);
    if (opening && e.components.locked) throw new WorldActionError("It is locked");
    e.components[key] = value;
    if (opening) {
      e.components.open = true;
      e.components.sealed = false;
    }
    const startedAt = world.tick;
    invoke(id, "change", {
      actorId,
      key,
      previous: structuredClone(previous),
      value: structuredClone(value),
    });
    if (opening) invoke(id, "open", { actorId });
    emit(
      opening
        ? actionText("open") + " " + e.name
        : actionText("adjust") + " " + e.name + " (" + key + ")"
    );
    if (world.tick === startedAt) advance();
    return publicEntity(e);
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
        throw new WorldActionError("There is no known route there");
      const target = entity(destination);
      if (target.kind !== "place") throw new WorldActionError("Destination is not a place");
      if (target.components.frontier) throw new Error("FRONTIER:" + destination);
      const origin = place();
      const departureWitnesses = world.entities
        .filter((e) => e.kind === "person" && e.id !== actorId && e.location === origin.id)
        .map((e) => e.id);
      invoke(origin.id, "leave", { destination });
      emit(actionText("leave") + " " + origin.name, "action", departureWitnesses);
      actor().location = destination;
      emit(actionText("arrive") + " at " + target.name);
      invoke(destination, "enter", { actorId });
      advance();
      return observe();
    },
    transfer: (id: string, to: string) => transfer(id, to),
    take: (id: string) => transfer(id, actorId, "take"),
    give: (id: string, to: string) => {
      const item = accessible(id);
      if (item.location !== actorId)
        throw new WorldActionError("You are not carrying " + item.name);
      return transfer(id, to, "give");
    },
    getComponent: (id: string, key: string) =>
      structuredClone(publicEntity(accessible(id)).components[key]),
    setComponent: changeComponent,
    link: (from: string, to: string, kind: string, data: Record<string, any> = {}) => {
      const source = accessible(from),
        target = accessible(to);
      if (from === to) throw new WorldActionError("Choose two different objects");
      if (kind === "covers") {
        if (
          source.kind !== "object" ||
          source.components.opaque !== true ||
          target.kind !== "object" ||
          typeof target.components.light !== "boolean"
        )
          throw new WorldActionError("An opaque object can cover a light source");
        if (source.location !== target.location)
          throw new WorldActionError("Place the cover alongside the light first");
      }
      const relation = {
        id: "physical-" + world.revision + "-" + world.tick + "-" + world.relations.length,
        from,
        to,
        kind,
        data: { ...structuredClone(data), physical: true },
      };
      const startedAt = world.tick;
      // Handlers validate the proposed connection before it becomes a fact.
      invoke(from, "link", { actorId, relation: structuredClone(relation) });
      invoke(to, "link", { actorId, relation: structuredClone(relation) });
      world.relations.push(relation);
      emit(actionText("connect") + " " + source.name + " to " + target.name + " (" + kind + ")");
      if (world.tick === startedAt) advance();
      return structuredClone(relation);
    },
    unlink: (id: string) => {
      const r = world.relations.find((r) => r.id === id);
      if (!r || r.data?.["physical"] !== true)
        throw new WorldActionError("Choose a physical connection");
      accessible(r.from);
      accessible(r.to);
      const startedAt = world.tick;
      invoke(r.from, "unlink", { actorId, relation: structuredClone(r) });
      invoke(r.to, "unlink", { actorId, relation: structuredClone(r) });
      world.relations = world.relations.filter((r) => r.id !== id);
      emit(actionText("disconnect") + " " + entity(r.from).name + " from " + entity(r.to).name);
      if (world.tick === startedAt) advance();
    },
    read: (id: string) => {
      const e = accessible(id);
      if (e.components.sealed) throw new WorldActionError("The seal must be opened first");
      if (e.components.privateCorrespondence && e.location !== actorId)
        throw new WorldActionError("You need custody to read this correspondence");
      if (typeof e.components.readable !== "string")
        throw new WorldActionError("Nothing legible here");
      emit(actionText("read") + " " + e.name, "observation", [actorId]);
      return e.components.readable;
    },
    say: (to: string, text: string) => {
      const receiver = accessible(to);
      if (receiver.kind !== "person") throw new WorldActionError("They cannot answer");
      const message = emit(actor().name + ": " + text, "speech", [actorId, to]);
      receiver.components.memory = [
        ...(receiver.components.memory ?? []),
        participantName(actor()) + " said: " + text,
      ];
      invoke(to, "speak", { actorId, text });
      advance();
      return message;
    },
    open: (id: string) => {
      const e = accessible(id);
      if (e.components.locked) throw new WorldActionError("It is locked");
      if (!e.components.container && !e.components.sealed)
        throw new WorldActionError("There is nothing to open");
      return changeComponent(id, "open", true);
    },
    act: (id: string, action: string, payload: any = {}) => {
      accessible(id);
      if (!world.behaviors.some((b) => b.entityId === id && b.trigger === action))
        throw new Error("UNMODELED:" + id + ":" + action);
      const startedAt = world.tick;
      invoke(id, action, { ...payload, actorId });
      if (world.tick === startedAt) advance();
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
export const WORLD_API_GUIDE = `Write JavaScript using the supplied world object. Compose entity, component and physical-relation operations for open-ended intentions; named verbs are conveniences. All methods are synchronous and must be qualified as world.method(...).

Data shapes:
- world.observe() returns {location, entities, inventory, exits, events}. location is the current place Entity. entities contains other visible entities nearby; it excludes the actor, current place and directly carried inventory. inventory is a separate Entity[] of directly carried items. exits maps route labels to destination IDs. events contains recent events witnessed by this actor. There is no self or actor field inside observe(); the caller supplies the actor identity separately.
- Entity is {id, name, kind, description, location?, components, actions?}. location on an Entity is a container/person/place ID, not another Entity. Component fields live under entity.components. Projections are detached copies with private/unreadable content omitted; editing these copies does not change the world.
- world.inspect(id) returns one accessible Entity by its exact ID, including carried items. Find available objects in [...world.observe().entities, ...world.observe().inventory], or inspect a known ID directly. Check a search result before using its id. world.getComponent(id,key) returns the public component value or undefined, as a detached copy.

Manipulation:
- world.transfer(itemId,toId), world.take(itemId), world.give(itemId,toId) return the moved Entity. Transfer moves accessible portable objects to reachable people, places or containers using shared volume/capacity/slot checks. Take moves into the actor's inventory; give requires the item already be carried.
- world.setComponent(id,key,value) changes public components of accessible entities, including new JSON values, runs authored change behavior, and returns the updated Entity. Private/structural fields remain mechanism-owned. Opening obeys the same lock, seal and open-hook rules as world.open(id), which also returns the opened Entity.
- world.link(fromId,toId,kind,data?) returns {id,from,to,kind,data}. Physical/descriptive link kinds are open-ended; optional link handlers constrain effects. The covers relation connects an opaque object alongside a light at the same location and changes its public effectiveLight. Public links carry data.physical:true and never grant institutional authority. world.unlink(relationId) removes a physical connection and returns undefined; authored story relationships remain mechanism-owned.
- world.move(placeId) and world.act(entityId,action,payload?) return the updated observe() view. act invokes an existing authored mechanism; its available custom triggers appear in Entity.actions. world.wait(0..24) advances fictional time and returns the resulting tick.

Information and conversation:
- world.read(id) returns readable text and records an observation without advancing time; sealed/private correspondence must be accessible under its reading rules. world.relations(id?) returns public Relation[] touching the supplied ID, defaulting to the actor. world.recall() returns the actor's memory string[]. world.remember(text) records personal memory and returns undefined.
- world.say(personId,text) returns the speech JournalEntry; world.narrate(text) returns a narration JournalEntry. Entries contain id,tick,actor,text,kind,audience. Say records speech; the other person's agent responds only AFTER you call finish_turn. After asking a question, finish your contribution rather than polling, waiting or simulating their answer. world.wait advances fictional time; it does not run another agent immediately.

Observing, inspecting and reading are free; physical actions advance fictional time. Return a concise result and narrate only outcomes the API establishes. UNMODELED or FRONTIER means the builder must extend the world, not that an outcome may be invented. Example: const view = world.observe(); const destination = Object.values(view.exits)[0]; if (destination) world.move(destination); return world.observe();`;
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
  purpose?: "frontier" | "extension" | "repair";
  continuationCode?: string;
};
export type ServiceView = {
  world: World;
  view: View;
  pending: PendingTurn | null;
  background: {
    scene: {
      id: string;
      placeId: string;
      signature: string;
      status: "queued" | "painting" | "error";
      error?: string;
      preparing?: string[];
    } | null;
  };
  visual: { signature: string; artworkSignature?: string; fresh: boolean; references?: Record<string, string> };
  seated: boolean;
  neededSeats: { role: AdventureRole; name: string }[];
};
