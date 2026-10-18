let context: AudioContext | undefined;
export function playCue(kind: 'click' | 'turn' | 'battle', enabled: boolean): void {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const tones = kind === 'turn' ? [330, 440, 660] : kind === 'battle' ? [180, 240] : [440];
    tones.forEach((hz, i) => {
      const osc = context!.createOscillator(),
        gain = context!.createGain();
      const start = context!.currentTime + i * 0.1;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.05, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(gain);
      gain.connect(context!.destination);
      osc.start(start);
      osc.stop(start + 0.27);
    });
  } catch {
    /* Optional audio must never block the game. */
  }
}
