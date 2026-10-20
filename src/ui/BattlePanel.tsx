import { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  CircleHelp,
  CloudRain,
  FastForward,
  Flag,
  Flame,
  Mountain,
  Package,
  ShieldAlert,
  Sparkles,
  Sun,
  Swords,
  Target,
  TreePine,
  Wheat,
  Wind,
  X,
} from 'lucide-react';
import { TROOP_LABELS, factionById } from '../content/scenario';
import {
  TACTIC_POINT_CAP,
  forecastAttack,
  forecastSkill,
  getAttackTargets,
  getAvailableTactics,
  getBattleUnitMove,
  getBattleUnitRange,
  getTacticTargets,
  getZocStopTiles,
  moraleState,
  supplyDaysLeft,
} from '../game/battle';
import type { BattleSkill, BattleState, BattleUnit, GameCommand } from '../game/types';
import { useI18n } from '../i18n';
import { nextReadyUnit, unitReadiness } from './battlePresentation';
import Portrait from './Portrait';
import TraitChips from './TraitChips';
import TroopIcon from './TroopIcon';
import TroopLegend from './TroopLegend';

const number = (n: number) => new Intl.NumberFormat('en').format(n);
const span = (a: number, b: number) => (a === b ? number(a) : `${number(a)}–${number(b)}`);

const SKILL_ICONS = {
  fire: Flame,
  rally: Flag,
  confuse: Sparkles,
  raidSupply: Package,
  ambush: TreePine,
  rockfall: Mountain,
} as const;
const SKILL_LABELS: Record<BattleSkill, string> = {
  fire: 'Fire',
  rally: 'Rally',
  confuse: 'Confuse',
  raidSupply: 'Raid supplies',
  ambush: 'Ambush',
  rockfall: 'Rockfall',
};
/** Accessible names for target buttons; each is a catalogue key so both languages read well. */
const TARGET_LABELS: Record<BattleSkill, string> = {
  fire: 'fire {name}',
  rally: 'rally {name}',
  confuse: 'confuse {name}',
  raidSupply: 'raid supplies from {name}',
  ambush: 'ambush {name}',
  rockfall: 'rockfall on {name}',
};
const SKILL_NOTES: Record<BattleSkill, string> = {
  fire: 'Fire: rain weakens it; wind and forests strengthen it. Costs {cost} tactic points.',
  rally:
    'Rally restores allied morale and removes confusion. Choose yourself or an ally in range. Costs {cost} tactic points.',
  confuse:
    'Confuse: success depends on both commanders’ intellect, and the target loses a turn. Costs {cost} tactic points.',
  raidSupply:
    'Raid supplies: seize half of the target’s army rations and keep half of what is taken. Costs {cost} tactic points.',
  ambush:
    'Ambush: from a forest, without moving, strike an enemy within two tiles for 40% more damage and no counterattack. Costs {cost} tactic points.',
  rockfall:
    'Rockfall: from a hill, crush an enemy within two tiles (not on a hill), ignoring terrain defense and shaking morale. Costs {cost} tactic points.',
};

export interface BattlePanelProps {
  battle: BattleState;
  unit: BattleUnit | undefined;
  canAct: boolean;
  skill: BattleSkill | null;
  setSkill: (skill: BattleSkill | null) => void;
  reachableTiles: { x: number; y: number }[];
  destination: string;
  setDestination: (value: string) => void;
  moveUnit: (x: number, y: number) => void;
  selectUnit: (id: string) => void;
  chooseSkill: (skill: BattleSkill) => void;
  performTarget: (id: string) => void;
  execute: (command: GameCommand) => boolean;
  nextCommander: () => void;
  showThreat: boolean;
  setShowThreat: (value: boolean) => void;
  advanceToContact: () => void;
  advancing: boolean;
}

