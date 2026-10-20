import { Check, Circle, Crown, Flag, Handshake, Lightbulb } from 'lucide-react';
import { factionById } from '../content/scenario';
import { getAdvice, getGoals, type Advice, type GoalId } from '../game/advisor';
import { HEGEMON_MONTHS, getObjectives } from '../game/campaign';
import { getRivalHegemon } from '../game/world';
import type { GameCommand, GameState } from '../game/types';
import { useI18n } from '../i18n';

const ADVICE_TEXT: Record<Advice['kind'], string> = {
  rivalHegemon:
    '{faction} holds Luoyang and 16 cities and will be proclaimed Hegemon in {months} months unless you stop them.',
  food: '{city} holds {food} food but needs about {upkeep} each month. Buy provisions or develop farms.',
  openingBorder:
    '{enemy} masses {troops} troops beside {city} and may march as early as month {month}. Reinforce it, or seek peace.',
  weakBorder: '{enemy} masses {troops} troops beside {city}. Reinforce it, or seek peace.',
  idle: '{officer} commands no soldiers while {city} keeps {reserve} in reserve. Muster them.',
  atRisk: '{officer} is close to leaving (loyalty {loyalty}). Reward or feast them.',
};
const GOAL_TEXT: Record<GoalId, string> = {
  develop: 'Issue three city orders',
  muster: 'Muster an officer to 1,500 soldiers',
  recruit: 'Recruit a new officer',
  capture: 'Capture your first city',
  supply: 'Keep every city stocked with two months of food',
};
const OBJECTIVE_TEXT: Record<string, string> = {
  hegemon: 'Be proclaimed Hegemon: hold Luoyang and 16 cities for {months} months',
  capital: 'Hold the capital, Luoyang',
  cities: 'Hold 16 cities',
  rivalHegemon: '{faction} is closing in on the Hegemon title',
};

/** The monthly adviser, first-campaign goals, standing objectives and open invitations. */
export default function AdvisorPanel({
  state,
  onFocusCity,
  execute,
}: {
  state: GameState;
  onFocusCity: (cityId: string) => void;
  execute: (command: GameCommand) => boolean;
}) {
  const { t, tx } = useI18n();
  const advice = getAdvice(state);
  const goals = getGoals(state);
  const objectives = getObjectives(state);
  const rival = getRivalHegemon(state);
  return (
    <section className="advisor" aria-label={t('Adviser')}>
      <div className="report-heading">
        <Lightbulb size={20} />
        <div>
          <h3>{t('Your adviser')}</h3>
          <span>{t('Suggestions for this month')}</span>
        </div>
      </div>
      {state.invitations.map((invitation) => (
        <div className="invitation" key={invitation.id} data-testid="invitation">
          <Handshake size={16} />
          <p>
            {t('You are invited to join a coalition against {faction}.', {
              faction: tx(factionById(invitation.targetId)?.name ?? 'the rising power'),
            })}
            <small>
              {invitation.members.map((id) => tx(factionById(id)?.name ?? id)).join(' · ')}
            </small>
          </p>
          <div>
            <button
              onClick={() => execute({ type: 'invitation', id: invitation.id, accept: true })}
            >
              {t('Accept')}
            </button>
            <button
              className="text-button"
              onClick={() => execute({ type: 'invitation', id: invitation.id, accept: false })}
            >
              {t('Decline')}
            </button>
          </div>
        </div>
      ))}
      {advice.length > 0 ? (
        <ul className="advice-list">
          {advice.map((item) => (
            <li key={`${item.kind}-${item.cityId}-${item.officerId ?? ''}`}>
              <button onClick={() => onFocusCity(item.cityId)}>
                <Flag size={14} />
                <span>{t(ADVICE_TEXT[item.kind], item.params)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="report-note">{t('Nothing urgent. Your officers have the realm in hand.')}</p>
      )}
      {goals && (
        <div className="goal-list">
          <span className="eyebrow">{t('FIRST-CAMPAIGN GOALS')}</span>
          <ul>
            {goals.map((goal) => (
              <li key={goal.id} className={goal.done ? 'done' : ''}>
                {goal.done ? <Check size={14} /> : <Circle size={14} />}
                {t(GOAL_TEXT[goal.id])}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="goal-list">
        <span className="eyebrow">{t('OBJECTIVES')}</span>
        <ul>
          {objectives.map((objective) => (
            <li key={objective.id} className={objective.done ? 'done' : ''}>
              {objective.done ? <Check size={14} /> : <Crown size={14} />}
              {t(OBJECTIVE_TEXT[objective.id]!, {
                months: HEGEMON_MONTHS,
                faction: tx(factionById(rival?.factionId)?.name ?? ''),
              })}
              <small>
                {Math.min(objective.progress, objective.goal)}/{objective.goal}
              </small>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
