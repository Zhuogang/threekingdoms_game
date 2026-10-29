import { OFFICER_IDENTITIES } from '../../content/officerIdentity';
import { Button } from '../kit';
import { message } from '../../i18n';
import { useEffect, useRef, type ReactNode } from 'react';

import { projectCampaignPoint, projectJourneyPosition, type CityId } from '../../geography';

import { type V03Locale } from '../../wiki';

import type { V03GameState } from '../../types';
import { gameDate } from '../../types';

export function absoluteDateLabel(
  startYear: number,
  absoluteDay: number,
  locale: V03Locale,
): string {
  const date = gameDate({ startYear, absoluteDay });
  return message(locale, 'ui.month.day.137', { p0: date.year, p1: date.month, p2: date.day });
}

/** Order deadlines are entered as "within N days"; blank means no deadline. */
export function deadlineFromDaysInput(absoluteDay: number, input: string): number | null {
  if (input.trim() === '') return null;
  const days = Number(input);
  return Number.isFinite(days) ? absoluteDay + Math.max(0, Math.floor(days)) : null;
}

export function displayName(city: { name: string; chinese: string }, locale: V03Locale): string {
  return locale === 'zh'
    ? (Object.values(OFFICER_IDENTITIES).find((identity) => identity.name === city.name)?.chinese ??
        city.chinese)
    : city.name;
}

export function mapPosition(latitude: number, longitude: number) {
  return projectCampaignPoint(latitude, longitude);
}

export function journeyPosition(journey: V03GameState['journeys'][number]) {
  const cityIds = journey.routeCityIds ?? [journey.sourceCityId, journey.destinationCityId];
  return projectJourneyPosition(
    cityIds as CityId[],
    journey.routeSnapshot.map((segment) => segment.lengthKm),
    journey.segmentProgressKm,
  );
}

export function ConfirmDialog({
  title,
  detail,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  body,
  children,
  confirmDisabled = false,
  escapeCancels = true,
}: {
  title: string;
  detail: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | boolean;
  confirmDisabled?: boolean;
  /** False when cancelling has a consequence that Escape should not choose by reflex. */
  escapeCancels?: boolean;
  body?: ReactNode;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLElement>(null);
  const submitted = useRef(false);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLButtonElement>('[data-dialog-cancel]')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="v03-modal-backdrop">
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="v03-confirm-modal"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (escapeCancels) onCancel();
          }
          if (event.key !== 'Tab') return;
          const controls = dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select:not(:disabled), input:not(:disabled)',
          );
          if (!controls?.length) return;
          const first = controls[0]!;
          const last = controls[controls.length - 1]!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <h2>{title}</h2>
        <p>{detail}</p>
        {body}
        <div className="v03-dialog-actions">
          {children}
          <Button type="button" data-dialog-cancel onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className="v03-primary"
            disabled={confirmDisabled}
            onClick={() => {
              if (!submitted.current) {
                submitted.current = true;
                if (onConfirm() === false) submitted.current = false;
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
