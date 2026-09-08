import type { Campaign, Entity, Relation, View, World } from "@workspace/adventure-engine";

const place = (
  id: string,
  name: string,
  description: string,
  exits: Record<string, string>,
  extra: Record<string, unknown> = {}
): Entity => ({
  id,
  name,
  kind: "place",
  description,
  components: { exits, ...extra },
});
const person = (
  id: string,
  name: string,
  location: string,
  description: string,
  goals: string[],
  knowledge: string[]
): Entity => ({
  id,
  name,
  kind: "person",
  location,
  description,
  components: { goals, knowledge, memory: [] },
});
const object = (
  id: string,
  name: string,
  location: string,
  description: string,
  components: Record<string, unknown> = {}
): Entity => ({
  id,
  name,
  kind: "object",
  location,
  description,
  components,
});

export const deadLetterOffice: Campaign = {
  id: "dead-letter-office",
  title: "The Dead Letter Office",
  subtitle: "Some letters outlive their senders.",
  intro:
    "The last ferry has gone. In your satchel is a letter addressed to a woman who drowned thirty years ago. From the customs-house window, someone taps twice on the glass. She is holding an identical envelope.",
  artDirection:
    "Classic literary adventure, intricate oil painting and copperplate detail. Bellwether is a late nineteenth-century tidal harbour of slate roofs, wet cobbles, brass postboxes, sea-green timber and warm windows. Deep petrol blue, tarnished gold, sea mist and peach lantern light. Humane faces, readable architecture and consistent object silhouettes. The sorting cabinet has twelve brass pigeonholes and a small blue glass tide dial. The player's letter is cream rag paper with a red wax seal depicting a double lighthouse. No UI or text embedded in scene art. Preserve established architecture and prop positions using previous scene references.",
  playerId: "courier",
  story: {
    premise:
      "Deliver impossible correspondence in a harbour that quietly erased the people lost in an avoidable flood. The letters restore relationships, not simply names in a ledger.",
    arc: [
      "Discover that dead addressees still receive post at low tide.",
      "Trace the diverted warning letters and the customs clerk's part in the disaster.",
      "Choose how Bellwether remembers its dead and whether the last ferry carries a living passenger back.",
    ],
    commitments: [
      "The beacon casts a second shadow only when a letter is being answered.",
      "Mara Vale drowned thirty years ago after the warning mail was impounded.",
      "The player may open, copy, deliver, conceal or discuss letters; none of these choices may silently destroy the only route forward.",
      "Elin has an identical envelope because Mara wrote to her daughter. She is not a villain awaiting exposure.",
      "The drowned quarter is reachable at low fictional tide. Real elapsed time never closes a player's opportunity.",
      "Resolve small deliveries warmly while the larger mystery develops; honour lateral solutions and remembered promises.",
    ],
  },
  entities: [
    place(
      "landing",
      "The Ferry Landing",
      "Rain shines on the causeway. The customs house glows above the tide steps; across the water, the beacon throws one long shadow.",
      { "Customs house": "customs", "Along the quay": "quay" },
      {
        visualFields: ["tide", "weather"],
        tide: "falling",
        weather: "fine rain",
        visualAnchors: ["green-black customs house", "brass postbox", "distant white lighthouse"],
      }
    ),
    place(
      "customs",
      "The Dead Letter Office",
      "Twelve brass pigeonholes fill a walnut cabinet behind the counter. Its blue tide dial moves against the clock. Undelivered parcels scent the room with dust and orange peel.",
      { "Ferry landing": "landing", "Records stair": "archive" }
    ),
    place(
      "quay",
      "Lantern Quay",
      "A row of lamps follows the harbour wall. The Lantern Inn is open. A chained ferry strains against its mooring beside a customs notice.",
      {
        "Ferry landing": "landing",
        "Lantern Inn": "inn",
        "Tide steps": "drowned-quarter",
      }
    ),
    place(
      "archive",
      "The Customs Archive",
      "Above the office, thirty years of manifests preserve a conspicuous gap during the night of the flood.",
      { Downstairs: "customs" },
      { frontier: true }
    ),
    place(
      "inn",
      "The Lantern Inn",
      "A family-run inn where a retired optician waits each evening for a parcel she can no longer read the address on.",
      { Quay: "quay" },
      { frontier: true }
    ),
    place(
      "drowned-quarter",
      "The Drowned Quarter",
      "A submerged neighbourhood whose upper windows emerge at low tide. Postal routes and lived relationships survive beneath the water.",
      { "Tide steps": "quay" },
      {
        frontier: true,
        requires: "A safe low-tide route or a boat; accept inventive practical alternatives.",
      }
    ),
    person(
      "courier",
      "You",
      "landing",
      "A newly appointed courier with a weatherproof satchel.",
      ["Deliver the letter to Mara Vale."],
      []
    ),
    person(
      "elin",
      "Elin Vale",
      "customs",
      "A precise, tired clerk with ink on her thumb and a blue wool cardigan.",
      [
        "Find out whether her mother's reply is real.",
        "Keep the records safe without repeating the old concealment.",
      ],
      [
        "Mara Vale was my mother.",
        "The sorting cabinet responds to truthful addresses, not legal status.",
        "The old flood-warning manifest is upstairs.",
      ]
    ),
    person(
      "tomas",
      "Tomas Reed",
      "quay",
      "A ferryman with a patched ochre coat and a boat he cannot legally move.",
      [
        "Recover the ferry permit or obtain another lawful authorization.",
        "Take one last message to his brother in the drowned quarter.",
      ],
      [
        "The tide steps become walkable after two harbour bells.",
        "The missing permit is in the cabinet's Salt Street drawer. A current relief warrant is also valid harbour authority.",
      ]
    ),
    object(
      "harbour-lamp",
      "The harbour lamp",
      "landing",
      "A hooded amber lamp stands beside the tide steps, casting a bright reflection over the dark water. Its cool outer hood can safely take a cloth cover.",
      { light: true, visualFields: ["light", "effectiveLight"] }
    ),
    object(
      "oilskin-wrap",
      "The oilskin wrap",
      "courier",
      "A folded square of opaque oiled canvas, used to keep the post dry. It is broad enough to cover a lamp's hood.",
      { portable: true, opaque: true, material: "oiled canvas", volume: 1 }
    ),
    object(
      "canvas-cover",
      "The canvas cover",
      "landing",
      "A spare square of thick, opaque sailcloth hangs on a dry hook beneath the bell canopy.",
      { portable: true, opaque: true, material: "sailcloth", volume: 1 }
    ),
    object(
      "customs-window",
      "The woman at the customs-house window",
      "landing",
      "Through the lit window, a woman in a blue wool cardigan holds up a cream envelope with a red double-lighthouse seal. She gestures toward the customs-house door. You can meet her inside.",
      { depicts: "elin" }
    ),
    object(
      "mara-letter",
      "The double-sealed letter",
      "courier",
      "A cream envelope, addressed to Mara Vale, 14 Salt Street. Red wax bears two lighthouses.",
      {
        portable: true,
        sealed: true,
        addressee: "Mara Vale",
        readable:
          "Mara—The warning never reached you. I will be at the old ferry steps when the second shadow falls. Please let me explain. —E.",
        visualIdentity: "cream rag paper; red double-lighthouse seal",
      }
    ),
    object(
      "satchel",
      "Courier's satchel",
      "courier",
      "Soft brown leather with a polished brass clasp.",
      { portable: true, container: true }
    ),
    object(
      "sorting-cabinet",
      "The sorting cabinet",
      "customs",
      "Twelve brass pigeonholes and a blue glass tide dial. The open frame holds closed drawers; a narrow sorting slot accepts addressed mail. Each address opens its proper drawer. The blue dial indicates the tide; it is not a handle.",
      {
        container: true,
        open: true,
        insertionSlot: { maxVolume: 1 },
        slots: 12,
        routingTable: {
          "mara vale": { destination: "drowned-quarter", drawer: "salt-street-drawer" },
          "salt street ferry office": {
            destination: "drowned-quarter",
            drawer: "salt-street-drawer",
          },
          "elin vale": { destination: "customs", drawer: "current-post-drawer" },
        },
      }
    ),
    object(
      "salt-street-drawer",
      "The Salt Street drawer",
      "sorting-cabinet",
      "A closed brass drawer marked with the old Salt Street delivery route. Its lock is connected to the cabinet's sorting mechanism.",
      { container: true, locked: true, open: false, insertionSlot: { maxVolume: 1 }, capacity: 12 }
    ),
    object(
      "current-post-drawer",
      "The current-post drawer",
      "sorting-cabinet",
      "A separate brass drawer for present-day correspondence. It does not share the Salt Street clearance mechanism.",
      { container: true, locked: true, open: false, insertionSlot: { maxVolume: 1 }, capacity: 12 }
    ),
    object(
      "permit",
      "The ferry permit",
      "salt-street-drawer",
      "A green official card trapped behind the returned-mail drawer.",
      {
        portable: true,
        document: true,
        readable:
          "Bellwether Harbour navigation permit. Master: Tomas Reed. Valid when the Salt Street returned-mail clearance is recorded. Issued by Elin Vale.",
      }
    ),
    object(
      "relief-warrant",
      "The harbour relief warrant",
      "customs",
      "A signed blue warrant clipped to the public counter. Emergency post and relief boats are exempt from the old returned-mail impound.",
      {
        portable: true,
        document: true,
        readable:
          "Elin Vale authorizes Tomas Reed's ferry to carry relief and correspondence through Bellwether Harbour. This current warrant is valid independently of the older navigation permit.",
      }
    ),
    object(
      "salt-street-circular",
      "The Salt Street circular",
      "customs",
      "A folded flood-watch circular addressed to the Salt Street Ferry Office. The address is old, but perfectly legible.",
      {
        portable: true,
        addressee: "Salt Street Ferry Office",
        readable:
          "To the Salt Street Ferry Office: keep a lamp at the tide steps until every household has received the warning. —Harbour watch",
      }
    ),
    object(
      "blank-postcard",
      "The blank postcard",
      "customs",
      "A sturdy piece of cream postal card lies beside the counter pencil. There is room to write an address of your own.",
      { portable: true, material: "paper", readable: "" }
    ),
    object(
      "elin-letter",
      "Elin's envelope",
      "elin",
      "A matching cream envelope, its seal already broken.",
      {
        portable: true,
        addressee: "Elin Vale",
        readable:
          "My little wren, I heard you through the rain. I have kept a light for you. —Mother",
      }
    ),
    object(
      "harbour-bell",
      "The harbour bell",
      "landing",
      "A bronze bell suspended under a salt-worn timber canopy.",
      { actions: ["Ring the bell"], rings: 0 }
    ),
    object(
      "ferry",
      "The impounded ferry",
      "quay",
      "A low wooden ferry with an amber lantern and a sturdy bow chain.",
      { locked: true, capacity: 6 }
    ),
  ],
};

