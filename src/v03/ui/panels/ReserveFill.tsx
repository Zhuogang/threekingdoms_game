import { useMemo } from 'react';
import { message } from '../../i18n';
import { fillOfficersFromReserve } from '../../governance/reserve-fill';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button } from '../kit';

/** One free click for recruit → assign: matching reserves go to the stationed officers. */
export function ReserveFillButton({
  context,
  cityId,
}: {
  context: GameplayContext;
  cityId?: string;
}) {
  const { state, locale } = context;
  const city = cityId ? state.cities.find((entry) => entry.id === cityId) : context.selectedCity;
  const preview = useMemo(
    () => (city ? fillOfficersFromReserve(state, city.id) : null),
    [state, city?.id],
  );
  if (!city || !preview?.ok) return null;
  return (
    <Button
      variant="primary"
      className="v03-reserve-fill"
      title={message(locale, 'reserve.fillHint')}
      onClick={() => {
        const result = context.dispatch({ type: 'fillOfficersFromReserve', cityId: city.id });
        if (result?.ok)
          context.setFeedback({ key: 'reserve.filled', params: { count: result.assigned ?? 0 } });
      }}
    >
      {message(locale, 'reserve.fill', { count: preview.assigned.toLocaleString() })}
    </Button>
  );
}
