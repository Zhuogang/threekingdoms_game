import { useEffect, useRef, type CSSProperties } from 'react';
import { Button } from '../../v03/ui/kit';
import { OfficerPortrait } from '../../v03/rendering/OfficerPortrait';
import { GATES, INNER_WALL_SEGMENTS } from '../content/chencang';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import type { GateId, SiegeState, SiegeSide } from '../rules/types';
import type { HintKind } from '../save';
import { SIEGE_TUNING as T } from '../rules/tuning';
import { scoringScreen } from './scoring';
import { HINT_COPY, OPENING, engineKey, siegeSummary } from './story';
import { SiegeIcon, paperPiece, storyArt, storyPortrait } from './storyAssets';

export const paperStyle = {
  '--siege-paper': `url("${paperPiece('paper-tile')}")`,
} as CSSProperties;
const copy =
  (locale: SiegeLocale) =>
  (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(locale, key, params);

export function SiegeOpening({
  step,
  locale,
  next,
  skip,
}: {
  step: number;
  locale: SiegeLocale;
  next: () => void;
  skip: () => void;
}) {
  const line = OPENING[Math.min(step, OPENING.length - 1)]!;
  const t = copy(locale);
  return (
    <section
      className="siege-opening siege-story-scene"
      data-testid={`opening-${line.scene - 1}`}
      aria-label={t('opening')}
    >
      <img
        className="siege-scene-picture"
        src={storyArt(line.scene)}
        alt={t(line.scene === 2 ? 'openingScene1' : 'openingScene2')}
      />
      <Button className="siege-skip-opening" onClick={skip}>
        {t('skipOpening')}
      </Button>
      <div className="siege-dialogue" style={{ backgroundImage: `url("${paperPiece('dialog')}")` }}>
        {line.speaker === 'zhugeliang' ? (
          <OfficerPortrait id="zhugeliang" locale={locale} size={256} eager />
        ) : (
          <img className="siege-speaker-portrait" src={storyPortrait(line.speaker)} alt="" />
        )}
        <div className="siege-dialogue-copy">
          <h2 style={{ backgroundImage: `url("${paperPiece('plaque')}")` }}>{t(line.speaker)}</h2>
          <p aria-live="polite" data-testid="opening-dialogue">
            {t(line.text)}
          </p>
          <div className="siege-dialogue-controls">
            <span>
              {step + 1} / {OPENING.length}
            </span>
            <Button variant="primary" data-testid="opening-next" onClick={next}>
              {t(step === OPENING.length - 1 ? 'toDeploy' : 'nextLine')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SiegeActBanner({
  act,
  locale,
  close,
}: {
  act: 1 | 2;
  locale: SiegeLocale;
  close: () => void;
}) {
  const t = copy(locale);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector('button')?.focus();
  }, []);
  return (
    <div
      ref={panel}
      className="siege-banner-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="siege-act-title"
      data-testid={`banner-act${act}`}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          panel.current?.querySelector('button')?.focus();
        }
        if (event.key === 'Escape') close();
      }}
    >
      <div className="siege-scroll">
        <img src={paperPiece('scroll-left')} alt="" />
        <div
          className="siege-scroll-middle"
          style={{ backgroundImage: `url("${paperPiece('scroll-middle')}")` }}
        >
          <div className="siege-scroll-copy">
            <h1 id="siege-act-title">{t(act === 1 ? 'act1Title' : 'act2Title')}</h1>
            <p>{t(act === 1 ? 'act1Line' : 'act2Line')}</p>
            <Button variant="primary" onClick={close}>
              {t('enterAct')}
            </Button>
          </div>
        </div>
        <img src={paperPiece('scroll-right')} alt="" />
      </div>
    </div>
  );
}

export function SiegeHint({
  kind,
  locale,
  dismiss,
  place,
}: {
  kind: HintKind;
  locale: SiegeLocale;
  dismiss: () => void;
  place?: string;
}) {
  const t = copy(locale),
    [title, body] = HINT_COPY[kind];
  return (
    <aside className="siege-hint" role="region" aria-label={t(title)} data-testid={`hint-${kind}`}>
      <h3>{t(title)}</h3>
      {place && <small>{place}</small>}
      <p>{t(body, { trench: T.trenchCapacity, wall: INNER_WALL_SEGMENTS[0]!.buildPoints })}</p>
      <Button size="sm" onClick={dismiss}>
        {t('dismissHint')}
      </Button>
    </aside>
  );
}

