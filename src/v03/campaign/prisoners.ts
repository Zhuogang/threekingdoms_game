import type { V03GameState, V03Officer } from '../types';
import { recordEvent } from './reports';
import { cancelPendingGovernorAppointment } from '../governance/appointments';

export type PrisonerAction = 'release' | 'recruit' | 'exchange' | 'execute';

export function prisonerHolder(state: V03GameState, officer: V03Officer): string | null {
  return officer.alive && officer.location.kind === 'captured'
    ? (state.cities.find(
        (city) => officer.location.kind === 'captured' && city.id === officer.location.cityId,
      )?.factionId ?? null)
    : null;
}

/** A captured ruler stays a prisoner. Loyalty, then stable ID, chooses succession. */
export function resolveSuccessions(state: V03GameState): void {
  for (const faction of state.factions) {
    if (faction.eliminated) continue;
    const ruler = state.officers.find((officer) => officer.id === faction.leaderOfficerId);
    if (ruler?.alive && ruler.factionId === faction.id && ruler.location.kind !== 'captured')
      continue;
    const successor = state.officers
      .filter(
        (officer) =>
          officer.alive && officer.factionId === faction.id && officer.location.kind !== 'captured',
      )
      .sort((a, b) => b.loyalty - a.loyalty || a.id.localeCompare(b.id))[0];
    if (!successor) {
      faction.eliminated = true;
      for (const city of state.cities.filter((entry) => entry.factionId === faction.id)) {
        cancelPendingGovernorAppointment(state, city.id, 'the house has no free officers');
        city.factionId = null;
        city.governorId = null;
        city.governanceMode = 'steward';
      }
      for (const officer of state.officers.filter((entry) => entry.factionId === faction.id))
        officer.governorOfCityId = null;
    } else {
      faction.leaderOfficerId = successor.id;
      const successorCity =
        successor.location.kind === 'city'
          ? state.cities.find(
              (city) =>
                successor.location.kind === 'city' &&
                city.id === successor.location.cityId &&
                city.factionId === faction.id,
            )
          : undefined;
      const capital =
        successorCity ??
        state.cities.find(
          (city) => city.id === faction.capitalCityId && city.factionId === faction.id,
        ) ??
        state.cities.find((city) => city.factionId === faction.id);
      for (const city of state.cities.filter(
        (entry) => entry.factionId === faction.id && entry.governanceMode === 'ruler',
      ))
        city.governanceMode = city.governorId ? 'governor' : 'steward';
      if (capital) {
        cancelPendingGovernorAppointment(state, capital.id, 'the new ruler takes direct command');
        for (const officer of state.officers)
          if (officer.governorOfCityId === capital.id) officer.governorOfCityId = null;
        capital.governorId = null;
        capital.governanceMode = 'ruler';
        faction.capitalCityId = capital.id;
        if (faction.isPlayer) state.playerCapitalCityId = capital.id;
      }
    }
    recordEvent(state, {
      kind: 'succession',
      code: successor ? 'ruler.succession' : 'ruler.eliminated',
      title: successor ? 'A new ruler succeeds' : 'House eliminated',
      detail: successor
        ? `${successor.name} succeeds ${ruler?.name ?? faction.name}.`
        : 'No free officer remains.',
      entityId: faction.id,
      tier: faction.isPlayer ? 'critical' : 'chronicle',
      params: {
        factionId: faction.id,
        previousOfficerId: ruler?.id ?? null,
        successorOfficerId: successor?.id ?? null,
      },
    });
  }
}

export function prisonerRecruitChance(officer: Pick<V03Officer, 'loyalty'>): number {
  return Math.max(5, Math.min(90, 100 - officer.loyalty));
}

export function decidePrisoner(
  state: V03GameState,
  holderId: string,
  officerId: string,
  action: PrisonerAction,
  exchangeOfficerId?: string,
): { ok: boolean; state: V03GameState; error?: string } {
  const prisoner = state.officers.find((officer) => officer.id === officerId);
  if (!prisoner || prisonerHolder(state, prisoner) !== holderId || prisoner.factionId === holderId)
    return { ok: false, state, error: 'Choose a prisoner held by your house.' };
  if (prisoner.prisonerActionMonth === state.monthIndex)
    return { ok: false, state, error: 'This prisoner has already received a decision this month.' };
  const home = state.cities.find((city) => city.factionId === prisoner.factionId);
  const exchange = state.officers.find((officer) => officer.id === exchangeOfficerId);

  if (
    action === 'exchange' &&
    (!home ||
      !exchange ||
      exchange.factionId !== holderId ||
      prisonerHolder(state, exchange) !== prisoner.factionId ||
      exchange.prisonerActionMonth === state.monthIndex)
  )
    return {
      ok: false,
      state,
      error: 'Choose one of your officers held by this prisoner’s house.',
    };
  const next = structuredClone(state);
  const officer = next.officers.find((entry) => entry.id === officerId)!;
  const holdingCityId = officer.location.kind === 'captured' ? officer.location.cityId! : '';
  officer.prisonerActionMonth = next.monthIndex;
  officer.governorOfCityId = null;
  let accepted = true;
  if (action === 'execute') {
    officer.alive = false;
    officer.troops = 0;
  }
  if (action === 'release') {
    officer.location = { kind: 'city', cityId: home?.id ?? holdingCityId };
    if (!home) officer.factionId = null;
  }
  if (action === 'recruit' || action === 'exchange') {
    next.rng = (Math.imul(next.rng, 1664525) + 1013904223) >>> 0;
    accepted = next.rng % 100 < (action === 'recruit' ? prisonerRecruitChance(officer) : 75);
    if (accepted && action === 'recruit') {
      officer.factionId = holderId;
      officer.loyalty = 60;
      officer.location = { kind: 'city', cityId: holdingCityId };
    }
    if (accepted && action === 'exchange') {
      officer.location = { kind: 'city', cityId: home!.id };
      const returned = next.officers.find((entry) => entry.id === exchangeOfficerId)!;
      returned.location = { kind: 'city', cityId: holdingCityId };
      returned.prisonerActionMonth = next.monthIndex;
      returned.governorOfCityId = null;
    }
  }
  recordEvent(next, {
    kind: 'prisonerAction',
    code: 'prisoner.decision',
    title: 'Prisoner decision',
    detail: `${officer.name}: ${action}${accepted ? '' : ' refused'}.`,
    entityId: officer.id,
    tier:
      holderId === state.playerFactionId || prisoner.factionId === state.playerFactionId
        ? 'notice'
        : 'chronicle',
    params: { officerId, action, accepted },
  });
  resolveSuccessions(next);
  next.revision++;
  return { ok: true, state: next };
}

export function resolveAiPrisoners(state: V03GameState): V03GameState {
  let next = state;
  for (const officer of state.officers) {
    const holderId = prisonerHolder(next, officer);
    if (!holderId || holderId === state.playerFactionId || officer.factionId === holderId) continue;
    const exchange = next.officers.find(
      (entry) =>
        entry.factionId === holderId &&
        prisonerHolder(next, entry) === officer.factionId &&
        entry.prisonerActionMonth !== next.monthIndex,
    );
    const action: PrisonerAction = exchange
      ? 'exchange'
      : officer.loyalty < 75
        ? 'recruit'
        : 'release';
    const result = decidePrisoner(next, holderId, officer.id, action, exchange?.id);
    if (result.ok) next = result.state;
  }
  return next;
}
