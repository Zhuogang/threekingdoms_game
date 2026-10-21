import { TROOP_LABELS } from '../content/scenario';
import type { TroopType } from '../game/types';
import { useI18n } from '../i18n';
import TroopIcon from './TroopIcon';
import TroopFigure from './TroopFigure';

export default function TroopLegend() {
  const { t, tx } = useI18n();
  return (
    <section className="troop-legend" aria-label={t('Troop and banner meanings')}>
      <p>{t('Banner color and crest show allegiance. The surname identifies the commander.')}</p>
      <div className="troop-legend-grid">
        {(Object.keys(TROOP_LABELS) as TroopType[]).map((type) => (
          <span key={type}>
            <TroopFigure type={type} />
            <span className="troop-legend-label">
              <TroopIcon type={type} size={18} />
              {tx(TROOP_LABELS[type])}
            </span>
          </span>
        ))}
      </div>
      <div className="readiness-legend">
        <span>○ {t('Ready')}</span>
        <span>→ {t('Moved · action ready')}</span>
        <span>✓ {t('Finished for today')}</span>
        <span>? {t('Confused · unavailable')}</span>
      </div>
      <div className="readiness-legend">
        <span>~ {t('Wavering · no tactics')}</span>
        <span>✕ {t('Routed · move or hold only')}</span>
        <span>★ {t('Veteran level')}</span>
        <span>■ {t('Zone-of-control stop')}</span>
      </div>
      <p>{t('Inspired is an extra status. It does not restore an action.')}</p>
    </section>
  );
}
