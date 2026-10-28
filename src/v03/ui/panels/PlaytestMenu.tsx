import { PLAYTEST_FIXTURES, playtestFixture } from '../../dev/fixtures';
import type { V03GameState } from '../../types';
import { Button } from '../kit';

export default function PlaytestMenu({ onLoad }: { onLoad: (state: V03GameState) => void }) {
  return (
    <details className="v03-debug-fixtures">
      <summary>Playtest fixtures</summary>
      {PLAYTEST_FIXTURES.map((fixture) => (
        <Button key={fixture} onClick={() => onLoad(playtestFixture(fixture))}>
          {fixture}
        </Button>
      ))}
    </details>
  );
}
