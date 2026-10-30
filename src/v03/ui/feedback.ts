import { BATTLEFIELD_NAMES } from '../battle/battlefields/selection';
import { troopName } from '../rendering/presentation';
import type { V03GameState } from '../types';
import type { V03Locale } from '../wiki';

const ROUTINE_ZH: Readonly<Record<string, string>> = {
  'Select up to 100 officers per transfer.': '每支调动队伍最多 100 名武将，请分批调动。',
  'Choose at least one available officer.': '请至少勾选一名可用武将。',
  'Only cities held by your faction can issue this order.': '仅己方城池可以发出此命令。',
  'Choose living officers stationed in the source city.': '请选择驻留在出发城的己方在世武将。',
  'Rulers and governors must use governor appointments instead of ordinary officer transfers.':
    '君主和现任太守请通过太守任免调整任职；此处用于普通驻将。',
  'This officer has a pending governor appointment.': '该武将已有待生效的太守任命。',
  'The selected officers have departed for the friendly city.':
    '所选武将已携带所部出发前往己方城池。',
  'This action does not support multiple officers.': '此操作不支持多选武将。',
  'Choose at least one officer for this action.': '请至少勾选一名武将。',
  'Choose each officer only once.': '同一名武将不能重复选择。',
  'All selected officers are already completely loyal.': '所选武将的忠诚均已达到上限。',
  'The ruler must arrive in this city before governing it personally.':
    '君主须先抵达本城，才能亲自治理。',
  'This city governance decision is no longer available.': '该城治理选择已失效，请检查城池归属。',
  'Choose another officer; use personal rule for the ruler.':
    '请选择其他武将；君主任职请选择自任太守。',
  'The source city needs enough unreserved food for the contingent’s transfer and possible return.':
    '出发城须有足够未预留粮食，供所部调任及可能的返程使用。',
  'You can propose an alliance to this faction again next month.':
    '对该势力本月已提议结盟或解盟，请下月再试。',
  'City loyalty is already full.': '本城民心已满，无需再整顿治安。',
  'All stationed officers are already completely loyal.': '驻城武将忠诚均已满，无需再宴饮。',
  'Choose a different troop count.': '兵力没有变化，请调整目标人数。',
  'These troops are still reorganizing.': '这批人员仍在整编，暂不能作战或调拨。',
  'Choose an uncommitted friendly city.': '请选择未被战斗占用的己方城市。',
  'Choose a positive number of personnel to disband.': '请输入要遣散的人数。',
  'Choose personnel stationed in this city.': '请选择本城驻留且未被占用的人员。',
  'The city reserve does not contain those soldiers.': '本城兵池中没有这些人员。',
  'Choose a stationed officer with personnel.': '请选择仍有健全兵或伤兵的驻城武将。',
  'No city work points remain.': '本城本月已没有可用工作点。',
  'The prisoner is still being escorted.': '该俘虏仍在押送途中，抵城后才能处置。',
  'Choose one of your officers held by this prisoner’s house with a usable return route.':
    '请选择由对方看押、且双方都有归还路线的己方武将。',
  'Only your directly governed capital accepts city work orders.':
    '只有君主直辖本城接受直接内政命令。',
  'Monthly governor work requires an owned city under autonomous governance.':
    '太守月度工作要求城市归本势力所有并实行自治。',
  'City work is available during campaign planning.': '只能在战略筹划阶段安排内政。',
  'A living officer must be stationed in the capital to organize this work.':
    '需要一名驻守本城的在世武将组织此项工作。',
  'The city cannot afford or benefit from loyalty recovery.': '城市金钱不足，或民心已无需恢复。',
  'This improvement is already at its current limit.': '此项发展已达到当前上限。',
  'The capital needs 80 unreserved gold for this work.': '此项工作需要 80 未预留的金钱。',
  'The city cannot afford this recruitment.': '城中金钱不足，无法招募此兵种。',
  'There are not enough soldiers of this troop type in the city reserve.':
    '待命兵池中该兵种人数不足。',
  'Choose infantry, archers or cavalry to recruit.': '请选择招募步兵、弓兵或骑兵。',
  'The city has no recruitable population beyond its protected 1,000 residents.':
    '城市须保留 1,000 居民，目前没有可征募人口。',
  'The city reserve is at capacity.': '城市预备兵已达到容量上限。',
  'The capital cannot complete recruitment with its current reserves.':
    '当前预备兵状态无法完成征募。',
  'Choose a living officer stationed in the capital.': '请选择一名驻守本城的在世武将。',
  'An officer can command 0–10,000 soldiers.': '单名武将可统领 0–10,000 名士兵。',
  'There are not enough soldiers in the city reserve.': '城市预备兵不足。',
  'The city garrison does not contain those soldiers.': '城市驻军中没有足够的所部士兵。',
  'Choose a living officer with troops stationed in the capital to train.':
    '请选择一名驻守本城且拥有部队的在世武将训练。',
  'This officer has reached the current training limit.': '该武将已达到当前训练上限。',
  'The capital cannot complete this security action.': '本城当前无法完成治安行动。',
  'This officer is already completely loyal.': '该武将的忠诚已满。',
  'This officer already has fine arms.': '该武将已配备精良兵器。',
  'This officer has reached the fine-arms force limit.': '该武将已达到精良兵器的武力上限。',
  'The city population is already at capacity.': '城市人口已达到容量上限。',
  'The capital needs 80 gold to buy food.': '购买粮食需要 80 金。',
  'The granary has no room for another 800 food.': '粮仓没有容纳额外 800 粮的空间。',
  'The capital cannot complete this market purchase.': '本城当前无法完成这笔粮食购买。',
  'The capital needs 800 food before it can sell this amount.': '出售此数量需要至少 800 粮。',
  'The treasury has no room for the sale proceeds.': '金库没有容纳售粮所得的空间。',
  'Merchants delivered 800 food for 80 gold.': '商人以 80 金运来了 800 粮。',
  'Merchants bought 800 food for 80 gold.': '商人以 80 金购走了 800 粮。',
  'The capital needs 200 gold to buy food.': '购买粮食需要 200 金。',
  'The granary has no room for another 2000 food.': '粮仓没有容纳额外 2000 粮的空间。',
  'The capital cannot complete this market trade.': '本城当前无法完成这笔粮食买卖。',
  'The capital needs 2000 food before it can sell this amount.': '出售此数量需要至少 2000 粮。',
  'Merchants delivered 2000 food for 200 gold.': '商人以 200 金运来了 2000 粮。',
  'Merchants bought 2000 food for 200 gold.': '商人以 200 金购走了 2000 粮。',
  'Restore loyalty has been retired: security is free and restores more.':
    '恢复民心已取消：治安不花钱，且恢复更多。',
  'This action would spend gold reserved for an approved order.':
    '该行动会动用已批准命令预留的金钱。',
  'This action would spend food reserved for an approved order.':
    '该行动会动用已批准命令预留的粮食。',
  'These soldiers are reserved for an approved order.': '这些士兵已为获批命令预留。',
  'This city is not under your faction’s authority.': '该城市不受你的势力管辖。',
  'A governor or local steward handles this city’s internal administration.':
    '该城市的内政由太守或地方班底自治管理。',
  'Governor appointments can only be issued during campaign planning.':
    '只能在战略筹划阶段下达太守任免。',
  'You can appoint a governor only to one of your own cities.': '只能为己方城市任命太守。',
  'The ruler’s capital remains directly governed.': '君主本城保持直辖。',
  'Choose a living officer who serves your faction.': '请选择一名效力于己方势力的在世武将。',
  'The officer must be available in a friendly city before taking office.':
    '武将必须先驻于友方城市，才可接受任命。',
  'An officer commanding troops cannot take office until relieved.':
    '武将须先将所部归还预备兵，才能接受调任。',
  'A route service is required to transfer an officer between cities.':
    '跨城调任需要可用的行程路线。',
  'No usable route connects the officer’s current city to the appointment city.':
    '武将所在城市与任职城市间没有可用路线。',
  'The officer’s travel plan could not be created; no appointment was changed.':
    '无法创建调任行程，任免状态未改变。',
  'Acknowledge the current report before completing the battle day.':
    '请先确认当前待办报告，再结束战斗日。',
  'Complete the day in every active player battle before advancing the world.':
    '请先提交每一场己方战斗的本日指令，再推进战役。',
  'Advance one day at a time while a player battle is active.':
    '己方战斗进行期间，每次只能推进一日。',
  'This battle day is already complete.': '本场战斗日已经提交。',
  'This campaign has ended.': '本次战役已经结束。',
  'Choose a valid target for this tactic.': '请选择此计策的合法目标。',
  'Choose a living enemy unit.': '请选择一支存活的敌方部队。',
  'Routed units can only move or hold.': '溃败部队只能移动或待命。',
  'This save uses an unsupported newer version. Open it with a compatible game version; existing data was left unchanged.':
    '该存档采用本程序不支持的更新版本。请用兼容版本打开；现有数据未更改。',
};

