import React, { useState, useMemo } from 'react';
import {
  CheckCircle2, XCircle, Plus, Trash2, ShieldCheck, Flame,
  Edit3, Check, X, Settings2, RotateCcw, Clock, DollarSign,
  BookMarked, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Rule, RuleCheck, RuleSettings, Trade, TradeStatus } from '../types';

// ─── HELPERS ────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatCondition(rule: Rule): string {
  if (!rule.condition_type) return '—';
  if (rule.condition_type === 'time') return rule.condition_value || '';
  if (rule.condition_type === 'dollar') return `$${rule.condition_value || '0'}`;
  if (rule.condition_type === 'boolean') return '100%';
  return '—';
}

function ruleIcon(rule: Rule) {
  if (rule.id === 'sys_playbook')      return <BookMarked size={14} className="text-textMuted" />;
  if (rule.id === 'sys_stoploss')      return <AlertTriangle size={14} className="text-textMuted" />;
  if (rule.id === 'sys_maxloss_trade') return <DollarSign size={14} className="text-textMuted" />;
  if (rule.id === 'sys_maxloss_day')   return <DollarSign size={14} className="text-textMuted" />;
  if (rule.id === 'sys_start_day')     return <Clock size={14} className="text-textMuted" />;
  return null;
}

// ─── AUTO-EVAL SYSTEM RULES FROM TRADE DATA ─────────────────────────────────
function autoEvalSystemRules(
  rules: Rule[],
  trades: Trade[],
  manualChecks: RuleCheck[],   // already-stored manual/sys_start_day checks
): RuleCheck[] {
  const AUTO_IDS = ['sys_playbook', 'sys_stoploss', 'sys_maxloss_trade', 'sys_maxloss_day'];
  const activeAutoRules = rules.filter(r => r.rule_type === 'system' && r.active === 1 && AUTO_IDS.includes(r.id));
  if (activeAutoRules.length === 0) return manualChecks;

  const closedTrades = trades.filter(t => t.status === TradeStatus.CLOSED);
  const tradeDates   = [...new Set(closedTrades.map(t => t.date))];

  const computed: RuleCheck[] = [...manualChecks];

  tradeDates.forEach(date => {
    const dayTrades = closedTrades.filter(t => t.date === date);
    if (dayTrades.length === 0) return;

    activeAutoRules.forEach(rule => {
      // Don't override an existing DB check
      if (computed.find(c => c.date === date && c.rule_id === rule.id)) return;

      const limit = parseFloat(rule.condition_value || '0');
      let followed = false;

      if (rule.id === 'sys_playbook') {
        followed = dayTrades.every(t => !!t.playbookId);
      } else if (rule.id === 'sys_stoploss') {
        followed = dayTrades.every(t => t.stopLoss != null && Number(t.stopLoss) > 0);
      } else if (rule.id === 'sys_maxloss_trade') {
        followed = dayTrades.every(t => (t.pnl || 0) >= -limit);
      } else if (rule.id === 'sys_maxloss_day') {
        const dayPnl = dayTrades.reduce((a, t) => a + (t.pnl || 0), 0);
        followed = dayPnl >= -limit;
      }

      computed.push({ id: `_auto_${date}_${rule.id}`, date, rule_id: rule.id, followed: followed ? 1 : 0 });
    });
  });

  return computed;
}

// ─── HEATMAP GRID BUILDER ────────────────────────────────────────────────────
function buildHeatmapGrid(numWeeks = 14) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Anchor to Sunday of the current week
  const endSunday = new Date(today);
  endSunday.setDate(today.getDate() - today.getDay());

  const startSunday = new Date(endSunday);
  startSunday.setDate(endSunday.getDate() - (numWeeks - 1) * 7);

  const weeks: Array<Array<{ date: string; isFuture: boolean }>> = [];

  for (let w = 0; w < numWeeks; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(startSunday);
      cell.setDate(startSunday.getDate() + w * 7 + d);
      cell.setHours(12, 0, 0, 0);
      week.push({ date: cell.toISOString().split('T')[0], isFuture: cell > today });
    }
    weeks.push(week);
  }

  // Month labels — find first week each month appears
  const monthLabels: { label: string; weekIdx: number }[] = [];
  weeks.forEach((week, i) => {
    const m = parseInt(week[0].date.split('-')[1]) - 1;
    const prev = i > 0 ? parseInt(weeks[i - 1][0].date.split('-')[1]) - 1 : -1;
    if (m !== prev) monthLabels.push({ label: MONTH_NAMES[m], weekIdx: i });
  });

  return { weeks, monthLabels };
}

