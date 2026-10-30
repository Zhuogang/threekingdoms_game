import type { ReactNode } from 'react';
import { TROOP_TYPES } from '../../campaign/troop-experience';
import { getCityCapabilities } from '../../governance/authority';
import { cityActionWorkCost, cityWorkBusyDays } from '../../governance/city-actions';
import { message } from '../../i18n';
import { troopName } from '../../rendering/presentation';
import { UnitIcon } from '../../rendering/UnitIcon';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button } from '../kit';
import { localizeAppMessage } from '../shared/app-copy-2';
import { CityPersonnelPanel } from './CityPersonnelPanel';
import { OfficerRoster } from './CityOfficers';
import { workLabel, type CityWorkAction } from './CityWork';
import { PendingGovernor } from './GovernorAppointment';
import { ReserveFillButton } from './ReserveFill';
import { TroopProgress } from './TroopProgress';

/** Callbacks from the city window; each opens the focused page for one operation. */
export interface CityOperations {
  onMarch: () => void;
  onWork: (action: CityWorkAction) => void;
  onOfficer: (officerId: string) => void;
  onPrisoners: () => void;
  onGovernor: () => void;
  onTransfer: () => void;
  onRequest: (kind: 'resource' | 'campaign') => void;
  onProposal: () => void;
}

interface SectionProps {
  context: GameplayContext;
  operations: CityOperations;
  /** The player's capital under personal rule, where city work is ordered directly. */
  direct: boolean;
}

function CitySection({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`v03-city-section v03-city-section-${id}`}
      aria-labelledby={`city-section-${id}`}
    >
      <header>
        <h3 id={`city-section-${id}`}>{title}</h3>
        {hint ? <small>{hint}</small> : null}
      </header>
      {children}
    </section>
  );
}

function CityOp({
  label,
  hint,
  primary = false,
  disabled,
  title,
  onClick,
}: {
  label: string;
  hint?: string;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      className="v03-city-op"
      aria-label={label}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <span aria-hidden>→</span>
    </Button>
  );
}

/** What a capital task costs: a work point and, for most, the executor's time. */
function workCostHint(context: GameplayContext, action: CityWorkAction) {
  const { locale } = context;
  if (!cityActionWorkCost(action)) return message(locale, 'city.workFree');
  const days = cityWorkBusyDays(action);
  return days ? message(locale, 'city.workCost', { days }) : message(locale, 'city.workPoint');
}

function WorkOps({
  context,
  actions,
  onWork,
}: {
  context: GameplayContext;
  actions: readonly CityWorkAction[];
  onWork: (action: CityWorkAction) => void;
}) {
  return (
    <div className="v03-city-ops">
      {actions.map((action) => (
        <CityOp
          key={action}
          label={workLabel(context, action)}
          hint={workCostHint(context, action)}
          disabled={action === 'search' && !context.capitalAvailability('search').ok}
          title={action === 'search' ? context.capitalReason('search') : undefined}
          onClick={() => onWork(action)}
        />
      ))}
    </div>
  );
}

export function CityMilitary({
  context,
  operations,
  direct,
  friendly,
  committed,
}: SectionProps & { friendly: boolean; committed: boolean }) {
  const { selectedCity: city, locale, t } = context;
  if (!city) return null;
  return (
    <CitySection
      id="military"
      title={message(locale, 'city.section.military')}
      hint={friendly ? message(locale, 'city.militaryHint') : undefined}
    >
      <div className="v03-city-ops">
        <CityOp
          primary
          label={message(locale, friendly ? 'flow.march' : 'ui.march.here.96')}
          hint={message(locale, 'city.marchHint')}
          disabled={committed}
          onClick={operations.onMarch}
        />
        {friendly ? (
          <CityOp
            label={t.orderMarch}
            hint={message(locale, 'city.directiveHint')}
            disabled={committed}
            onClick={() => operations.onRequest('campaign')}
          />
        ) : null}
        {direct ? (
          <CityOp
            label={workLabel(context, 'recruit')}
            hint={workCostHint(context, 'recruit')}
            onClick={() => operations.onWork('recruit')}
          />
        ) : null}
      </div>
      {friendly ? (
        <>
          <h4>
            {message(locale, 'ui.reserve.soldiers.93')} · {city.reserve.toLocaleString()}
          </h4>
          <div className="v03-troop-comparison">
            {TROOP_TYPES.map((type) => (
              <div className="v03-troop-summary" key={type}>
                <UnitIcon
                  troopType={type}
                  {...city.reservePools[type]}
                  onWater={false}
                  locale={locale}
                />
                <span>
                  <strong>
                    {troopName(type, locale)} · {city.reservePools[type].troops.toLocaleString()}
                  </strong>
                  <TroopProgress
                    unit={{ ...city.reservePools[type], troopType: type }}
                    locale={locale}
                  />
                </span>
              </div>
            ))}
          </div>
          <ReserveFillButton context={context} />
          <CityPersonnelPanel context={context} />
        </>
      ) : null}
    </CitySection>
  );
}

