#!/usr/bin/env node
/** Rebuild the reviewed roster tables and current runtime initialization audit. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';

const docPath = 'docs/v0.3/13-officer-roster-data.md';
const evidenceDir = process.argv[2] ?? 'docs/v0.3/evidence/officer-roster-review-2026-10-26';
const evidencePath = `${evidenceDir}/roster-audit.json`;
const sourcePaths = [
  'src/v03/content/officer-catalog.ts',
  'src/v03/content/officer-history.ts',
  'src/v03/content/officer-timeline.ts',
  'src/v03/content/officer-game-reference.ts',
  'src/v03/content/officer-opening-placements.ts',
  'src/v03/content/officer-roster-setups.ts',
  'src/v03/campaign/officer-lifecycle.ts',
  'src/v03/campaign/monthly-systems.ts',
  'src/v03/content/officerIdentity.ts',
  'src/v03/initial-state.ts',
  'src/v03/engine.ts',
  'src/v03/platform/storage.ts',
  'src/v03/types.ts',
  'src/v03/governance/autonomy.ts',
  'src/v03/governance/city-actions.ts',
  'src/v03/governance/commitments.ts',
  'src/v03/ui/panels/CityAffairs.tsx',
  'src/v03/content/officer-portraits.generated.ts',
  'src/v03/content/naval-commanders.ts',
  'src/v03/rendering/officer-portraits.ts',
  'src/v03/rendering/OfficerPortrait.tsx',
  'src/v03/rendering/presentation.ts',
  'src/v03/rendering/BattlefieldMapView.tsx',
  'src/v03/ui/panels/BattleSidebar.tsx',
  'src/v03/ui/screens/StartScreen.tsx',
  'src/v03/ui/panels/CityOfficers.tsx',
  'src/v03/ui/panels/OfficerDirectory.tsx',
  'src/v03/ui/panels/OfficerProfile.tsx',
  'src/v03/ui/shared/officer-view.ts',
  'src/v03/styles.css',
  'public/fonts/manifest.json',
  'public/fonts/noto-serif-sc.woff2',
  'public/fonts/source-sans-3.woff2',
  'src/v03/commands.ts',
  'src/v03/campaign/battle-aftermath.ts',
  'src/v03/campaign/personnel.ts',
  'src/v03/campaign/personnel-recovery.ts',
  'src/v03/campaign/prisoners.ts',
  'src/v03/battle/engine.ts',
  'src/v03/calendar/day-resolution.ts',
  'tests/v03/helpers/roster-regression.ts',
  'tests/v03/officer-expansion.regression.test.ts',
  'tests/v03/month-boundary-arrivals.test.ts',
  'tests/production-v03/roster-matrix.spec.ts',
  'tools/v03-roster-regression.mjs',
  'tools/v03-officer-roster-audit.mjs',
  'tests/v03/officer-expansion.review.test.ts',
  'tests/v03/officer-lifecycle.integration.test.ts',
  'tests/e2e-v03/officer-review.spec.ts',
];
try {
  await mkdir('.artifacts', { recursive: true });
  const runtime = resolve('.artifacts/v03-officer-audit-runtime.mjs');
  await build({
    stdin: {
      contents: [
        "export { OFFICER_CATALOG } from './src/v03/content/officer-catalog.ts';",
        "export { createOfficerRosterSetup, scheduledOfficerDebuts, OFFICER_ROSTER_VERSION } from './src/v03/content/officer-roster-setups.ts';",
        "export { SCENARIOS } from './src/v03/content/scenario.ts';",
        "export { createV03Game } from './src/v03/initial-state.ts';",
        "export { encodeV03Save, decodeV03Save } from './src/v03/platform/storage.ts';",
      ].join('\n'),
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: runtime,
  });
  const {
    OFFICER_CATALOG,
    createOfficerRosterSetup,
    scheduledOfficerDebuts,
    OFFICER_ROSTER_VERSION,
    SCENARIOS,
    createV03Game,
    encodeV03Save,
    decodeV03Save,
  } = await import(pathToFileURL(runtime).href);
  const manifest = JSON.parse(await readFile('public/assets/v03/portraits/manifest.json', 'utf8'));
  const ids = ['divided-realm-190', 'guandu-200'];
  const definitions = new Map(OFFICER_CATALOG.map((officer) => [officer.id, officer]));
  const cityNames = new Map(SCENARIOS[0].cities.map((city) => [city.id, city.chinese]));
  const names = (id) => definitions.get(id)?.chinese ?? '—';
  const city = (id) => cityNames.get(id) ?? id;
  const faction = {
    cao: '曹操',
    liu: '刘备',
    sun: '孙氏',
    yuan: '袁绍',
    dong: '董卓',
    yan: '刘焉／璋',
    ma: '马腾',
  };
  const troop = { infantry: '步', cavalry: '骑', archer: '弓' };
  const status = { serving: '在职', free: '在野', deceased: '已故', pending: '待登场' };
  const roles = { ruler: '君主', governor: '太守', officer: '属将', none: '—' };
  const kinds = {
    recorded: '史载',
    inferred: '史据推算',
    disputed: '有争议',
    'game-reference': '游戏参考',
    unknown: '不详',
    design: '策划近似',
  };
  const setups = ids.map((id) => createOfficerRosterSetup(id));
  const count = (setup) =>
    Object.fromEntries(
      Object.keys(status).map((key) => [
        key,
        setup.officers.filter((officer) => officer.status === key).length,
      ]),
    );
  const sources = [...new Set(OFFICER_CATALOG.flatMap((officer) => officer.timeline.sources))];
  const sourceLinks = (refs) =>
    refs.map((ref) => `[${sources.indexOf(ref) + 1}](#来源)`).join('、');
  const report = {
    reviewed: '2026-10-26',
    phase: 'R5-review',
    runtimeIntegrated: true,
    officerRosterVersion: OFFICER_ROSTER_VERSION,
    baselineCommit: '55ffd75',
    runtimeOpenings: ids.map((id) => {
      const state = createV03Game('cao', 19, id);
      const decoded = decodeV03Save(encodeV03Save(state));
      return {
        scenarioId: id,
        officerCount: state.officers.length,
        livingCount: state.officers.filter((officer) => officer.alive).length,
        deceasedCount: state.officers.filter((officer) => !officer.alive).length,
        officerRosterVersion: state.officerRosterVersion,
        lastOfficerDebutYear: state.lastOfficerDebutYear,
        saveRoundTripValid: isDeepStrictEqual(decoded, state),
      };
    }),
    sourceHashes: Object.fromEntries(
      await Promise.all(
        sourcePaths.map(async (path) => [
          path,
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        ]),
      ),
    ),
    catalogue: OFFICER_CATALOG.map((officer) => ({
      ...officer,
      portraitFiles: manifest.entries
        .find((entry) => entry.id === officer.portraitId)
        .files.map((file) => file.path),
    })),
    scenarios: setups.map((setup, index) => {
      const baseline = SCENARIOS[index];
      return {
        ...setup,
        counts: count(setup),
        schedule: scheduledOfficerDebuts(setup.scenarioId),
        resources: setup.cities.map((planned) => {
          const before = baseline.cities.find((candidate) => candidate.id === planned.id);
          const healthBefore = baseline.officers
            .filter(
              (officer) =>
                officer.fate === 'active' &&
                officer.cityId === planned.id &&
                officer.factionId === planned.factionId &&
                planned.factionId !== null,
            )
            .reduce((sum, officer) => sum + officer.troops, 0);
          const returns = Object.values(planned.reserveAdditions).reduce((a, b) => a + b, 0);
          return {
            cityId: planned.id,
            population: before.population,
            food: before.food,
            gold: before.gold,
            wounded: 0,
            healthyBefore: healthBefore,
            healthyAfter: planned.healthyTroops,
            reserveBefore: before.reserve,
            reserveAfter: before.reserve + returns,
            soldiersConserved:
              healthBefore + before.reserve === planned.healthyTroops + before.reserve + returns,
          };
        }),
      };
    }),
  };
  if (
    report.catalogue.length !== 98 ||
    report.runtimeOpenings.some((opening) => !opening.saveRoundTripValid) ||
    report.catalogue.filter((officer) => officer.isNew).length !== 45 ||
    report.scenarios.some((scenario) =>
      scenario.resources.some((resource) => !resource.soldiersConserved),
    )
  )
    throw new Error('Roster accounting failed.');
  const table = (header, rows) =>
    `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n${rows.map((row) => '| ' + row.join(' | ') + ' |').join('\n')}\n`;
  const lines = [
    '# 98 人年表与开局配置（R1–R5）',
    '',
    '2026-10-26。R1–R5 已接通人物数据、生命周期、招募／首次编兵、头像与 98 人名册资料界面，并完成各势力集成回归。由 `node tools/v03-officer-roster-audit.mjs` 从人物库、配置与实际初始化生成，修改数据后重跑本工具。名册内容版本为 1。',
    '',
    '史料优先；按用户补充，史料没有记载的生卒及早期登场参考《三国志11》公开数据，逐字段标记“游戏参考”。本次 98 人均有对应参考项，无需混用《三国志10》。游戏参考不是史实证明；年龄按虚岁计算，登场不得早于 16 岁。出生、可用、投主三者分开，官职首次记载不等于此前一定不可招募。',
    '',
    '生卒仅决定开局资格。开局当年卒者仍可用，开局前已故者保留死亡记录；局内不按史实或参考游戏卒年杀人。未来登场者固定在野、零兵，城市易主不自动加入。固定人物库不模拟婚育，不因游戏中父母的命运增减日程。',
    '',
    '**新战役已使用本表配置：190 年有 69 条在世记录，200 年有 81 条记录（66 在世、15 已故）。** 名册可查看全部 98 人，但未登场者和已故者不获得现役操作。NPC 首都及地方城按共享工作点搜索和首次编兵，未来到年者在野零兵出现。旧名册不自动迁移，玩法平衡仍需人工试玩。',
    '',
    '## 开局人数与登场节奏',
    '',
    table(
      ['剧本', '在职', '在野', '已故', '待登场', '开局可用', '随后五年登场', '更晚登场'],
      setups.map((setup) => {
        const c = count(setup),
          schedule = scheduledOfficerDebuts(setup.scenarioId);
        return [
          setup.year,
          c.serving,
          c.free,
          c.deceased,
          c.pending,
          c.serving + c.free,
          schedule.filter((entry) => entry.year <= setup.year + 5).length,
          schedule.filter((entry) => entry.year > setup.year + 5).length,
        ];
      }),
    ),
    '',
    '“随后五年”是开局年之后第 1–5 年。登场统计只计算既定日程，不扣局内战死，也不按历史卒年移除开局人物；每个剧本四类状态合计 98。普通战役可在晚期人物登场前正常结束。',
    '',
  ];
  for (const setup of setups) {
    const schedule = scheduledOfficerDebuts(setup.scenarioId);
    const years = [...new Set(schedule.map((entry) => entry.year))];
    lines.push(
      `### ${setup.year} 年剧本的后续日程`,
      '',
      table(
        ['年份', '人数', '人物与落点'],
        years.map((year) => [
          year,
          schedule.filter((entry) => entry.year === year).length,
          schedule
            .filter((entry) => entry.year === year)
            .map((entry) => `${names(entry.id)}·${city(entry.cityId)}`)
            .join('、'),
        ]),
      ),
      '',
    );
  }
  lines.push(
    '## 完整人物表',
    '',
    '能力均为本作成年基准，不照搬光荣五维属性；每人仅一个基础兵种。原有 53 人成年基准保持原值，新增 45 人按既有量级配置。史据推算指用卒年／年龄推生年；策划近似指有活动依据但未将选定年份冒称史实出仕。',
    '',
    table(
      [
        '人物／ID',
        '新增',
        '生年（依据）',
        '卒年（依据）',
        '可用年（依据）',
        '未来落点',
        '成年武／智',
        '兵种',
        '头像清单 ID',
        '来源',
      ],
      OFFICER_CATALOG.map((officer) => {
        const t = officer.timeline;
        return [
          `${officer.chinese} · \`${officer.id}\``,
          officer.isNew ? '是' : '—',
          `${t.birthYear ?? '不详'}·${kinds[t.birthKind]}`,
          `${t.deathYear ?? '不详'}·${kinds[t.deathKind]}`,
          `${t.debutYear}·${kinds[t.debutKind]}`,
          `${city(t.debutCityId)} · ${t.debutCityId}`,
          `${officer.adultForce}/${officer.adultIntellect}`,
          troop[officer.troopType],
          `\`${officer.portraitId}\``,
          sourceLinks(t.sources),
        ];
      }),
    ),
    '',
    '### 逐人核定说明',
    '',
    ...OFFICER_CATALOG.map(
      (officer) =>
        `- **${officer.chinese}**：${officer.timeline.basis} 来源 ${sourceLinks(officer.timeline.sources)}。`,
    ),
    '',
    '## 两剧本逐人开局安排',
    '',
    '在职者必须处于友城；在野者可居任何城市，但搜索仍受本城权限、承诺状态及工作点约束。未建模原势力人物的游戏所属为空，不设隐藏势力。待登场行只供资料及日程核对，不进入世界武将列表。',
    '',
    table(
      [
        '人物',
        '190 状态',
        '190 所属·城市',
        '190 职务·兵',
        '200 状态',
        '200 所属·城市',
        '200 职务·兵',
      ],
      OFFICER_CATALOG.map((officer) => {
        const [a, b] = setups.map((setup) =>
          setup.officers.find((candidate) => candidate.id === officer.id),
        );
        return [
          officer.chinese,
          status[a.status],
          `${faction[a.factionId] ?? '无'}·${city(a.cityId)}`,
          `${roles[a.role]}·${a.troops}`,
          status[b.status],
          `${faction[b.factionId] ?? '无'}·${city(b.cityId)}`,
          `${roles[b.role]}·${b.troops}`,
        ];
      }),
    ),
    '',
    '### 关键归属与版图妥协',
    '',
    '- 190 年荀彧、程昱、于禁不提前归曹；韩馥旧属张郃、沮授、郭图与汉廷旧臣田丰按地方人才安排。200 年郭嘉、荀攸、张昭等已入幕者直接在职；许攸仍属袁绍；贾诩已于 199 年随张绣归曹。',
    '- 200 年孙策仍为君主，孙权在孙氏任职；鲁肃、诸葛瑾、朱然、徐盛不提前套用孙权接掌后的任命。赵云与刘备在当年重逢也不在年初预演。孔融改为许都汉官位置；刘表 190 年在洛阳，200 年在襄阳。',
    '- 马腾的运行 ID 保留 `maliang`，头像清单 ID 是 `mateng`；马良为 `maliang_shu`。祖茂运行 ID `zuzhao` 对应 `zumao`。16 套修订像不重复加人。',
    '- 190 年刘璋在成都作为刘焉家族班底，是六势力地图的明确抽象；董卓首都仍为长安，孙氏江东与刘备平原等也沿用既有剧本版图。本批不宣称还原完整政治地理。',
    '- 190 年颜良由邺改驻北海，明确任太守以维持当地人才入口。其原部归邺预备兵，改从北海张郃归库的原有 700 骑兵中分配，城市兵种总量不增。200 年颜良仍驻邺，寿春太守由参考卒年已故的祖茂改为吕蒙；吕蒙仍以零兵开局。',
    '- 200 年北平、平原原已缺少在职班底，仍需正常派人／任命才有城务，不能越权用全局名册直接招人。R3 已验证有人手且预算、同兵种库存与粮食充足的 NPC 首都及地方城搜索、首次编兵链。',
    '',
    '## 城市人员、兵力和资源账',
    '',
    '新增者全部零健康兵、零伤兵、零经验、零整编；没有随人赠送人口、预备兵、金粮。旧部因开局资格／归属调整而归原城市同兵种预备兵，保留逐城、逐兵种守恒；未征募、未改变人口及金粮。工作点只数同城在职者，仍最多三点。以下健康兵下降和预备兵增加是重分配，不是额外兵员。',
    '',
  );
  for (const [index, setup] of setups.entries()) {
    const base = SCENARIOS[index];
    lines.push(
      `### ${setup.year} 年城市核对`,
      '',
      table(
        [
          '城市',
          '所属',
          '君主／太守',
          '在职',
          '工作点 旧→新',
          '健康兵 旧→新',
          '预备兵变化（步／骑／弓）',
        ],
        setup.cities.map((c) => {
          const old = base.officers.filter(
            (o) =>
              o.cityId === c.id &&
              o.fate === 'active' &&
              o.factionId !== null &&
              o.factionId === c.factionId,
          );
          const ruler = setup.factions.find((f) => f.capitalCityId === c.id);
          return [
            city(c.id),
            faction[c.factionId] ?? '无主',
            names(ruler?.leaderOfficerId ?? c.governorId),
            setup.officers.filter((o) => o.status === 'serving' && o.cityId === c.id).length,
            `${Math.min(3, old.length)}→${c.workPoints}`,
            `${old.reduce((sum, o) => sum + o.troops, 0)}→${c.healthyTroops}`,
            `${c.reserveAdditions.infantry}/${c.reserveAdditions.cavalry}/${c.reserveAdditions.archer}`,
          ];
        }),
      ),
      '',
    );
  }
  lines.push(
    '## 原有 53 人的年龄与少年能力校准',
    '',
    '表中只列与旧种子不同的行。武／智成年基准保持旧值；未满 18 岁开局减 3／2，到成年只加回差额。R2 已通过实际装备、训练命令及跨年／读档验证，成长加到当前值，保留个人经验、等级及装备收益；新登场的成年者不再额外领取成长。死亡记录冻结年龄。',
    '',
    table(
      ['剧本', '人物', '年龄 旧→新', '武／智 旧→新', '新状态'],
      setups.flatMap((setup, index) =>
        SCENARIOS[index].officers.flatMap((old) => {
          const row = setup.officers.find((officer) => officer.id === old.id);
          return old.age === row.age && old.force === row.force && old.intellect === row.intellect
            ? []
            : [
                [
                  setup.year,
                  old.chinese,
                  `${old.age}→${row.age ?? '不详'}`,
                  `${old.force}/${old.intellect}→${row.force}/${row.intellect}`,
                  status[row.status],
                ],
              ];
        }),
      ),
    ),
    '',
    '## 来源',
    '',
    '史料为公开古籍文本；游戏参考为攻略站对《三国志11》数值字段的整理，并非光荣官方史料。保留了本轮读取的 98 人生年／卒年／登场字段快照，不引入其人物传记、技能、素材或其他规则。字段冲突以本表的逐人标注为准。',
    '',
    ...sources.map(
      (source, index) =>
        `${index + 1}. [${source.includes('atwiki') ? '《三国志11》武将数据参考' : decodeURI(source.split('/').at(-1))}](${source})`,
    ),
    '',
    '## 验证与接续',
    '',
    `测试覆盖数据、生命周期、招募编兵、人物界面及完整战役流程。当前机器账：[roster-audit.json](${evidenceDir.replace('docs/v0.3/', '')}/roster-audit.json)；整体复核：[复核验证记录](${evidenceDir.replace('docs/v0.3/', '')}/README.md)；集成及生产子路径：[R5 验证记录](evidence/officer-roster-r5-2026-10-26/README.md)；界面／字体证据：[R4 验证记录](evidence/officer-roster-r4-2026-10-26/README.md)；原始游戏参考快照：[san11-reference.json](evidence/officer-roster-2026-10-26/san11-reference.json)。进度见[实施状态](implementation-status.md)。`,
    '',
    'R1–R3 的初始化、存取、登场、招募、同兵种编兵与口粮记录保持。R4 使用轻量头像索引：53 位旧人物保留早期原像，45 位新人物接入新图；16 套修订像不另加人物、不自动按年龄切脸。名册每页最多 12 张小图，资料才加载大图，未登场和已故只查阅，城池将领与在野分组。R5 覆盖 12 个剧本／势力组合的完整流程、跨年、固定种子战役和生产子路径；修复月界到达漏办。本批属于实现验收，完整战役平衡仍需人工试玩。',
    '',
  );
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    docPath,
    await format(lines.join('\n'), {
      ...(await resolveConfig(docPath)),
      parser: 'markdown',
      proseWrap: 'preserve',
    }),
  );
  await writeFile(
    evidencePath,
    await format(JSON.stringify(report), {
      ...(await resolveConfig(evidencePath)),
      parser: 'json',
    }),
  );
  console.log(
    JSON.stringify(
      {
        catalogue: report.catalogue.length,
        additions: report.catalogue.filter((officer) => officer.isNew).length,
        scenarios: report.scenarios.map(({ scenarioId, counts }) => ({ scenarioId, counts })),
        docPath,
        evidencePath,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