export function SiegeEnding({
  state,
  locale,
  summary,
  playerSide = 'shu',
  onSummary,
  onExit,
}: {
  state: SiegeState;
  locale: SiegeLocale;
  summary: boolean;
  playerSide?: SiegeSide;
  onSummary: (show: boolean) => void;
  onExit: () => void;
}) {
  const t = copy(locale),
    outcome = state.outcome!;
  if (summary)
    return (
      <SiegeSummary
        state={state}
        locale={locale}
        playerSide={playerSide}
        onEnding={() => onSummary(false)}
        onExit={onExit}
      />
    );
  const narration: SiegeTextKey[] =
    outcome === 'victory'
      ? ['victoryLine1', 'victoryLine2']
      : outcome === 'defeat'
        ? ['defeatLine1', 'defeatLine2']
        : state.withdrawn
          ? ['withdrawLine1', 'withdrawLine2']
          : ['historicalLine1', 'historicalLine2'];
  const rating =
    outcome === 'victory'
      ? 'ratingVictory'
      : outcome === 'defeat'
        ? 'ratingDefeat'
        : state.withdrawn
          ? 'ratingWithdraw'
          : 'ratingHistorical';
  return (
    <section className="siege-ending siege-story-scene" data-testid={`ending-${outcome}`}>
      <img
        className="siege-scene-picture"
        data-testid="ending-picture"
        src={storyArt(outcome === 'victory' ? 5 : outcome === 'historical' ? 6 : 7)}
        alt={t(outcome)}
      />
      <div className="siege-ending-copy">
        <small>{t('ending')}</small>
        <h1>{t(outcome)}</h1>
        <div data-testid="ending-narration">
          {narration.map((key) => (
            <p key={key}>{t(key)}</p>
          ))}
        </div>
        <p className="siege-rating" data-testid="ending-rating">
          {t(rating)}
        </p>
        <Score state={state} locale={locale} side={playerSide} />
        <Button variant="primary" onClick={() => onSummary(true)}>
          {t('viewSummary')}
        </Button>
      </div>
    </section>
  );
}

export function SiegeSummary({
  state,
  locale,
  onEnding,
  playerSide = 'shu',
  onExit,
}: {
  state: SiegeState;
  locale: SiegeLocale;
  onEnding: () => void;
  playerSide?: SiegeSide;
  onExit: () => void;
}) {
  const t = copy(locale),
    result = siegeSummary(state);
  return (
    <section className="siege-summary" data-testid="siege-summary">
      <header>
        <h1>{t('summary')}</h1>
        <strong>{t('daysFought', { n: result.days })}</strong>
      </header>
      <div className="siege-summary-grid">
        <section>
          <h2>{t('losses')}</h2>
          <table>
            <thead>
              <tr>
                {(['side', 'lossTotal', 'dead', 'stillWounded'] as const).map((key) => (
                  <th key={key}>{t(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['shu', 'wei'] as const).map((side) => (
                <tr key={side}>
                  <th>{t(side)}</th>
                  <td>{result[side].total}</td>
                  <td>{result[side].dead}</td>
                  <td>{result[side].wounded}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <small>{t('lossNote')}</small>
          </p>
        </section>
        <section>
          <h2>{t('engineSummary')}</h2>
          <table>
            <thead>
              <tr>
                {(['engineKind', 'built', 'destroyed'] as const).map((key) => (
                  <th key={key}>{t(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.engines.map((e) => (
                <tr key={e.kind}>
                  <th>
                    <SiegeIcon name={engineKey(e.kind)} />
                    {t(engineKey(e.kind))}
                  </th>
                  <td>{e.built}</td>
                  <td>{e.destroyed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2>
            <SiegeIcon name="gates" />
            {t('gates')}
          </h2>
          {(Object.keys(GATES) as GateId[]).map((id) => {
            const gate = state.gates[id];
            return (
              <p key={id}>
                {t('gateSummary', {
                  gate: t(id),
                  state: t(
                    gate.broken || gate.durability <= 0
                      ? 'gateBroken'
                      : gate.durability < gate.max
                        ? 'gateDamaged'
                        : 'gateIntact',
                  ),
                  n: gate.durability,
                  max: gate.max,
                })}
              </p>
            );
          })}
        </section>
        <section>
          <h2>
            <SiegeIcon name="fillTrench" />
            {t('hintTrenchTitle')}
          </h2>
          <p>{t('trenchSummary', result.trench)}</p>
          <h3>{t('innerWall')}</h3>
          {INNER_WALL_SEGMENTS.map((s) => (
            <p key={s.index}>
              {t('segment', { n: s.index + 1 })} ·{' '}
              {t('progress', { n: state.innerWall[s.index] ?? 0, max: s.buildPoints })}
            </p>
          ))}
        </section>
      </div>
      <Score state={state} locale={locale} side={playerSide} />
      <section className="siege-history">
        <h2>{t('inHistory')}</h2>
        <p>{t('historyParagraph')}</p>
      </section>
      <nav>
        <Button onClick={onEnding}>{t('viewEnding')}</Button>
        <Button onClick={onExit}>{t('back')}</Button>
      </nav>
    </section>
  );
}

function Score({
  state,
  locale,
  side,
}: {
  state: SiegeState;
  locale: SiegeLocale;
  side: SiegeSide;
}) {
  const result = scoringScreen(state, locale, side);
  return (
    <section className="siege-score" data-testid="score-panel">
      <h2>
        {siegeText(locale, 'scoreTitle')} · {result.tier}
      </h2>
      <strong>{siegeText(locale, 'scoreValue', { n: Math.round(result.score) })}</strong>
      <dl>
        {result.parts.map((part) => (
          <div key={part.key} data-testid={`score-part-${part.key}`}>
            <dt>{part.label}</dt>
            <dd>{Math.round(part.value)}</dd>
          </div>
        ))}
      </dl>
      <p>{result.history}</p>
      <table data-testid="extended-summary">
        <tbody>
          {result.summary.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