export const missingCountry: Campaign = {
  id: "missing-country",
  title: "The Embassy of a Missing Country",
  subtitle: "A nation begins with someone who remembers.",
  intro:
    "At nine, you inherit an embassy. At ten, the city registry informs you that your country does not exist. At eleven, a woman arrives with a passport, a sleeping child, and a train ticket for a border that vanished last night.",
  artDirection:
    "Lavish classic European illustrated adventure, painterly architectural precision and soft cinematic light. An impossible early twentieth-century embassy: ivory limestone, tall arched windows, faded rose damask, burgundy velvet, verdigris brass, intricate parquet. Antique diplomatic stationery and restrained art-nouveau motifs. Morning light in dusty gold, muted celadon shadows, deep carmine accents. The country of Orison is symbolized by a small silver moth over three blue waves. Elegance with signs of ordinary life: tea, a child's coat, repaired upholstery. No game UI or lettering baked into artwork. Preserve room geometry and individual appearance from references.",
  playerId: "ambassador",
  story: {
    premise:
      "Recognition is something people and institutions do. Rebuild the vanished country of Orison through hospitality, testimony and negotiated commitments, deciding what deserves to survive its old regime.",
    arc: [
      "Offer refuge before the embassy's diplomatic status expires.",
      "Reconstruct Orison from conflicting witnesses, objects and institutional records.",
      "Choose what the restored country promises its people, and secure recognition on those terms.",
    ],
    commitments: [
      "Orison genuinely existed. Its erasure is not revealed to be a dream.",
      "A seal alone does not create recognition; an institution or person must knowingly accept the commitment.",
      "Refugees have names, goals and differing memories; they are collaborators, not collectible evidence.",
      "Ada does not want the old monarchy restored simply to retrieve her home.",
      "The city registrar is constrained by an inconsistent registry and can become an ally.",
      "Clocks advance through meaningful play; bureaucracy must offer negotiations and lateral routes, not repetitive form-filling.",
    ],
  },
  entities: [
    place(
      "vestibule",
      "The Embassy Vestibule",
      "A winter garden beyond the glass doors catches the morning light. The front desk has a telephone, an empty visitors' book, and one unopened official notice.",
      { "Reception salon": "salon", "Outside, to Registry Square": "square" },
      {
        visualAnchors: ["ivory arched vestibule", "burgundy stair runner", "silver moth crest"],
      }
    ),
    place(
      "salon",
      "The Reception Salon",
      "Faded damask, a samovar and chairs arranged for a delegation that has not arrived. Three blue waves wind around a painted ceiling.",
      {
        Vestibule: "vestibule",
        "Map room": "map-room",
        "Winter garden": "garden",
      }
    ),
    place(
      "square",
      "Registry Square",
      "Trams loop around a municipal clock. The embassy's name has disappeared from the stone directory, leaving a clean rectangle.",
      {
        Embassy: "vestibule",
        "City Registry": "registry",
        "Station arcade": "station",
      }
    ),
    place(
      "map-room",
      "The Map Room",
      "Layers of official maps disagree about the place occupied by Orison. One map retains roads but no country name.",
      { Salon: "salon" },
      { frontier: true }
    ),
    place(
      "garden",
      "The Winter Garden",
      "Orange trees planted by successive ambassadors bear handwritten dedication tags; some still remember a coastline.",
      { Salon: "salon" },
      { frontier: true }
    ),
    place(
      "registry",
      "The City Registry",
      "An institution whose ledgers cannot reconcile living citizens with a missing sovereign entry.",
      { Square: "square" },
      { frontier: true }
    ),
    place(
      "station",
      "The Station Arcade",
      "The last Orison train stands on a platform no longer listed on the departure board.",
      { "Registry Square": "square" },
      { frontier: true }
    ),
    person(
      "ambassador",
      "You",
      "vestibule",
      "An unexpected inheritor with a key and no instructions.",
      ["Keep the embassy open and learn what happened to Orison."],
      []
    ),
    person(
      "ada",
      "Ada Serein",
      "vestibule",
      "A railway engineer in a travel-worn olive coat, holding a child's red scarf.",
      [
        "Find a safe place for her son Niko.",
        "Restore the railway without restoring the King's secret police.",
      ],
      [
        "The north bridge leads to a real town even though its border post vanished.",
        "The railway workers kept their own route book.",
      ]
    ),
    person(
      "ilyan",
      "Ilyan Moss",
      "salon",
      "The embassy steward wears a carefully darned waistcoat and has already made tea for everyone.",
      ["Keep the household and its guests safe.", "Preserve the embassy's tradition of asylum."],
      [
        "The visitors' book once recorded acts of hospitality, not just names.",
        "An accepted invitation binds this embassy to protect its guest.",
      ]
    ),
    person(
      "vesper",
      "Registrar Vesper",
      "square",
      "A municipal official balancing a bundle of contradictory records.",
      [
        "Avoid making people stateless through a clerical fiction.",
        "Find an entry that her superiors can legally recognize.",
      ],
      [
        "Two independent institutional witnesses can reopen a struck registry entry.",
        "The morning deletion was countersigned with a seal no one admits issuing.",
      ]
    ),
    object(
      "embassy-key",
      "The embassy key",
      "ambassador",
      "Heavy brass, worn smooth where generations of stewards turned it.",
      { portable: true }
    ),
    object(
      "guest-book",
      "The visitors' book",
      "vestibule",
      "A large blue ledger. Its first blank page bears the impression of erased handwriting.",
      {
        portable: false,
        entries: [],
        readable: "Hospitality witnessed and accepted is a promise of this house.",
      }
    ),
    object(
      "passport",
      "Ada's passport",
      "ada",
      "A dark blue passport with a silver moth above three waves.",
      {
        portable: true,
        readable: "Ada Serein. Engineer. Citizen of Orison. Accompanied by Niko Serein, age seven.",
        recognizedBy: [],
      }
    ),
    object(
      "notice",
      "The official notice",
      "vestibule",
      "A grey envelope from the city registry, delivered by hand.",
      {
        portable: true,
        readable:
          "Diplomatic privileges expire at the close of today's registry session unless continuing representation can be established. Appeals and witnesses may be heard.",
      }
    ),
    object("seal", "The moth seal", "salon", "A silver seal beside a shallow carmine ink pad.", {
      portable: true,
      authority: "Orison Embassy",
      actions: ["Seal an invitation"],
    }),
    object(
      "telephone",
      "The ivory telephone",
      "vestibule",
      "A black braided cord disappears into the panelling.",
      {
        communication: true,
        contacts: ["City Registry", "Stationmaster", "Foreign Ministry"],
      }
    ),
  ],
};

