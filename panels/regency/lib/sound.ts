/**
 * Sound cues, generated rather than shipped: three short WebAudio phrases for
 * the turning of a season, a clash of arms and the fall of the seal. Off by
 * default; the Regent's choice is remembered in the panel's stateArgs.
 */
export type Cue = "season" | "battle" | "seal";

interface Note {
  /** Hertz. */
  hz: number;
  /** Seconds from the start of the cue. */
  at: number;
  /** Seconds. */
  dur: number;
  gain: number;
  type: OscillatorType;
}

const CUES: Record<Cue, Note[]> = {
  // A rising horn call: the season has turned.
  season: [
    { hz: 392, at: 0, dur: 0.22, gain: 0.16, type: "triangle" },
    { hz: 523.25, at: 0.16, dur: 0.24, gain: 0.16, type: "triangle" },
    { hz: 659.25, at: 0.34, dur: 0.5, gain: 0.14, type: "triangle" },
    { hz: 329.63, at: 0.34, dur: 0.5, gain: 0.07, type: "sine" },
  ],
  // Two struck, detuned blows: steel.
  battle: [
    { hz: 220, at: 0, dur: 0.12, gain: 0.2, type: "square" },
    { hz: 233, at: 0.005, dur: 0.12, gain: 0.14, type: "sawtooth" },
    { hz: 196, at: 0.13, dur: 0.16, gain: 0.16, type: "square" },
    { hz: 1200, at: 0, dur: 0.06, gain: 0.05, type: "square" },
  ],
  // A single low, settling stamp: the wax takes the seal.
  seal: [
    { hz: 146.83, at: 0, dur: 0.3, gain: 0.22, type: "sine" },
    { hz: 98, at: 0.02, dur: 0.34, gain: 0.12, type: "sine" },
  ],
};

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Play one cue. A no-op when the Regent has the sound off, when the browser
 * has no WebAudio, or when the page has not yet been allowed to make noise.
 */
export function playCue(cue: Cue, enabled: boolean): void {
  if (!enabled) return;
  const audio = context();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume().catch(() => undefined);
  const start = audio.currentTime + 0.01;
  for (const note of CUES[cue]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.hz, start + note.at);
    gain.gain.setValueAtTime(0.0001, start + note.at);
    gain.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(start + note.at);
    osc.stop(start + note.at + note.dur + 0.02);
  }
}

export function closeAudio(): void {
  void ctx?.close().catch(() => undefined);
  ctx = null;
}
