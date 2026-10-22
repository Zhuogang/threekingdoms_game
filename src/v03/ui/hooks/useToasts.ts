import { useCallback, useState } from 'react';
import { COPY, message, type MessageKey } from '../../i18n';
import { localizeAppMessage } from '../shared/app-copy-2';
import type { V03GameState } from '../../types';
export type ToastMessage =
  | { key: MessageKey; params?: Record<string, string | number | boolean | null> }
  | { legacy: string };
/** Store identity, not a locale snapshot. Legacy command feedback is read at render time. */
export function useToasts(locale: 'en' | 'zh', state: V03GameState | null) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const setFeedback = useCallback((value: string | ToastMessage) => {
    if (!value) {
      setToast(null);
      return;
    }
    if (typeof value !== 'string') {
      setToast(value);
      return;
    }
    const known: Record<string, MessageKey> = {
      'This city is committed to an active battle.': 'reason.committed',
      'This officer is committed to an active battle.': 'reason.committed',
      'This prisoner has already received a decision this month.': 'reason.prisonerMonth',
      'The selected army needs enough food for the march, battle and return.': 'reason.food',
      'Choose at least one available officer.': 'reason.choose',
      'Choose living officers with troops stationed in the source city.': 'reason.choose',
    };
    const key =
      known[value] ??
      (Object.keys(COPY.en) as MessageKey[]).find(
        (key) => COPY.en[key] === value || COPY.zh[key] === value,
      );
    setToast(key ? { key } : { legacy: value });
  }, []);
  const feedback = toast
    ? 'key' in toast
      ? message(locale, toast.key, toast.params)
      : localizeAppMessage(toast.legacy, locale, state ?? undefined)
    : '';
  return { feedback, setFeedback };
}