const hotelRoom = (...args: Parameters<typeof place>): Entity => ({
  ...place(...args),
  location: "house",
});

export const wanderingHouse: Campaign = {
  id: "wandering-house",
  title: "The House That Crosses the World",
  subtitle: "Your room is ready. The horizon is not.",
  intro:
    "You wake to the clink of a teacup and the sound of mountains passing under the floor. Downstairs, the night porter is polishing a key that opens no room. He looks relieved to see you. ‘Would you mind choosing where we stop?’",
  artDirection:
    "Sumptuous hand-painted fantastical adventure, architectural cutaway sensibility with coherent eye-level spaces. A grand eccentric walking hotel of emerald lacquer, dark walnut, warm brass, amber stained glass and deep peacock-blue velvet. Outside: immense changing landscapes, luminous cloud seas and apricot dawn, delicate astronomical machinery. Cozy humane interiors against sublime scale. Recurring lobby: sweeping bifurcated stair, circular brass route table, green concierge desk, chandelier shaped like a constellation. Distinctive characters with consistent clothing. Wonder without clutter; rich painterly material detail. No typography or UI in image. Use references to maintain the familiar hotel as landscapes change.",
  playerId: "guest",
  story: {
    premise:
      "A walking hotel has lost its destination and is quietly carrying guests toward places they have unfinished business. Become its navigator, nurture its small society, and learn why the missing proprietor abandoned the itinerary.",
    arc: [
      "Choose the first stop and understand the hotel's needs and recurring cast.",
      "Discover that the itinerary follows promises the proprietor failed to keep.",
      "Decide whether the house should complete its old journey, settle somewhere, or let its residents chart a new course.",
    ],
    commitments: [
      "The hotel is a stable home: rooms, inventory, relationships and alterations persist across destinations.",
      "Movement consumes fictional journey stages, never real waiting time.",
      "Every stop has something immediately rewarding and at least one connection to a recurring guest.",
      "The house's machinery is physical and repairable; creative mechanical solutions are welcome.",
      "Guests may disagree with a destination and act on their own needs, but cannot silently strand the player.",
      "The proprietor's disappearance has a humane cause: she left to make amends, not a last-minute universe-ending twist.",
    ],
  },
  entities: [
    {
      id: "house",
      name: "The travelling house",
      kind: "object",
      description: "A walking hotel whose rooms remain a home across every journey.",
      components: { container: true },
    },
    hotelRoom(
      "lobby",
      "The Travelling Lobby",
      "A constellation chandelier sways almost imperceptibly. Beyond the immense windows, a sea of cloud slips past the green concierge desk.",
      {
        "Breakfast conservatory": "conservatory",
        "Engine stair": "engine-room",
        "Up to your room": "guest-room",
      },
      {
        visualFields: ["moving"],
        moving: true,
        visualAnchors: [
          "bifurcated walnut stair",
          "circular brass route table",
          "emerald concierge desk",
        ],
      }
    ),
    hotelRoom(
      "conservatory",
      "The Breakfast Conservatory",
      "Apricot sunlight pours over fern fronds and white tablecloths. Someone has laid an extra place for the absent proprietor.",
      { Lobby: "lobby", "Observation balcony": "balcony" }
    ),
    hotelRoom(
      "engine-room",
      "The Heart of the House",
      "A warm, rhythmic chamber of brass linkages, ceramic bearings and enormous patient feet. One navigation escapement ticks irregularly.",
      { Lobby: "lobby" }
    ),
    hotelRoom(
      "guest-room",
      "Room Seventeen",
      "A small haven of peacock velvet, polished walnut and an oval window. Your suitcase rests beneath a painting of a place the hotel has never reached.",
      { Downstairs: "lobby" }
    ),
    hotelRoom(
      "balcony",
      "The Observation Balcony",
      "A sheltered brass balcony over the moving landscape, with a telescope and an empty pigeon loft.",
      { Conservatory: "conservatory" },
      { frontier: true }
    ),
    place(
      "outside",
      "The Orchard Above the Clouds",
      "The house's first possible stop: an abandoned high-altitude orchard whose keeper still sets out fresh ladders each morning.",
      {},
      { frontier: true }
    ),
    place(
      "saltglass",
      "The Saltglass Night Market",
      "Lantern stalls stand over a cobalt salt lagoon. Travellers trade small repairs, remembered songs, and news of those they mean to find.",
      {},
      { frontier: true }
    ),
    person(
      "guest",
      "You",
      "lobby",
      "The guest in Room Seventeen, newly entrusted with the route key.",
      ["Choose a stop and discover why the house brought you aboard."],
      []
    ),
    person(
      "porter",
      "Mr. Pell",
      "lobby",
      "A silver-haired night porter with an emerald lapel and a ring of unusually shaped keys.",
      [
        "Keep every guest welcome and accounted for.",
        "Deliver the proprietor's unopened letter at the right stop.",
      ],
      [
        "The route table accepts a destination when the brass key is turned.",
        "The house slows safely when the arrival bell is rung.",
      ]
    ),
    person(
      "saffron",
      "Saffron Wren",
      "engine-room",
      "A young engineer with copper curls, rolled sleeves and blue ceramic dust on her boots.",
      ["Repair the navigation escapement.", "Find her mentor at the orchard."],
      [
        "The missing bearing could be replaced with a small glazed ceramic piece.",
        "The house follows old promises as well as coordinates.",
      ]
    ),
    person(
      "vale",
      "Dr. Vale",
      "conservatory",
      "A botanist in a violet coat carefully watering a plant in a cracked teacup.",
      [
        "Return a stolen seedling to its orchard.",
        "Avoid admitting she once worked for the proprietor.",
      ],
      [
        "The orchard's trees bloom when someone tells them a true memory.",
        "The proprietor promised its keeper she would return.",
      ]
    ),
    object(
      "route-key",
      "The route key",
      "guest",
      "An intricate brass key with a star-shaped bow.",
      { portable: true }
    ),
    object(
      "route-table",
      "The route table",
      "lobby",
      "A circular brass table carrying a slowly turning relief landscape. An orchard hangs above a sea of clouds; further routes wait beyond its rim.",
      {
        visualFields: ["moving", "destination"],
        destination: "outside",
        moving: true,
        actions: ["Choose a destination", "Turn the route key"],
      }
    ),
    object(
      "arrival-bell",
      "The arrival bell",
      "lobby",
      "A small silver bell on a green velvet pad.",
      { actions: ["Ring to stop the house"] }
    ),
    object(
      "escapement",
      "The navigation escapement",
      "engine-room",
      "A brass wheel judders around an empty ceramic bearing seat.",
      {
        visualFields: ["working"],
        working: false,
        needs: "A small smooth ceramic bearing",
        actions: ["Fit a replacement bearing"],
      }
    ),
    object(
      "teacup",
      "The chipped teacup",
      "conservatory",
      "A discarded blue-glazed cup. A curved chip sits on its saucer.",
      {
        portable: true,
        material: "glazed ceramic",
        parts: ["smooth blue ceramic chip"],
      }
    ),
    object(
      "seedling",
      "The cloud-pear seedling",
      "vale",
      "A silvery seedling with one tiny pear, growing in Dr. Vale's repaired cup.",
      { portable: true, origin: "Orchard Above the Clouds" }
    ),
    object(
      "itinerary",
      "The unfinished itinerary",
      "route-table",
      "A folded route card with three blank destinations and a handwritten promise.",
      {
        portable: true,
        readable: "First, the orchard. Then the people I should have gone back for. —A.",
      }
    ),
  ],
};

