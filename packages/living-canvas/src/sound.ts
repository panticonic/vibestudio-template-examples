let context: AudioContext | null = null;
export function chime() {
  context ??= new AudioContext();
  void context.resume();
  [0, 7, 12, 16].forEach((note, i) => {
    const oscillator = context!.createOscillator(),
      gain = context!.createGain();
    const start = context!.currentTime + i * 0.11;
    oscillator.type = "sine";
    oscillator.frequency.value = 261.63 * 2 ** (note / 12);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.035, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 1.2);
    oscillator.connect(gain).connect(context!.destination);
    oscillator.start(start);
    oscillator.stop(start + 1.25);
  });
}
export function closeAudio() {
  if (context) {
    void context.close();
    context = null;
  }
}