// ─── PROPS ───────────────────────────────────────────────────────────────────
interface RuleTrackerProps {
  rules: Rule[];
  ruleChecks: RuleCheck[];
  ruleSettings: RuleSettings;
  trades: Trade[];
  onAddRule: (rule: Rule) => void;
  onUpdateRule: (rule: Rule) => void;
  onDeleteRule: (id: string) => void;
  onToggleCheck: (check: RuleCheck) => void;
  onUpdateSettings: (s: RuleSettings) => void;
  onResetProgress: () => void;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const RuleTracker: React.FC<RuleTrackerProps> = ({
  rules, ruleChecks, ruleSettings, trades,
  onAddRule, onUpdateRule, onDeleteRule,
  onToggleCheck, onUpdateSettings, onResetProgress,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayStr());

  // Modal draft state
  const [draftDays, setDraftDays]   = useState<string[]>(ruleSettings.trading_days);
  const [draftRules, setDraftRules] = useState<Rule[]>([]);
  const [newManualText, setNewManualText] = useState('');

  const openModal = () => {
    setDraftDays(ruleSettings.trading_days);
    setDraftRules(rules.map(r => ({ ...r })));
    setNewManualText('');
    setModalOpen(true);
  };

  // ── All checks (DB + auto-eval) ──────────────────────────────────
  const allChecks = useMemo(
    () => autoEvalSystemRules(rules, trades, ruleChecks),
    [rules, ruleChecks, trades]
  );

  const activeRules  = useMemo(() => rules.filter(r => r.active === 1), [rules]);
  const manualActive = useMemo(() => activeRules.filter(r => r.rule_type === 'manual' || r.id === 'sys_start_day'), [activeRules]);

  // ── Per-date helper ──────────────────────────────────────────────
  const checksForDate = (date: string) => allChecks.filter(c => c.date === date);

  const dayScore = (date: string) => {
    if (activeRules.length === 0) return null;
    const dc = checksForDate(date);
    if (dc.length === 0) return null;
    const followed = activeRules.filter(r => dc.find(c => c.rule_id === r.id && c.followed === 1)).length;
    return { followed, total: activeRules.length, pct: Math.round((followed / activeRules.length) * 100) };
  };

  // ── TODAY stats ─────────────────────────────────────────────────
  const todayScore = useMemo(() => dayScore(todayStr()), [allChecks, activeRules]);

  // ── Current streak ──────────────────────────────────────────────
  const currentStreak = useMemo(() => {
    if (activeRules.length === 0) return 0;
    let streak = 0;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const dayName = DAY_NAMES[d.getDay()];
      // Skip non-trading days in settings
      const shortDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      if (!ruleSettings.trading_days.includes(shortDay)) continue;
      const sc = dayScore(dStr);
      if (!sc || sc.followed === 0) break;
      streak++;
    }
    return streak;
  }, [allChecks, activeRules, ruleSettings]);

  // ── Period score (avg follow % across all checked days) ─────────
  const periodScore = useMemo(() => {
    const scoredDays = [...new Set(allChecks.map(c => c.date))];
    if (scoredDays.length === 0) return null;
    const total = scoredDays.reduce((acc, d) => {
      const sc = dayScore(d);
      return acc + (sc ? sc.pct : 0);
    }, 0);
    return Math.round(total / scoredDays.length);
  }, [allChecks, activeRules]);

