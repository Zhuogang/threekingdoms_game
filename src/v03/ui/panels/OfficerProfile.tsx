import type { V03GameState } from '../../types';
import { hasNavalTraining } from '../../content/naval-commanders';
import { troopName } from '../../rendering/presentation';
import { OfficerPortrait } from '../../rendering/OfficerPortrait';
import { StatGrid } from '../kit';
import {
  officerCopy,
  officerDossier,
  officerLocation,
  OFFICER_STATUS_LABELS,
} from '../shared/officer-view';

export function OfficerProfile({
  state,
  id,
  locale,
}: {
  state: V03GameState;
  id: string;
  locale: 'zh' | 'en';
}) {
  const data = officerDossier(state, id);
  if (!data) return null;
  const { definition: person, runtime, status, age, year, opening, personnel } = data;
  const t = officerCopy[locale];
  const name = (entity: { chinese: string; name: string }) =>
    locale === 'zh' ? entity.chinese : entity.name;
  const factionName = (id: string | null | undefined) => {
    const faction = state.factions.find((entry) => entry.id === id);
    return faction ? name(faction) : '—';
  };
  const unborn = person.timeline.birthYear !== null && year < person.timeline.birthYear;
  const dateLabels: Record<string, string> = {
    'game-reference': t.game,
    inferred: t.inferred,
    disputed: t.disputed,
    design: t.design,
  };
  const date = (value: number | null, kind: string) =>
    (value ?? t.unknown) + (dateLabels[kind] ? ' · ' + dateLabels[kind] : '');
  const debutCity = state.cities.find((city) => city.id === person.timeline.debutCityId);
  return (
    <section className="v03-officer-profile" data-officer-id={id} data-status={status}>
      <div className="v03-profile-hero">
        <OfficerPortrait id={id} locale={locale} size={256} eager />
        <div>
          <h3>{name(person)}</h3>
          <p>{locale === 'zh' ? person.name : person.chinese}</p>
          <span className="v03-officer-status">{OFFICER_STATUS_LABELS[status][locale]}</span>
          <p>
            {t.surname}: {locale === 'zh' ? person.surnameZh : person.surnameEn}
          </p>
          <p className="v03-muted">
            {status === 'pending'
              ? t.pendingNote
              : status === 'deceased'
                ? t.deadNote
                : status === 'free'
                  ? t.freeNote
                  : t.readOnly}
          </p>
        </div>
      </div>
      {opening?.unmodeledHouse ? (
        <p className="v03-muted">
          {t.opening}: {t.unmodeledHouse} · {opening.unmodeledHouse[locale]}
          {locale === 'zh' ? '。' : '. '}
          {t.openingNote}
        </p>
      ) : null}
      <StatGrid
        values={[
          { label: t.age, value: age === null ? (unborn ? t.unborn : t.unknown) : age },
          { label: t.faction, value: factionName(runtime?.factionId) },
          {
            label: status === 'pending' ? t.debutCity : t.location,
            value:
              status === 'pending'
                ? debutCity
                  ? name(debutCity)
                  : '—'
                : officerLocation(state, runtime, locale),
          },
          { label: t.type, value: troopName(person.troopType, locale) },
          { label: t.debut, value: date(person.timeline.debutYear, person.timeline.debutKind) },
          { label: t.naval, value: hasNavalTraining(id) ? t.yes : t.no },
          ...(status === 'captured'
            ? [{ label: t.holder, value: factionName(data.holderFactionId) }]
            : []),
        ]}
      />
      <h4>{runtime ? t.current : t.adult}</h4>
      <StatGrid
        values={[
          { label: t.force, value: runtime?.force ?? person.adultForce },
          { label: t.intellect, value: runtime?.intellect ?? person.adultIntellect },
          ...(runtime
            ? [
                {
                  label: personnel?.shared
                    ? t.formationHealthy
                    : locale === 'zh'
                      ? '健康兵'
                      : 'Healthy soldiers',
                  value: personnel!.troops.toLocaleString(),
                },
                {
                  label: personnel?.shared
                    ? t.formationWounded
                    : locale === 'zh'
                      ? '伤兵'
                      : 'Wounded',
                  value: personnel!.wounded.toLocaleString(),
                },
                { label: locale === 'zh' ? '武将经验' : 'Officer XP', value: runtime.experience },
                { label: locale === 'zh' ? '武将等级' : 'Officer level', value: runtime.level },
                { label: locale === 'zh' ? '忠诚' : 'Loyalty', value: runtime.loyalty },
                {
                  label: locale === 'zh' ? '装备' : 'Equipment',
                  value:
                    runtime.equipment === 'Fine arms'
                      ? locale === 'zh'
                        ? '精良兵器'
                        : 'Fine arms'
                      : '—',
                },
              ]
            : []),
        ]}
      />
      {personnel?.shared ? <p className="v03-muted">{t.formationNote}</p> : null}
      <details className="v03-profile-sources">
        <summary>{t.reference}</summary>
        <p>
          {t.birth}: {date(person.timeline.birthYear, person.timeline.birthKind)}
        </p>
        <p>
          {t.death}: {date(person.timeline.deathYear, person.timeline.deathKind)}
        </p>
        <p>{t.dateNote}</p>
        {locale === 'zh' ? <p>{person.timeline.basis}</p> : null}
        <ul>
          {person.timeline.sources.map((url, index) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {url.includes('atwiki') ? t.game : t.history} {index + 1}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