/** Authored programs are self-contained: the same functions become saved behavior source and test hooks. */
export interface PostalBehaviorWorld {
  world: World;
  entity(id: string): Entity;
  observe(): View;
  transfer(itemId: string, destination: string): unknown;
  patch(id: string, patch: Partial<Entity>): unknown;
  relate(relation: Relation): unknown;
  emit(text: string): unknown;
}
export const postalPrograms = {
  window: function (
    world: PostalBehaviorWorld,
    _state: Record<string, any>,
    _event: Record<string, any>,
    self: Entity
  ) {
    const present = world.entity("elin").location === "customs";
    world.patch(self.id, {
      name: present ? "The woman at the customs-house window" : "The customs-house window",
      description: present
        ? "Through the lit window, a woman in a blue wool cardigan holds up a cream envelope with a red double-lighthouse seal. She gestures toward the customs-house door. You can meet her inside."
        : "The lit customs-house window is empty now. The door below leads inside.",
    });
  },
  tide: function (
    world: PostalBehaviorWorld,
    state: Record<string, any>,
    _event: Record<string, any>,
    self: Entity
  ) {
    state["rings"] += 1;
    world.patch(self.id, { components: { ...self.components, rings: state["rings"] } });
    world.emit(
      "The harbour bell carries over the water. A second note answers from beneath the quay."
    );
    if (state["rings"] === 2) {
      const landing = world.entity("landing"),
        quarter = world.entity("drowned-quarter");
      world.patch(landing.id, { components: { ...landing.components, tide: "low" } });
      world.patch(quarter.id, { components: { ...quarter.components, requires: null } });
      world.emit(
        "The tide has drawn back from the old steps. A walkable path glitters between the drowned houses."
      );
    }
  },
  insert: function (
    world: PostalBehaviorWorld,
    _state: Record<string, any>,
    event: Record<string, any>,
    self: Entity
  ) {
    const letterId =
      event["itemId"] || world.observe().inventory.find((item) => item.components["addressee"])?.id;
    if (!letterId) throw new Error("Choose an addressed letter to put through the sorting slot.");
    world.transfer(letterId, self.id);
  },
  route: function (
    world: PostalBehaviorWorld,
    state: Record<string, any>,
    event: Record<string, any>,
    self: Entity
  ) {
    const letter = world.entity(event["itemId"]);
    const address = String(letter.components["addressee"] ?? "")
      .trim()
      .toLowerCase();
    const routes = self.components["routingTable"] as Record<
      string,
      { destination: string; drawer: string }
    >;
    const route = routes[address];
    if (!route) {
      world.emit(
        "The sorting slot holds " +
          letter.name +
          ", but no drawer answers its address. The other mail remains where it was."
      );
      return;
    }
    const drawer = world.entity(route.drawer);
    world.transfer(letter.id, drawer.id);
    state["sorted"] = { ...state["sorted"], [letter.id]: route.drawer };
    world.patch(drawer.id, { components: { ...drawer.components, locked: false, open: true } });
    world.relate({
      id: "route-" + letter.id,
      from: letter.id,
      to: route.destination,
      kind: "postal-route",
      data: { addressee: letter.components["addressee"], drawer: drawer.id },
    });
    // Some old documents await a particular mail clearance, rather than a magic item identity.
    for (const grant of [...world.world.relations]) {
      if (
        grant.kind !== "authorizes" ||
        grant.data?.["physical"] === true ||
        grant.data?.["reconciliationRoute"] !== route.destination
      )
        continue;
      const document = world.entity(grant.from);
      if (document.location !== drawer.id) continue;
      world.relate({ ...grant, data: { ...grant.data, valid: true } });
    }
    const reachable = world.world.entities.filter(
      (item) => item.location === drawer.id && item.id !== letter.id
    );
    world.emit(
      drawer.name +
        " clicks open. " +
        letter.name +
        " is routed toward " +
        world.entity(route.destination).name +
        "." +
        (reachable.length
          ? " " + reachable.map((item) => item.name).join(", ") + " can now be reached."
          : "")
    );
  },
  inspectAuthority: function (
    world: PostalBehaviorWorld,
    _state: Record<string, any>,
    event: Record<string, any>,
    self: Entity
  ) {
    const document = world.entity(event["itemId"]);
    const inspection = self.components["recognizes"] as { issuer: string; permission: string };
    if (!document.components["document"] || !inspection) return;
    const grant = world.world.relations.find(
      (relation) =>
        relation.from === document.id &&
        relation.kind === "authorizes" &&
        relation.data?.["physical"] !== true &&
        relation.data?.["valid"] === true &&
        relation.data?.["issuer"] === inspection.issuer &&
        relation.data?.["permission"] === inspection.permission
    );
    if (!grant) {
      world.emit(
        self.name + " checks " + document.name + ": it does not currently authorize this passage."
      );
      return;
    }
    const vessel = world.entity(grant.to);
    world.patch(vessel.id, { components: { ...vessel.components, locked: false } });
    world.relate({
      id: "recognized-" + self.id + "-" + document.id,
      from: self.id,
      to: document.id,
      kind: "recognized-authority",
      data: { resource: vessel.id, permission: inspection.permission },
    });
    world.relate({
      id: "passage-" + vessel.id + "-" + event["actorId"],
      from: event["actorId"],
      to: String(grant.data!["beneficiary"]),
      kind: "promised-passage",
      data: { destination: grant.data!["destination"] },
    });
    world.emit(
      self.name +
        " recognizes " +
        document.name +
        ". The impound on " +
        vessel.name +
        " is lifted; the passage can now be made lawfully."
    );
  },
};

