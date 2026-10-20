import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Coins,
  Crown,
  Flag,
  Flame,
  Handshake,
  Landmark,
  Map,
  ScrollText,
  Search,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Tent,
  TrendingUp,
  Truck,
  Users,
  Volume2,
  Wheat,
  X,
  Save,
  Upload,
  RotateCcw,
  Heart,
  Package,
  Eye,
  Wine,
  UserPlus,
  Minus,
  Axe,
  Repeat2,
  Hourglass,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { session } from '../app/session';
import {
  DEFAULT_SCENARIO_ID,
  battlefieldProfile,
  SCENARIOS,
  TROOP_LABELS,
  factionOf,
  factionsOf,
  scenarioOf,
} from '../content/scenario';
import {
  getActionInfo,
  getActionPreview,
  getAllianceChance,
  getPersuadeChance,
  type PreviewStat,
} from '../game/campaign';
import { getReachableTiles, getTacticRange } from '../game/battle';
import { isActiveOfficer } from '../game/officers';
import { fogRange, isScouted } from '../game/fog';
import type {
  Action,
  AttackIntent,
  BattleSkill,
  City,
  Difficulty,
  GameCommand,
  SupplyDays,
} from '../game/types';
import { decodeSave, downloadSave, listSlots, saveSlot, type SaveRecord } from '../platform/saves';
import { cueForBattleLog, playCue } from '../platform/audio';
import { DIFFICULTIES, DIFFICULTY_PRESETS, defaultTruceMonths } from '../game/difficulty';
import { autosave } from '../platform/autosave';
import { useI18n } from '../i18n';
import LanguageSwitch from '../i18n/LanguageSwitch';
import {
  DISPLAY_PRESETS,
  readDisplayPreset,
  writeDisplayPreset,
  type DisplayPreset,
} from './display';
import Portrait from './Portrait';
import TroopIcon from './TroopIcon';
import MonthlyReport from './MonthlyReport';
import AdvisorPanel from './AdvisorPanel';
import BattleSummary, { playerWon } from './BattleSummary';
import MarchDialog from './MarchDialog';
import OfficerMark from './OfficerMark';
import { FactionsContext } from './FactionsContext';
import PrisonerPanel from './PrisonerPanel';
import TraitChips from './TraitChips';
import TroopLegend from './TroopLegend';
import {
  appendedLines,
  BATTLEFIELD_LABELS,
  contactMade,
  nextReadyUnit,
} from './battlePresentation';
import type { RivalAggression, TroopType } from '../game/types';

const number = (n: number) => new Intl.NumberFormat('en').format(n);
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const ACTIONS: Record<Action, LucideIcon> = {
  farm: Wheat,
  commerce: TrendingUp,
  govern: Landmark,
  search: Search,
  recruit: UserPlus,
  train: Swords,
  reward: Coins,
  feast: Wine,
  buyFood: ArrowDownToLine,
  sellFood: ArrowUpRight,
  relieve: Heart,
  scout: Eye,
  persuade: Handshake,
  subvert: Flame,
  alliance: Flag,
  equip: Shield,
  confiscate: Package,
  banish: Minus,
  appoint: Crown,
  plunder: Axe,
  reorganize: Repeat2,
};
const GROUPS: { name: string; actions: Action[]; warning?: boolean }[] = [
  { name: 'Develop', actions: ['farm', 'commerce', 'govern', 'relieve', 'buyFood', 'sellFood'] },
  {
    name: 'Officers',
    actions: [
      'search',
      'recruit',
      'train',
      'reward',
      'feast',
      'equip',
      'confiscate',
      'appoint',
      'reorganize',
      'banish',
    ],
  },
  { name: 'Diplomacy', actions: ['scout', 'persuade', 'subvert', 'alliance'] },
  { name: 'Harsh measures', actions: ['plunder'], warning: true },
];
const STAT_LABELS: Record<PreviewStat, string> = {
  farming: 'Agriculture',
  commerce: 'Commerce',
  support: 'Public loyalty',
  defense: 'Fortifications',
  population: 'Population',
  reserve: 'Reserves',
  gold: 'Gold',
  food: 'Food',
  loyalty: 'Loyalty',
  experience: 'Experience',
  force: 'Might',
  stamina: 'Stamina',
  troops: 'Troops',
};
const signed = (n: number) => (n > 0 ? `+${number(n)}` : number(n));

/** What an order will do, from the pure preview query: ranges, or exact before → after. */
function ActionPreviewBox({
  action,
  preview,
  city,
  label,
}: {
  action: Action;
  preview: NonNullable<ReturnType<typeof getActionPreview>>;
  city: City;
  label: string;
}) {
  const { t, tx } = useI18n();
  const current: Partial<Record<PreviewStat, number>> = {
    farming: city.farming,
    commerce: city.commerce,
    support: city.loyalty,
    defense: city.defense,
    population: city.population,
    reserve: city.reserve,
    gold: city.gold,
    food: city.food,
  };
  return (
    <div className={`action-preview ${action === 'plunder' ? 'warning' : ''}`} aria-live="polite">
      <span className="eyebrow">{t('EXPECTED RESULT · {order}', { order: tx(label) })}</span>
      <ul>
        {preview.effects.map((effect) => {
          const before = effect.scope === 'city' ? current[effect.stat] : undefined;
          const exact = effect.min === effect.max;
          return (
            <li key={`${effect.stat}-${effect.scope}`}>
              <strong>{t(STAT_LABELS[effect.stat])}</strong>{' '}
              {effect.scope === 'officers'
                ? `(${t('all officers here')}) `
                : effect.scope === 'target'
                  ? `(${t('target city')}) `
                  : effect.scope === 'officer'
                    ? `(${t('this officer')}) `
                    : ''}
              {exact && before !== undefined
                ? `${number(before)} → ${number(before + effect.min)} (${signed(effect.min)})`
                : exact
                  ? signed(effect.min)
                  : `${signed(effect.min)} … ${signed(effect.max)}`}
            </li>
          );
        })}
        {preview.chance !== null && (
          <li>
            <strong>{t('Success chance')}</strong> {preview.chance}%
          </li>
        )}
        {!preview.effects.length && preview.chance === null && (
          <li>{t('No direct change to the numbers.')}</li>
        )}
      </ul>
    </div>
  );
}
type ModalKind =
  | 'start'
  | 'help'
  | 'settings'
  | 'saves'
  | 'march'
  | 'transfer'
  | 'muster'
  | 'credits'
  | 'summary'
  | null;
/** A fresh 32-bit world seed; random values live in the UI, never in the simulation core. */
function randomSeed(): string {
  try {
    return String(crypto.getRandomValues(new Uint32Array(1))[0] ?? 190);
  } catch {
    return String(Date.now() >>> 0);
  }
}
const AGGRESSION_OPTIONS: RivalAggression[] = ['cautious', 'balanced', 'aggressive'];
const TRUCE_MONTHS = 2;
/** A saved slot's scenario, read from its envelope (slot summaries predate scenarios). */
const slotScenario = (record: SaveRecord) => ({
  scenarioId: /"scenario":"([\w-]+)"/.exec(record.payload)?.[1] ?? DEFAULT_SCENARIO_ID,
});
// The map (Pixi) and the battle panel load on demand, keeping them out of the first chunk.
const GameMap = lazy(() => import('../rendering/GameMap'));
const BattlePanel = lazy(() => import('./BattlePanel'));
const AGGRESSION_LABELS = { cautious: 'Cautious', balanced: 'Balanced', aggressive: 'Aggressive' };
function readPreference(key: string, fallback: boolean): boolean {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) as boolean;
  } catch {
    return fallback;
  }
}

