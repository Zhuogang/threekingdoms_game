import { acknowledgeV03Event, advanceV03, applyV03BattleAction } from './engine';
import { queueGovernorAppointment } from './governance/appointments';
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
export function executeV03Command(state: V03GameState, command: V03Command): V03ActionResult {
  if (state.phase === 'finished' && command.type !== 'acknowledgeEvent') {
    return { ok: false, state, error: 'This campaign has ended.' };
  }
  switch (command.type) {
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
      const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId);
      if (!city || city.governanceMode !== 'ruler' || city.factionId !== state.playerFactionId)
        return {
          ok: false,
          state,
          error: 'Only the ruler’s directly governed capital can be developed by direct order.',
        };
      if (state.phase !== 'planning')
        return {
          ok: false,
          state,
          error: 'Direct city work is available during campaign planning.',
        };
      if (city.gold < 100)
        return { ok: false, state, error: 'The capital needs 100 gold for this work.' };
      if (city[command.field] >= 100)
        return { ok: false, state, error: 'This improvement is already at its current limit.' };
      const next = structuredClone(state);
      const updated = next.cities.find((entry) => entry.id === next.playerCapitalCityId)!;
      updated.gold -= 100;
      updated[command.field]++;
      next.revision++;
      next.log.push(
        `${updated.name} improved its ${command.field === 'farming' ? 'farmland' : 'market'}.`,
      );
      return {
        ok: true,
        state: next,
        message: `${command.field === 'farming' ? 'Farmland' : 'Commerce'} improved by 1.`,
      };
    }
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
    case 'battleAction': {
      const result = applyV03BattleAction(state, command.battleId, command.action);
      return { ok: result.ok, state: result.state, error: result.error };
    }
    case 'acknowledgeEvent':
      return { ok: true, state: acknowledgeV03Event(state, command.eventId) };
  }
}