const postalCode = (program: keyof typeof postalPrograms) =>
  "(" + postalPrograms[program].toString() + ")(world, state, event, self);";

deadLetterOffice.relations = [
  {
    id: "permit-authority",
    from: "permit",
    to: "ferry",
    kind: "authorizes",
    data: {
      issuer: "elin",
      beneficiary: "tomas",
      permission: "navigate",
      destination: "drowned-quarter",
      valid: false,
      reconciliationRoute: "drowned-quarter",
    },
  },
  {
    id: "relief-authority",
    from: "relief-warrant",
    to: "ferry",
    kind: "authorizes",
    data: {
      issuer: "elin",
      beneficiary: "tomas",
      permission: "navigate",
      destination: "drowned-quarter",
      valid: true,
    },
  },
];
for (const inspector of ["elin", "tomas"]) {
  deadLetterOffice.entities.find((entity) => entity.id === inspector)!.components["recognizes"] = {
    issuer: "elin",
    permission: "navigate",
  };
}
deadLetterOffice.behaviors = [
  {
    id: "customs-window-presence",
    entityId: "customs-window",
    trigger: "tick",
    state: {},
    code: postalCode("window"),
  },
  {
    id: "harbour-tide",
    entityId: "harbour-bell",
    trigger: "Ring the bell",
    state: { rings: 0 },
    code: postalCode("tide"),
  },
  {
    id: "cabinet-insertion",
    entityId: "sorting-cabinet",
    trigger: "Insert a letter",
    state: {},
    code: postalCode("insert"),
  },
  {
    id: "cabinet-delivery",
    entityId: "sorting-cabinet",
    trigger: "receive",
    state: { sorted: {} },
    code: postalCode("route"),
  },
  ...["elin", "tomas"].map((inspector) => ({
    id: "authority-inspection-" + inspector,
    entityId: inspector,
    trigger: "receive",
    state: {},
    code: postalCode("inspectAuthority"),
  })),
];

