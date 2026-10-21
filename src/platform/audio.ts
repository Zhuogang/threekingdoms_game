let context: AudioContext | undefined;
export type Cue =
  | 'click'
  | 'turn'
  | 'battle'
  | 'attack'
  | 'counter'
  | 'fire'
  | 'rally'
  | 'confuse'
  | 'victory'
  | 'defeat';
// Short tone sequences keep the effects subtle; waveforms vary so cues stay distinguishable.
const CUES: Record<Cue, { tones: number[]; type: OscillatorType; step: number }> = {
  click: { tones: [440], type: 'sine', step: 0.1 },
  turn: { tones: [330, 440, 660], type: 'sine', step: 0.1 },
  battle: { tones: [180, 240], type: 'sine', step: 0.1 },
  attack: { tones: [210, 150], type: 'square', step: 0.06 },
  counter: { tones: [190, 150, 120], type: 'square', step: 0.07 },
  fire: { tones: [620, 520, 410], type: 'sawtooth', step: 0.07 },
  rally: { tones: [440, 554, 659], type: 'triangle', step: 0.08 },
  confuse: { tones: [330, 300, 340, 290], type: 'triangle', step: 0.06 },
  victory: { tones: [523, 659, 784, 1046], type: 'triangle', step: 0.12 },
  defeat: { tones: [330, 262, 196, 147], type: 'sine', step: 0.14 },
};
export function playCue(kind: Cue, enabled: boolean): void {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const { tones, type, step } = CUES[kind];
    tones.forEach((hz, i) => {
      const osc = context!.createOscillator(),
        gain = context!.createGain();
      const start = context!.currentTime + i * step;
      osc.type = type;
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

/** Pick the sound cue that best matches what a battle command just did. */
export function cueForBattleLog(newLines: string[], ended: 'win' | 'loss' | null): Cue {
  if (ended === 'win') return 'victory';
  if (ended === 'loss') return 'defeat';
  const has = (needle: string) => newLines.some((line) => line.includes(needle));
  if (has('counterattacks')) return 'counter';
  if (has('fire tactic')) return 'fire';
  if (has('rallied')) return 'rally';
  if (has('confused') || has('confusion tactic')) return 'confuse';
  if (has('attacked') || has('ambushed') || has('dropped rocks')) return 'attack';
  return 'battle';
}
