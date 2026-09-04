/**
 * The calendar. A tick is the world's unit; a day is 24 ticks, a season 30
 * days, a year four seasons. The moon has eight phases over 30 days. Weather
 * is generated per season with named storms announced three days ahead.
 * Festivals are the calendar's joy (design §11).
 */
import type { Dir, FestivalId, Season, Sky, Weather } from "../types.js";
import type { Rng } from "./rng.js";
import type { WorldEvent } from "./physics.js";

export const TICKS_PER_DAY = 24;
export const DAYS_PER_SEASON = 30;
export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

export type SkyEvent = "dawn" | "dusk" | "noon" | "midnight" | "full-moon" | "new-moon" | "storm" | "frost" | "season" | "festival" | "tick";

const STORM_NAMES = ["the Widow's Comb", "Long Ash", "the Ridge-Walker", "Salt Wind", "the Grey Bride", "Ninefold", "the Hound", "Ilvane's Breath", "the Shutter", "Crook-Moon"];

export function initialSky(): Sky {
  return {
    tick: 0,
    hour: 6,
    day: 0,
    season: "spring",
    year: 1,
    moon: 2,
    weather: "clear",
    windDir: "s",
    windForce: 1,
    forecast: [],
    festival: null,
    bellTrue: false,
    bell: 0,
  };
}

export function isDaytime(sky: Sky): boolean {
  return sky.hour >= 6 && sky.hour < 18;
}

/** Sun by season and hour, 0..6. */
export function sunlight(sky: Sky): number {
  if (!isDaytime(sky)) return 0;
  const seasonMax: Record<Season, number> = { spring: 5, summer: 6, autumn: 4, winter: 3 };
  const noonDist = Math.abs(sky.hour - 12); // 0..6
  const arc = Math.max(0, seasonMax[sky.season] - Math.floor(noonDist / 2));
  const weatherCut: Record<Weather, number> = { clear: 0, overcast: 2, rain: 2, storm: 3, snow: 2, fog: 3, wind: 0 };
  return Math.max(0, arc - weatherCut[sky.weather]);
}