missingCountry.behaviors = [
  {
    id: "hospitality",
    entityId: "guest-book",
    trigger: "Offer asylum",
    state: { guests: [] },
    code: `
    const guest=world.entity(event.guestId || "ada");
    if(guest.kind!=="person")throw new Error("An invitation needs a person.");
    if(!state.guests.includes(guest.id))state.guests.push(guest.id);
    world.patch(self.id,{components:{...self.components,entries:state.guests}});
    world.relate({id:"asylum-"+guest.id,from:event.actorId,to:guest.id,kind:"offered-asylum",data:{accepted:false}});
    world.emit("You enter "+guest.name+" in the visitors’ book and offer the protection of this house. The promise now awaits their answer.");
  `,
  },
  {
    id: "seal-invitation",
    entityId: "seal",
    trigger: "Seal an invitation",
    state: { count: 0 },
    code: `
    state.count++;
    const recipient=String(event.recipient || "City Registry");
    const id="invitation-"+state.count;
    world.add({id,name:"Invitation to "+recipient,kind:"object",description:"Ivory stationery bearing a carmine moth seal.",location:event.actorId,components:{portable:true,readable:"The Embassy of Orison invites "+recipient+" to hear its citizens and witness its continuing obligations.",recipient}});
    world.emit("The silver moth leaves a crisp carmine impression. The invitation exists; its recipient must still choose to accept.");
  `,
  },
];

