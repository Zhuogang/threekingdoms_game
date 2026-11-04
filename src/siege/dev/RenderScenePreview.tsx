import { useEffect, useMemo, useRef, useState } from 'react';
import { SiegeMapView, type SiegeMapHandle } from '../render/SiegeMapView';
import { POSE_SETS, sheet, sheetImage } from '../render/assets';
import { nightReplay, type NightFrame } from '../render/nightReplay';
import { endDay } from '../rules/day';
import { createRenderScene, RENDER_SCENES, type RenderSceneName } from './renderScenes';
import '../ui/siege.css';

export default function RenderScenePreview({ name }: { name: RenderSceneName }) {
  const fixture = useMemo(() => createRenderScene(name), [name]);
  const map = useRef<SiegeMapHandle>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [frame, setFrame] = useState<NightFrame | null>(null);
  const [blinking, setBlinking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying(false);
    setFrame(null);
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const replay = (outcome: 'success' | 'guarded' | 'assault') => {
    stop();
    const before = structuredClone(fixture.state);
    if (name === 'nightTorches') {
      before.engines = [
        {
          ...createRenderScene('covered').state.engines[0]!,
          covered: false,
          x: 18,
          y: 21,
          id: 'night-ladder',
        },
      ];
      before.trenchFill['18,18'] = 0;
      before.nightOrders = { shu: { kind: 'nightAssault' } };
    } else if (name === 'sortie') {
      const target = before.engines[0]!;
      target.burning = false;
      target.durability = target.max;
      const raider = before.units.find((u) => u.side === 'wei')!;
      Object.assign(raider, { x: 23, y: 16, level: 'wall' });
      before.nightOrders = {
        wei: { kind: 'sortie', target: target.id, unitId: raider.id },
        ...(outcome === 'assault' ? { shu: { kind: 'nightAssault' as const } } : {}),
      };
      for (const unit of before.units.filter((u) => u.side === 'shu')) unit.y = 24;
      if (outcome === 'guarded') Object.assign(before.units[1]!, { x: target.x + 1, y: target.y });
    }
    const frames = nightReplay(before, endDay(before));
    setPlaying(true);
    let elapsed = 0;
    for (const next of frames) {
      timers.current.push(setTimeout(() => setFrame(next), elapsed));
      elapsed += next.night.duration;
    }
    timers.current.push(setTimeout(stop, elapsed));
  };
  const state = frame?.state ?? fixture.state;
  return (
    <main
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#ece4d2',
        color: '#302d27',
        font: '14px sans-serif',
      }}
      data-testid="render-scene"
      data-scene={name}
    >
      <nav style={{ padding: 8, display: 'flex', gap: 10 }}>
        {RENDER_SCENES.map((scene) => (
          <a key={scene} href={`?siege-map&scene=${scene}`}>
            {scene}
          </a>
        ))}
      </nav>
      <div style={{ padding: 8 }}>{fixture.legend}</div>
      <div style={{ display: 'flex', gap: 8, padding: 8 }}>
        {[0.75, 1, 1.5].map((zoom) => (
          <button
            key={zoom}
            data-testid={`zoom-${zoom}`}
            onClick={() => {
              map.current?.zoom(zoom);
              map.current?.focus({ x: 24, y: 19, level: 'ground' });
            }}
          >
            {zoom * 100}%
          </button>
        ))}
        <button onClick={() => replay('success')}>Replay</button>
        {name === 'sortie' && (
          <>
            <button onClick={() => replay('guarded')}>Guarded replay</button>
            <button onClick={() => replay('assault')}>Night assault replay</button>
          </>
        )}
        <button disabled={!playing} onClick={stop}>
          Skip replay
        </button>
        <span
          data-testid="preview-forecast"
          onMouseEnter={() => setBlinking(true)}
          onMouseLeave={() => setBlinking(false)}
        >
          Forecast: foothold +1
        </span>
        <output data-testid="preview-selection">{selected ?? 'none'}</output>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid' }}>
        <SiegeMapView
          ref={map}
          state={state}
          locale="en"
          selected={selected}
          onSelect={setSelected}
          facings={fixture.facings}
          night={frame?.night ?? fixture.night}
          showRange={false}
          forecastCell={blinking ? { x: 19, y: 16, level: 'wall' } : null}
          repulsedUnits={playing ? undefined : fixture.repulsedUnits}
          initialFocus={{ x: 24, y: 19, level: 'ground' }}
          initialZoom={0.95}
        />
      </div>
      {name === 'sortie' && (
        <div style={{ display: 'flex', justifyContent: 'space-around', height: 90 }}>
          {[...POSE_SETS['s8-05']!.poses].map(([poseName, pose]) => (
            <div key={poseName} data-reference-pose={poseName}>
              <img src={pose.href} height={50} alt={poseName} />
              <div>{poseName}</div>
            </div>
          ))}
        </div>
      )}
      {name === 'preparations' && (
        <div style={{ display: 'flex', alignItems: 'center', height: 65 }}>
          Unlit brazier (asset reference; absent from preparations state):
          <svg
            width={70}
            height={60}
            viewBox={sheet('s8-04-wall-top-preparations')
              .pieces[0]!.objects[0]!.alphaBBox!.map((v, i, a) => (i < 2 ? v : v - a[i - 2]!))
              .join(' ')}
          >
            <image
              href={sheetImage('s8-04-wall-top-preparations')}
              width={sheet('s8-04-wall-top-preparations').size[0]}
              height={sheet('s8-04-wall-top-preparations').size[1]}
            />
          </svg>
        </div>
      )}
    </main>
  );
}
