import { marchArmy } from './governance/army';
import { decidePrisoner } from './campaign/prisoners';
import {
  acknowledgeV03Event,
  advanceV03,
  applyV03BattleAction,
  completeV03BattleDay,
  recallV03Journey,
} from './engine';
import { queueGovernorAppointment } from './governance/appointments';
import { acceptV03Invitation, breakV03Alliance, proposeV03Alliance } from './campaign/diplomacy';
import { applyV03CityAction } from './governance/city-actions';
import { createV03OrderServices } from './governance/services';
import {
  answerCampaignDirective,
  answerRequisition,
  requestCampaignDirective,
  requestRequisition,
} from './governance/orders';
import type { V03Command, V03GameState } from './types';

export interface V03ActionResult {
  ok: boolean;
  state: V03GameState;
  message?: string;
  error?: string;
  orderId?: string;
  preview?: unknown;
}

const services = createV03OrderServices();

/** Single application command boundary for the independent v0.3 ruleset. */
function executeCommand(state: V03GameState, command: V03Command): V03ActionResult {
  if (state.phase === 'finished' && command.type !== 'acknowledgeEvent') {
    return { ok: false, state, error: 'This campaign has ended.' };
  }
  switch (command.type) {
    case 'marchArmy':
      return marchArmy(state, command);
    case 'prisonerAction':
      return decidePrisoner(
        state,
        state.playerFactionId,
        command.officerId,
        command.action,
        command.exchangeOfficerId,
      );
    case 'setBattleAutoCommand': {
      const current = state.battles.find(
        (battle) => battle.id === command.battleId && battle.active,
      );
      if (
        !current ||
        (current.attackerFactionId !== state.playerFactionId &&
          current.defenderFactionId !== state.playerFactionId)
      )
        return { ok: false, state, error: 'This is not the player-controlled side.' };
      const next = structuredClone(state);
      const battle = next.battles.find((entry) => entry.id === command.battleId)!;
      battle.autoCommand = command.enabled;
      battle.playerDayComplete = false;
      next.revision++;
      return { ok: true, state: next };
    }
    case 'advance': {
      const mode = command.days === 'nextEvent' ? 'next-event' : command.days;
      const result = advanceV03(state, mode);
      return result.error
        ? { ok: false, state, error: result.error }
        : {
            ok: true,
            state: result.state,
            message: `Advanced ${result.daysAdvanced} day${result.daysAdvanced === 1 ? '' : 's'}.`,
            orderId: result.eventId ?? undefined,
          };
    }
    case 'appointGovernor': {
      const result = queueGovernorAppointment(state, command.cityId, command.officerId, services);
      return result.ok
        ? {
            ok: true,
            state: result.state,
            message: 'The appointment is queued for the next monthly settlement.',
          }
        : { ok: false, state, error: result.error };
    }
    case 'developCapital': {
      return applyV03CityAction(state, {
        cityId: state.playerCapitalCityId,
        action: command.field === 'farming' ? 'develop-farming' : 'develop-commerce',
      });
    }
    case 'cityAction':
      return applyV03CityAction(state, command);
    case 'requestRequisition': {
      const result = requestRequisition(
        state,
        {
          sourceCityId: command.sourceCityId,
          targetCityId: command.targetCityId,
          requested: command.requested,
          requestedByDay: command.requestedByDay,
        },
        services,
      );
      return {
        ok: result.ok,
        state: result.state,
        message: result.message,
        error: result.ok ? undefined : result.message,
        orderId: result.order?.id,
        preview: result.preview,
      };
    }
    case 'answerRequisition': {
      const result = answerRequisition(
        state,
        command.requisitionId,
        command.answer,
        services,
        command.reduced,
      );
      return {
        ok: result.ok,
        state: result.state,
        message: result.message,
        error: result.ok ? undefined : result.message,
        orderId: result.order?.id,
        preview: result.preview,
      };
    }
    case 'issueCampaignDirective': {
      const result = requestCampaignDirective(
        state,
        {
          sourceCityId: command.sourceCityId,
          targetCityId: command.targetCityId,
          intent: command.intent,
          requestedTroops: command.requestedTroops,
          requestedByDay: command.requestedByDay,
        },
        services,
      );
      return {
        ok: result.ok,
        state: result.state,
        message: result.message,
        error: result.ok ? undefined : result.message,
        orderId: result.order?.id,
        preview: result.preview,
      };
    }
    case 'answerCampaignDirective': {
      const result = answerCampaignDirective(
        state,
        command.directiveId,
        command.answer,
        services,
        command.reducedTroops,
      );
      return {
        ok: result.ok,
        state: result.state,
        message: result.message,
        error: result.ok ? undefined : result.message,
        orderId: result.order?.id,
        preview: result.preview,
      };
    }
    case 'recallJourney': {
      const result = recallV03Journey(state, command.journeyId);
      return result.ok
        ? { ok: true, state: result.state, message: 'The party will return by a safe route.' }
        : { ok: false, state, error: result.error };
    }
    case 'proposeAlliance': {
      const result = proposeV03Alliance(state, command.targetFactionId);
      return {
        ok: result.ok,
        state: result.state,
        message: result.message,
        error: result.error,
      };
    }
    case 'breakAlliance': {
      const result = breakV03Alliance(state, command.targetFactionId);
      return { ok: result.ok, state: result.state, message: result.message, error: result.error };
    }
    case 'acceptCoalitionInvitation': {
      const result = acceptV03Invitation(state, command.invitationId);
      return { ok: result.ok, state: result.state, message: result.message, error: result.error };
    }
    case 'battleAction': {
      const result = applyV03BattleAction(state, command.battleId, command.action);
      return { ok: result.ok, state: result.state, error: result.error };
    }
    case 'completeBattleDay': {
      const result = completeV03BattleDay(state, command.battleId);
      return result.ok
        ? {
            ok: true,
            state: result.state,
            message: result.advancedWorldDay
              ? 'All active battles completed their day; the campaign advanced one day.'
              : 'Battle day complete. Resolve the other active battles to advance the campaign.',
          }
        : { ok: false, state, error: result.error };
    }
    case 'acknowledgeEvent':
      return { ok: true, state: acknowledgeV03Event(state, command.eventId) };
  }
}

/** Optional structured fields preserve the v3 envelope and legacy report reader. */
export function executeV03Command(state: V03GameState, command: V03Command): V03ActionResult {
  const result = executeCommand(state, command);
  if (result.state !== state) {
    const existing = new Set(state.events.map((event) => event.id));
    for (const event of result.state.events)
      if (!existing.has(event.id) && !event.code) {
        event.code = event.kind;
        event.params = { entityId: event.entityId };
      }
  }
  return result;
}
