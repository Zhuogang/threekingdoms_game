import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { CityOverview } from './CityOverview';
import { CityPrisoners, OfficerDetail } from './CityOfficers';
import { CityWork, workLabel, isCityWork, type CityWorkAction } from './CityWork';
import { GovernorAppointment } from './GovernorAppointment';
import { PrisonerPanel } from './PrisonerPanel';
import { ArmyBuilder } from './ArmyBuilder';
import { OrdersInbox } from './OrdersInbox';
import {
  DiplomacyFlow,
  diplomacyParent,
  diplomacyTitle,
  type DiplomacyPage,
} from './DiplomacyFlow';
import { SupplyFlow, type SupplyPage } from './SupplyFlow';
import { CityWorkAssignment, rankWorkExecutors } from './CityWorkAssignment';
import { OfficerGroupWork } from './OfficerGroupWork';
import { OfficerTransfer } from './OfficerTransfer';
import { isOfficerGroupAction } from '../../governance/city-actions';
import { localizeAppMessage } from '../shared/app-copy-2';

type CityPage =
  | { kind: 'overview' | 'prisoners' | 'governor' | 'transfer' }
  | { kind: 'officer' | 'prisoner'; officerId: string }
  | { kind: SupplyPage }
  | { kind: 'work-actor'; action: CityWorkAction }
  | { kind: 'work'; action: CityWorkAction; officerId?: string };

function parentPage(page: CityPage): CityPage {
  switch (page.kind) {
    case 'work':
      // City work and group orders open from the city page; officer orders from their detail.
      if (isCityWork(page.action) || !page.officerId) return { kind: 'overview' };
      return { kind: 'officer', officerId: page.officerId };
    case 'prisoner':
      return { kind: 'prisoners' };
    case 'supply-form':
      return { kind: 'supply-target' };
    case 'supply-review':
      return { kind: 'supply-form' };
    case 'supply-reduce':
      return { kind: 'supply-proposal' };
    default:
      return { kind: 'overview' };
  }
}

