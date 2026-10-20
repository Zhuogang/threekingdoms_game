import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
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
  Wind,
  CloudRain,
  Sun,
  Heart,
  Package,
  Target,
  Eye,
  Wine,
  UserPlus,
  Minus,
  Axe,
  type LucideIcon,
} from 'lucide-react';
import { session } from '../app/session';
import { FACTIONS, SCENARIO, TROOP_LABELS, factionById } from '../content/scenario';
import { getActionInfo } from '../game/campaign';
import {
  getAttackTargets,
  getReachableTiles,
  getBattleUnitMove,
  getBattleUnitRange,
} from '../game/battle';
import type { Action, GameCommand, Officer } from '../game/types';
import GameMap from '../rendering/GameMap';
import { decodeSave, downloadSave, listSlots, saveSlot, type SaveRecord } from '../platform/saves';
import { playCue } from '../platform/audio';
import { autosave } from '../platform/autosave';
import { useI18n } from '../i18n';
import LanguageSwitch from '../i18n/LanguageSwitch';
import { getOfficerIdentity } from '../content/officerIdentity';
import {
  DISPLAY_PRESETS,
  readDisplayPreset,
  writeDisplayPreset,
  type DisplayPreset,
} from './display';
import Portrait from './Portrait';
import TroopIcon from './TroopIcon';
import MonthlyReport from './MonthlyReport';
import { nextReadyUnit, unitReadiness } from './battlePresentation';
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
};
const GROUPS: { name: string; actions: Action[] }[] = [
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
      'banish',
    ],
  },
  { name: 'Diplomacy', actions: ['scout', 'persuade', 'subvert', 'alliance'] },
  { name: 'Harsh measures', actions: ['plunder'] },
];
type ModalKind =
  'start' | 'help' | 'settings' | 'saves' | 'march' | 'transfer' | 'muster' | 'credits' | null;
const AGGRESSION_OPTIONS: RivalAggression[] = ['cautious', 'balanced', 'aggressive'];
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