wanderingHouse.behaviors = [
  {
    id: "safe-arrival",
    entityId: "arrival-bell",
    trigger: "Ring to stop the house",
    state: {},
    code: `
    const table=world.entity("route-table");
    if(!table.components.moving){world.emit("The house is already resting. The little bell sounds welcomingly.");return;}
    world.patch(table.id,{components:{...table.components,moving:false}});
    const lobby=world.entity("lobby");
    const destination=world.entity(table.components.destination);
    world.patch("house",{location:destination.id});
    world.patch(lobby.id,{components:{...lobby.components,moving:false,exits:{...lobby.components.exits,"Front steps":destination.id}}});
    world.patch(destination.id,{components:{...destination.components,exits:{...destination.components.exits,"Hotel steps":"lobby"}}});
    world.emit("The great feet settle with astonishing gentleness. The front steps unfold toward "+destination.name+". Somewhere upstairs, not a single teacup spills.");
  `,
  },
  {
    id: "bearing-repair",
    entityId: "escapement",
    trigger: "Fit a replacement bearing",
    state: {},
    code: `
    const item=world.entity(event.itemId || "teacup");
    if(item.location!==event.actorId)throw new Error("Bring the replacement material with you first.");
    if(!String(item.components.material || "").includes("ceramic"))throw new Error("This bearing needs a smooth heat-resistant ceramic surface.");
    world.patch(item.id,{location:self.id});
    world.patch(self.id,{components:{...self.components,working:true}});
    world.emit("The glazed ceramic finds its seat. A stuttering tick becomes a patient, even heartbeat. Upstairs the route table steadies.");
    world.relate({id:"repaired-heart",from:event.actorId,to:"saffron",kind:"shared-achievement",data:{repair:self.id}});
  `,
  },
  {
    id: "route-choice",
    entityId: "route-table",
    trigger: "Choose a destination",
    state: {},
    code: `
    if(self.components.moving)throw new Error("Ring the arrival bell before choosing the next journey.");
    const destination=world.entity(event.destination || "outside");
    if(destination.kind!=="place")throw new Error("Choose a place on the route.");
    let container=destination;
    while(container.location){container=world.entity(container.location);if(container.id==="house")throw new Error("Choose a stop beyond the hotel, not one of its own rooms.");}
    world.patch(self.id,{components:{...self.components,destination:destination.id}});
    world.emit("The relief landscape settles around "+destination.name+". The house waits for the navigator to turn the key.");
  `,
  },
  {
    id: "route-departure",
    entityId: "route-table",
    trigger: "Turn the route key",
    state: {},
    code: `
    if(world.entity("route-key").location!==event.actorId)throw new Error("You need the route key.");
    if(!world.entity("escapement").components.working)throw new Error("The navigation escapement needs repair before the next journey.");
    if(self.components.moving){world.emit("The house is already travelling. The arrival bell will bring it gently to rest.");return;}
    let passenger=world.entity(world.world.playerId),aboard=false;
    while(passenger.location){passenger=world.entity(passenger.location);if(passenger.id==="house"){aboard=true;break;}}
    if(!aboard)throw new Error("The guest from Room Seventeen is still ashore. Bring them aboard before departing.");
    const house=world.entity("house"),lobby=world.entity("lobby");
    if(house.location){const stop=world.entity(house.location),exits={...stop.components.exits};if(exits["Hotel steps"]==="lobby")delete exits["Hotel steps"];world.patch(stop.id,{components:{...stop.components,exits}});}
    const exits={...lobby.components.exits};delete exits["Front steps"];
    world.patch(house.id,{location:undefined});
    world.patch(self.id,{components:{...self.components,moving:true}});
    world.patch(lobby.id,{components:{...lobby.components,moving:true,exits}});
    world.emit("The key turns. A constellation of lights wakes in the table, and the house takes its first deliberate step toward its new destination.");
  `,
  },
];

export const campaigns = [deadLetterOffice, missingCountry, wanderingHouse];

for (const [campaign, roleName] of [
  [deadLetterOffice, "The courier"],
  [missingCountry, "The ambassador"],
  [wanderingHouse, "The guest from Room Seventeen"],
] as const) {
  campaign.entities.find((entity) => entity.id === campaign.playerId)!.components.roleName =
    roleName;
}
