import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { hasNavalTraining } from '../../../src/v03/content/naval-commanders';
import { formationLeaderVisual } from '../../../src/v03/rendering/unit-leader';

describe('historical naval commanders', () => {
  it('preserves the original eight and enables the available R4 addition in the 190 opening', () => {
    const state = createV03Game('cao', 1234);
    expect(
      state.officers
        .filter((officer) => hasNavalTraining(officer.id))
        .map((o) => o.id)
        .sort(),
    ).toEqual(
      [
        'zhouyu',
        'chengpu',
        'huanggai',
        'handang',
        'ganning',
        'guanyu',
        'sunce',
        'lusu',
        'zhoutai',
      ].sort(),
    );
    expect(hasNavalTraining(undefined)).toBe(false);
    expect(hasNavalTraining('militia')).toBe(false);
  });

  it('uses the portrait commander, not any subordinate or the faction, for mixed formations', () => {
    const officers = [
      { id: 'caocao', level: 2, force: 90 },
      { id: 'guanyu', level: 1, force: 100 },
    ];
    const ids = ['guanyu', 'caocao'];
    expect(formationLeaderVisual(officers, ids)).toEqual({
      portraitKey: 'caocao',
      navalTraining: false,
    });
    officers[1]!.level = 2;
    expect(formationLeaderVisual(officers, ids)).toEqual({
      portraitKey: 'guanyu',
      navalTraining: true,
    });
    officers[0]!.force = 100;
    expect(formationLeaderVisual(officers, ids)).toEqual({
      portraitKey: 'caocao',
      navalTraining: false,
    });
    expect(formationLeaderVisual(officers, [])).toEqual({
      portraitKey: undefined,
      navalTraining: false,
    });
    expect(officers.map((o) => o.id)).toEqual(['caocao', 'guanyu']);
  });
});
