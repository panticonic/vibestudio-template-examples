/**
 * The estate's sounds, generated rather than shipped: the hearth, the river
 * when the weir is right, the wheel, the bell when it is true, wind before a
 * storm, moths. Off by default; the choice is remembered in stateArgs.
 */
export type Cue = "hearth" | "river" | "wheel" | "bell" | "wind" | "moths" | "cast" | "misfire" | "page" | "seal";

interface Note { hz: number; at: number; dur: number; gain: number; type: OscillatorType; slide?: number }

const CUES: Record<Cue, Note[]> = {
  hearth: [
    { hz: 110, at: 0, dur: 0.5, gain: 0.05, type: "triangle" },
    { hz: 165, at: 0.08, dur: 0.4, gain: 0.04, type: "sine" },
    { hz: 880, at: 0.1, dur: 0.05, gain: 0.02, type: "square" },
    { hz: 1320, at: 0.32, dur: 0.04, gain: 0.015, type: "square" },
  ],
  river: [
    { hz: 196, at: 0, dur: 0.9, gain: 0.05, type: "sine", slide: 220 },
    { hz: 294, at: 0.2, dur: 0.7, gain: 0.04, type: "sine", slide: 262 },
  ],
  wheel: [
    { hz: 98, at: 0, dur: 0.25, gain: 0.08, type: "triangle" },
    { hz: 98, at: 0.3, dur: 0.25, gain: 0.08, type: "triangle" },
    { hz: 98, at: 0.6, dur: 0.25, gain: 0.06, type: "triangle" },
  ],
  bell: [
    { hz: 523.25, at: 0, dur: 1.6, gain: 0.14, type: "sine" },
    { hz: 1318.5, at: 0, dur: 0.9, gain: 0.05, type: "sine" },
    { hz: 784, at: 0.01, dur: 1.2, gain: 0.04, type: "triangle" },
  ],
  wind: [
    { hz: 140, at: 0, dur: 1.2, gain: 0.05, type: "sawtooth", slide: 200 },
    { hz: 210, at: 0.4, dur: 1.0, gain: 0.03, type: "sawtooth", slide: 160 },
  ],
  moths: [
    { hz: 1760, at: 0, dur: 0.08, gain: 0.02, type: "sine" },
    { hz: 1975, at: 0.1, dur: 0.08, gain: 0.02, type: "sine" },
    { hz: 1568, at: 0.22, dur: 0.1, gain: 0.02, type: "sine" },
    { hz: 2093, at: 0.3, dur: 0.08, gain: 0.015, type: "sine" },
  ],
  cast: [
    { hz: 392, at: 0, dur: 0.18, gain: 0.1, type: "triangle" },
    { hz: 587.33, at: 0.12, dur: 0.3, gain: 0.1, type: "triangle" },
    { hz: 783.99, at: 0.24, dur: 0.5, gain: 0.08, type: "sine" },
  ],
  misfire: [
    { hz: 392, at: 0, dur: 0.18, gain: 0.1, type: "triangle" },
    { hz: 370, at: 0.14, dur: 0.3, gain: 0.1, type: "sawtooth", slide: 300 },
    { hz: 1200, at: 0.3, dur: 0.05, gain: 0.03, type: "square" },
  ],
  page: [
    { hz: 660, at: 0, dur: 0.05, gain: 0.03, type: "triangle" },
    { hz: 520, at: 0.04, dur: 0.08, gain: 0.03, type: "triangle" },
  ],
  seal: [
    { hz: 146.83, at: 0, dur: 0.3, gain: 0.2, type: "sine" },
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

/** Play one cue. A no-op when sound is off or the browser has no WebAudio. */
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
    if (note.slide) osc.frequency.linearRampToValueAtTime(note.slide, start + note.at + note.dur);
    gain.gain.setValueAtTime(0.0001, start + note.at);
    gain.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(start + note.at);
    osc.stop(start + note.at + note.dur + 0.03);
  }
}

export function closeAudio(): void {
  void ctx?.close().catch(() => undefined);
  ctx = null;
}
