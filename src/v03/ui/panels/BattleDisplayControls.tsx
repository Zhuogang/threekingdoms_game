import { Button, Input } from '../kit';
import type { BattleDisplay, BattlePanel } from '../hooks/useBattleDisplay';

export function BattleDisplayControls({
  display,
  locale,
}: {
  display: BattleDisplay;
  locale: 'zh' | 'en';
}) {
  const labels: Record<BattlePanel, string> =
    locale === 'zh'
      ? {
          commands: '指令栏',
          minimap: '小地图',
          help: '操作提示',
          topbar: '全局顶栏',
          rail: '战场列表',
        }
      : {
          commands: 'Command panel',
          minimap: 'Minimap',
          help: 'Battle help',
          topbar: 'Top bar',
          rail: 'Battle list',
        };
  return (
    <div className="v03-battle-display-controls">
      <Button
        type="button"
        aria-pressed={display.expanded}
        onClick={display.expanded ? display.leave : display.expand}
      >
        {locale === 'zh'
          ? display.expanded
            ? '退出放大'
            : '放大战场'
          : display.expanded
            ? 'Restore layout'
            : 'Expand battlefield'}
      </Button>
      <Button
        type="button"
        aria-pressed={display.fullscreen}
        onClick={() => void display.toggleFullscreen()}
      >
        {locale === 'zh'
          ? display.fullscreen
            ? '退出全屏'
            : '全屏'
          : display.fullscreen
            ? 'Exit fullscreen'
            : 'Fullscreen'}
      </Button>
      <details className="v03-battle-display-menu">
        <summary>{locale === 'zh' ? '显示面板' : 'Show panels'}</summary>
        <div>
          {(Object.keys(labels) as BattlePanel[]).map((panel) => (
            <label key={panel}>
              <Input
                type="checkbox"
                checked={display.panels[panel]}
                onChange={() => display.toggle(panel)}
              />
              {labels[panel]}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