/** Current engine formation names retain their troop label and comma-separated leaders. */
export function localizeV03PersonOrFormationName(
  name: string,
  locale: V03Locale,
  state?: Readonly<V03GameState>,
): string {
  if (locale === 'en') return name;
  const officerName = (value: string) =>
    state?.officers.find((officer) => officer.name === value || officer.chinese === value)
      ?.chinese ?? value;
  const formationType = (value: string) => {
    const key = value.toLowerCase();
    if (key === 'militia') return '民兵';
    if (key === 'archers') return troopName('archer', 'zh');
    return troopName(key, 'zh') === key ? value : troopName(key, 'zh');
  };
  const separator = name.indexOf(' · ');
  if (separator !== -1) {
    const formation = formationType(name.slice(0, separator));
    const leaders = name
      .slice(separator + 3)
      .split(', ')
      .map(officerName)
      .join('、');
    return `${formation} · ${leaders}`;
  }
  return officerName(formationType(name));
}

/** Bounded adapter for current domain messages. Null lets the caller use its established fallback. */
export function localizeRoutineFeedback(
  message: string,
  locale: V03Locale,
  state?: Readonly<V03GameState>,
): string | null {
  if (locale === 'en') return message;
  if (ROUTINE_ZH[message]) return ROUTINE_ZH[message]!;
  const name = (value: string) => localizeV03PersonOrFormationName(value, locale, state);
  const groupCost = message.match(
    /^The city needs (\d+) unreserved gold for the selected officers\.$/,
  );
  if (groupCost) return `赏赐或配发兵器给所选武将需要 ${groupCost[1]} 金可用资金。`;
  const groupFeast = message.match(
    /^(\d+) selected officers attended the feast and gained up to 8 loyalty each\.$/,
  );
  if (groupFeast) return `${groupFeast[1]} 名所选武将参加宴饮，忠诚各提高最多 8。`;
  const groupReward = message.match(
    /^(\d+) selected officers received rewards and gained up to 15 loyalty each\.$/,
  );
  if (groupReward) return `${groupReward[1]} 名所选武将接受赏赐，忠诚各提高最多 15。`;
  const groupEquipment = message.match(
    /^(\d+) selected officers received fine arms and gained up to 5 force each\.$/,
  );
  if (groupEquipment) return `${groupEquipment[1]} 名所选武将获赐精良兵器，武力各提高最多 5。`;
  let match = message.match(
    /^The capital has used its (\d+) work points for this ten-day period\.$/,
  );
  if (match) return `本城本旬的 ${match[1]} 个工作点已用完。`;
  match = message.match(/^The capital has no work points left; (\d+) more arrive in (\d+) days\.$/);
  if (match) return `本城工作点已用完，${match[2]} 日后增加 ${match[1]} 点。`;
  match = message.match(/^The capital has used its (\d+) monthly work points?\.$/);
  if (match) return `本城本月的 ${match[1]} 个工作点已用完。`;
  match = message.match(/^(.+) improved city loyalty by 2 for 80 gold\.$/);
  if (match) return `${name(match[1]!)}花费 80 金，使民心提高 2。`;
  match = message.match(/^(Farming|Commerce) improved by (\d+) for 80 gold\.$/);
  if (match) return `${match[1] === 'Farming' ? '农业' : '商业'}花费 80 金提高了 ${match[2]}。`;
  match = message.match(/^(.+) found (.+), who joined your faction\.$/);
  if (match) return `${name(match[1]!)}寻得${name(match[2]!)}，其已加入己方势力。`;
  match = message.match(/^(.+) searched the countryside, but no officer joined this month\.$/);
  if (match) return `${name(match[1]!)}搜访乡野，本月没有武将加入。`;
  match = message.match(/^(.+) recruited (\d+) soldiers into the reserve\.$/);
  if (match) return `${name(match[1]!)}征募了 ${match[2]} 名士兵，已编入预备兵。`;
  match = message.match(/^(.+) now commands ([\d,]+) soldiers\.$/);
  if (match) return `${name(match[1]!)}现统领 ${match[2]} 名士兵。`;
  match = message.match(/^(.+) completed training: \+25 experience and \+1 force\.$/);
  if (match) return `${name(match[1]!)}完成训练：经验 +25，武力 +1。`;
  match = message.match(
    /^(.+) completed training: \+(\d+) experience, \+(\d+) force and \+(\d+) intellect\.$/,
  );
  if (match)
    return `${name(match[1]!)}完成训练：经验 +${match[2]}，武力 +${match[3]}，智力 +${match[4]}。`;
  match = message.match(/^(.+) restored public order; city loyalty is now (\d+)%\.$/);
  if (match) return `${name(match[1]!)}整顿治安，民心现为 ${match[2]}%。`;
  match = message.match(/^(.+) hosted a feast; local officers gained up to 8 loyalty\.$/);
  if (match) return `${name(match[1]!)}举办宴饮，驻城武将忠诚提高最多 8。`;
  match = message.match(/^(.+) received a reward and gained up to 15 loyalty\.$/);
  if (match) return `${name(match[1]!)}接受赏赐，忠诚提高最多 15。`;
  match = message.match(/^(.+) distributed grain: up to 15 city loyalty and (\d+) population\.$/);
  if (match) return `${name(match[1]!)}开仓赈济，民心提高最多 15，人口增加 ${match[2]}。`;
  match = message.match(/^(.+) received fine arms and gained up to 5 force\.$/);
  if (match) return `${name(match[1]!)}获配精良兵器，武力提高最多 5。`;
  match = message.match(
    /^The city needs (\d+) (gold|food) to (reward an officer|relieve the people|issue fine arms)\.$/,
  );
  if (match)
    return `${match[3] === 'reward an officer' ? '赏赐武将' : match[3] === 'relieve the people' ? '赈济百姓' : '配发精良兵器'}需要 ${match[1]} ${match[2] === 'gold' ? '金' : '粮'}。`;
  match = message.match(
    /^(.+) (has already acted today|has already moved today|is confused and cannot act today|is confused and will lose the rest of today|is confused and will lose its next action|is outside the normal attack range|is outside this tactic's range)\.$/,
  );
  if (match) {
    const reasons: Record<string, string> = {
      'has already acted today': '今日已经行动',
      'has already moved today': '今日已经移动',
      'is confused and cannot act today': '陷入混乱，今日无法行动',
      'is confused and will lose its next action': '陷入混乱，将失去下一次行动',
      'is confused and will lose the rest of today': '陷入混乱，今日无法继续行动',
      'is outside the normal attack range': '不在普通攻击射程内',
      "is outside this tactic's range": '不在此计策的射程内',
    };
    return `${name(match[1]!)}${reasons[match[2]!]!}。`;
  }
  return null;
}

/** Translate the existing tactical log vocabulary, including all six tactics and water suffixes. */
export function localizeRoutineBattleLog(
  line: string,
  state: Readonly<V03GameState>,
  locale: V03Locale,
): string | null {
  if (locale === 'en') return line;
  const person = (value: string) => localizeV03PersonOrFormationName(value, locale, state);
  const side = (value: string) =>
    value === 'attacker' ? '攻方' : value === 'defender' ? '守方' : value;
  const water = line.match(/ \(water ([\d.]+)× attack × ([\d.]+)× damage received\)\.$/);
  const core = water ? `${line.slice(0, water.index)}.` : line;
  const finish = (text: string) =>
    `${text}${water ? `（水上修正：攻击 ×${water[1]}，承伤 ×${water[2]}）` : ''}。`;
  let match = core.match(/^Battle (.+) begins on a (hanzhong|shouchun|xiapi|chengdu) field\.$/);
  if (match) {
    const regions: Record<string, string> = {
      hanzhong: '汉中',
      shouchun: '寿春',
      xiapi: '下邳',
      chengdu: '成都',
    };
    return finish(`战斗（${match[1]}）在${regions[match[2]!]!}战场开始`);
  }
  match = core.match(/^Battle (.+) begins at the (.+)\.$/);
  const battlefield =
    match && Object.values(BATTLEFIELD_NAMES).find((name) => name.en === match![2]);
  if (match && battlefield) return finish(`战斗（${match[1]}）在${battlefield.zh}开始`);
  match = core.match(/^(.+)'s fire tactic strikes (.+): (\d+) casualties\.$/);
  if (match) return finish(`${person(match[1]!)}对${person(match[2]!)}施展火计：伤亡 ${match[3]}`);
  match = core.match(/^(.+) ambushes (.+): (\d+) casualties\.$/);
  if (match) return finish(`${person(match[1]!)}伏击${person(match[2]!)}：伤亡 ${match[3]}`);
  match = core.match(/^(.+) drops rocks on (.+): (\d+) casualties; morale −(\d+)\.$/);
  if (match)
    return finish(
      `${person(match[1]!)}对${person(match[2]!)}施展落石：伤亡 ${match[3]}，士气 −${match[4]}`,
    );
  match = core.match(/^(.+) confuses (.+); the unit will lose its next turn \((\d+)% chance\)\.$/);
  if (match)
    return finish(
      `${person(match[1]!)}使${person(match[2]!)}陷入混乱，下回合无法行动（成功率 ${match[3]}%）`,
    );
  match = core.match(/^(.+) resists (.+)'s confusion tactic \((\d+)% chance\)\.$/);
  if (match)
    return finish(
      `${person(match[1]!)}抵抗了${person(match[2]!)}的混乱计策（成功率 ${match[3]}%）`,
    );
  match = core.match(
    /^(.+) rallies (.+): morale \+(\d+); next (?:attack|normal attack, counterattack or Ambush hit) \+20%(; confusion cleared)?\.$/,
  );
  if (match)
    return finish(
      `${person(match[1]!)}鼓舞${person(match[2]!)}：士气 +${match[3]}，下次普攻、反击或伏兵命中伤害 +20%${match[4] ? '，混乱已解除' : ''}`,
    );
  match = core.match(/^(.+) raids (.+)'s supplies: (\d+) food seized\.$/);
  if (match)
    return finish(`${person(match[1]!)}劫掠${person(match[2]!)}的粮草：夺取 ${match[3]} 粮`);
  match = core.match(
    /^(attacker|defender) army breaks and retreats; (attacker|defender) holds the battlefield\.$/,
  );
  if (match) return finish(`${side(match[1]!)}溃败撤离，${side(match[2]!)}控制战场`);
  match = core.match(/^(.+) loses its turn to confusion\.$/);
  if (match) return finish(`${person(match[1]!)}因混乱失去本回合行动`);
  return null;
}