  // ── Heatmap ─────────────────────────────────────────────────────
  const { weeks, monthLabels } = useMemo(() => buildHeatmapGrid(14), []);

  const heatPct = (date: string) => {
    if (!date) return null;
    const sc = dayScore(date);
    return sc;
  };

  const heatColor = (pct: number | null, isFuture: boolean) => {
    if (isFuture) return 'bg-transparent border border-surfaceHighlight/30';
    if (pct === null) return 'bg-surfaceHighlight/40';
    if (pct >= 80) return 'bg-green-500';
    if (pct >= 60) return 'bg-green-500/60';
    if (pct >= 40) return 'bg-yellow-500/60';
    if (pct > 0)   return 'bg-red-500/50';
    return 'bg-red-500/30';
  };

  // ── Per-rule stats ───────────────────────────────────────────────
  const ruleStats = useMemo(() => {
    const closedTrades = trades.filter(t => t.status === TradeStatus.CLOSED);
    return activeRules.map(rule => {
      const rc = allChecks.filter(c => c.rule_id === rule.id);
      const followed = rc.filter(c => c.followed === 1);
      const followRate = rc.length > 0 ? Math.round((followed.length / rc.length) * 100) : null;

      // Streak for this rule
      let streak = 0;
      const today = new Date(); today.setHours(12,0,0,0);
      for (let i = 0; i < 365; i++) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        const chk = rc.find(c => c.date === dStr);
        if (!chk) break;
        if (chk.followed === 1) streak++;
        else break;
      }

      // Avg daily P&L across all logged days
      const loggedDays = [...new Set(rc.map(c => c.date))];
      const avgPerf = loggedDays.length > 0
        ? loggedDays.reduce((acc, d) => {
            const dayPnl = closedTrades.filter(t => t.date === d).reduce((s, t) => s + (t.pnl || 0), 0);
            return acc + dayPnl;
          }, 0) / loggedDays.length
        : null;

      return { rule, followRate, streak, avgPerf, totalChecked: rc.length };
    });
  }, [activeRules, allChecks, trades]);

  // ── Manual rule checklist helpers ───────────────────────────────
  const isFollowed = (ruleId: string) =>
    checksForDate(selectedDate).some(c => c.rule_id === ruleId && c.followed === 1);
  const isLogged   = (ruleId: string) =>
    ruleChecks.some(c => c.date === selectedDate && c.rule_id === ruleId);

  const handleToggle = (ruleId: string, followed: boolean) => {
    const existing = ruleChecks.find(c => c.date === selectedDate && c.rule_id === ruleId);
    onToggleCheck({
      id: existing?.id ?? `${selectedDate}_${ruleId}`,
      date: selectedDate,
      rule_id: ruleId,
      followed: followed ? 1 : 0,
    });
  };

  // ── Modal save ───────────────────────────────────────────────────
  const handleModalSave = () => {
    // 1. Save trading days
    onUpdateSettings({ trading_days: draftDays });

    // 2. Diff rules against originals and persist
    draftRules.forEach(dr => {
      const orig = rules.find(r => r.id === dr.id);
      if (!orig) {
        // New manual rule
        onAddRule(dr);
      } else if (
        orig.active !== dr.active ||
        orig.text !== dr.text ||
        orig.condition_value !== dr.condition_value
      ) {
        onUpdateRule(dr);
      }
    });

    // 3. Delete manual rules removed in draft
    rules
      .filter(r => r.rule_type === 'manual')
      .forEach(r => {
        if (!draftRules.find(dr => dr.id === r.id)) onDeleteRule(r.id);
      });

    setModalOpen(false);
  };

  const addDraftManualRule = () => {
    if (!newManualText.trim()) return;
    const newRule: Rule = {
      id: Date.now().toString(),
      text: newManualText.trim(),
      active: 1,
      rule_type: 'manual',
      condition_type: null,
      condition_value: null,
    };
    setDraftRules(prev => [...prev, newRule]);
    setNewManualText('');
  };

  const streakEmoji = currentStreak === 0 ? '😐' : currentStreak >= 5 ? '🔥' : '💪';

  // ─── RENDER ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── PAGE HEADER ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text flex items-center gap-2">
            <ShieldCheck size={24} className="text-primary" /> Progress Tracker
          </h2>
          <p className="text-textMuted text-sm mt-0.5">Build consistency by tracking your trading rules daily</p>
        </div>
      </div>

      {/* ── TOP ROW: stats + heatmap ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">

        {/* Stat cards */}
        <div className="flex flex-col gap-3">
          {/* Streak */}
          <div className="bg-surface border border-surfaceHighlight rounded-xl p-4">
            <p className="text-xs text-textMuted uppercase tracking-wide mb-1">Current streak</p>
            <p className="text-3xl font-bold text-text">
              {currentStreak} {currentStreak === 1 ? 'day' : 'days'} {streakEmoji}
            </p>
          </div>

          {/* Period score */}
          <div className="bg-surface border border-surfaceHighlight rounded-xl p-4 flex flex-col items-center justify-center gap-2">
            <p className="text-xs text-textMuted uppercase tracking-wide self-start">Current period score</p>
            {periodScore !== null ? (
              <>
                <div className="relative w-20 h-10 overflow-hidden">
                  <svg viewBox="0 0 36 18" className="w-full h-full">
                    <path d="M2 18 A16 16 0 0 1 34 18" fill="none" stroke="var(--surface-highlight)" strokeWidth="3.5" strokeLinecap="round"/>
                    <path
                      d="M2 18 A16 16 0 0 1 34 18"
                      fill="none"
                      stroke={periodScore >= 70 ? '#22c55e' : periodScore >= 40 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray={`${(periodScore / 100) * 50.3} 50.3`}
                    />
                  </svg>
                </div>
                <p className="text-xl font-bold text-text -mt-1">{periodScore}%</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-textMuted">--</p>
            )}
          </div>

          {/* Today's progress */}
          <div className="bg-surface border border-surfaceHighlight rounded-xl p-4">
            <p className="text-xs text-textMuted uppercase tracking-wide mb-2">Today's progress</p>
            <p className="text-2xl font-bold text-text mb-2">
              {todayScore ? `${todayScore.followed}/${todayScore.total}` : `0/${activeRules.length}`}
            </p>
            <div className="w-full bg-surfaceHighlight h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${todayScore ? todayScore.pct : 0}%`,
                  backgroundColor: todayScore && todayScore.pct >= 70 ? '#22c55e' : todayScore && todayScore.pct >= 40 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className="bg-surface border border-surfaceHighlight rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-textMuted uppercase tracking-wide">Progress tracker</p>
            <button
              onClick={() => setSelectedDate(todayStr())}
              className="text-xs font-medium px-3 py-1 bg-surfaceHighlight hover:bg-surface border border-surfaceHighlight rounded-lg text-text transition-colors"
            >
              Today
            </button>
          </div>

          {/* Month labels */}
          <div className="flex mb-1 pl-8">
            {weeks.map((_, wi) => {
              const ml = monthLabels.find(m => m.weekIdx === wi);
              return (
                <div key={wi} className="flex-1 text-[9px] text-textMuted">
                  {ml ? ml.label : ''}
                </div>
              );
            })}
          </div>

          {/* Grid: rows = day-of-week, cols = weeks */}
          <div className="flex gap-1">
            {/* Day labels */}
            <div className="flex flex-col gap-1 mr-1 justify-around">
              {DAY_SHORT.map((d, i) => (
                <div key={i} className={`text-[9px] text-textMuted w-5 text-right leading-4 ${[1,3,5].includes(i) ? '' : 'invisible'}`}>
                  {d}
                </div>
              ))}
            </div>

            {/* Week columns */}
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1 flex-1">
                {week.map((cell, di) => {
                  const sc = heatPct(cell.date);
                  const pct = sc ? sc.pct : null;
                  return (
                    <button
                      key={di}
                      title={`${cell.date}${sc ? `: ${sc.followed}/${sc.total} rules (${sc.pct}%)` : ': No data'}`}
                      onClick={() => !cell.isFuture && setSelectedDate(cell.date)}
                      className={`h-4 rounded-sm transition-all border-2 ${
                        cell.date === selectedDate ? 'border-primary' : 'border-transparent'
                      } ${heatColor(pct, cell.isFuture)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 mt-2 text-[9px] text-textMuted justify-end">
            <span>Less</span>
            {['bg-surfaceHighlight/40','bg-red-500/30','bg-yellow-500/60','bg-green-500/60','bg-green-500'].map(c => (
              <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>

      {/* ── DAILY CHECKLIST (manual rules only) ─────────────────── */}
      <div className="bg-surface border border-surfaceHighlight rounded-xl overflow-hidden">
        <div className="p-4 border-b border-surfaceHighlight flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-text">Daily Checklist</h3>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-xs bg-surfaceHighlight border border-transparent rounded-lg px-2 py-1 text-textMuted focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <span className="text-xs text-textMuted">{manualActive.length} manual rules</span>
        </div>

        {manualActive.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="w-16 h-16 opacity-30">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="8" width="44" height="52" rx="4" stroke="currentColor" strokeWidth="3" className="text-textMuted"/>
                <rect x="20" y="18" width="24" height="3" rx="1.5" fill="currentColor" className="text-textMuted"/>
                <rect x="20" y="26" width="18" height="3" rx="1.5" fill="currentColor" className="text-textMuted"/>
                <rect x="20" y="34" width="20" height="3" rx="1.5" fill="currentColor" className="text-textMuted"/>
                <rect x="20" y="42" width="14" height="3" rx="1.5" fill="currentColor" className="text-textMuted"/>
              </svg>
            </div>
            <p className="font-semibold text-text">No active rules today</p>
            <p className="text-xs text-textMuted max-w-[220px]">
              To change that, open <strong>Edit rules</strong> and add a manual rule or enable a system rule.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surfaceHighlight/50">
            {manualActive.map(rule => {
              const logged   = isLogged(rule.id);
              const followed = isFollowed(rule.id);
              return (
                <div key={rule.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surfaceHighlight/20 transition-colors">
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(rule.id, true)}
                      title="Followed"
                      className={`p-1.5 rounded-lg transition-colors ${
                        logged && followed
                          ? 'bg-green-500/20 text-success'
                          : 'text-textMuted hover:text-success hover:bg-green-500/10'
                      }`}
                    >
                      <CheckCircle2 size={18} />
                    </button>
                    <button
                      onClick={() => handleToggle(rule.id, false)}
                      title="Broke rule"
                      className={`p-1.5 rounded-lg transition-colors ${
                        logged && !followed
                          ? 'bg-red-500/20 text-danger'
                          : 'text-textMuted hover:text-danger hover:bg-red-500/10'
                      }`}
                    >
                      <XCircle size={18} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {ruleIcon(rule)}
                    <span className={`text-sm truncate ${logged && !followed ? 'line-through text-textMuted' : 'text-text'}`}>
                      {rule.text}
                    </span>
                    {rule.condition_value && (
                      <span className="text-xs text-textMuted bg-surfaceHighlight px-1.5 py-0.5 rounded font-mono shrink-0">
                        {formatCondition(rule)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── CURRENT RULES TABLE ─────────────────────────────────── */}
      <div className="bg-surface border border-surfaceHighlight rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-surfaceHighlight flex items-center justify-between">
          <h3 className="font-semibold text-text">Current rules</h3>
          <button
            onClick={openModal}
            className="flex items-center gap-2 text-sm font-medium text-text hover:text-primary border border-surfaceHighlight hover:border-primary/50 px-3 py-1.5 rounded-lg transition-all"
          >
            <Edit3 size={14} /> Edit rules
          </button>
        </div>

        {activeRules.length === 0 ? (
          <div className="px-5 py-10 text-center text-textMuted text-sm">
            No active rules. Click <strong>Edit rules</strong> to set up your first rule.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surfaceHighlight/30 text-textMuted text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left w-6"></th>
                  <th className="px-5 py-3 text-left">Rule</th>
                  <th className="px-5 py-3 text-center">Condition</th>
                  <th className="px-5 py-3 text-center">Rule Streak</th>
                  <th className="px-5 py-3 text-center">Avg Performance</th>
                  <th className="px-5 py-3 text-right">Follow Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surfaceHighlight/30">
                {ruleStats.map(({ rule, followRate, streak, avgPerf, totalChecked }) => {
                  const isOnStreak = streak > 0;
                  return (
                    <tr key={rule.id} className="hover:bg-surfaceHighlight/20 transition-colors">
                      {/* Status icon */}
                      <td className="px-4 py-3">
                        {isOnStreak
                          ? <CheckCircle2 size={16} className="text-success" />
                          : <XCircle size={16} className="text-danger/60" />}
                      </td>

                      {/* Rule name */}
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          {ruleIcon(rule)}
                          <span className="text-text font-medium">{rule.text}</span>
                          {rule.rule_type === 'system' && (
                            <span className="text-[9px] uppercase tracking-widest text-textMuted bg-surfaceHighlight px-1.5 py-0.5 rounded">auto</span>
                          )}
                        </div>
                      </td>

                      {/* Condition */}
                      <td className="px-5 py-3 text-center">
                        <span className="font-mono text-xs text-textMuted">{formatCondition(rule)}</span>
                      </td>

                      {/* Streak */}
                      <td className="px-5 py-3 text-center">
                        <span className={`flex items-center justify-center gap-1 text-sm font-semibold ${streak > 2 ? 'text-success' : 'text-textMuted'}`}>
                          {streak > 2 && <Flame size={13} />}
                          {streak}
                        </span>
                      </td>

                      {/* Avg performance */}
                      <td className="px-5 py-3 text-center font-mono text-xs">
                        {avgPerf !== null
                          ? <span className={avgPerf >= 0 ? 'text-success' : 'text-danger'}>{avgPerf >= 0 ? '+' : ''}${avgPerf.toFixed(2)}</span>
                          : <span className="text-textMuted">--</span>}
                      </td>

                      {/* Follow rate */}
                      <td className="px-5 py-3 text-right">
                        <span className={`font-semibold text-sm ${followRate !== null && followRate >= 70 ? 'text-success' : 'text-danger'}`}>
                          {followRate !== null ? `${followRate}%` : '0%'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── EDIT RULES MODAL ────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-surfaceHighlight rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surfaceHighlight shrink-0">
              <div>
                <h3 className="text-lg font-bold text-text">Rules</h3>
                <p className="text-xs text-textMuted mt-0.5">Changes will update your scoring for today and future days.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 text-textMuted hover:text-text hover:bg-surfaceHighlight rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

              {/* Trading days */}
              <div>
                <p className="text-sm font-semibold text-text mb-1">Trading days</p>
                <p className="text-xs text-textMuted mb-3">The days on which these rules should be active.</p>
                <div className="flex gap-2">
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => {
                    const active = draftDays.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => setDraftDays(prev =>
                          active ? prev.filter(d => d !== day) : [...prev, day]
                        )}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          active
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-surfaceHighlight/40 border-surfaceHighlight text-textMuted hover:border-primary/50'
                        }`}
                      >
                        {day.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* System rules */}
              <div>
                <p className="text-xs text-textMuted uppercase tracking-widest mb-3">System rules</p>
                <div className="space-y-3">
                  {draftRules.filter(r => r.rule_type === 'system').map(rule => {
                    const isOn = rule.active === 1;
                    return (
                      <div key={rule.id} className="flex items-start gap-3 p-3 bg-surfaceHighlight/20 rounded-xl border border-surfaceHighlight">
                        {/* Toggle */}
                        <button
                          onClick={() => setDraftRules(prev =>
                            prev.map(r => r.id === rule.id ? { ...r, active: isOn ? 0 : 1 } : r)
                          )}
                          className={`mt-0.5 w-10 h-5 rounded-full transition-all shrink-0 relative ${isOn ? 'bg-primary' : 'bg-surfaceHighlight'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${isOn ? 'left-[22px]' : 'left-0.5'}`} />
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {ruleIcon(rule)}
                            <p className="text-sm font-medium text-text">{rule.text}</p>
                          </div>

                          {/* Condition input */}
                          {isOn && rule.condition_type === 'time' && (
                            <input
                              type="time"
                              value={rule.condition_value || '09:30'}
                              onChange={e => setDraftRules(prev =>
                                prev.map(r => r.id === rule.id ? { ...r, condition_value: e.target.value } : r)
                              )}
                              className="mt-2 bg-background border border-surfaceHighlight rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:border-primary w-28"
                            />
                          )}
                          {isOn && rule.condition_type === 'dollar' && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-textMuted">Max loss $</span>
                              <input
                                type="number"
                                min="0"
                                value={rule.condition_value || '100'}
                                onChange={e => setDraftRules(prev =>
                                  prev.map(r => r.id === rule.id ? { ...r, condition_value: e.target.value } : r)
                                )}
                                className="w-24 bg-background border border-surfaceHighlight rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:border-primary"
                              />
                            </div>
                          )}
                          {isOn && rule.condition_type === 'boolean' && (
                            <p className="text-xs text-textMuted mt-1">100% — auto-evaluated from your trades</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Manual rules */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-textMuted uppercase tracking-widest">Manual rules</p>
                    <p className="text-[10px] text-textMuted mt-0.5">Added to your daily check-in list</p>
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  {draftRules.filter(r => r.rule_type === 'manual').map(rule => (
                    <div key={rule.id} className="flex items-center gap-2 p-2.5 bg-surfaceHighlight/20 rounded-lg border border-surfaceHighlight">
                      <button
                        onClick={() => setDraftRules(prev =>
                          prev.map(r => r.id === rule.id ? { ...r, active: rule.active === 1 ? 0 : 1 } : r)
                        )}
                        className={`w-8 h-4 rounded-full transition-all shrink-0 relative ${rule.active === 1 ? 'bg-primary' : 'bg-surfaceHighlight'}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${rule.active === 1 ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                      <span className="flex-1 text-sm text-text">{rule.text}</span>
                      <button
                        onClick={() => setDraftRules(prev => prev.filter(r => r.id !== rule.id))}
                        className="p-1 text-textMuted hover:text-danger rounded transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newManualText}
                    onChange={e => setNewManualText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addDraftManualRule()}
                    placeholder="Add a manual rule..."
                    className="flex-1 bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-sm text-text placeholder-textMuted focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={addDraftManualRule}
                    className="flex items-center gap-1.5 bg-surfaceHighlight hover:bg-primary hover:text-white text-text px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {/* Reset progress */}
              <div className="border border-red-500/20 rounded-xl p-4 bg-red-500/5">
                <p className="text-sm font-semibold text-text mb-0.5">Reset your progress tracker</p>
                <p className="text-xs text-textMuted mb-3">Start over with new rules, streak and habit building.</p>
                <button
                  onClick={() => {
                    if (window.confirm('This will delete ALL rule check history. Are you sure?')) {
                      onResetProgress();
                      setModalOpen(false);
                    }
                  }}
                  className="flex items-center gap-2 bg-danger/10 hover:bg-danger hover:text-white text-danger border border-danger/30 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                >
                  <RotateCcw size={14} /> Reset all progress
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-surfaceHighlight shrink-0">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-textMuted hover:text-text hover:bg-surfaceHighlight rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleModalSave}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RuleTracker;