export function CityAdministration({ context, operations, direct }: SectionProps) {
  const { state, selectedCity: city, locale } = context;
  if (!city) return null;
  if (direct)
    return (
      <CitySection
        id="affairs"
        title={message(locale, 'city.section.affairs')}
        hint={message(locale, 'city.affairsHint')}
      >
        <WorkOps
          context={context}
          actions={[
            'develop-farming',
            'develop-commerce',
            'security',
            'relieve',
            'buy-food',
            'sell-food',
          ]}
          onWork={operations.onWork}
        />
      </CitySection>
    );
  return (
    <CitySection id="affairs" title={message(locale, 'city.section.governance')}>
      <p className="v03-muted">
        {localizeAppMessage(getCityCapabilities(state, city.id).reason ?? '', locale, state)}
      </p>
      <div className="v03-city-ops">
        <CityOp label={message(locale, 'flow.appointments')} onClick={operations.onGovernor} />
      </div>
      <PendingGovernor context={{ ...context, selectedCity: city }} />
    </CitySection>
  );
}

export function CityOfficerSection({ context, operations, direct }: SectionProps) {
  const { state, selectedCity: city, locale } = context;
  if (!city) return null;
  const stationed = state.officers.filter(
    (officer) =>
      officer.alive && officer.location.kind === 'city' && officer.location.cityId === city.id,
  ).length;
  const captured = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.location.kind === 'captured' &&
      !officer.location.journeyId &&
      officer.location.cityId === city.id,
  ).length;
  return (
    <CitySection
      id="officers"
      title={`${message(locale, 'city.section.officers')} · ${stationed}`}
      hint={
        city.factionId === state.playerFactionId ? message(locale, 'city.officersHint') : undefined
      }
    >
      {direct ? (
        <WorkOps
          context={context}
          actions={['reward', 'equip', 'feast', 'search']}
          onWork={operations.onWork}
        />
      ) : null}
      <OfficerRoster context={context} onOfficer={operations.onOfficer} />
      {captured > 0 ? (
        <div className="v03-city-ops">
          <CityOp
            label={`${message(locale, 'ui.prisoners.104')} · ${captured}`}
            onClick={operations.onPrisoners}
          />
        </div>
      ) : null}
    </CitySection>
  );
}

export function CityLogistics({ context, operations }: Omit<SectionProps, 'direct'>) {
  const { selectedCity: city, locale, t, orderPreviewOrder: order } = context;
  if (!city) return null;
  const pending =
    order && order.sourceCityId === city.id && ['proposed', 'waiting'].includes(order.status);
  return (
    <CitySection
      id="logistics"
      title={message(locale, 'city.section.logistics')}
      hint={message(locale, 'city.logisticsHint')}
    >
      <div className="v03-city-ops">
        <CityOp
          label={t.requestSupplies}
          hint={message(locale, 'flow.suppliesHint')}
          onClick={() => operations.onRequest('resource')}
        />
        <CityOp
          label={message(locale, 'flow.officerTransfer')}
          hint={message(locale, 'city.transferHint')}
          onClick={operations.onTransfer}
        />
        <CityOp
          label={message(locale, 'flow.orders')}
          hint={message(locale, 'city.ordersHint')}
          onClick={() => context.setCampaignTab('orders')}
        />
      </div>
      {pending ? (
        <Button className="v03-step-choice v03-pending-proposal" onClick={operations.onProposal}>
          {message(locale, 'flow.resumeProposal')} · {context.locationName(order.targetCityId)}
          <span aria-hidden>→</span>
        </Button>
      ) : null}
    </CitySection>
  );
}