function Dialog({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
  canClose = true,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  canClose?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = () => {
    if (canClose) onClose();
  };
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first = root?.querySelector<HTMLElement>('button,input,select,[tabindex="0"]');
    first?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === 'Tab' && root) {
        const list = [
          ...root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
          ),
        ].filter((el) => el.offsetParent !== null);
        const start = list[0],
          end = list[list.length - 1];
        if (event.shiftKey && document.activeElement === start) {
          event.preventDefault();
          end?.focus();
        } else if (!event.shiftKey && document.activeElement === end) {
          event.preventDefault();
          start?.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (canClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`dialog ${wide ? 'dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <LanguageSwitch />
          {canClose && (
            <button className="icon-button" onClick={onClose} aria-label={t('Close dialog')}>
              <X size={20} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <Icon size={17} />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}
function Meter({
  label,
  value,
  max = 100,
  color,
  fog = false,
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
  /** Under fog of war the value is rounded and shown as an estimate. */
  fog?: boolean;
}) {
  const step = max > 100 ? 50 : 10;
  const shown = fog ? Math.min(max, Math.round(value / step) * step) : value;
  return (
    <div className="meter">
      <div>
        <span>{label}</span>
        <strong>
          {fog ? '≈ ' : ''}
          {number(shown)}
          <small> / {number(max)}</small>
        </strong>
      </div>
      <div className="meter-track">
        <i style={{ width: `${Math.min(100, (shown / max) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

export default function App() {
  const { locale, t, tx } = useI18n();
  const compact = (n: number) =>
    n >= 10000
      ? locale === 'zh'
        ? `${(n / 10000).toFixed(1)}万`
        : `${(n / 1000).toFixed(1)}k`
      : number(n);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [selectedCityId, setSelectedCityId] = useState('chenliu');
  const [selectedOfficerId, setSelectedOfficerId] = useState('caocao');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [section, setSection] = useState<'realm' | 'officers' | 'chronicle'>('realm');
  const [group, setGroup] = useState(0);
  const [modal, setModal] = useState<ModalKind>('start');
  const [started, setStarted] = useState(false),
    [ready, setReady] = useState(false);
  const [ruler, setRuler] = useState('cao'),
    [seed, setSeed] = useState(randomSeed);
  const [newAggression, setNewAggression] = useState<RivalAggression>('balanced');
  // The opening truce defaults on for Cautious rivals and stays where the player puts it.
  const [truce, setTruce] = useState(false),
    [truceTouched, setTruceTouched] = useState(false);
  const [displayPreset, setDisplayPreset] = useState<DisplayPreset>(readDisplayPreset);
  const [showThreat, setShowThreat] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reorganizeType, setReorganizeType] = useState<TroopType | ''>('');
  const [newScenario, setNewScenario] = useState(DEFAULT_SCENARIO_ID),
    [newDifficulty, setNewDifficulty] = useState<Difficulty>('standard'),
    [newAging, setNewAging] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [previewAction, setPreviewAction] = useState<Action | null>(null);
  const [marchIntent, setMarchIntent] = useState<AttackIntent>('conquer'),
    [marchSupply, setMarchSupply] = useState<SupplyDays>(20);
  const [cameraFocus, setCameraFocus] = useState<{
    kind: 'city' | 'unit';
    id: string;
    serial: number;
  } | null>(null);
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);
  const saveStatus = useSyncExternalStore(autosave.subscribe, autosave.getSnapshot);
  const saving = {
    idle: 'Ready',
    saving: 'Saving…',
    saved: 'All progress saved',
    error: 'Save unavailable',
  }[saveStatus.status];
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<SaveRecord[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const slotRequest = useRef(0);
  const [sound, setSound] = useState(() => readPreference('baye.sound', false));
  const [reducedMotion, setReducedMotion] = useState(() =>
    readPreference('baye.motion', window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  const [targetId, setTargetId] = useState('');
  const [cityList, setCityList] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const [officerFilter, setOfficerFilter] = useState('');
  const [marchTarget, setMarchTarget] = useState(''),
    [marchOfficers, setMarchOfficers] = useState<string[]>([]);
  const [transferTarget, setTransferTarget] = useState(''),
    [transferGold, setTransferGold] = useState(0),
    [transferFood, setTransferFood] = useState(0),
    [transferTroops, setTransferTroops] = useState(0);
  const [muster, setMuster] = useState(0),
    [skill, setSkill] = useState<BattleSkill | null>(null);
  const [battleDestination, setBattleDestination] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const player = factionOf(state, state.playerFactionId)!;
  const owned = state.cities.filter((c) => c.factionId === state.playerFactionId);
  const city = state.cities.find((c) => c.id === selectedCityId) ?? owned[0] ?? state.cities[0]!;
  const friendly = city.factionId === state.playerFactionId;
  const cityOfficers = state.officers.filter(
    (o) =>
      o.cityId === city.id && o.factionId === city.factionId && !o.captive && isActiveOfficer(o),
  );
  const available = cityOfficers.filter((o) => !o.busy);
  const officer =
    cityOfficers.find((o) => o.id === selectedOfficerId) ?? available[0] ?? cityOfficers[0];
  const army = state.officers
    .filter((o) => o.factionId === state.playerFactionId && !o.captive)
    .reduce((sum, o) => sum + o.troops, 0);
  const battle = state.battle;
  const unit =
    battle?.units.find(
      (u) => u.id === selectedUnitId && u.side === battle.playerSide && u.troops > 0,
    ) ??
    battle?.units.find(
      (u) => u.side === battle.playerSide && u.troops > 0 && !u.acted && u.status !== 'confused',
    ) ??
    battle?.units.find((u) => u.side === battle.playerSide && u.troops > 0);
  const canBattleAct = !!unit && !unit.acted && unit.status !== 'confused' && !busy;
  const reachableTiles =
    battle && unit ? getReachableTiles(battle, unit.id).sort((a, b) => a.y - b.y || a.x - b.x) : [];
  const pickerFactions = (SCENARIOS.find((entry) => entry.id === newScenario) ?? SCENARIOS[0]!)
    .factions;
  const enemies = state.cities.filter((c) => c.factionId && c.factionId !== state.playerFactionId);
  // Fog of war: unscouted rival cities show ranges, never exact figures.
  const fogged = !friendly && !isScouted(state, city.id);
  const approx = (value: number, stat: string): string => {
    if (!fogged) return number(value);
    const [low, high] = fogRange(value, city.id, stat);
    return `${number(low)}–${number(high)}`;
  };
  const activeAlliances = state.alliances.filter(
    (a) => (a.a === player.id || a.b === player.id) && a.untilTurn > state.turn,
  );
  const isBattle = state.phase === 'battle' && battle !== null;
  const nextUnit = battle ? nextReadyUnit(battle, unit?.id ?? null) : null;
  const notify = (text: string, bad = false) => setToast({ text, bad });
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    let live = true;
    listSlots()
      .then((records) => {
        if (!live) return;
        setSlots(records);
        const auto = records.find((r) => r.id === 'auto');
        if (auto) {
          try {
            const loaded = decodeSave(auto.payload);
            session.load(loaded);
            setSelectedCityId(
              loaded.cities.find((c) => c.factionId === loaded.playerFactionId)?.id ?? 'chenliu',
            );
            setStarted(true);
            setModal(null);
          } catch (error) {
            notify((error as Error).message, true);
          }
        }
      })
      .catch((error) => {
        if (live) notify((error as Error).message, true);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (saveStatus.error) notify(saveStatus.error, true);
  }, [saveStatus.error]);
  useEffect(() => {
    try {
      localStorage.setItem('baye.sound', JSON.stringify(sound));
      localStorage.setItem('baye.motion', JSON.stringify(reducedMotion));
    } catch {
      /* preferences are optional */
    }
  }, [sound, reducedMotion]);
  useEffect(() => {
    writeDisplayPreset(displayPreset);
  }, [displayPreset]);
  useEffect(() => {
    setSelectedUnitId(null);
    setSkill(null);
  }, [battle?.id]);
  useEffect(() => {
    setSkill(null);
    setBattleDestination('');
  }, [battle?.id, battle?.day, unit?.id]);

  // The truce box follows the ruler, scenario, difficulty and aggression until the player toggles it.
  useEffect(() => {
    if (truceTouched) return;
    const rating = pickerFactions.find((f) => f.id === ruler)?.difficulty;
    setTruce(newAggression === 'cautious' || defaultTruceMonths(newDifficulty, rating) > 0);
  }, [newAggression, newDifficulty, ruler, pickerFactions, truceTouched]);
  function execute(command: GameCommand): boolean {
    const before = session.getSnapshot();
    const result = session.execute(command);
    if (!result.ok) {
      notify(result.error ?? 'This command is unavailable.', true);
      return false;
    }
    // A finished battle (or an unopposed raid) involving the player opens its recap.
    const recap = result.state.lastBattle;
    if (
      recap &&
      recap.orderId !== before.lastBattle?.orderId &&
      [recap.attackerId, recap.defenderId].includes(result.state.playerFactionId)
    )
      setModal('summary');
    if (command.type.startsWith('battle')) {
      // Choose a cue from what the command actually did: a hit, a counter, a tactic or the end.
      const fresh = appendedLines(before.battle?.log ?? [], result.state.battle?.log ?? []);
      const last = result.state.lastBattle;
      const finished = before.battle !== null && result.state.battle === null && last;
      const won = finished && last ? playerWon(last, result.state.playerFactionId) : null;
      playCue(cueForBattleLog(fresh, finished ? (won ? 'win' : 'loss') : null), sound);
    } else playCue(command.type === 'endMonth' ? 'turn' : 'click', sound);
    if (command.type === 'assignTroops')
      notify(`Troop assignment updated to ${number(command.amount)}.`);
    else if (command.type === 'action' || command.type === 'march' || command.type === 'transfer')
      notify(result.state.log.at(-1)?.text ?? 'Orders received.');
    return true;
  }
  function endTurn() {
    if (busy) return;
    setBusy(true);
    requestAnimationFrame(() =>
      setTimeout(() => {
        try {
          execute(isBattle ? { type: 'battleEndDay' } : { type: 'endMonth' });
        } finally {
          setBusy(false);
        }
      }, 20),
    );
  }
  function chooseCity(id: string) {
    setSelectedCityId(id);
    setTargetId('');
    setSection('realm');
    setCityList(false);
    setSelectedOfficerId('');
  }
  function startCampaign() {
    const parsed = Number(seed);
    session.start(ruler, Number.isFinite(parsed) ? parsed >>> 0 : 190, newAggression, {
      truceMonths: truce ? TRUCE_MONTHS : 0,
      scenarioId: newScenario,
      difficulty: newDifficulty,
      aging: newAging,
    });
    const next = session.getSnapshot();
    const leader = next.officers.find((o) => o.name === factionOf(next, ruler)?.leader);
    focusCity(
      leader?.cityId ?? next.cities.find((c) => c.factionId === ruler)?.id ?? next.cities[0]!.id,
    );
    setSelectedOfficerId(leader?.id ?? '');
    setStarted(true);
    setModal(null);
    setSection('realm');
    notify('Your banner rises. Select an officer and give your first orders.');
  }
  function openMarch() {
    setMarchTarget(
      city.neighbors.find((id) => state.cities.find((c) => c.id === id)?.factionId !== player.id) ??
        '',
    );
    setMarchOfficers(
      available
        .filter((o) => o.troops > 0 && o.stamina >= 15)
        .slice(0, 3)
        .map((o) => o.id),
    );
    setMarchIntent('conquer');
    setMarchSupply(20);
    setModal('march');
  }
  function openTransfer() {
    setTransferTarget(
      city.neighbors.find((id) => state.cities.find((c) => c.id === id)?.factionId === player.id) ??
        '',
    );
    setTransferGold(0);
    setTransferFood(0);
    setTransferTroops(0);
    setModal('transfer');
  }
  function performAction(action: Action) {
    if (!officer) return;
    if (['scout', 'persuade', 'subvert', 'alliance'].includes(action) && !targetId) {
      notify('Choose a diplomatic target first.', true);
      return;
    }
    if (action === 'reorganize') {
      if (!reorganizeType) {
        notify('Choose a troop type first.', true);
        return;
      }
      execute({
        type: 'action',
        action,
        cityId: city.id,
        officerId: officer.id,
        targetId: reorganizeType,
      });
      setReorganizeType('');
      return;
    }
    execute({
      type: 'action',
      action,
      cityId: city.id,
      officerId: officer.id,
      ...(targetId ? { targetId } : {}),
    });
  }
  function performBattleTarget(id: string) {
    if (!unit) return;
    const command: GameCommand = skill
      ? { type: 'battleSkill', unitId: unit.id, skill, targetId: id }
      : { type: 'battleAttack', unitId: unit.id, targetId: id };
    if (execute(command)) {
      setSkill(null);
      setBattleDestination('');
    }
  }
  function selectBattleUnit(id: string) {
    const clicked = battle?.units.find((u) => u.id === id && u.troops > 0);
    if (!clicked || !unit || !battle) return;
    if (clicked.side === battle.playerSide) {
      if (skill === 'rally') performBattleTarget(id);
      else {
        setSelectedUnitId(id);
        setSkill(null);
        setBattleDestination('');
      }
    } else if (skill === 'rally')
      notify(`Rally requires a friendly unit within ${getTacticRange(unit)} tiles.`, true);
    else performBattleTarget(id);
  }
  function moveBattleUnit(x: number, y: number) {
    if (skill) {
      notify('Choose a tactic target, or cancel the tactic before moving.', true);
      return;
    }
    if (unit && execute({ type: 'battleMove', unitId: unit.id, x, y })) setBattleDestination('');
  }
  function chooseBattleSkill(next: BattleSkill) {
    if (!unit || !canBattleAct) return;
    setSelectedUnitId(unit.id);
    setBattleDestination('');
    setSkill(skill === next ? null : next);
  }
  /** End days automatically (each one validated and autosaved) until the armies are in reach. */
  async function advanceToContact() {
    if (advancing || !battle || busy) return;
    setAdvancing(true);
    try {
      for (let day = 0; day < 10; day++) {
        const current = session.getSnapshot();
        if (!current.battle || current.battle.outcome || contactMade(current.battle)) break;
        if (!execute({ type: 'battleEndDay' })) break;
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      }
    } finally {
      setAdvancing(false);
    }
  }
  async function openSaves() {
    const request = ++slotRequest.current;
    setSlotsLoading(true);
    setSlots([]);
    setModal('saves');
    try {
      const records = await listSlots();
      if (request === slotRequest.current) setSlots(records);
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      if (request === slotRequest.current) setSlotsLoading(false);
    }
  }
  async function manualSave(id: string) {
    if (slotsLoading) return;
    const request = ++slotRequest.current;
    setSlotsLoading(true);
    try {
      await saveSlot(id, `${player.name} · ${MONTHS[state.month - 1]} ${state.year}`, state);
      const records = await listSlots();
      if (request === slotRequest.current) setSlots(records);
      notify('Campaign saved.');
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      if (request === slotRequest.current) setSlotsLoading(false);
    }
  }
  async function retrySave() {
    await autosave.retry();
    if (autosave.getSnapshot().status === 'saved') notify('Campaign saved.');
  }
  function restore(record: SaveRecord) {
    try {
      const loaded = decodeSave(record.payload);
      session.load(loaded);
      focusCity(
        loaded.cities.find((c) => c.factionId === loaded.playerFactionId)?.id ??
          loaded.cities[0]!.id,
      );
      setStarted(true);
      setModal(null);
      notify('Campaign restored.');
    } catch (error) {
      notify((error as Error).message, true);
    }
  }
  async function importFile(file: File | undefined) {
    // Initial restoration must settle before a user import can replace it.
    if (!file || !ready) return;
    try {
      if (file.size > 5_000_000) throw new Error('Save files must be smaller than 5 MB.');
      const loaded = decodeSave(await file.text());
      session.load(loaded);
      setStarted(true);
      focusCity(
        loaded.cities.find((c) => c.factionId === loaded.playerFactionId)?.id ??
          loaded.cities[0]!.id,
      );
      setModal(null);
      notify('Campaign imported.');
    } catch (error) {
      notify((error as Error).message, true);
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  const closeModal = () => {
    if (started) setModal(null);
  };
  function focusCity(id: string) {
    chooseCity(id);
    setCameraFocus((previous) => ({ kind: 'city', id, serial: (previous?.serial ?? 0) + 1 }));
  }
  function nextCommander() {
    if (!nextUnit) return;
    setSelectedUnitId(nextUnit.id);
    setSkill(null);
    setBattleDestination('');
    setCameraFocus((previous) => ({
      kind: 'unit',
      id: nextUnit.id,
      serial: (previous?.serial ?? 0) + 1,
    }));
  }

  return (
    <FactionsContext.Provider value={factionsOf(state)}>
      <div
        className={`game-shell ${reducedMotion ? 'reduced-motion' : ''} ${isBattle ? 'in-battle' : ''}`}
        data-display={displayPreset}
        style={
          {
            '--text-main': `${DISPLAY_PRESETS[displayPreset].mainText}px`,
            '--text-secondary': `${DISPLAY_PRESETS[displayPreset].secondaryText}px`,
            '--control-height': `${DISPLAY_PRESETS[displayPreset].controlHeight}px`,
            '--portrait-small': `${{ compact: 40, comfortable: 48, large: 56 }[displayPreset]}px`,
            '--portrait-large': `${{ compact: 96, comfortable: 128, large: 160 }[displayPreset]}px`,
          } as React.CSSProperties
        }
      >
        <header className="masthead">
          <a
            className="brand"
            href="#"
            aria-label={t('Hegemony of the Three Kingdoms')}
            onClick={(e) => {
              e.preventDefault();
              setSection('realm');
            }}
          >
            <span className="brand-seal">霸</span>
            <span className="brand-word">
              {t('HEGEMONY')}
              <small>{t('THREE KINGDOMS')}</small>
            </span>
          </a>
          <nav aria-label={t('Main navigation')}>
            <button
              className={section === 'realm' ? 'active' : ''}
              onClick={() => setSection('realm')}
            >
              <Map size={16} />
              {t('The realm')}
            </button>
            <button
              className={section === 'officers' ? 'active' : ''}
              onClick={() => setSection('officers')}
            >
              <Users size={16} />
              {t('Officers')}
            </button>
            <button
              className={section === 'chronicle' ? 'active' : ''}
              onClick={() => setSection('chronicle')}
            >
              <ScrollText size={16} />
              {t('Chronicle')}
              {state.log.length > 0 && <span className="nav-dot" />}
            </button>
          </nav>
          <div className="masthead-tools">
            <LanguageSwitch />
            <button className="icon-button" onClick={openSaves} aria-label={t('Save and load')}>
              <Save size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => setModal('help')}
              aria-label={t('How to play')}
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => setModal('settings')}
              aria-label={t('Settings')}
            >
              <Settings size={18} />
            </button>
            <span className="vertical-line" />
            <div className="ruler-chip">
              <span style={{ background: player.color }}>{player.chinese}</span>
              <div>
                {tx(player.name)}
                <small>{t('Your banner')}</small>
              </div>
            </div>
          </div>
        </header>

        <section className="campaign-bar" aria-label={t('Campaign summary')}>
          <div className="scenario-title">
            <span className="eyebrow">
              {t('CAMPAIGN 01')} <span className="tiny-line" />
            </span>
            <h1>{tx(scenarioOf(state).title)}</h1>
          </div>
          <div className="realm-stats">
            <Stat
              icon={Landmark}
              label={t('Cities')}
              value={
                <>
                  {owned.length}
                  <em> / {state.cities.length}</em>
                </>
              }
            />
            <Stat
              icon={Coins}
              label={t('Treasury')}
              value={compact(owned.reduce((s, c) => s + c.gold, 0))}
            />
            <Stat
              icon={Wheat}
              label={t('Provisions')}
              value={compact(owned.reduce((s, c) => s + c.food, 0))}
            />
            <Stat icon={Shield} label={t('Field troops')} value={compact(army)} />
          </div>
          <div className="date-box">
            <span>{tx(MONTHS[state.month - 1])}</span>
            <strong>
              {state.year}
              <small> {t('AD')}</small>
            </strong>
          </div>
        </section>

        <main className="workspace">
          <section
            className="map-pane"
            aria-label={tx(isBattle ? 'Tactical battlefield' : 'Campaign map')}
          >
            <div className="map-topline">
              <span className="map-kicker">
                <i />{' '}
                {isBattle
                  ? t('BATTLE OF {city}', {
                      city: state.cities.find((c) => c.id === battle.order.targetId)?.name ?? '',
                    })
                  : t('THE HAN REALM')}
              </span>
              <span>
                {isBattle
                  ? t('DAY {day} / {limit}', { day: battle.day, limit: battle.dayLimit })
                  : tx('山河万里 · A THOUSAND LEAGUES')}
              </span>
            </div>
            <Suspense fallback={<div className="map-loading" aria-busy="true" />}>
              <GameMap
                state={state}
                locale={locale}
                selectedCityId={city.id}
                onSelectCity={chooseCity}
                selectedUnitId={unit?.id ?? null}
                onSelectUnit={selectBattleUnit}
                onBattleTile={moveBattleUnit}
                reducedMotion={reducedMotion}
                displayPreset={displayPreset}
                cameraFocus={cameraFocus ?? undefined}
                showThreat={showThreat && isBattle}
              />
            </Suspense>
            {!isBattle && (
              <>
                <div className="map-legend">
                  {factionsOf(state).map((f) => (
                    <span key={f.id}>
                      <i style={{ background: f.color }} />
                      {tx(f.name)}
                    </span>
                  ))}
                  <span>
                    <i style={{ background: '#9b9587' }} />
                    {t('Unclaimed')}
                  </span>
                </div>
                <button
                  className="city-index-button"
                  onClick={() => setCityList(!cityList)}
                  aria-expanded={cityList}
                >
                  <Landmark size={15} />
                  {t('City index')} <ChevronDown size={14} />
                </button>
                {cityList && (
                  <div className="city-index">
                    <div className="search-field">
                      <Search size={15} />
                      <input
                        placeholder={t('Find a city…')}
                        value={cityFilter}
                        onChange={(e) => setCityFilter(e.target.value)}
                        aria-label={t('Find a city')}
                      />
                    </div>
                    {state.cities
                      .filter((c) =>
                        (c.name + c.chinese).toLowerCase().includes(cityFilter.toLowerCase()),
                      )
                      .map((c) => (
                        <button key={c.id} onClick={() => chooseCity(c.id)}>
                          <i
                            style={{ background: factionOf(state, c.factionId)?.color ?? '#999' }}
                          />
                          <span>
                            {tx(c.name)}
                            {locale === 'en' && <small>{c.chinese}</small>}
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
            {busy && (
              <div className="processing">
                <div className="spinner" />
                <strong>{t('The realm stirs…')}</strong>
                <span>{t('Resolving orders and rival ambitions')}</span>
              </div>
            )}
          </section>

          <aside className="inspector">
            {!isBattle && <MonthlyReport state={state} onFocusCity={focusCity} />}
            {!isBattle && section === 'realm' && started && (
              <AdvisorPanel state={state} onFocusCity={focusCity} execute={execute} />
            )}
            ﻿{' '}
            {isBattle && battle ? (
              <Suspense fallback={null}>
                <p className="battlefield-profile" data-testid="battlefield-profile">
                  {tx(BATTLEFIELD_LABELS[battlefieldProfile(battle.order.targetId)])}
                </p>
                <BattlePanel
                  battle={battle}
                  unit={unit}
                  canAct={canBattleAct}
                  skill={skill}
                  setSkill={setSkill}
                  reachableTiles={reachableTiles}
                  destination={battleDestination}
                  setDestination={setBattleDestination}
                  moveUnit={moveBattleUnit}
                  selectUnit={(id) => {
                    setSelectedUnitId(id);
                    setSkill(null);
                    setBattleDestination('');
                  }}
                  chooseSkill={chooseBattleSkill}
                  performTarget={performBattleTarget}
                  execute={execute}
                  nextCommander={nextCommander}
                  showThreat={showThreat}
                  setShowThreat={setShowThreat}
                  advanceToContact={advanceToContact}
                  advancing={advancing}
                />
              </Suspense>
            ) : section === 'officers' ? (
              <>
                <div className="inspector-title">
                  <span className="eyebrow">{t('THE PEOPLE BEHIND YOUR BANNER')}</span>
                  <h2>{t('Council of officers')}</h2>
                  <p>{t('Talent wins battles. Loyalty holds a realm.')}</p>
                </div>
                <div className="search-field roster-search">
                  <Search size={15} />
                  <input
                    placeholder={t('Search your officers…')}
                    value={officerFilter}
                    onChange={(e) => setOfficerFilter(e.target.value)}
                    aria-label={t('Search officers')}
                  />
                </div>
                <div className="roster">
                  {state.officers
                    .filter(
                      (o) =>
                        o.factionId === player.id &&
                        !o.captive &&
                        (o.name + o.chinese).toLowerCase().includes(officerFilter.toLowerCase()),
                    )
                    .sort((a, b) => b.force + b.intellect - a.force - a.intellect)
                    .map((o) => (
                      <button
                        className="roster-row"
                        key={o.id}
                        onClick={() => {
                          chooseCity(o.cityId);
                          setSelectedOfficerId(o.id);
                          setGroup(1);
                        }}
                      >
                        <OfficerMark officer={o} />
                        <span className="roster-info">
                          <strong>{tx(o.name)}</strong>
                          <small>
                            <TroopIcon type={o.troopType} />
                            {tx(TROOP_LABELS[o.troopType])} ·{' '}
                            {tx(state.cities.find((c) => c.id === o.cityId)?.name)} ·{' '}
                            {tx(o.busy ? 'On assignment' : 'Available')}
                          </small>
                          <span>
                            <Swords size={11} />
                            {o.force}
                            <BookOpen size={11} />
                            {o.intellect}
                            <Heart size={11} />
                            {o.loyalty}
                            {o.level > 0 && (
                              <>
                                <Star size={11} />
                                {o.level}
                              </>
                            )}
                          </span>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                </div>
                {(() => {
                  const captured = state.officers.filter(
                    (o) => o.factionId === player.id && o.captive && o.fate === 'active',
                  );
                  if (!captured.length) return null;
                  return (
                    <div className="roster roster-captives" data-testid="captured-officers">
                      <span className="eyebrow">{t('CAPTURED OFFICERS')}</span>
                      {captured.map((o) => {
                        const holding = state.cities.find((c) => c.id === o.cityId);
                        return (
                          <div className="roster-row" key={o.id}>
                            <OfficerMark officer={o} />
                            <span className="roster-info">
                              <strong>{tx(o.name)}</strong>
                              <small>
                                {t('Held by {faction} in {city}', {
                                  faction: tx(
                                    factionOf(state, holding?.factionId)?.name ?? 'The garrison',
                                  ),
                                  city: tx(holding?.name ?? o.cityId),
                                })}
                              </small>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            ) : section === 'chronicle' ? (
              <>
                <div className="inspector-title">
                  <span className="eyebrow">{t('A HISTORY IN THE MAKING')}</span>
                  <h2>{t('The chronicle')}</h2>
                  <p>{t('Every decision leaves its mark.')}</p>
                </div>
                <div className="chronicle">
                  {[...state.log].reverse().map((entry) => (
                    <article key={entry.id} className={entry.kind}>
                      <span className="log-icon">
                        {entry.kind === 'military' ? (
                          <Swords size={14} />
                        ) : entry.kind === 'economy' ? (
                          <Wheat size={14} />
                        ) : entry.kind === 'diplomacy' ? (
                          <Handshake size={14} />
                        ) : (
                          <ScrollText size={14} />
                        )}
                      </span>
                      <div>
                        <small>
                          {t('TURN')} {entry.turn + 1} · {tx(entry.kind.toUpperCase())}
                        </small>
                        <p>{tx(entry.text)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="city-heading">
                  <div>
                    <span className="eyebrow">{tx(city.region)}</span>
                    <h2>
                      {tx(city.name)}
                      {locale === 'en' && <span>{city.chinese}</span>}
                    </h2>
                  </div>
                  <span
                    className="ownership-badge"
                    style={
                      {
                        '--badge-color': factionOf(state, city.factionId)?.color ?? '#7b786b',
                      } as React.CSSProperties
                    }
                  >
                    <i />
                    {friendly
                      ? t('YOUR CITY')
                      : tx(factionOf(state, city.factionId)?.name ?? 'UNCLAIMED')}
                  </span>
                </div>
                <div className="city-resources">
                  <Stat
                    icon={Users}
                    label={t('Population')}
                    value={
                      fogged ? approx(city.population, 'population') : compact(city.population)
                    }
                  />
                  <Stat icon={Coins} label={t('Gold')} value={approx(city.gold, 'gold')} />
                  <Stat
                    icon={Wheat}
                    label={t('Food')}
                    value={fogged ? approx(city.food, 'food') : compact(city.food)}
                  />
                  <Stat
                    icon={Shield}
                    label={t('Reserves')}
                    value={approx(city.reserve, 'reserve')}
                  />
                </div>
                {fogged && (
                  <p className="inline-notice" role="note" data-testid="fog-notice">
                    {t(
                      'Fog of war: these figures are estimates. Scout this city from a neighboring city of yours to see exact numbers for two months.',
                    )}
                  </p>
                )}
                <div className="city-meters">
                  <Meter label={t('Agriculture')} value={city.farming} max={999} fog={fogged} />
                  <Meter
                    label={t('Commerce')}
                    value={city.commerce}
                    max={999}
                    color="#b28b50"
                    fog={fogged}
                  />
                  <div className="split-meters">
                    <Meter label={t('Public loyalty')} value={city.loyalty} fog={fogged} />
                    <Meter
                      label={t('Fortifications')}
                      value={city.defense}
                      color="#82909b"
                      fog={fogged}
                    />
                  </div>
                </div>
                <div className="section-heading">
                  <h3>{t('Officers in residence')}</h3>
                  <span>
                    {available.length} {t('available')}
                  </span>
                </div>
                <div className="officer-select-row">
                  {cityOfficers.length ? (
                    cityOfficers.map((o) => (
                      <button
                        key={o.id}
                        className={`officer-choice ${officer?.id === o.id ? 'selected' : ''} ${o.busy ? 'busy' : ''}`}
                        onClick={() => setSelectedOfficerId(o.id)}
                        title={t('{name} · {status}', {
                          name: o.name,
                          status: o.busy ? 'On assignment' : 'Available',
                        })}
                        aria-label={t('Select {name}', { name: o.name })}
                      >
                        <OfficerMark officer={o} size="small" />
                        {o.busy ? (
                          <span className="busy-dot" />
                        ) : officer?.id === o.id ? (
                          <span className="selected-check">
                            <Check size={9} />
                          </span>
                        ) : null}
                      </button>
                    ))
                  ) : (
                    <p className="subtle">{t('No sworn officers in this city.')}</p>
                  )}
                </div>
                {officer && (
                  <div className="officer-summary">
                    <Portrait officerId={officer.id} large />
                    <div>
                      <strong>{tx(officer.name)}</strong>
                      <span className="troop-description">
                        <TroopIcon type={officer.troopType} />
                        {tx(TROOP_LABELS[officer.troopType])} ·{' '}
                        {fogged ? approx(officer.troops, officer.id) : number(officer.troops)}{' '}
                        {t('troops')}
                      </span>
                      <TraitChips officerId={officer.id} />
                    </div>
                    <div className="officer-attributes">
                      <span title={t('Might')}>
                        <Swords size={13} />
                        {officer.force}
                      </span>
                      <span title={t('Intellect')}>
                        <BookOpen size={13} />
                        {officer.intellect}
                      </span>
                      <span title={t('Stamina')}>
                        <Heart size={13} />
                        {officer.stamina}
                      </span>
                      {officer.level > 0 && (
                        <span title={t('Veteran level')}>
                          <Star size={13} />
                          {officer.level}
                        </span>
                      )}
                    </div>
                    {officer.equipment && (
                      <small className="equipment-label">
                        <Shield size={12} />
                        {tx(officer.equipment)}
                      </small>
                    )}
                  </div>
                )}
                {friendly && state.phase === 'planning' ? (
                  <>
                    <div className="command-tabs" role="tablist" aria-label={t('Command category')}>
                      {GROUPS.map((g, index) => (
                        <button
                          role="tab"
                          aria-selected={group === index}
                          key={g.name}
                          className={`${group === index ? 'active' : ''} ${g.warning ? 'warning' : ''}`}
                          onClick={() => {
                            setGroup(index);
                            setTargetId('');
                          }}
                        >
                          {tx(g.name)}
                        </button>
                      ))}
                    </div>
                    {group === 1 && officer && (
                      <div className="diplomacy-target">
                        <label htmlFor="reorganize-type">{t('Reorganize as')}</label>
                        <select
                          id="reorganize-type"
                          value={reorganizeType}
                          onChange={(e) => setReorganizeType(e.target.value as TroopType | '')}
                        >
                          <option value="">{t('Choose a troop type')}</option>
                          {(Object.keys(TROOP_LABELS) as TroopType[])
                            .filter((type) => type !== officer.troopType)
                            .map((type) => (
                              <option key={type} value={type}>
                                {tx(TROOP_LABELS[type])}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    {group === 2 && (
                      <div className="diplomacy-target">
                        <label htmlFor="diplomatic-target">{t('Diplomatic target')}</label>
                        <select
                          id="diplomatic-target"
                          value={targetId}
                          onChange={(e) => setTargetId(e.target.value)}
                        >
                          <option value="">{t('Choose a city, ruler, or officer')}</option>
                          <optgroup label={t('Neighboring cities — scout or subvert')}>
                            {state.cities
                              .filter((c) => city.neighbors.includes(c.id))
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {tx(c.name)} ·{' '}
                                  {tx(factionOf(state, c.factionId)?.name ?? 'Unclaimed')}
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label={t('Rival rulers — alliance')}>
                            {factionsOf(state)
                              .filter(
                                (f) =>
                                  f.id !== player.id && enemies.some((c) => c.factionId === f.id),
                              )
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {tx(f.name)} ·{' '}
                                  {t('{count}% chance', {
                                    count: getAllianceChance(
                                      state,
                                      player.id,
                                      f.id,
                                      officer?.intellect ?? 0,
                                    ),
                                  })}
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label={t('Officers — persuade')}>
                            {state.officers
                              .filter(
                                (o) =>
                                  isActiveOfficer(o) &&
                                  (o.factionId !== player.id || o.captive) &&
                                  (officer
                                    ? getPersuadeChance(state, officer.id, o.id) !== null
                                    : true) &&
                                  (o.cityId === city.id ||
                                    (city.neighbors.includes(o.cityId) &&
                                      o.factionId &&
                                      !o.captive)),
                              )
                              .map((o) => (
                                <option value={o.id} key={o.id}>
                                  {tx(o.name)} ·{' '}
                                  {tx(state.cities.find((c) => c.id === o.cityId)?.name)}
                                  {officer
                                    ? ` · ${t('{count}% chance', {
                                        count: getPersuadeChance(state, officer.id, o.id) ?? 0,
                                      })}`
                                    : ''}
                                </option>
                              ))}
                          </optgroup>
                        </select>
                        {activeAlliances.map((alliance) => {
                          const other = alliance.a === player.id ? alliance.b : alliance.a;
                          return (
                            <div className="alliance-row" key={`${alliance.a}-${alliance.b}`}>
                              <Handshake size={14} />
                              <span>
                                {t('Allied with {faction} for {count} more months', {
                                  faction: factionOf(state, other)?.name ?? other,
                                  count: alliance.untilTurn - state.turn,
                                })}
                              </span>
                              <button
                                className="text-button danger"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      t(
                                        'Break the alliance with {faction}? Rulers remember: future treaties will be harder to win.',
                                        { faction: factionOf(state, other)?.name ?? other },
                                      ),
                                    )
                                  )
                                    execute({ type: 'breakAlliance', factionId: other });
                                }}
                              >
                                {t('Break alliance')}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {officer?.busy && (
                      <div className="inline-notice">
                        {t(
                          '{name} is on assignment. Choose another officer or advance the month.',
                          {
                            name: officer.name,
                          },
                        )}
                      </div>
                    )}
                    <div className="command-grid">
                      {GROUPS[group]!.actions.map((action) => {
                        const info = getActionInfo(state, action, city.id, officer?.id),
                          Icon = ACTIONS[action];
                        return (
                          <button
                            key={action}
                            disabled={!!info.reason}
                            className={GROUPS[group]!.warning ? 'warning' : ''}
                            onClick={() => performAction(action)}
                            onMouseEnter={() => setPreviewAction(action)}
                            onFocus={() => setPreviewAction(action)}
                            title={tx(info.reason ?? info.description)}
                          >
                            <Icon size={18} />
                            <span>
                              <strong>{tx(info.label)}</strong>
                              <small>
                                {info.gold > 0 ? (
                                  <>
                                    <Coins size={10} />
                                    {info.gold}
                                  </>
                                ) : (
                                  t('No gold cost')
                                )}
                                <span>
                                  {' '}
                                  · {info.stamina} {t('stamina')}
                                </span>
                              </small>
                            </span>
                            <ChevronRight size={13} />
                          </button>
                        );
                      })}
                    </div>
                    {officer &&
                      (() => {
                        const shown =
                          previewAction && GROUPS[group]!.actions.includes(previewAction)
                            ? previewAction
                            : GROUPS[group]!.actions[0]!;
                        const preview = getActionPreview(
                          state,
                          shown,
                          city.id,
                          officer.id,
                          targetId || undefined,
                        );
                        return preview ? (
                          <ActionPreviewBox
                            action={shown}
                            preview={preview}
                            city={city}
                            label={getActionInfo(state, shown, city.id, officer.id).label}
                          />
                        ) : null;
                      })()}
                    <PrisonerPanel state={state} city={city} execute={execute} />
                    <div className="military-orders">
                      <button
                        className="primary-outline"
                        onClick={openMarch}
                        disabled={!available.some((o) => o.troops > 0)}
                      >
                        <Swords size={16} />
                        {t('March an army')}
                        <ArrowUpRight size={15} />
                      </button>
                      <div>
                        <button
                          onClick={() => {
                            setMuster(officer?.troops ?? 0);
                            setModal('muster');
                          }}
                          disabled={!officer || officer.busy}
                        >
                          <Shield size={14} />
                          {t('Muster')}
                        </button>
                        <button onClick={openTransfer} disabled={!officer || officer.busy}>
                          <Truck size={14} />
                          {t('Transfer')}
                        </button>
                      </div>
                    </div>
                  </>
                ) : !friendly ? (
                  <div className="foreign-city">
                    <Flag size={22} />
                    <h3>
                      {tx(city.factionId ? 'Beyond your borders' : 'A city without a banner')}
                    </h3>
                    <p>
                      {tx(
                        city.factionId
                          ? 'Inspect this stronghold, then select an adjacent city of your own to prepare an army.'
                          : 'An opportunity to expand your realm. March an army from an adjacent city to claim it.',
                      )}
                    </p>
                    {state.cities
                      .filter((c) => c.factionId === player.id && c.neighbors.includes(city.id))
                      .map((c) => (
                        <button className="text-button" key={c.id} onClick={() => chooseCity(c.id)}>
                          {t('Prepare in {city}', { city: c.name })}
                          <ArrowRight size={14} />
                        </button>
                      ))}
                  </div>
                ) : null}
                {state.orders
                  .filter((o) => o.sourceId === city.id)
                  .map((o) => (
                    <div className="queued-order" key={o.id}>
                      <Tent size={16} />
                      <span>
                        {t('March to {city}', {
                          city: state.cities.find((c) => c.id === o.targetId)?.name ?? '',
                        })}
                        <small>{t('Departs when the month advances')}</small>
                      </span>
                    </div>
                  ))}
              </>
            )}
          </aside>
        </main>

        <footer className="campaign-footer">
          <div className="save-status">
            <span className={`status-dot ${saving === 'Save unavailable' ? 'error' : ''}`} />
            {tx(saving)}
            {saveStatus.status === 'error' && (
              <button className="retry-save" onClick={() => void retrySave()}>
                {t('Retry save')}
              </button>
            )}
            <span className="footer-separator">/</span>
            <span>
              {t('Turn')} {state.turn + 1}
            </span>
            {activeAlliances.length > 0 && (
              <span className="alliance-indicator">
                <Handshake size={13} />
                {t(activeAlliances.length > 1 ? '{count} alliances' : '{count} alliance', {
                  count: activeAlliances.length,
                })}
              </span>
            )}
          </div>
          <div className="footer-objective">
            <Flag size={14} />
            <span>{t('Unite the realm')}</span>
            <div>
              <i style={{ width: `${(owned.length / state.cities.length) * 100}%` }} />
            </div>
            <strong>
              {owned.length}/{state.cities.length}
            </strong>
          </div>
          <button
            className="end-turn"
            onClick={endTurn}
            disabled={busy || state.phase === 'finished' || !started}
          >
            <span>
              {tx(isBattle ? 'End battle day' : 'Advance month')}
              <small>
                {isBattle
                  ? t('Let the enemy respond')
                  : t('{month} {year}', {
                      month: MONTHS[state.month % 12]!,
                      year: state.month === 12 ? state.year + 1 : state.year,
                    })}
              </small>
            </span>
            <ArrowRight size={21} />
          </button>
        </footer>

        {toast && (
          <div
            className={`toast ${toast.bad ? 'error' : ''}`}
            role={toast.bad ? 'alert' : 'status'}
          >
            {toast.bad ? <CircleHelp size={18} /> : <Check size={18} />}
            <span>{tx(toast.text)}</span>
            <button onClick={() => setToast(null)} aria-label={t('Dismiss notification')}>
              <X size={15} />
            </button>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          disabled={!ready}
          hidden
          onChange={(e) => void importFile(e.target.files?.[0])}
        />

        {modal === 'start' && (
          <Dialog
            title={t('Choose your banner')}
            eyebrow={t('THE FALL OF THE HAN · 190 AD')}
            onClose={closeModal}
            canClose={started}
            wide
          >
            <div className="new-campaign">
              <div className="campaign-intro">
                <div className="intro-seal">
                  霸<br />业
                </div>
                <h3>
                  {t('An empire divided.')}
                  <br />
                  <em>{t('A mandate to claim.')}</em>
                </h3>
                <p>{tx(scenarioOf(state).description)}</p>
                <div className="intro-facts">
                  <span>
                    <Landmark size={15} />
                    {t('24 cities')}
                  </span>
                  <span>
                    <Flag size={15} />
                    {t('6 rival houses')}
                  </span>
                  <span>
                    <Users size={15} />
                    {t('{count} officers', {
                      count: (SCENARIOS.find((entry) => entry.id === newScenario) ?? SCENARIOS[0]!)
                        .officers.length,
                    })}
                  </span>
                </div>
                <p className="intro-footnote">
                  {t('Build your cities. Win their loyalty.')}
                  <br />
                  {t('Write the next chapter of the realm.')}
                </p>
                <button
                  className="text-button"
                  disabled={!ready}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={14} />
                  {t('Import a saved campaign')}
                </button>
              </div>
              <div className="ruler-selection">
                <div className="scenario-picker" role="radiogroup" aria-label={t('Scenario')}>
                  {SCENARIOS.map((entry) => (
                    <button
                      key={entry.id}
                      role="radio"
                      aria-checked={newScenario === entry.id}
                      className={newScenario === entry.id ? 'selected' : ''}
                      onClick={() => {
                        setNewScenario(entry.id);
                        if (!entry.factions.some((f) => f.id === ruler))
                          setRuler(entry.factions[0]!.id);
                      }}
                    >
                      <strong>{tx(entry.title)}</strong>
                      <small>
                        {entry.year} {t('AD')}
                      </small>
                    </button>
                  ))}
                </div>
                <p className="subtle">
                  {tx(SCENARIOS.find((entry) => entry.id === newScenario)?.description)}
                </p>
                <div className="faction-grid">
                  {pickerFactions.map((f) => (
                    <button
                      key={f.id}
                      className={`faction-card ${ruler === f.id ? 'selected' : ''}`}
                      onClick={() => setRuler(f.id)}
                      style={{ '--faction-color': f.color } as React.CSSProperties}
                    >
                      <div className="ruler-portrait">
                        <Portrait
                          officerId={
                            state.officers.find((officer) => officer.name === f.leader)?.id ??
                            'garrison'
                          }
                        />
                        <span className="faction-emblem">{f.chinese}</span>
                      </div>
                      <span>
                        <strong>{tx(f.name)}</strong>
                        <small>{tx(f.motto)}</small>
                        <em>
                          {t('Starting position')}: {tx(f.difficulty)}
                        </em>
                      </span>
                      {ruler === f.id && <Check size={16} />}
                    </button>
                  ))}
                </div>
                <div className="ruler-description">
                  <span className="eyebrow">{t('YOUR CAMPAIGN')}</span>
                  <p>{tx(pickerFactions.find((f) => f.id === ruler)?.description)}</p>
                </div>
                <div className="begin-campaign">
                  <button className="primary-button" onClick={startCampaign} disabled={!ready}>
                    {t('Raise your banner')}
                    <ArrowRight size={18} />
                  </button>
                </div>
                <details className="advanced-setup" open={advancedOpen}>
                  <summary
                    onClick={(event) => {
                      event.preventDefault();
                      setAdvancedOpen(!advancedOpen);
                    }}
                  >
                    {t('Advanced')}
                  </summary>
                  <label className="field-label">
                    {t('World seed')}
                    <input
                      aria-label={t('World seed')}
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </label>
                  <p className="subtle">
                    {t(
                      'A random seed is chosen for every new campaign. Enter one to replay a world.',
                    )}
                  </p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={newAging}
                      onChange={(event) => setNewAging(event.target.checked)}
                    />
                    <span>
                      <strong>{t('Natural aging')}</strong>
                      <small>
                        {t(
                          'Veteran officers past sixty may die of old age each January. Off by default.',
                        )}
                      </small>
                    </span>
                  </label>
                </details>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={truce}
                    onChange={(event) => {
                      setTruce(event.target.checked);
                      setTruceTouched(true);
                    }}
                  />
                  <span>
                    <strong>{t('Opening truce (2 months)')}</strong>
                    <small>
                      {t('Rival houses will not march against anyone for the first two months.')}
                    </small>
                  </span>
                </label>
                <label className="field-label">
                  {t('Difficulty')}
                  <select
                    aria-label={t('Difficulty')}
                    value={newDifficulty}
                    onChange={(event) => {
                      const next = event.target.value as Difficulty;
                      setNewDifficulty(next);
                      setNewAggression(DIFFICULTY_PRESETS[next].aggression);
                    }}
                  >
                    {DIFFICULTIES.map((value) => (
                      <option value={value} key={value}>
                        {t(DIFFICULTY_PRESETS[value].label)}
                      </option>
                    ))}
                  </select>
                  <small>{t(DIFFICULTY_PRESETS[newDifficulty].description)}</small>
                </label>
                <label className="field-label aggression-setup">
                  {t('Rival aggression')}
                  <select
                    aria-label={t('Rival aggression')}
                    value={newAggression}
                    onChange={(event) => setNewAggression(event.target.value as RivalAggression)}
                  >
                    {AGGRESSION_OPTIONS.map((value) => (
                      <option value={value} key={value}>
                        {t(AGGRESSION_LABELS[value])}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="subtle">
                  {t(
                    'Controls how readily rivals start wars against you and each other. It grants no combat or resource bonuses.',
                  )}
                </p>
                {started && (
                  <p className="subtle">
                    {t(
                      'Starting a new campaign replaces the autosave. Use a manual slot to keep your current campaign.',
                    )}
                  </p>
                )}
              </div>
            </div>
          </Dialog>
        )}

        {modal === 'help' && (
          <Dialog
            title={t('The art of ruling')}
            eyebrow={t('A FIELD GUIDE TO HEGEMONY')}
            onClose={() => setModal(null)}
            wide
          >
            <div className="help-grid">
              <article>
                <span>01</span>
                <h3>{t('Cultivate your cities')}</h3>
                <p>
                  {t(
                    'Select a city you own, then an available officer. Develop agriculture for harvests, commerce for income, and governance for defenses. Each officer receives one assignment per month. Rewards raise loyalty; feasts restore stamina.',
                  )}
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>{t('Prepare your army')}</h3>
                <p>
                  {t(
                    'Recruit reserves, then use Muster to assign them to officers. Choose March, select an adjacent target and your commanders. Food is committed when the order is issued. Your army departs when you advance the month.',
                  )}
                </p>
              </article>
              <article>
                <span>03</span>
                <h3>{t('Command the battlefield')}</h3>
                <p>
                  {t(
                    'Select your unit, move to a highlighted tile, then click an enemy in range. Archers shoot farther; cavalry moves faster. Defenders strike back, so read each forecast first. Tactics cost tactic points; routed troops cannot fight. Capture the enemy camp or defeat their troops. Defenders win when the day limit passes.',
                  )}
                </p>
              </article>
              <article>
                <span>04</span>
                <h3>{t('Shape the realm')}</h3>
                <p>
                  {t(
                    'Search for hidden talent, persuade officers, undermine rival cities, or negotiate alliances. Raid, sack or plunder when you must, but a ruined city breeds unrest. Captured officers may be recruited, released or executed. Conquer all 24 cities to unite the realm. Losing your last city ends the campaign.',
                  )}
                </p>
              </article>
            </div>
            <TroopLegend />
            <div className="help-bottom">
              <div>
                <strong>{t('Map controls')}</strong>
                <p>
                  {t('Drag to pan · Scroll to zoom · Double-click to reset')}
                  <br />
                  {t('Use City index to select cities with the keyboard.')}
                </p>
              </div>
              <div>
                <strong>{t('Your campaign is saved automatically')}</strong>
                <p>
                  {t('Use Save & load for manual slots and portable JSON backups.')}
                  <br />
                  {t(
                    'Battle progress is saved too. Browser storage can be cleared; export a copy.',
                  )}
                </p>
              </div>
            </div>
          </Dialog>
        )}

        {modal === 'settings' && (
          <Dialog
            title={t('Your campaign, your pace')}
            eyebrow={t('SETTINGS')}
            onClose={() => setModal(null)}
          >
            <div className="settings-list">
              <label className="preference-select">
                <span>
                  <Eye size={18} />
                  <strong>{t('Display size')}</strong>
                  <small>{t('Applies to maps, text, and controls. Saved in this browser.')}</small>
                </span>
                <select
                  aria-label={t('Display size')}
                  value={displayPreset}
                  onChange={(event) => setDisplayPreset(event.target.value as DisplayPreset)}
                >
                  <option value="compact">{t('Compact')}</option>
                  <option value="comfortable">{t('Comfortable')}</option>
                  <option value="large">{t('Large')}</option>
                </select>
              </label>
              <label className="preference-select">
                <span>
                  <Swords size={18} />
                  <strong>{t('Rival aggression')}</strong>
                  <small>
                    {t('Controls willingness to start wars; no combat or resource bonuses.')}
                  </small>
                </span>
                <select
                  aria-label={t('Rival aggression')}
                  value={state.rivalAggression}
                  disabled={!started || busy || state.phase !== 'planning' || !!state.resolution}
                  onChange={(event) =>
                    execute({
                      type: 'setRivalAggression',
                      value: event.target.value as RivalAggression,
                    })
                  }
                >
                  {AGGRESSION_OPTIONS.map((value) => (
                    <option value={value} key={value}>
                      {t(AGGRESSION_LABELS[value])}
                    </option>
                  ))}
                </select>
              </label>
              <p className="subtle">
                {t(
                  state.phase === 'planning' && !state.resolution
                    ? 'Campaign setting: takes effect next month and is saved with your progress.'
                    : 'Rival aggression can be changed during campaign planning after the current month resolves.',
                )}
              </p>
              <label>
                <span>
                  <Hourglass size={18} />
                  <strong>{t('Natural aging')}</strong>
                  <small>
                    {t(
                      'Veteran officers past sixty may die of old age each January. Off by default.',
                    )}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={state.aging}
                  disabled={!started || busy || state.phase !== 'planning' || !!state.resolution}
                  onChange={(event) => execute({ type: 'setAging', value: event.target.checked })}
                />
              </label>
              <label>
                <span>
                  <Volume2 size={18} />
                  <strong>{t('Sound effects')}</strong>
                  <small>{t('Gentle feedback for actions and turns')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={sound}
                  onChange={(e) => setSound(e.target.checked)}
                />
              </label>
              <label>
                <span>
                  <Sparkles size={18} />
                  <strong>{t('Reduce motion')}</strong>
                  <small>{t('Keep the interface still and focused')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                />
              </label>
            </div>
            <div className="settings-footer">
              <span className="eyebrow">{t('HEGEMONY OF THE THREE KINGDOMS · v0.2')}</span>
              <p>
                {t(
                  'A web remake inspired by 三国霸业 (Baye). One realm, six houses, and a history that belongs to you.',
                )}
              </p>
              <button className="primary-outline" onClick={() => setModal('start')}>
                <RotateCcw size={16} />
                {t('Begin a new campaign')}
              </button>
              <button className="text-button" onClick={() => setModal('help')}>
                {t('Read the field guide')}
                <ArrowRight size={14} />
              </button>
              <button className="text-button" onClick={() => setModal('credits')}>
                {t('Artwork & reference credits')}
                <ArrowRight size={14} />
              </button>
            </div>
          </Dialog>
        )}

        {modal === 'credits' && (
          <Dialog
            title={t('Artwork & reference credits')}
            eyebrow={t('HEGEMONY OF THE THREE KINGDOMS · v0.2')}
            onClose={() => setModal('settings')}
          >
            <div className="credits-copy">
              <h3>{t('Officer illustrations')}</h3>
              <p>
                {t(
                  '53 distinct officer portraits and one garrison portrait were created for this project. These are artistic depictions, not verified historical likenesses.',
                )}
              </p>
              <p>
                {t(
                  'Portraits are bundled locally. Identity stays with the officer when allegiance changes.',
                )}
              </p>
              <a
                href={`${import.meta.env.BASE_URL}assets/portraits/credits.json`}
                target="_blank"
                rel="noreferrer"
              >
                {t('View artwork provenance and rights records')}
                <ArrowUpRight size={16} />
              </a>
              <h3>{t('Main game reference')}</h3>
              <a
                href="https://github.com/erduoniba/baye-fmj-app/tree/main"
                target="_blank"
                rel="noreferrer"
              >
                erduoniba/baye-fmj-app
                <ArrowUpRight size={16} />
              </a>
              <p>
                {t(
                  'Baye / 三国霸业 inspired the core game. The web remake uses its own authored atlas and presentation.',
                )}
              </p>
            </div>
          </Dialog>
        )}

        {modal === 'saves' && (
          <Dialog
            title={t('Keep your history')}
            eyebrow={t('SAVE & LOAD')}
            onClose={() => setModal(null)}
          >
            <div className="save-slots" aria-busy={slotsLoading}>
              {['auto', 'slot-1', 'slot-2', 'slot-3'].map((id, i) => {
                const record = slots.find((r) => r.id === id);
                return (
                  <div className="save-slot" key={id}>
                    <div className="slot-number">
                      {i === 0 ? <RotateCcw size={18} /> : String(i).padStart(2, '0')}
                    </div>
                    <div>
                      <strong>
                        {i === 0 ? t('Autosave') : t('Campaign slot {slot}', { slot: i })}
                      </strong>
                      <span>
                        {slotsLoading
                          ? t('Reading saved campaigns…')
                          : record?.summary
                            ? t('{ruler} · {month} {year}', {
                                ruler:
                                  factionOf(slotScenario(record), record.summary.factionId)?.name ??
                                  record.summary.factionId,
                                month: MONTHS[record.summary.month - 1] ?? '',
                                year: record.summary.year,
                              })
                            : tx(record?.name ?? 'An unwritten history')}
                      </span>
                      {record && (
                        <small>
                          {new Date(record.savedAt).toLocaleString(
                            locale === 'zh' ? 'zh-CN' : 'en-US',
                          )}
                        </small>
                      )}
                    </div>
                    <div className="slot-actions">
                      {record && (
                        <button disabled={slotsLoading} onClick={() => restore(record)}>
                          {t('Load')}
                        </button>
                      )}
                      {i > 0 && (
                        <button disabled={slotsLoading} onClick={() => void manualSave(id)}>
                          {t('Save')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="save-file-actions">
              <button className="primary-outline" onClick={() => downloadSave(state)}>
                <ArrowDownToLine size={16} />
                {t('Export campaign')}
              </button>
              <button
                className="primary-outline"
                disabled={!ready}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={16} />
                {t('Import file')}
              </button>
            </div>
            <p className="subtle">
              {t(
                'Export a backup before clearing browser data. Saves include ongoing battles and the exact state of your campaign.',
              )}
            </p>
          </Dialog>
        )}

        {modal === 'march' && (
          <Dialog
            title={t('March from {city}', { city: city.name })}
            eyebrow={t('MILITARY DISPATCH')}
            onClose={() => setModal(null)}
          >
            <MarchDialog
              state={state}
              city={city}
              available={available}
              target={marchTarget}
              setTarget={setMarchTarget}
              officers={marchOfficers}
              setOfficers={setMarchOfficers}
              intent={marchIntent}
              setIntent={setMarchIntent}
              supplyDays={marchSupply}
              setSupplyDays={setMarchSupply}
              onIssue={(command) => {
                if (execute(command)) setModal(null);
              }}
            />
          </Dialog>
        )}

        {modal === 'summary' && state.lastBattle && (
          <Dialog
            title={t(playerWon(state.lastBattle, state.playerFactionId) ? 'Victory' : 'Defeat')}
            eyebrow={t('BATTLE REPORT')}
            onClose={() => setModal(null)}
          >
            <BattleSummary
              state={state}
              summary={state.lastBattle}
              onFocusCity={focusCity}
              onClose={() => setModal(null)}
            />
          </Dialog>
        )}

        {modal === 'muster' && officer && (
          <Dialog
            title={t('Muster for {name}', { name: officer.name })}
            eyebrow={t('TROOP ASSIGNMENT')}
            onClose={() => setModal(null)}
          >
            <div className="muster-officer">
              <OfficerMark officer={officer} size="large" />
              <div>
                <h3>{tx(officer.name)}</h3>
                <p>
                  <TroopIcon type={officer.troopType} /> {tx(TROOP_LABELS[officer.troopType])} ·{' '}
                  {number(officer.troops)} {t('currently assigned')}
                </p>
              </div>
            </div>
            <label className="field-label">
              {t('Assigned troops')}
              <strong className="muster-count">{number(muster)}</strong>
              <input
                type="range"
                min="0"
                max={Math.min(5000, officer.troops + city.reserve)}
                step="1"
                value={muster}
                onChange={(e) => setMuster(Number(e.target.value))}
              />
            </label>
            <div className="number-field">
              <input
                aria-label={t('Assigned troop count')}
                type="number"
                min="0"
                max={Math.min(5000, officer.troops + city.reserve)}
                value={muster}
                onChange={(e) => setMuster(Number(e.target.value))}
              />
              <button onClick={() => setMuster(Math.min(5000, officer.troops + city.reserve))}>
                {t('Assign maximum')}
              </button>
            </div>
            <p className="subtle">
              {t(
                '{count} reserves available in {city}. Reducing an army returns troops to the reserves.',
                { count: number(city.reserve), city: city.name },
              )}
            </p>
            <button
              className="primary-button full"
              onClick={() => {
                if (
                  execute({
                    type: 'assignTroops',
                    cityId: city.id,
                    officerId: officer.id,
                    amount: muster,
                  })
                )
                  setModal(null);
              }}
            >
              {t('Confirm assignment')}
              <Check size={17} />
            </button>
          </Dialog>
        )}

        {modal === 'transfer' && officer && (
          <Dialog
            title={t('Move people and provisions')}
            eyebrow={t('LOGISTICS')}
            onClose={() => setModal(null)}
          >
            <p className="dialog-copy">
              {t(
                'Transfer {name} and their troops to a neighboring city under your banner, along with additional supplies.',
                { name: officer.name },
              )}
            </p>
            <label className="field-label">
              {t('Destination')}
              <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}>
                <option value="">{t('Select a friendly city')}</option>
                {city.neighbors
                  .filter((id) => state.cities.find((c) => c.id === id)?.factionId === player.id)
                  .map((id) => (
                    <option key={id} value={id}>
                      {tx(state.cities.find((c) => c.id === id)?.name)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="transfer-fields">
              {[
                { label: 'Gold', value: transferGold, max: city.gold, set: setTransferGold },
                { label: 'Food', value: transferFood, max: city.food, set: setTransferFood },
                {
                  label: 'Reserves',
                  value: transferTroops,
                  max: city.reserve,
                  set: setTransferTroops,
                },
              ].map((field) => (
                <label key={field.label} className="field-label">
                  {tx(field.label)}
                  <input
                    type="number"
                    min="0"
                    max={field.max}
                    value={field.value}
                    onChange={(e) => field.set(Number(e.target.value))}
                  />
                  <small>
                    {number(field.max)} {t('available')}
                  </small>
                </label>
              ))}
            </div>
            <button
              className="primary-button full"
              disabled={!transferTarget}
              onClick={() => {
                if (
                  execute({
                    type: 'transfer',
                    sourceId: city.id,
                    targetId: transferTarget,
                    officerId: officer.id,
                    gold: transferGold,
                    food: transferFood,
                    troops: transferTroops,
                  })
                )
                  setModal(null);
              }}
            >
              {t('Dispatch convoy')}
              <Truck size={17} />
            </button>
          </Dialog>
        )}

        {state.phase === 'finished' && modal === null && (
          <Dialog
            title={tx(
              state.winner === player.id
                ? owned.length === state.cities.length
                  ? 'A realm united.'
                  : 'The Hegemon of the realm.'
                : owned.length
                  ? 'A rival is crowned Hegemon.'
                  : 'Your banner falls.',
            )}
            eyebrow={tx(
              state.winner === player.id ? 'THE MANDATE IS YOURS' : 'THE END OF A DYNASTY',
            )}
            onClose={() => setModal('start')}
          >
            <div className="ending">
              <Crown size={54} />
              <p>
                {tx(
                  state.winner === player.id
                    ? owned.length === state.cities.length
                      ? `${player.name} has brought the divided realm under one banner. A new chapter begins.`
                      : `${player.name} has held the capital and sixteen cities for a year. The court proclaims a new Hegemon.`
                    : owned.length
                      ? `${factionOf(state, state.winner)?.name ?? 'A rival'} has held the capital and sixteen cities for a year and is proclaimed Hegemon. Your banner still flies, but the realm has chosen.`
                      : 'Your last stronghold has fallen, but history offers another path. Raise a new banner and try again.',
                )}
              </p>
              <div className="ending-stats">
                <Stat icon={Flag} label={t('Turns')} value={state.turn + 1} />
                <Stat icon={Swords} label={t('Battles won')} value={state.stats.battlesWon} />
              </div>
              <button className="primary-button full" onClick={() => setModal('start')}>
                {t('Begin a new history')}
                <ArrowRight size={17} />
              </button>
            </div>
          </Dialog>
        )}
      </div>
    </FactionsContext.Provider>
  );
}
