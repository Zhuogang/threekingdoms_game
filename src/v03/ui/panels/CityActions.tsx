import { useState } from 'react';
import type { TroopType } from '../../types';
import { TROOP_TYPES } from '../../campaign/troop-experience';
import { troopName } from '../../rendering/presentation';
import { ActionButton, Input, Select } from '../kit';
import { message } from '../../i18n';

import { displayName } from '../shared/app-copy-3';
import type { GameplayContext } from '../hooks/gameplayView';

export function CityActions({
  context,
}: {
  context: GameplayContext & { selectedCity: NonNullable<GameplayContext['selectedCity']> };
}) {
  const [recruitType, setRecruitType] = useState<TroopType>('infantry');
  const {
    t,
    directWorkRemaining,
    directWorkQuota,
    capitalAvailability,
    capitalReason,
    dispatch,
    selectedCity,
    locale,
    openWiki,
    directCityOfficers,
    troopAssignments,
    localizedOfficerName,
    setTroopAssignments,
  } = context;
  return (
    <div className="v03-direct-work">
      <strong>{t.directWork}</strong>
      <small className="v03-work-quota">
        {t.workRemaining}: {directWorkRemaining}/{directWorkQuota} ·{' '}
        {message(locale, 'ui.one.point.per.stationed.officer.up.to.3.refreshe.49')}
      </small>
      <ActionButton
        type="button"
        disabled={!capitalAvailability('develop-farming').ok}
        title={capitalReason('develop-farming')}
        onClick={() =>
          dispatch({
            type: 'cityAction',
            cityId: selectedCity.id,
            action: 'develop-farming',
          })
        }
      >
        {t.improveFarm}
      </ActionButton>
      <ActionButton
        type="button"
        disabled={!capitalAvailability('develop-commerce').ok}
        title={capitalReason('develop-commerce')}
        onClick={() =>
          dispatch({
            type: 'cityAction',
            cityId: selectedCity.id,
            action: 'develop-commerce',
          })
        }
      >
        {t.improveMarket}
      </ActionButton>
      <ActionButton
        type="button"
        disabled={!capitalAvailability('search').ok}
        title={capitalReason('search')}
        onClick={() =>
          dispatch({
            type: 'cityAction',
            cityId: selectedCity.id,
            action: 'search',
          })
        }
      >
        {t.search}
      </ActionButton>
      <Select
        aria-label={locale === 'zh' ? '招募兵种' : 'Recruit troop type'}
        value={recruitType}
        onChange={(event) => setRecruitType(event.target.value as TroopType)}
      >
        {TROOP_TYPES.map((type) => (
          <option key={type} value={type}>
            {troopName(type, locale)}
          </option>
        ))}
      </Select>
      <ActionButton
        type="button"
        disabled={!capitalAvailability('recruit', undefined, undefined, recruitType).ok}
        title={capitalReason('recruit', undefined, undefined, recruitType)}
        onClick={() =>
          dispatch({
            type: 'cityAction',
            cityId: selectedCity.id,
            action: 'recruit',
            troopType: recruitType,
          })
        }
      >
        {t.recruit}
      </ActionButton>
      <ActionButton
        type="button"
        disabled={!capitalAvailability('security').ok}
        title={capitalReason('security')}
        onClick={() =>
          dispatch({
            type: 'cityAction',
            cityId: selectedCity.id,
            action: 'security',
          })
        }
      >
        {t.security}
      </ActionButton>
      <ActionButton
        type="button"
        disabled={!capitalAvailability('feast').ok}
        title={capitalReason('feast')}
        onClick={() =>
          dispatch({
            type: 'cityAction',
            cityId: selectedCity.id,
            action: 'feast',
          })
        }
      >
        {t.feast}
      </ActionButton>
      <ActionButton
        type="button"
        disabled={!capitalAvailability('buy-food').ok}
        title={capitalReason('buy-food')}
        onClick={() =>
          dispatch({
            type: 'cityAction',
            cityId: selectedCity.id,
            action: 'buy-food',
          })
        }
      >
        {t.buyFood}
      </ActionButton>
      <ActionButton
        type="button"
        disabled={!capitalAvailability('sell-food').ok}
        title={capitalReason('sell-food')}
        onClick={() =>
          dispatch({
            type: 'cityAction',
            cityId: selectedCity.id,
            action: 'sell-food',
          })
        }
      >
        {t.sellFood}
      </ActionButton>
      <ActionButton
        type="button"
        disabled={!capitalAvailability('relieve').ok}
        title={capitalReason('relieve')}
        onClick={() =>
          dispatch({
            type: 'cityAction',
            cityId: selectedCity.id,
            action: 'relieve',
          })
        }
      >
        {t.relievePeople}
      </ActionButton>
      <p className="v03-muted">
        {message(locale, 'ui.recruit.soldiers.into.reserve.assign.reserve.sol.50')}{' '}
        <ActionButton type="button" className="text-button" onClick={() => openWiki('governance')}>
          {t.wiki}
        </ActionButton>
      </p>

      {directCityOfficers.map((officer) => {
        const desiredTroops = troopAssignments[officer.id] ?? officer.troops;
        return (
          <div className="v03-work-officer" key={officer.id}>
            <strong>
              {localizedOfficerName(officer.name)} · {officer.troops.toLocaleString()}
            </strong>
            <small className="v03-muted">
              {message(locale, 'ui.loyalty.52')} {officer.loyalty} ·{' '}
              {message(locale, 'ui.force.53')} {officer.force} ·{' '}
              {message(locale, 'ui.intellect.54')} {officer.intellect} ·{' '}
              {message(locale, 'ui.experience.55')} {officer.experience} ·{' '}
              {message(locale, 'ui.level.56')} {officer.level}
            </small>
            <small className="v03-muted">
              {officer.equipment === 'Fine arms' ? t.fineArmsEquipped : t.noFineArms}
            </small>
            <ActionButton
              type="button"
              disabled={!capitalAvailability('reward', officer.id).ok}
              title={capitalReason('reward', officer.id)}
              onClick={() =>
                dispatch({
                  type: 'cityAction',
                  cityId: selectedCity.id,
                  action: 'reward',
                  officerId: officer.id,
                })
              }
            >
              {t.rewardOfficer}
            </ActionButton>
            <ActionButton
              type="button"
              disabled={!capitalAvailability('equip', officer.id).ok}
              title={capitalReason('equip', officer.id)}
              onClick={() =>
                dispatch({
                  type: 'cityAction',
                  cityId: selectedCity.id,
                  action: 'equip',
                  officerId: officer.id,
                })
              }
            >
              {t.issueFineArms}
            </ActionButton>
            <ActionButton
              type="button"
              disabled={!capitalAvailability('train', officer.id).ok}
              title={capitalReason('train', officer.id)}
              onClick={() =>
                dispatch({
                  type: 'cityAction',
                  cityId: selectedCity.id,
                  action: 'train',
                  officerId: officer.id,
                })
              }
            >
              {t.train}
            </ActionButton>
            <label>
              {t.assignmentAmount}
              <Input
                aria-label={`${t.assignmentAmount}: ${displayName(officer, locale)}`}
                type="number"
                min={0}
                max={10000}
                step={100}
                value={desiredTroops}
                onChange={(event) =>
                  setTroopAssignments((current) => ({
                    ...current,
                    [officer.id]: Number(event.target.value),
                  }))
                }
              />
            </label>
            <ActionButton
              type="button"
              disabled={!capitalAvailability('assign-troops', officer.id, desiredTroops).ok}
              title={capitalReason('assign-troops', officer.id, desiredTroops)}
              onClick={() =>
                dispatch({
                  type: 'cityAction',
                  cityId: selectedCity.id,
                  action: 'assign-troops',
                  officerId: officer.id,
                  amount: desiredTroops,
                })
              }
            >
              {t.assignTroops}
            </ActionButton>
          </div>
        );
      })}
    </div>
  );
}