function OfficerMark({
  officer,
  size = 'normal',
}: {
  officer: Officer;
  size?: 'normal' | 'small' | 'large';
}) {
  const identity = getOfficerIdentity(officer.id);
  const faction = factionById(officer.factionId);
  return (
    <div
      className={`officer-mark ${size}`}
      style={{ '--officer-color': faction?.color ?? '#827766' } as React.CSSProperties}
    >
      <Portrait officerId={officer.id} large={size === 'large'} />
      <span className="officer-surname">{identity?.surnameZh ?? '军'}</span>
      <span className="officer-troop">
        <TroopIcon type={officer.troopType} />
      </span>
    </div>
  );
}
function TroopLegend() {
  const { t, tx } = useI18n();
  return (
    <section className="troop-legend" aria-label={t('Troop and banner meanings')}>
      <p>{t('Banner color and crest show allegiance. The surname identifies the commander.')}</p>
      <div className="troop-legend-grid">
        {(Object.keys(TROOP_LABELS) as TroopType[]).map((type) => (
          <span key={type}>
            <TroopIcon type={type} size={24} />
            {tx(TROOP_LABELS[type])}
          </span>
        ))}
      </div>
      <div className="readiness-legend">
        <span>○ {t('Ready')}</span>
        <span>→ {t('Moved · action ready')}</span>
        <span>✓ {t('Finished for today')}</span>
        <span>? {t('Confused · unavailable')}</span>
      </div>
      <p>{t('Inspired is an extra status. It does not restore an action.')}</p>
    </section>
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
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
}) {
  return (
    <div className="meter">
      <div>
        <span>{label}</span>
        <strong>
          {number(value)}
          <small> / {number(max)}</small>
        </strong>
      </div>
      <div className="meter-track">
        <i style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
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
    [seed, setSeed] = useState('190');
  const [newAggression, setNewAggression] = useState<RivalAggression>('balanced');
  const [displayPreset, setDisplayPreset] = useState<DisplayPreset>(readDisplayPreset);
  const [legendOpen, setLegendOpen] = useState(false);
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
    [skill, setSkill] = useState<'fire' | 'rally' | 'confuse' | null>(null);
  const [battleDestination, setBattleDestination] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const player = factionById(state.playerFactionId)!;
  const owned = state.cities.filter((c) => c.factionId === state.playerFactionId);
  const city = state.cities.find((c) => c.id === selectedCityId) ?? owned[0] ?? state.cities[0]!;
  const friendly = city.factionId === state.playerFactionId;
  const cityOfficers = state.officers.filter(
    (o) => o.cityId === city.id && o.factionId === city.factionId && !o.captive,
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
  const moveDestination = reachableTiles.find(
    (tile) => `${tile.x},${tile.y}` === battleDestination,
  );
  const battleTargets =
    battle && unit && canBattleAct
      ? skill
        ? battle.units.filter(
            (target) =>
              target.troops > 0 &&
              (skill === 'rally' ? target.side === unit.side : target.side !== unit.side) &&
              Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y) <= 3,
          )
        : battle.units.filter((target) => getAttackTargets(battle, unit.id).includes(target.id))
      : [];
  const enemies = state.cities.filter((c) => c.factionId && c.factionId !== state.playerFactionId);
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

  function execute(command: GameCommand): boolean {
    const result = session.execute(command);
    if (!result.ok) {
      notify(result.error ?? 'This command is unavailable.', true);
      return false;
    }
    playCue(
      command.type === 'endMonth' ? 'turn' : command.type.startsWith('battle') ? 'battle' : 'click',
      sound,
    );
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
    session.start(ruler, Number.isFinite(parsed) ? parsed >>> 0 : 190, newAggression);
    const next = session.getSnapshot();
    const leader = next.officers.find((o) => o.name === factionById(ruler)?.leader);
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
      notify('Rally requires a friendly unit within three tiles.', true);
    else performBattleTarget(id);
  }
  function moveBattleUnit(x: number, y: number) {
    if (skill) {
      notify('Choose a tactic target, or cancel the tactic before moving.', true);
      return;
    }
    if (unit && execute({ type: 'battleMove', unitId: unit.id, x, y })) setBattleDestination('');
  }
  function chooseBattleSkill(next: 'fire' | 'rally' | 'confuse') {
    if (!unit || !canBattleAct) return;
    setSelectedUnitId(unit.id);
    setBattleDestination('');
    setSkill(skill === next ? null : next);
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
          <h1>{tx(SCENARIO.title)}</h1>
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
            <span>{tx(isBattle ? `DAY ${battle.day} / 30` : '山河万里 · A THOUSAND LEAGUES')}</span>
          </div>
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
          />
          {!isBattle && (
            <>
              <div className="map-legend">
                {FACTIONS.map((f) => (
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
                        <i style={{ background: factionById(c.factionId)?.color ?? '#999' }} />
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
          {isBattle && battle ? (
            <>
              <div className="inspector-title">
                <span className="eyebrow">{t('TACTICAL COMMAND')}</span>
                <h2>{t('Hold your ground.')}</h2>
                <p>{t('Capture the enemy camp or break their army.')}</p>
              </div>
              <div className="battle-conditions">
                <span>
                  {battle.weather === 'clear' ? (
                    <Sun size={16} />
                  ) : battle.weather === 'rain' ? (
                    <CloudRain size={16} />
                  ) : (
                    <Wind size={16} />
                  )}{' '}
                  {tx(battle.weather)}
                </span>
                <span>
                  <Wheat size={16} />
                  {number(
                    battle.playerSide === 'attacker' ? battle.attackerFood : battle.defenderFood,
                  )}{' '}
                  {t('supplies')}
                </span>
              </div>
              <div className="army-balance">
                <span>
                  {t('Your army')}
                  <strong>
                    {number(
                      battle.units
                        .filter((u) => u.side === battle.playerSide)
                        .reduce((s, u) => s + u.troops, 0),
                    )}
                  </strong>
                </span>
                <Swords size={18} />
                <span>
                  {t('Enemy army')}
                  <strong>
                    {number(
                      battle.units
                        .filter((u) => u.side !== battle.playerSide)
                        .reduce((s, u) => s + u.troops, 0),
                    )}
                  </strong>
                </span>
              </div>
              <div className="battle-toolbar">
                <button
                  className="primary-outline next-commander"
                  onClick={nextCommander}
                  disabled={!nextUnit}
                >
                  <ArrowRight size={17} />
                  {t('Next ready commander')}
                </button>
                {!nextUnit && (
                  <p className="subtle">
                    {t('No ready commanders remain. End the day to continue.')}
                  </p>
                )}
              </div>
              <button
                className="legend-toggle"
                onClick={() => setLegendOpen(!legendOpen)}
                aria-expanded={legendOpen}
              >
                <CircleHelp size={17} />
                {t('Troops & banners legend')}
                <ChevronDown size={16} />
              </button>
              {legendOpen && <TroopLegend />}
              {isBattle && (
                <div className="battle-map-hint">
                  <Target size={16} />
                  <span>
                    {tx(
                      skill
                        ? `Choose ${skill === 'rally' ? 'a friendly unit' : 'an enemy'} within 3 tiles for ${skill}.`
                        : unit?.status === 'confused'
                          ? `${unit.name} is confused. Rally them with an ally, or end the day.`
                          : unit?.acted
                            ? `${unit.name} has acted. Select another commander or end the day.`
                            : unit
                              ? `${unit.name}: select a highlighted tile to move, or an enemy to attack.`
                              : 'Select a unit to give orders.',
                    )}
                  </span>
                  {skill && (
                    <button
                      onClick={() => setSkill(null)}
                      aria-label={t('Cancel tactic targeting')}
                    >
                      {t('Cancel')}
                    </button>
                  )}
                </div>
              )}
              {unit && (
                <div className="unit-card">
                  <span className="eyebrow">{t('SELECTED COMMANDER')}</span>
                  <div className="selected-identity">
                    <Portrait officerId={unit.officerId} large />
                    <div className="identity-details">
                      <h3>{tx(unit.name)}</h3>
                      <div className="identity-faction">
                        <Flag size={17} />
                        {tx(
                          factionById(
                            unit.side === 'attacker' ? battle.attackerId : battle.defenderId,
                          )?.name ?? 'The garrison',
                        )}
                      </div>
                      <span className="subtle troop-description">
                        <TroopIcon type={unit.troopType} />
                        {tx(TROOP_LABELS[unit.troopType])} · {number(unit.troops)} {t('troops')}
                      </span>
                      <p
                        className={`readiness ${unit.status === 'confused' ? 'unavailable' : unit.acted ? 'finished' : 'ready'}`}
                      >
                        <span aria-hidden="true">
                          {unit.status === 'confused'
                            ? '?'
                            : unit.acted
                              ? '✓'
                              : unit.moved
                                ? '→'
                                : '○'}
                        </span>
                        {t(unitReadiness(unit))}
                      </p>
                    </div>
                  </div>
                  <div className="unit-facts">
                    <span>
                      {t('Move')} <b>{getBattleUnitMove(unit)}</b>
                    </span>
                    <span>
                      {t('Range')} <b>{getBattleUnitRange(unit)}</b>
                    </span>
                    <span>
                      {t('Morale')} <b>{unit.morale}</b>
                    </span>
                  </div>
                  <div className="unit-status">
                    <span
                      className={
                        unit.moved || unit.acted || unit.status === 'confused' ? 'used' : ''
                      }
                    >
                      {tx(
                        unit.status === 'confused'
                          ? 'Movement blocked'
                          : unit.moved || unit.acted
                            ? 'Movement used'
                            : 'Movement ready',
                      )}
                    </span>
                    <span className={unit.acted || unit.status === 'confused' ? 'used' : ''}>
                      {tx(
                        unit.status === 'confused'
                          ? 'Action blocked'
                          : unit.acted
                            ? 'Action used'
                            : 'Action ready',
                      )}
                    </span>
                  </div>
                  {unit.status === 'confused' && (
                    <p className="inline-notice" role="status">
                      {t(
                        'Confused: this commander loses the current turn. Another commander can Rally them within three tiles, or end the day to recover.',
                      )}
                    </p>
                  )}
                  {unit.status === 'inspired' && (
                    <p className="subtle">{t('Inspired: attacks deal 20% more damage today.')}</p>
                  )}
                  <div className="battle-movement">
                    <label className="field-label" htmlFor="battle-destination">
                      {t('Move to tile')}
                      <select
                        id="battle-destination"
                        value={moveDestination ? battleDestination : ''}
                        onChange={(event) => setBattleDestination(event.target.value)}
                        disabled={!canBattleAct || !reachableTiles.length || !!skill}
                      >
                        <option value="">
                          {tx(
                            unit.status === 'confused'
                              ? 'Movement blocked'
                              : unit.moved || unit.acted
                                ? 'Movement used'
                                : reachableTiles.length
                                  ? 'Choose a reachable tile'
                                  : 'No reachable tiles',
                          )}
                        </option>
                        {reachableTiles.map((tile) => (
                          <option key={`${tile.x},${tile.y}`} value={`${tile.x},${tile.y}`}>
                            {String.fromCharCode(65 + tile.x)}
                            {tile.y + 1} · {tx(battle.terrain[tile.y * battle.width + tile.x])}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary-outline"
                      disabled={!canBattleAct || !moveDestination || !!skill}
                      onClick={() => {
                        if (moveDestination) moveBattleUnit(moveDestination.x, moveDestination.y);
                      }}
                    >
                      {t('Move unit')}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="tactic-actions">
                    <button
                      disabled={!canBattleAct}
                      onClick={() => chooseBattleSkill('fire')}
                      aria-pressed={skill === 'fire'}
                      className={skill === 'fire' ? 'selected' : ''}
                    >
                      <Flame size={16} />
                      {t('Fire')}
                    </button>
                    <button
                      disabled={!canBattleAct}
                      onClick={() => chooseBattleSkill('rally')}
                      aria-pressed={skill === 'rally'}
                      className={skill === 'rally' ? 'selected' : ''}
                    >
                      <Flag size={16} />
                      {t('Rally')}
                    </button>
                    <button
                      disabled={!canBattleAct}
                      onClick={() => chooseBattleSkill('confuse')}
                      aria-pressed={skill === 'confuse'}
                      className={skill === 'confuse' ? 'selected' : ''}
                    >
                      <Sparkles size={16} />
                      {t('Confuse')}
                    </button>
                  </div>
                  {skill && (
                    <div className="battle-tactic-note">
                      <p className="subtle">
                        {tx(
                          skill === 'rally'
                            ? 'Rally restores allied morale and removes confusion. Choose yourself or an ally within three tiles.'
                            : skill === 'fire'
                              ? 'Fire reaches three tiles. Rain weakens it; wind and forests strengthen it.'
                              : 'Confuse reaches three tiles. Success depends on both commanders’ intellect and makes the target lose a turn.',
                        )}
                      </p>
                      <button className="text-button" onClick={() => setSkill(null)}>
                        <X size={13} />
                        {t('Cancel')} {tx(skill)}
                      </button>
                    </div>
                  )}
                  <button
                    className="text-button"
                    disabled={!canBattleAct}
                    onClick={() => {
                      if (execute({ type: 'battleWait', unitId: unit.id })) setSkill(null);
                    }}
                  >
                    {t('Hold position')} <ArrowRight size={14} />
                  </button>
                  {canBattleAct && (skill || battleTargets.length > 0) && (
                    <div className={`attack-targets ${skill === 'rally' ? 'rally-targets' : ''}`}>
                      <span className="eyebrow">
                        {tx(skill ? `${skill.toUpperCase()} TARGETS · RANGE 3` : 'IN ATTACK RANGE')}
                      </span>
                      {battleTargets.length ? (
                        battleTargets.map((target) => (
                          <button
                            key={target.id}
                            onClick={() => performBattleTarget(target.id)}
                            aria-label={t(
                              skill === 'fire'
                                ? 'fire {name}'
                                : skill === 'rally'
                                  ? 'rally {name}'
                                  : skill === 'confuse'
                                    ? 'confuse {name}'
                                    : 'Attack {name}',
                              { name: target.name },
                            )}
                          >
                            {skill === 'rally' ? (
                              <Flag size={13} />
                            ) : skill === 'fire' ? (
                              <Flame size={13} />
                            ) : skill === 'confuse' ? (
                              <Sparkles size={13} />
                            ) : (
                              <Swords size={13} />
                            )}
                            <span>
                              {tx(target.name)}
                              {tx(target.id === unit.id ? ' (self)' : '')}
                              <small>
                                {tx(
                                  skill === 'rally'
                                    ? `${target.morale} morale${target.status === 'confused' ? ' · Confused' : ''}`
                                    : `${number(target.troops)} troops`,
                                )}
                              </small>
                            </span>
                            <ArrowRight size={13} />
                          </button>
                        ))
                      ) : (
                        <p className="subtle">
                          {t(
                            'No valid targets within three tiles. Cancel to move or choose another commander.',
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="section-heading">
                <h3>{t('Your commanders')}</h3>
                <span>
                  {battle.units.filter((u) => u.side === battle.playerSide && u.troops > 0).length}{' '}
                  {t('standing')}
                </span>
              </div>
              <div className="battle-unit-list">
                {battle.units
                  .filter((u) => u.side === battle.playerSide && u.troops > 0)
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setSelectedUnitId(u.id);
                        setSkill(null);
                        setBattleDestination('');
                      }}
                      className={u.id === unit?.id ? 'selected' : ''}
                    >
                      <Portrait officerId={u.officerId} />
                      <span>
                        {tx(u.name)}
                        <small>
                          <TroopIcon type={u.troopType} />
                          {tx(TROOP_LABELS[u.troopType])} · {t(unitReadiness(u))}
                          {u.status === 'inspired' && <> · {t('Inspired')}</>}
                        </small>
                      </span>
                      <strong>{number(u.troops)}</strong>
                      <i className={u.acted || u.status === 'confused' ? 'spent' : 'ready'} />
                    </button>
                  ))}
              </div>
              <div className="section-heading">
                <h3>{t('Enemy commanders')}</h3>
                <span>
                  {battle.units.filter((u) => u.side !== battle.playerSide && u.troops > 0).length}
                </span>
              </div>
              <div className="enemy-commander-list" role="list" aria-label={t('Enemy commanders')}>
                {battle.units
                  .filter((u) => u.side !== battle.playerSide && u.troops > 0)
                  .map((enemy) => (
                    <div className="enemy-unit" role="listitem" tabIndex={0} key={enemy.id}>
                      <Portrait officerId={enemy.officerId} />
                      <span>
                        <strong>{tx(enemy.name)}</strong>
                        <small>
                          <TroopIcon type={enemy.troopType} />
                          {tx(TROOP_LABELS[enemy.troopType])} ·{' '}
                          {tx(
                            factionById(
                              enemy.side === 'attacker' ? battle.attackerId : battle.defenderId,
                            )?.name ?? 'The garrison',
                          )}
                        </small>
                      </span>
                      <strong>{number(enemy.troops)}</strong>
                    </div>
                  ))}
              </div>
              <div className="battle-report">
                {battle.log
                  .slice(-5)
                  .reverse()
                  .map((log, i) => (
                    <p key={`${i}-${log}`}>{tx(log)}</p>
                  ))}
              </div>
              <div className="battle-secondary">
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        t('Withdraw from this battle? Your surviving troops will retreat.'),
                      )
                    )
                      execute({ type: 'battleRetreat' });
                  }}
                >
                  {t('Retreat')}
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        t('Let your commanders resolve the rest of this battle automatically?'),
                      )
                    )
                      execute({ type: 'battleAuto' });
                  }}
                >
                  {t('Auto-resolve')}
                </button>
              </div>
            </>
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
                        </span>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
              </div>
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
                      '--badge-color': factionById(city.factionId)?.color ?? '#7b786b',
                    } as React.CSSProperties
                  }
                >
                  <i />
                  {friendly ? t('YOUR CITY') : tx(factionById(city.factionId)?.name ?? 'UNCLAIMED')}
                </span>
              </div>
              <div className="city-resources">
                <Stat icon={Users} label={t('Population')} value={compact(city.population)} />
                <Stat icon={Coins} label={t('Gold')} value={number(city.gold)} />
                <Stat icon={Wheat} label={t('Food')} value={compact(city.food)} />
                <Stat icon={Shield} label={t('Reserves')} value={number(city.reserve)} />
              </div>
              <div className="city-meters">
                <Meter label={t('Agriculture')} value={city.farming} max={999} />
                <Meter label={t('Commerce')} value={city.commerce} max={999} color="#b28b50" />
                <div className="split-meters">
                  <Meter label={t('Public loyalty')} value={city.loyalty} />
                  <Meter label={t('Fortifications')} value={city.defense} color="#82909b" />
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
                      {tx(TROOP_LABELS[officer.troopType])} · {number(officer.troops)} {t('troops')}
                    </span>
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
                        className={group === index ? 'active' : ''}
                        onClick={() => {
                          setGroup(index);
                          setTargetId('');
                        }}
                      >
                        {tx(g.name)}
                      </button>
                    ))}
                  </div>
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
                                {tx(c.name)} · {tx(factionById(c.factionId)?.name ?? 'Unclaimed')}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label={t('Rival rulers — alliance')}>
                          {FACTIONS.filter(
                            (f) => f.id !== player.id && enemies.some((c) => c.factionId === f.id),
                          ).map((f) => (
                            <option key={f.id} value={f.id}>
                              {tx(f.name)}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={t('Officers — persuade')}>
                          {state.officers
                            .filter(
                              (o) =>
                                (o.factionId !== player.id || o.captive) &&
                                (o.cityId === city.id ||
                                  (city.neighbors.includes(o.cityId) && o.factionId && !o.captive)),
                            )
                            .map((o) => (
                              <option value={o.id} key={o.id}>
                                {tx(o.name)} ·{' '}
                                {tx(state.cities.find((c) => c.id === o.cityId)?.name)}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    </div>
                  )}
                  {officer?.busy && (
                    <div className="inline-notice">
                      {t('{name} is on assignment. Choose another officer or advance the month.', {
                        name: officer.name,
                      })}
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
                          onClick={() => performAction(action)}
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
                  <h3>{tx(city.factionId ? 'Beyond your borders' : 'A city without a banner')}</h3>
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
        <div className={`toast ${toast.bad ? 'error' : ''}`} role={toast.bad ? 'alert' : 'status'}>
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
              <p>{tx(SCENARIO.description)}</p>
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
                  {t('52 officers')}
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
              <div className="faction-grid">
                {FACTIONS.map((f) => (
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
                <p>{tx(factionById(ruler)?.description)}</p>
              </div>
              <div className="begin-campaign">
                <label>
                  {t('World seed')}{' '}
                  <input
                    aria-label={t('World seed')}
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    inputMode="numeric"
                    maxLength={10}
                  />
                </label>
                <button className="primary-button" onClick={startCampaign} disabled={!ready}>
                  {t('Raise your banner')}
                  <ArrowRight size={18} />
                </button>
              </div>
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
                  'Select your unit, move to a highlighted tile, then click an enemy in range. Archers shoot farther; cavalry moves faster. Fire, Rally, and Confuse use your action. Capture the enemy camp or defeat their troops. Defenders win after 30 days.',
                )}
              </p>
            </article>
            <article>
              <span>04</span>
              <h3>{t('Shape the realm')}</h3>
              <p>
                {t(
                  'Search for hidden talent, persuade officers, undermine rival cities, or negotiate alliances. Transfer officers and resources between neighboring cities. Conquer all 24 cities to unite the realm. Losing your last city ends the campaign.',
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
                {t('Battle progress is saved too. Browser storage can be cleared; export a copy.')}
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
                <Volume2 size={18} />
                <strong>{t('Sound effects')}</strong>
                <small>{t('Gentle feedback for actions and turns')}</small>
              </span>
              <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
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
            <span className="eyebrow">{t('HEGEMONY OF THE THREE KINGDOMS · v0.1')}</span>
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
          eyebrow={t('HEGEMONY OF THE THREE KINGDOMS · v0.1')}
          onClose={() => setModal('settings')}
        >
          <div className="credits-copy">
            <h3>{t('Officer illustrations')}</h3>
            <p>
              {t(
                '52 distinct officer portraits and one garrison portrait were created for this project. These are artistic depictions, not verified historical likenesses.',
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
                                factionById(record.summary.factionId)?.name ??
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
          <p className="dialog-copy">
            {t('Choose your destination and commanders. Armies depart at the end of the month.')}
          </p>
          <label className="field-label">
            {t('Destination')}
            <select value={marchTarget} onChange={(e) => setMarchTarget(e.target.value)}>
              {city.neighbors
                .filter((id) => state.cities.find((c) => c.id === id)?.factionId !== player.id)
                .map((id) => {
                  const target = state.cities.find((c) => c.id === id)!;
                  return (
                    <option key={id} value={id}>
                      {tx(target.name)} · {tx(factionById(target.factionId)?.name ?? 'Unclaimed')}
                    </option>
                  );
                })}
            </select>
          </label>
          <div className="march-roster">
            {available
              .filter((o) => o.troops > 0)
              .map((o) => (
                <label key={o.id}>
                  <input
                    type="checkbox"
                    checked={marchOfficers.includes(o.id)}
                    onChange={(e) =>
                      setMarchOfficers(
                        e.target.checked
                          ? [...marchOfficers, o.id]
                          : marchOfficers.filter((id) => id !== o.id),
                      )
                    }
                  />
                  <OfficerMark officer={o} size="small" />
                  <span>
                    <strong>{tx(o.name)}</strong>
                    <small>
                      {tx(TROOP_LABELS[o.troopType])} · {o.stamina} {t('stamina')}
                    </small>
                  </span>
                  <b>{number(o.troops)}</b>
                </label>
              ))}
          </div>
          <div className="dispatch-summary">
            <span>
              <Shield size={16} />
              {number(
                state.officers
                  .filter((o) => marchOfficers.includes(o.id))
                  .reduce((s, o) => s + o.troops, 0),
              )}{' '}
              {t('troops')}
            </span>
            <span>
              <Wheat size={16} />
              {number(
                Math.ceil(
                  state.officers
                    .filter((o) => marchOfficers.includes(o.id))
                    .reduce((s, o) => s + o.troops, 0) * 0.65,
                ) + 200,
              )}{' '}
              {t('food')}
            </span>
          </div>
          <button
            className="primary-button full"
            disabled={!marchTarget || !marchOfficers.length}
            onClick={() => {
              if (
                execute({
                  type: 'march',
                  sourceId: city.id,
                  targetId: marchTarget,
                  officerIds: marchOfficers,
                })
              )
                setModal(null);
            }}
          >
            {t('Issue march order')}
            <ArrowRight size={17} />
          </button>
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
          title={tx(state.winner === player.id ? 'A realm united.' : 'Your banner falls.')}
          eyebrow={tx(state.winner === player.id ? 'THE MANDATE IS YOURS' : 'THE END OF A DYNASTY')}
          onClose={() => setModal('start')}
        >
          <div className="ending">
            <Crown size={54} />
            <p>
              {tx(
                state.winner === player.id
                  ? `${player.name} has brought the divided realm under one banner. A new chapter begins.`
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
  );
}