/** The tactical command sidebar: unit orders, forecasts, supplies and the battle log. */
export default function BattlePanel(props: BattlePanelProps) {
  const { t, tx } = useI18n();
  const { battle, unit, canAct, skill, execute } = props;
  const [legendOpen, setLegendOpen] = useState(false);
  const nextUnit = nextReadyUnit(battle, unit?.id ?? null);
  const side = battle.playerSide;
  const foeSide = side === 'attacker' ? 'defender' : 'attacker';
  const mine = battle.units.filter((u) => u.side === side && u.troops > 0);
  const theirs = battle.units.filter((u) => u.side === foeSide && u.troops > 0);
  const tactics = unit ? getAvailableTactics(battle, unit.id) : [];
  const stops = unit
    ? new Set(getZocStopTiles(battle, unit.id).map((tile) => `${tile.x},${tile.y}`))
    : new Set<string>();
  const destination = props.reachableTiles.find(
    (tile) => `${tile.x},${tile.y}` === props.destination,
  );
  const targetIds =
    unit && canAct
      ? skill
        ? getTacticTargets(battle, unit.id, skill)
        : getAttackTargets(battle, unit.id)
      : [];
  const targets = targetIds
    .map((id) => battle.units.find((u) => u.id === id))
    .filter((u): u is BattleUnit => !!u);
  const tacticPoints = battle.tacticPoints[side];
  const weatherIcon = (weather: BattleState['weather']) =>
    weather === 'clear' ? (
      <Sun size={16} />
    ) : weather === 'rain' ? (
      <CloudRain size={16} />
    ) : (
      <Wind size={16} />
    );
  const foeName = (u: BattleUnit) =>
    factionById(u.side === 'attacker' ? battle.attackerId : battle.defenderId)?.name ??
    'The garrison';
  const moraleLabel = (u: BattleUnit) => {
    const state = moraleState(u);
    return state === 'routed' ? 'Routed' : state === 'wavering' ? 'Wavering' : null;
  };

  /** Casualty forecast shown on every target button and in its tooltip. */
  function forecastText(target: BattleUnit): string {
    if (!unit) return '';
    if (!skill) {
      const f = forecastAttack(battle, unit.id, target.id);
      if (!f) return '';
      const lethal = f.lethal ? ` · ${t('lethal')}` : '';
      return f.counterMax > 0
        ? t('≈ {casualties} casualties · counter ≈ {counter}', {
            casualties: span(f.min, f.max),
            counter: span(f.counterMin, f.counterMax),
          }) + lethal
        : t('≈ {casualties} casualties · no counter', { casualties: span(f.min, f.max) }) + lethal;
    }
    const f = forecastSkill(battle, unit.id, skill, target.id);
    if (!f) return '';
    if (skill === 'rally') return t('+{count} morale', { count: f.moraleGain });
    if (skill === 'confuse') return t('{count}% chance', { count: f.chance });
    if (skill === 'raidSupply') return t('{count} food seized', { count: number(f.foodTaken) });
    if (skill === 'rockfall')
      return t('≈ {casualties} casualties · −10 morale', { casualties: span(f.min, f.max) });
    return t('≈ {casualties} casualties', { casualties: span(f.min, f.max) });
  }

  const SelectedIcon = skill ? SKILL_ICONS[skill] : Swords;
  const supply = (s: 'attacker' | 'defender') => supplyDaysLeft(battle, s);

  return (
    <>
      <div className="inspector-title">
        <span className="eyebrow">{t('TACTICAL COMMAND')}</span>
        <h2>{t('Hold your ground.')}</h2>
        <p>{t('Capture the enemy camp or break their army.')}</p>
      </div>
      <div className="battle-conditions">
        <span>
          {weatherIcon(battle.weather)} {tx(battle.weather)}
        </span>
        <span data-testid="weather-forecast">
          {weatherIcon(battle.nextWeather)}{' '}
          {t('Tomorrow: {weather}', { weather: battle.nextWeather })}
        </span>
        <span data-testid="supply-days">
          <Wheat size={16} />
          {t('Supplies: {count} days left', { count: supply(side) })}
          {' · '}
          {t('Enemy {count} days', { count: supply(foeSide) })}
        </span>
        <span>
          <Wheat size={16} />
          {number(side === 'attacker' ? battle.attackerFood : battle.defenderFood)} {t('supplies')}
        </span>
      </div>
      <div className="tactic-points" aria-label={t('Tactic points')}>
        <span>
          {t('Tactic points')}
          <strong>
            {tacticPoints}
            <small> / {TACTIC_POINT_CAP}</small>
          </strong>
        </span>
        <div className="meter-track">
          <i
            style={{ width: `${(tacticPoints / TACTIC_POINT_CAP) * 100}%`, background: '#6a5d8c' }}
          />
        </div>
      </div>
      <div className="army-balance">
        <span>
          {t('Your army')}
          <strong>{number(mine.reduce((s, u) => s + u.troops, 0))}</strong>
        </span>
        <Swords size={18} />
        <span>
          {t('Enemy army')}
          <strong>{number(theirs.reduce((s, u) => s + u.troops, 0))}</strong>
        </span>
      </div>
      <div className="battle-toolbar">
        <button
          className="primary-outline next-commander"
          onClick={props.nextCommander}
          disabled={!nextUnit}
        >
          <ArrowRight size={17} />
          {t('Next ready commander')}
        </button>
        <button
          className={`primary-outline ${props.showThreat ? 'selected' : ''}`}
          aria-pressed={props.showThreat}
          onClick={() => props.setShowThreat(!props.showThreat)}
        >
          <ShieldAlert size={17} />
          {t(props.showThreat ? 'Hide enemy reach' : 'Show enemy reach')}
        </button>
        <button
          className="primary-outline"
          disabled={props.advancing}
          onClick={props.advanceToContact}
          title={t('End days automatically until the armies are in reach, up to ten days.')}
        >
          <FastForward size={17} />
          {t('Advance to contact')}
        </button>
        {!nextUnit && (
          <p className="subtle">{t('No ready commanders remain. End the day to continue.')}</p>
        )}
      </div>
      <button
        className="legend-toggle"
        onClick={() => setLegendOpen(!legendOpen)}
        aria-expanded={legendOpen}
      >
        <CircleHelp size={17} />
        {t('Troops & banners legend')}
        <ChevronDown size={16} />
      </button>
      {legendOpen && <TroopLegend />}
      <div className="battle-map-hint">
        <Target size={16} />
        <span>
          {skill && unit
            ? t('Choose a target for {skill} within range.', { skill: SKILL_LABELS[skill] })
            : unit?.status === 'confused'
              ? t('{name} is confused. Rally them with an ally, or end the day.', {
                  name: unit.name,
                })
              : unit && moraleState(unit) === 'routed'
                ? t('{name} has routed and can only move or hold. Rally them, or end the day.', {
                    name: unit.name,
                  })
                : unit?.acted
                  ? t('{name} has acted. Select another commander or end the day.', {
                      name: unit.name,
                    })
                  : unit
                    ? t('{name}: select a highlighted tile to move, or an enemy to attack.', {
                        name: unit.name,
                      })
                    : t('Select a unit to give orders.')}
        </span>
        {skill && (
          <button onClick={() => props.setSkill(null)} aria-label={t('Cancel tactic targeting')}>
            {t('Cancel')}
          </button>
        )}
      </div>
      {unit && (
        <div className="unit-card">
          <span className="eyebrow">{t('SELECTED COMMANDER')}</span>
          <div className="selected-identity">
            <Portrait officerId={unit.officerId} large />
            <div className="identity-details">
              <h3>{tx(unit.name)}</h3>
              <div className="identity-faction">
                <Flag size={17} />
                {tx(foeName(unit))}
              </div>
              <span className="subtle troop-description">
                <TroopIcon type={unit.troopType} />
                {tx(TROOP_LABELS[unit.troopType])} · {number(unit.troops)} {t('troops')}
              </span>
              <TraitChips officerId={unit.officerId} />
              <p
                className={`readiness ${unit.status === 'confused' ? 'unavailable' : unit.acted ? 'finished' : 'ready'}`}
              >
                <span aria-hidden="true">
                  {unit.status === 'confused' ? '?' : unit.acted ? '✓' : unit.moved ? '→' : '○'}
                </span>
                {t(unitReadiness(unit))}
              </p>
            </div>
          </div>
          <div className="unit-facts">
            <span>
              {t('Move')} <b>{getBattleUnitMove(unit)}</b>
            </span>
            <span>
              {t('Range')} <b>{getBattleUnitRange(unit)}</b>
            </span>
            <span>
              {t('Morale')} <b>{unit.morale}</b>
              {moraleLabel(unit) && <em className="morale-badge"> · {t(moraleLabel(unit)!)}</em>}
            </span>
            {unit.level > 0 && (
              <span>
                {t('Level')} <b>{unit.level}</b>
              </span>
            )}
          </div>
          <div className="unit-status">
            <span className={unit.moved || unit.acted || unit.status === 'confused' ? 'used' : ''}>
              {tx(
                unit.status === 'confused'
                  ? 'Movement blocked'
                  : unit.moved || unit.acted
                    ? 'Movement used'
                    : 'Movement ready',
              )}
            </span>
            <span className={unit.acted || unit.status === 'confused' ? 'used' : ''}>
              {tx(
                unit.status === 'confused'
                  ? 'Action blocked'
                  : unit.acted
                    ? 'Action used'
                    : 'Action ready',
              )}
            </span>
          </div>
          {unit.status === 'confused' && (
            <p className="inline-notice" role="status">
              {t(
                'Confused: this commander loses the current turn. Another commander can Rally them, or end the day to recover.',
              )}
            </p>
          )}
          {unit.status === 'inspired' && (
            <p className="subtle">{t('Inspired: attacks deal 20% more damage today.')}</p>
          )}
          <div className="battle-movement">
            <label className="field-label" htmlFor="battle-destination">
              {t('Move to tile')}
              <select
                id="battle-destination"
                value={destination ? props.destination : ''}
                onChange={(event) => props.setDestination(event.target.value)}
                disabled={!canAct || !props.reachableTiles.length || !!skill}
              >
                <option value="">
                  {tx(
                    unit.status === 'confused'
                      ? 'Movement blocked'
                      : unit.moved || unit.acted
                        ? 'Movement used'
                        : props.reachableTiles.length
                          ? 'Choose a reachable tile'
                          : 'No reachable tiles',
                  )}
                </option>
                {props.reachableTiles.map((tile) => (
                  <option key={`${tile.x},${tile.y}`} value={`${tile.x},${tile.y}`}>
                    {String.fromCharCode(65 + tile.x)}
                    {tile.y + 1} · {tx(battle.terrain[tile.y * battle.width + tile.x])}
                    {stops.has(`${tile.x},${tile.y}`) ? ` · ${t('stops here')}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-outline"
              disabled={!canAct || !destination || !!skill}
              onClick={() => {
                if (destination) props.moveUnit(destination.x, destination.y);
              }}
            >
              {t('Move unit')}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="tactic-actions">
            {tactics.map((entry) => {
              const Icon = SKILL_ICONS[entry.skill];
              const reason = entry.reason;
              return (
                <button
                  key={entry.skill}
                  disabled={!canAct || !entry.allowed}
                  onClick={() => props.chooseSkill(entry.skill)}
                  aria-pressed={skill === entry.skill}
                  aria-label={t(SKILL_LABELS[entry.skill])}
                  className={skill === entry.skill ? 'selected' : ''}
                  title={reason ? tx(reason) : t(SKILL_NOTES[entry.skill], { cost: entry.cost })}
                >
                  <Icon size={16} />
                  {t(SKILL_LABELS[entry.skill])}
                  <small>{entry.cost}</small>
                </button>
              );
            })}
          </div>
          {canAct && !skill && tactics.every((entry) => !entry.allowed) && tactics[0]?.reason && (
            <p className="subtle" data-testid="tactic-reason">
              {tx(tactics[0].reason)}
            </p>
          )}
          {skill && (
            <div className="battle-tactic-note">
              <p className="subtle">
                {t(SKILL_NOTES[skill], {
                  cost: tactics.find((entry) => entry.skill === skill)?.cost ?? 0,
                })}
              </p>
              <button className="text-button" onClick={() => props.setSkill(null)}>
                <X size={13} />
                {t('Cancel')} {t(SKILL_LABELS[skill])}
              </button>
            </div>
          )}
          <button
            className="text-button"
            disabled={!canAct}
            onClick={() => {
              if (execute({ type: 'battleWait', unitId: unit.id })) props.setSkill(null);
            }}
          >
            {t('Hold position')} <ArrowRight size={14} />
          </button>
          {canAct && (skill || targets.length > 0) && (
            <div className={`attack-targets ${skill === 'rally' ? 'rally-targets' : ''}`}>
              <span className="eyebrow">
                {skill
                  ? t('{skill} TARGETS', { skill: SKILL_LABELS[skill].toUpperCase() })
                  : tx('IN ATTACK RANGE')}
              </span>
              {targets.length ? (
                targets.map((target) => {
                  const forecast = forecastText(target);
                  return (
                    <button
                      key={target.id}
                      onClick={() => props.performTarget(target.id)}
                      title={forecast}
                      aria-label={t(skill ? TARGET_LABELS[skill] : 'Attack {name}', {
                        name: target.name,
                      })}
                    >
                      <SelectedIcon size={13} />
                      <span>
                        {tx(target.name)}
                        {tx(target.id === unit.id ? ' (self)' : '')}
                        <small>
                          {number(target.troops)} {t('troops')} · {target.morale}{' '}
                          {t('Morale').toLowerCase()}
                          {target.status === 'confused' ? ` · ${t('Confused')}` : ''}
                        </small>
                        <small className="forecast">{forecast}</small>
                      </span>
                      <ArrowRight size={13} />
                    </button>
                  );
                })
              ) : (
                <p className="subtle">
                  {t('No valid targets in range. Cancel to move or choose another commander.')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <div className="section-heading">
        <h3>{t('Your commanders')}</h3>
        <span>
          {mine.length} {t('standing')}
        </span>
      </div>
      <div className="battle-unit-list">
        {mine.map((u) => (
          <button
            key={u.id}
            onClick={() => props.selectUnit(u.id)}
            className={u.id === unit?.id ? 'selected' : ''}
          >
            <Portrait officerId={u.officerId} />
            <span>
              {tx(u.name)}
              <small>
                <TroopIcon type={u.troopType} />
                {tx(TROOP_LABELS[u.troopType])} · {t(unitReadiness(u))}
                {u.status === 'inspired' && <> · {t('Inspired')}</>}
                {moraleLabel(u) && <> · {t(moraleLabel(u)!)}</>}
              </small>
            </span>
            <strong>{number(u.troops)}</strong>
            <i className={u.acted || u.status === 'confused' ? 'spent' : 'ready'} />
          </button>
        ))}
      </div>
      <div className="section-heading">
        <h3>{t('Enemy commanders')}</h3>
        <span>{theirs.length}</span>
      </div>
      <div className="enemy-commander-list" role="list" aria-label={t('Enemy commanders')}>
        {theirs.map((enemy) => (
          <div className="enemy-unit" role="listitem" tabIndex={0} key={enemy.id}>
            <Portrait officerId={enemy.officerId} />
            <span>
              <strong>{tx(enemy.name)}</strong>
              <small>
                <TroopIcon type={enemy.troopType} />
                {tx(TROOP_LABELS[enemy.troopType])} · {tx(foeName(enemy))}
                {moraleLabel(enemy) && <> · {t(moraleLabel(enemy)!)}</>}
              </small>
            </span>
            <strong>{number(enemy.troops)}</strong>
          </div>
        ))}
      </div>
      <div className="battle-report">
        {battle.log
          .slice(-5)
          .reverse()
          .map((log, i) => (
            <p key={`${i}-${log}`}>{tx(log)}</p>
          ))}
      </div>
      <div className="battle-secondary">
        <button
          onClick={() => {
            if (window.confirm(t('Withdraw from this battle? Your surviving troops will retreat.')))
              execute({ type: 'battleRetreat' });
          }}
        >
          {t('Retreat')}
        </button>
        <button
          onClick={() => {
            if (
              window.confirm(
                t('Let your commanders resolve the rest of this battle automatically?'),
              )
            )
              execute({ type: 'battleAuto' });
          }}
        >
          {t('Auto-resolve')}
        </button>
      </div>
    </>
  );
}
