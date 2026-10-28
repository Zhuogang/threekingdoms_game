import { Button, Select } from '../kit';
import { message } from '../../i18n';
import { OfficerPortrait } from '../../rendering/OfficerPortrait';
import { createV03Game } from '../../initial-state';
import { lazy, Suspense } from 'react';
const PlaytestMenu = import.meta.env.DEV ? lazy(() => import('../panels/PlaytestMenu')) : null;

import { scenarioById } from '../../content/scenario';

import { loadV03Autosave, readV03AutosavePayload } from '../../platform/storage';

import { availableV03Scenarios } from '../../initial-state';

import { ConfirmDialog } from '../shared/app-copy-3';
import type { useCampaignOrders } from '../hooks/useCampaignOrders';
export function StartScreen({ context }: { context: ReturnType<typeof useCampaignOrders> }) {
  const {
    state,
    locale,
    setLocale,
    t,
    scenarioId,
    setScenarioId,
    setFactionId,
    factions,
    factionId,
    setConfirmation,
    startCampaign,
    replaceCampaign,
    setShowCampaignMenu,
    feedback,
    confirmation,
    exportSave,
  } = context;
  const saved =
    state ??
    (() => {
      try {
        return loadV03Autosave();
      } catch {
        return null;
      }
    })();
  const hasStoredPayload = (() => {
    try {
      return readV03AutosavePayload() !== null;
    } catch {
      return false;
    }
  })();
  return (
    <main className="v03-start">
      <section className="v03-start-card" aria-label={message(locale, 'ui.campaign.menu.120')}>
        <div className="v03-start-kicker">HEGEMONY · NEW RULESET</div>
        <Button
          type="button"
          className="v03-start-locale"
          onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
        >
          {message(locale, 'ui.text.122')}
        </Button>
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
        <label className="v03-field">
          {t.scenario}
          <Select
            value={scenarioId}
            onChange={(event) => {
              setScenarioId(event.target.value);
              const scenario = scenarioById(event.target.value);
              setFactionId(scenario?.factions[0]?.id ?? '');
            }}
          >
            {availableV03Scenarios().map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.year} ·{' '}
                {locale === 'zh'
                  ? scenario.id === 'guandu-200'
                    ? '官渡前夕'
                    : '群雄割据'
                  : scenario.title}
              </option>
            ))}
          </Select>
        </label>
        <p>
          {locale === 'zh'
            ? scenarioId === 'guandu-200'
              ? '曹操与袁绍争雄北方，孙氏立足江东。'
              : '汉室衰微，六大势力竞逐天下。'
            : scenarioById(scenarioId)?.description}
        </p>
        <div className="v03-ruler-grid" aria-label={t.ruler}>
          {factions.map((faction) => (
            <Button
              type="button"
              key={faction.id}
              className={`v03-ruler-card ${factionId === faction.id ? 'is-selected' : ''}`}
              onClick={() => setFactionId(faction.id)}
            >
              <span className="v03-banner" style={{ backgroundColor: faction.color }} />
              {(() => {
                const initial = createV03Game(faction.id, 1, scenarioId);
                const ruler = initial.officers.find(
                  (officer) =>
                    officer.id ===
                    initial.factions.find((entry) => entry.id === faction.id)!.leaderOfficerId,
                )!;
                const cities = initial.cities.filter((city) => city.factionId === faction.id);
                const count = initial.officers.filter(
                  (officer) => officer.alive && officer.factionId === faction.id,
                ).length;
                const blurbs: Record<string, string> = {
                  cao: '中原谋略之主，商贸兴盛，文武均衡。',
                  liu: '以仁义聚众，需善用忠诚的武将。',
                  sun: '江东勇进，凭借水乡稳步扩张。',
                  yuan: '北方大族，兵强粮足。',
                  dong: '控制朝廷，四面受敌。',
                  yan: '据守益州，凭借山川屏障发展内政。',
                  ma: '西凉骑将，立足西部山地。',
                };
                return (
                  <>
                    <OfficerPortrait id={ruler.id} locale={locale} size={256} eager />
                    <strong>{locale === 'zh' ? ruler.chinese : faction.name}</strong>
                    <small>
                      {cities
                        .map((city) => (locale === 'zh' ? city.chinese : city.name))
                        .join(' · ')}
                    </small>
                    <small>
                      {message(locale, 'ui.officers.127', {
                        p0: count,
                        p1: cities.length >= 4 ? '较易' : cities.length <= 2 ? '较难' : '均衡',
                        p2: faction.difficulty,
                      })}
                    </small>
                    <p>{locale === 'zh' ? blurbs[faction.id] : faction.description}</p>
                  </>
                );
              })()}
            </Button>
          ))}
        </div>
        <div className="v03-start-actions">
          {PlaytestMenu ? (
            <Suspense>
              <PlaytestMenu onLoad={replaceCampaign} />
            </Suspense>
          ) : null}
          <Button
            type="button"
            className="v03-primary"
            onClick={() =>
              saved || hasStoredPayload ? setConfirmation('replace') : startCampaign()
            }
          >
            {t.newCampaign}
          </Button>
          {saved ? (
            <Button
              type="button"
              onClick={() => {
                if (!state) replaceCampaign(saved);
                else setShowCampaignMenu(false);
              }}
            >
              {message(locale, 'ui.resume.campaign.128')}
            </Button>
          ) : null}
        </div>
        {feedback ? (
          <p className="v03-feedback" role="status">
            {feedback}
          </p>
        ) : null}
      </section>
      {confirmation === 'replace' ? (
        <ConfirmDialog
          title={message(locale, 'ui.replace.current.campaign.129')}
          detail={message(locale, 'ui.starting.a.new.campaign.replaces.this.browser.s..130')}
          cancelLabel={message(locale, 'ui.cancel.62')}
          confirmLabel={message(locale, 'ui.replace.and.begin.131')}
          onCancel={() => setConfirmation(null)}
          onConfirm={startCampaign}
        >
          {state || hasStoredPayload ? (
            <Button type="button" onClick={exportSave}>
              {message(
                locale,
                state ? 'ui.export.current.campaign.132' : 'flow.exportOriginalSave',
              )}
            </Button>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </main>
  );
}
