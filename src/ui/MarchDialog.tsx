import { useEffect } from 'react';
import { ArrowRight, Shield, TriangleAlert, Wheat } from 'lucide-react';
import { TROOP_LABELS, factionById } from '../content/scenario';
import { plunderLeader, plunderOutcome } from '../game/plunder';
import { RAID_SUPPLY_DAYS, SUPPLY_DAY_OPTIONS, supplyFood } from '../game/supply';
import type {
  AttackIntent,
  City,
  GameCommand,
  GameState,
  Officer,
  SupplyDays,
} from '../game/types';
import { useI18n } from '../i18n';
import OfficerMark from './OfficerMark';

const number = (n: number) => new Intl.NumberFormat('en').format(n);

export interface MarchDialogProps {
  state: GameState;
  city: City;
  available: Officer[];
  target: string;
  setTarget: (id: string) => void;
  officers: string[];
  setOfficers: (ids: string[]) => void;
  intent: AttackIntent;
  setIntent: (intent: AttackIntent) => void;
  supplyDays: SupplyDays;
  setSupplyDays: (days: SupplyDays) => void;
  onIssue: (command: GameCommand) => void;
}

const INTENTS: { intent: AttackIntent; label: string; note: string }[] = [
  {
    intent: 'conquer',
    label: 'Conquer',
    note: 'Take the city intact. Its people keep their livelihoods.',
  },
  {
    intent: 'sack',
    label: 'Sack',
    note: 'Conquer the city, then plunder it for gold and food. Support, farming and commerce are halved.',
  },
  {
    intent: 'raid',
    label: 'Raid',
    note: 'Strike, loot and go home within 10 days. The city is not taken; any defenders must be beaten first.',
  },
];

/** The march planner: destination, commanders, intent and how many days of rations to carry. */
export default function MarchDialog(props: MarchDialogProps) {
  const { t, tx } = useI18n();
  const { state, city, intent } = props;
  const target = state.cities.find((c) => c.id === props.target);
  const chosen = state.officers.filter((o) => props.officers.includes(o.id));
  const troops = chosen.reduce((sum, o) => sum + o.troops, 0);
  const days: SupplyDays = intent === 'raid' ? RAID_SUPPLY_DAYS : props.supplyDays;
  const food = supplyFood(troops, days);
  const cooldown = target ? Math.max(0, target.plunderCooldownUntil - state.turn) : 0;
  // Upkeep is paid monthly from the same store, so warn before the army empties it.
  const strength =
    city.reserve +
    state.officers
      .filter((o) => o.cityId === city.id && o.factionId === city.factionId && !o.captive)
      .reduce((sum, o) => sum + o.troops, 0);
  const monthlyUpkeep = Math.ceil(strength * 0.12);
  const leader = plunderLeader(chosen);
  const loot = target && leader ? plunderOutcome(target, leader) : null;
  const short = city.food < food;
  const thin = !short && city.food - food < monthlyUpkeep;
  const { intent: currentIntent, setIntent } = props;
  // A target under plunder cooldown can only be conquered.
  useEffect(() => {
    if (cooldown > 0 && currentIntent !== 'conquer') setIntent('conquer');
  }, [cooldown, currentIntent, setIntent]);
  return (
    <>
      <p className="dialog-copy">
        {t(
          'Choose your destination, commanders and supplies. Armies depart at the end of the month.',
        )}
      </p>
      <label className="field-label">
        {t('Destination')}
        <select value={props.target} onChange={(e) => props.setTarget(e.target.value)}>
          {city.neighbors
            .filter((id) => state.cities.find((c) => c.id === id)?.factionId !== city.factionId)
            .map((id) => {
              const place = state.cities.find((c) => c.id === id)!;
              return (
                <option key={id} value={id}>
                  {tx(place.name)} · {tx(factionById(place.factionId)?.name ?? 'Unclaimed')}
                </option>
              );
            })}
        </select>
      </label>
      <fieldset className="march-intent">
        <legend>{t('Purpose of the march')}</legend>
        {INTENTS.map((entry) => {
          const blocked = entry.intent !== 'conquer' && cooldown > 0;
          return (
            <label key={entry.intent} className={intent === entry.intent ? 'selected' : ''}>
              <input
                type="radio"
                name="march-intent"
                checked={intent === entry.intent}
                disabled={blocked}
                onChange={() => props.setIntent(entry.intent)}
              />
              <span>
                <strong>{t(entry.label)}</strong>
                <small>
                  {blocked
                    ? t('Plundered recently: available again in {count} months.', {
                        count: cooldown,
                      })
                    : t(entry.note)}
                </small>
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="march-roster">
        {props.available
          .filter((o) => o.troops > 0)
          .map((o) => (
            <label key={o.id}>
              <input
                type="checkbox"
                checked={props.officers.includes(o.id)}
                onChange={(e) =>
                  props.setOfficers(
                    e.target.checked
                      ? [...props.officers, o.id]
                      : props.officers.filter((id) => id !== o.id),
                  )
                }
              />
              <OfficerMark officer={o} size="small" />
              <span>
                <strong>{tx(o.name)}</strong>
                <small>
                  {tx(TROOP_LABELS[o.troopType])} · {o.stamina} {t('stamina')}
                </small>
              </span>
              <b>{number(o.troops)}</b>
            </label>
          ))}
      </div>
      <div className="supply-choice" role="radiogroup" aria-label={t('Days of supplies')}>
        <span className="eyebrow">{t('DAYS OF SUPPLIES')}</span>
        <div>
          {SUPPLY_DAY_OPTIONS.map((option) => {
            const cost = supplyFood(troops, option);
            const fixed = intent === 'raid';
            return (
              <button
                key={option}
                role="radio"
                aria-checked={days === option}
                disabled={fixed && option !== RAID_SUPPLY_DAYS}
                className={days === option ? 'selected' : ''}
                onClick={() => props.setSupplyDays(option)}
              >
                <strong>{t('{count} days', { count: option })}</strong>
                <small>
                  {number(cost)} {t('food')}
                </small>
              </button>
            );
          })}
        </div>
        <p className="subtle">
          {intent === 'raid'
            ? t('A raid carries 10 days of rations and must finish within 10 days.')
            : t('When the rations run out, your soldiers desert. A longer siege needs more.')}
        </p>
      </div>
      <div className="dispatch-summary">
        <span>
          <Shield size={16} />
          {number(troops)} {t('troops')}
        </span>
        <span>
          <Wheat size={16} />
          {number(food)} {t('food')}
        </span>
      </div>
      {loot && intent !== 'conquer' && (
        <p className="inline-notice" role="note" data-testid="loot-preview">
          {t(
            'Expected loot: about {gold} gold and {food} food. The city falls to half its support, farming and commerce.',
            { gold: number(loot.gold), food: number(loot.food) },
          )}
        </p>
      )}
      {(short || thin) && (
        <p className="inline-notice warning" role="alert">
          <TriangleAlert size={15} />
          {short
            ? t('{city} cannot supply {count} food.', { city: city.name, count: number(food) })
            : t('Warning: {city} would be left with less than a month of provisions.', {
                city: city.name,
              })}
        </p>
      )}
      <button
        className="primary-button full"
        disabled={!props.target || !props.officers.length || short}
        onClick={() =>
          props.onIssue({
            type: 'march',
            sourceId: city.id,
            targetId: props.target,
            officerIds: props.officers,
            intent,
            supplyDays: days,
          })
        }
      >
        {t('Issue march order')}
        <ArrowRight size={17} />
      </button>
    </>
  );
}
