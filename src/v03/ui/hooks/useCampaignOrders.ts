import { message } from '../../i18n';

import { getCityCapabilities } from '../../governance/authority';

import { getV03WikiArticles, type V03WikiTopic } from '../../wiki';

import { isV03AllianceActive } from '../../campaign/monthly-systems';

import { displayName } from '../shared/app-copy-3';
import type { useCommands } from './useCommands';
export function useCampaignOrders(context: ReturnType<typeof useCommands>) {
  const {
    state,
    locale,
    orderPreview,
    diplomacyTargetId,
    selectedCity,
    wikiSearch,
    wikiTopic,
    wikiReturnFocus,
    setWikiTopic,
    setShowWiki,
  } = context;
  const activeOrders = state
    ? [
        ...state.requisitions
          .filter((order) => order.factionId === state.playerFactionId)
          .map((order) => ({
            id: order.id,
            kind: 'resource' as const,
            status: order.status,
            message: order.message,
            source: (() => {
              const city = state.cities.find((city) => city.id === order.sourceCityId);
              return city ? displayName(city, locale) : order.sourceCityId;
            })(),
            target: (() => {
              const city = state.cities.find((city) => city.id === order.targetCityId);
              return city ? displayName(city, locale) : order.targetCityId;
            })(),
            requested: order.requested,
            proposed: order.proposed,
            journeyId: order.journeyId,
            returnRequested: Boolean(
              order.journeyId &&
              state.journeys.find((journey) => journey.id === order.journeyId)?.returnRequested,
            ),
          })),
        ...state.directives
          .filter((order) => order.factionId === state.playerFactionId)
          .map((order) => ({
            id: order.id,
            kind: 'campaign' as const,
            status: order.status,
            message: order.message,
            source: (() => {
              const city = state.cities.find((city) => city.id === order.sourceCityId);
              return city ? displayName(city, locale) : order.sourceCityId;
            })(),
            target: (() => {
              const city = state.cities.find((city) => city.id === order.targetCityId);
              return city ? displayName(city, locale) : order.targetCityId;
            })(),
            requested: order.requestedTroops,
            proposed: order.proposedTroops,
            journeyId: order.journeyId,
            returnRequested: Boolean(
              order.journeyId &&
              state.journeys.find((journey) => journey.id === order.journeyId)?.returnRequested,
            ),
          })),
      ].sort((a, b) => {
        const priority = (order: { status: string; journeyId: string | null }) =>
          !order.journeyId && ['proposed', 'waiting'].includes(order.status) ? 0 : 1;
        return priority(a) - priority(b) || a.id.localeCompare(b.id);
      })
    : [];
  const orderPreviewOrder =
    state && orderPreview
      ? (state.requisitions.find((order) => order.id === orderPreview.orderId) ??
        state.directives.find((order) => order.id === orderPreview.orderId))
      : undefined;
  const orderPreviewSourceCity =
    state && orderPreviewOrder
      ? state.cities.find((city) => city.id === orderPreviewOrder.sourceCityId)
      : undefined;
  const orderPreviewTroops = orderPreview
    ? 'executable' in orderPreview.preview
      ? orderPreview.preview.executable.troops
      : orderPreview.preview.executableTroops
    : 0;
  const friendlyCities =
    state?.cities.filter((city) => city.factionId === state.playerFactionId) ?? [];
  const diplomacyTargets =
    state?.factions.filter(
      (faction) => faction.id !== state.playerFactionId && !faction.eliminated,
    ) ?? [];
  const diplomacyTarget =
    diplomacyTargets.find((faction) => faction.id === diplomacyTargetId) ?? diplomacyTargets[0];
  const playerAlliances = state
    ? state.alliances.filter((alliance) =>
        isV03AllianceActive(
          state.alliances,
          state.playerFactionId,
          alliance.a === state.playerFactionId ? alliance.b : alliance.a,
          state.monthIndex,
        ),
      )
    : [];
  const hostileCities =
    state?.cities.filter((city) => city.factionId !== state.playerFactionId) ?? [];
  const canOrderFromSelected =
    state && selectedCity
      ? getCityCapabilities(state, selectedCity.id).requisitionResources
      : false;
  const wikiArticles = getV03WikiArticles(locale);
  const wikiQuery = wikiSearch
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase(message(locale, 'ui.en.us.19'));
  const filteredWikiArticles = wikiQuery
    ? wikiArticles.filter((article) =>
        [
          article.title,
          ...article.sections.flatMap((section) => [section.heading, ...section.body]),
        ]
          .join('\n')
          .normalize('NFKC')
          .toLocaleLowerCase(message(locale, 'ui.en.us.19'))
          .includes(wikiQuery),
      )
    : wikiArticles;
  const displayedWikiArticle =
    filteredWikiArticles.find((article) => article.id === wikiTopic) ?? filteredWikiArticles[0];
  const openWiki = (topic: V03WikiTopic) => {
    wikiReturnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setWikiTopic(topic);
    setShowWiki(true);
  };
  return {
    ...context,
    activeOrders,
    orderPreviewOrder,
    orderPreviewSourceCity,
    orderPreviewTroops,
    friendlyCities,
    diplomacyTargets,
    diplomacyTarget,
    playerAlliances,
    hostileCities,
    canOrderFromSelected,
    wikiArticles,
    wikiQuery,
    filteredWikiArticles,
    displayedWikiArticle,
    openWiki,
  };
}