export function CampaignWindow({ context }: { context: GameplayContext }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [page, setPage] = useState<CityPage>({ kind: 'overview' });
  const [diplomacyPage, setDiplomacyPage] = useState<DiplomacyPage>({ kind: 'list' });
  const { locale, campaignTab, selectedCity, t, state } = context;
  const close = () => context.setCampaignWindowOpen(false);
  const navigate = (next: CityPage, preserveFeedback = false) => {
    setPage(next);
    context.setCampaignTab('city');
    if (!preserveFeedback) context.setFeedback('');
  };
  const parent = campaignTab === 'forces' ? ({ kind: 'overview' } as const) : parentPage(page);
  const navigateDiplomacy = (next: DiplomacyPage, preserveFeedback = false) => {
    setDiplomacyPage(next);
    if (!preserveFeedback) context.setFeedback('');
  };
  const back = () =>
    campaignTab === 'diplomacy'
      ? navigateDiplomacy(diplomacyParent(diplomacyPage))
      : navigate(parent);
  const complete = () => navigate(parent, true);
  // Recommended executor first; "Change executor" on the review still opens the full list.
  const openWork = (action: CityWorkAction) => {
    const executor = isOfficerGroupAction(action)
      ? undefined
      : rankWorkExecutors(context.directCityOfficers, action, state.absoluteDay)[0];
    navigate(
      isOfficerGroupAction(action) || executor
        ? { kind: 'work', action, officerId: executor?.id }
        : { kind: 'work-actor', action },
    );
  };
  const isCity = campaignTab === 'city' && page.kind === 'overview';
  const isAction =
    campaignTab === 'forces' ||
    (campaignTab === 'city' && !isCity) ||
    (campaignTab === 'diplomacy' && diplomacyPage.kind !== 'list');
  const cityName = selectedCity ? displayName(selectedCity, locale) : t.city;
  const officerName =
    'officerId' in page && page.officerId
      ? displayName(
          state.officers.find((officer) => officer.id === page.officerId)!,
          locale,
        )
      : '';
  const title =
    campaignTab === 'orders'
      ? message(locale, 'flow.orders')
      : campaignTab === 'diplomacy'
        ? diplomacyTitle(context, diplomacyPage)
        : campaignTab === 'forces'
          ? message(locale, 'flow.march')
          : page.kind === 'transfer'
            ? message(locale, 'flow.officerTransfer')
            : page.kind === 'prisoners'
              ? message(locale, 'ui.prisoners.104')
              : page.kind === 'officer' || page.kind === 'prisoner'
                ? officerName
                : page.kind === 'work-actor'
                  ? `${workLabel(context, page.action)} · ${message(locale, 'flow.assignWork')}`
                  : page.kind === 'supply-target'
                    ? message(locale, 'flow.chooseTarget')
                    : page.kind === 'supply-form'
                      ? context.requestKind === 'resource'
                        ? t.requestSupplies
                        : t.orderMarch
                      : page.kind === 'supply-proposal' || page.kind === 'supply-review'
                        ? message(locale, 'flow.proposal')
                        : page.kind === 'supply-reduce'
                          ? t.acceptReduced
                          : page.kind === 'work'
                            ? workLabel(context, page.action)
                            : page.kind === 'governor'
                              ? message(locale, 'flow.appointments')
                              : cityName;
  const backLabel =
    campaignTab === 'diplomacy'
      ? message(
          locale,
          diplomacyPage.kind === 'propose' || diplomacyPage.kind === 'break'
            ? 'flow.backFaction'
            : 'flow.backDiplomacy',
        )
      : message(
          locale,
          parent.kind === 'supply-target'
            ? 'flow.backTargets'
            : parent.kind === 'supply-proposal'
              ? 'flow.backProposal'
              : parent.kind === 'supply-form'
                ? 'flow.backRequest'
                : parent.kind === 'officer'
                  ? 'flow.backOfficer'
                  : parent.kind === 'prisoners'
                    ? 'flow.backPrisoners'
                    : 'flow.backCity',
        );
  const screenKey = `${selectedCity?.id}:${campaignTab}:${JSON.stringify(page)}:${JSON.stringify(diplomacyPage)}`;
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  useEffect(() => {
    setPage({ kind: 'overview' });
  }, [selectedCity?.id]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [screenKey]);
  // Returning from an operation lands where the player left the long city page.
  const body = useRef<HTMLDivElement>(null);
  const cityScroll = useRef({ cityId: '', top: 0 });
  useLayoutEffect(() => {
    if (isCity && body.current && cityScroll.current.cityId === selectedCity?.id)
      body.current.scrollTop = cityScroll.current.top;
  }, [screenKey]);
  // Existing help remains reachable while the campaign dialog owns native focus.
  const nested = {
    ...context,
    openWiki: (...args: Parameters<GameplayContext['openWiki']>) => {
      close();
      context.openWiki(...args);
    },
  };
  return (
    <dialog
      ref={dialog}
      className="v03-campaign-window"
      aria-labelledby="campaign-window-title"
      onKeyDown={(event) => {
        // Handle every level before the browser's native repeated-Escape close policy.
        // A nested confirmation may already have consumed this key.
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        isAction ? back() : close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        isAction ? back() : close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          close();
      }}
    >
      <header className="v03-window-header">
        <div>
          <span className="v03-kicker">
            {isCity
              ? message(locale, 'flow.cityWindow')
              : isAction
                ? `${campaignTab === 'diplomacy' ? t.diplomacy : cityName}${page.kind === 'work' && officerName && !isOfficerGroupAction(page.action) ? ` / ${officerName}` : ''}`
                : t.campaign}
          </span>
          <h2 id="campaign-window-title" tabIndex={-1} ref={heading}>
            {title}
          </h2>
        </div>
        <Button
          className="v03-window-language"
          variant="ghost"
          onClick={() => context.setLocale(locale === 'en' ? 'zh' : 'en')}
        >
          {locale === 'en' ? '中文' : 'EN'}
        </Button>
        <Button variant="ghost" onClick={close} aria-label={message(locale, 'flow.closeWindow')}>
          <X size={20} />
        </Button>
      </header>
      <div
        className="v03-window-body"
        key={screenKey}
        ref={body}
        onScroll={(event) => {
          if (isCity && selectedCity)
            cityScroll.current = { cityId: selectedCity.id, top: event.currentTarget.scrollTop };
        }}
      >
        {context.feedback ? (
          <p className="v03-window-feedback" role="status">
            {localizeAppMessage(context.feedback, locale, state)}
          </p>
        ) : null}
        {isCity && selectedCity ? (
          <CityOverview
            context={nested}
            operations={{
              onWork: openWork,
              onOfficer: (officerId) => navigate({ kind: 'officer', officerId }),
              onPrisoners: () => navigate({ kind: 'prisoners' }),
              onGovernor: () => navigate({ kind: 'governor' }),
              onTransfer: () => navigate({ kind: 'transfer' }),
              onRequest: (kind) => {
                context.setRequestKind(kind);
                context.setTargetCityId('');
                navigate({ kind: 'supply-target' });
              },
              onProposal: () => navigate({ kind: 'supply-proposal' }),
            }}
          />
        ) : null}
        {campaignTab === 'city' && selectedCity ? (
          <>
            {page.kind === 'prisoners' ? (
              <CityPrisoners
                context={nested}
                onOfficer={(officerId) => navigate({ kind: 'prisoner', officerId })}
              />
            ) : null}
            {page.kind === 'officer' ? (
              <OfficerDetail
                context={nested}
                officerId={page.officerId}
                onWork={(action) => navigate({ kind: 'work', action, officerId: page.officerId })}
              />
            ) : null}
            {page.kind === 'work-actor' ? (
              <CityWorkAssignment
                context={nested}
                action={page.action}
                onSelect={(officerId) => navigate({ kind: 'work', action: page.action, officerId })}
              />
            ) : null}
            {page.kind === 'work' && isOfficerGroupAction(page.action) ? (
              <OfficerGroupWork
                context={nested}
                action={page.action}
                initialOfficerId={page.officerId}
                onComplete={complete}
              />
            ) : page.kind === 'work' ? (
              <CityWork
                context={nested}
                action={page.action}
                officerId={page.officerId}
                onComplete={complete}
                onChangeOfficer={() => navigate({ kind: 'work-actor', action: page.action })}
              />
            ) : null}
            {page.kind === 'governor' ? (
              <GovernorAppointment context={{ ...nested, selectedCity }} onComplete={complete} />
            ) : null}
            {page.kind === 'transfer' ? (
              <OfficerTransfer context={nested} onComplete={complete} />
            ) : null}
            {page.kind === 'prisoner' ? (
              <PrisonerPanel context={nested} officerId={page.officerId} onComplete={complete} />
            ) : null}
            {(
              [
                'supply-target',
                'supply-form',
                'supply-review',
                'supply-proposal',
                'supply-reduce',
              ] as string[]
            ).includes(page.kind) ? (
              <SupplyFlow
                context={{ ...nested, selectedCity }}
                page={page.kind as SupplyPage}
                onNavigate={(kind) => navigate({ kind })}
              />
            ) : null}
          </>
        ) : null}
        {campaignTab === 'forces' ? <ArmyBuilder context={nested} /> : null}
        {campaignTab === 'orders' ? <OrdersInbox context={nested} /> : null}
        {campaignTab === 'diplomacy' ? (
          <DiplomacyFlow context={nested} page={diplomacyPage} onNavigate={navigateDiplomacy} />
        ) : null}
      </div>
      <footer className="v03-window-footer">
        <Button variant="ghost" onClick={isAction ? back : close}>
          <ArrowLeft size={16} />
          {isAction ? backLabel : message(locale, 'flow.backMap')}
        </Button>
        {isAction ? (
          <Button variant="ghost" onClick={close}>
            {message(locale, 'flow.backMap')}
          </Button>
        ) : (
          <small>{message(locale, 'flow.escape')}</small>
        )}
      </footer>
    </dialog>
  );
}