/** Moon by phase at night, 0..3. */
export function moonlight(sky: Sky): number {
  if (isDaytime(sky)) return 0;
  const byPhase = [0, 1, 1, 2, 3, 2, 1, 1];
  const base = byPhase[sky.moon] ?? 0;
  const cloudy = sky.weather === "overcast" || sky.weather === "rain" || sky.weather === "storm" || sky.weather === "snow" || sky.weather === "fog";
  return cloudy ? Math.max(0, base - 2) : base;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function hourName(hour: number): string {
  if (hour === 0) return "midnight";
  if (hour < 6) return "the small hours";
  if (hour === 6) return "dawn";
  if (hour < 12) return "morning";
  if (hour === 12) return "noon";
  if (hour < 18) return "afternoon";
  if (hour === 18) return "dusk";
  return "night";
}

export function seasonLabel(sky: Sky): string {
  return `the ${ordinal(sky.day + 1)} day of ${sky.season}, year ${sky.year}, ${hourName(sky.hour)}`;
}

function weatherFor(season: Season, rng: Rng): Weather {
  const r = rng.next();
  switch (season) {
    case "spring": return r < 0.45 ? "clear" : r < 0.65 ? "overcast" : r < 0.9 ? "rain" : "wind";
    case "summer": return r < 0.7 ? "clear" : r < 0.85 ? "overcast" : r < 0.95 ? "wind" : "rain";
    case "autumn": return r < 0.3 ? "clear" : r < 0.5 ? "overcast" : r < 0.7 ? "rain" : r < 0.85 ? "fog" : "wind";
    case "winter": return r < 0.3 ? "clear" : r < 0.5 ? "overcast" : r < 0.8 ? "snow" : "fog";
  }
}

function windFor(season: Season, rng: Rng): { dir: Dir; force: number } {
  // Wind comes off the ridge (north) most of the year; from the moor (south) in autumn.
  const dirs: Record<Season, Dir[]> = { spring: ["n", "n", "w", "e"], summer: ["w", "n", "e", "s"], autumn: ["s", "s", "n", "w"], winter: ["n", "n", "n", "e"] };
  return { dir: rng.pick(dirs[season]), force: 1 + rng.int(3) };
}

/**
 * Advance one tick. Returns a fresh sky plus the sky events that occurred at
 * the boundary. Daily weather is drawn at dawn; storms are queued three days
 * ahead in `forecast` and arrive on schedule.
 */
export function advanceSky(sky: Sky, rng: Rng): { sky: Sky; events: SkyEvent[]; texts: WorldEvent[] } {
  const next: Sky = { ...sky, forecast: sky.forecast.map((f) => ({ ...f })) };
  const events: SkyEvent[] = ["tick"];
  const texts: WorldEvent[] = [];
  next.tick = sky.tick + 1;
  // The cracked bell drifts: without a true bell, one tick in twelve is not counted as an hour.
  const drift = !sky.bellTrue && (next.tick % 12 === 7);
  if (!drift) next.hour = sky.hour + 1;
  if (next.hour >= TICKS_PER_DAY) {
    next.hour = 0;
    next.day = sky.day + 1;
    next.moon = Math.floor((next.day * 8) / DAYS_PER_SEASON) % 8;
    // Move the forecast one day closer.
    next.forecast = next.forecast.map((f) => ({ ...f, inDays: f.inDays - 1 })).filter((f) => f.inDays >= 0);
    if (next.festival) {
      next.festival = null;
      texts.push({ kind: "festival-end", text: "The green empties; the lanterns are left burning.", region: "green" });
    }
    if (next.day >= DAYS_PER_SEASON) {
      next.day = 0;
      const si = SEASONS.indexOf(sky.season);
      next.season = SEASONS[(si + 1) % 4]!;
      if (next.season === "spring") next.year = sky.year + 1;
      events.push("season");
      texts.push({ kind: "season", text: `${next.season[0]!.toUpperCase()}${next.season.slice(1)} comes to the valley.`, rung: "inbox" });
    }
    if (next.moon === 4 && sky.moon !== 4) events.push("full-moon");
    if (next.moon === 0 && sky.moon !== 0) events.push("new-moon");
  }
  if (next.hour === 6 && !(sky.hour === 6)) {
    events.push("dawn");
    next.bell = sky.bell + 1;
    // Daily weather: scheduled storm arrives, or draw.
    const due = next.forecast.find((f) => f.inDays === 0);
    if (due) {
      next.weather = due.weather;
      next.forecast = next.forecast.filter((f) => f !== due);
      if (due.name) texts.push({ kind: "storm", text: `${due.name} breaks over the ridge.`, region: "ridge", rung: "inbox" });
    } else {
      next.weather = weatherFor(next.season, rng);
    }
    const w = windFor(next.season, rng);
    next.windDir = w.dir;
    next.windForce = next.weather === "storm" ? 4 : next.weather === "wind" ? 3 : w.force;
    if (next.weather === "storm") events.push("storm");
    // Announce a named storm three days ahead, a few times a year.
    if (next.forecast.length === 0 && rng.next() < 0.05) {
      const name = rng.pick(STORM_NAMES);
      next.forecast.push({ inDays: 3, weather: "storm", name });
      texts.push({ kind: "forecast", text: `The Ridge says a storm is coming in three days. The old name for it is ${name}.`, region: "ridge", rung: "inbox" });
    }
    // Festivals.
    const fest = festivalDue(next, sky);
    if (fest) {
      next.festival = fest;
      events.push("festival");
      texts.push({ kind: "festival", text: festivalText(fest), region: "green", rung: "inbox" });
    }
  } else if (next.hour === 6 && sky.hour === 6) {
    // Bell drift kept us at 6: no second dawn.
  }
  if (next.hour === 12 && sky.hour !== 12) { events.push("noon"); next.bell = sky.bell + 1; }
  if (next.hour === 18 && sky.hour !== 18) { events.push("dusk"); next.bell = sky.bell + 1; }
  if (next.hour === 0 && sky.hour !== 0) { events.push("midnight"); next.bell = sky.bell + 1; }
  if (next.season === "autumn" && next.weather === "snow") next.weather = "fog";
  if ((next.season === "winter" || next.season === "autumn") && next.weather === "snow" && sky.weather !== "snow") events.push("frost");
  if (next.season === "autumn" && next.hour === 6 && sky.hour !== 6 && next.weather === "clear" && next.day >= 20 && rng.next() < 0.2) {
    events.push("frost");
  }
  return { sky: next, events, texts };
}

function festivalDue(next: Sky, prev: Sky): FestivalId | null {
  if (next.season === "spring" && next.day === 15) return "first-sap";
  if (next.season === "summer" && next.day === 15) return "midsummer";
  if (next.season === "winter" && next.moon === 0 && next.day >= 10 && next.day <= 20 && !(prev.season === "winter" && prev.moon === 0 && prev.day >= 10)) return "long-dark";
  return null;
}

/** First Frost is rung by the world when the season's first frost occurs (physics calls this). */
export function ringFirstFrost(sky: Sky): WorldEvent | null {
  if (sky.season !== "autumn" || sky.festival) return null;
  sky.festival = "first-frost";
  return { kind: "festival", text: festivalText("first-frost"), region: "green", rung: "inbox" };
}

export function festivalText(id: FestivalId): string {
  switch (id) {
    case "first-sap": return "First Sap. The Orchard gives; the household casts for growth and colour on the green, and the Hearth judges.";
    case "midsummer": return "Midsummer, the longest day. Light and moths; charms only. The Glass judges, and is never satisfied.";
    case "first-frost": return "The first frost. Fire and ash on the green tonight; the Foundry judges, loudly.";
    case "long-dark": return "The Long Dark. Ether and stillness. The Ridge judges in weather, and the familiar tells the year's story.";
  }
}

export function festivalName(id: FestivalId): string {
  return { "first-sap": "First Sap", "midsummer": "Midsummer", "first-frost": "First Frost", "long-dark": "the Long Dark" }[id];
}
