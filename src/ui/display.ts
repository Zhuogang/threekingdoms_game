/** Shared CSS-pixel targets for the DOM and the Pixi camera. */
export const DISPLAY_PRESETS = {
  compact: {
    mainText: 14,
    secondaryText: 12,
    cityLabel: 14,
    controlHeight: 32,
    tileSize: 48,
    troopCount: 12,
  },
  comfortable: {
    mainText: 16,
    secondaryText: 14,
    cityLabel: 16,
    controlHeight: 40,
    tileSize: 64,
    troopCount: 14,
  },
  large: {
    mainText: 18,
    secondaryText: 16,
    cityLabel: 18,
    controlHeight: 44,
    tileSize: 80,
    troopCount: 16,
  },
} as const;

export type DisplayPreset = keyof typeof DISPLAY_PRESETS;
export const DISPLAY_PREFERENCE_KEY = 'baye.display';

export function isDisplayPreset(value: unknown): value is DisplayPreset {
  return typeof value === 'string' && Object.hasOwn(DISPLAY_PRESETS, value);
}

export function readDisplayPreset(): DisplayPreset {
  try {
    const value = localStorage.getItem(DISPLAY_PREFERENCE_KEY);
    return isDisplayPreset(value) ? value : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

export function writeDisplayPreset(value: DisplayPreset): void {
  try {
    localStorage.setItem(DISPLAY_PREFERENCE_KEY, value);
  } catch {
    // Browser presentation preferences are optional; the selected size still works.
  }
}
