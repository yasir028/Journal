import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import { Trade, TradeStatus } from '../types';
import {
  Target, TrendingUp, TrendingDown, Shield, AlertTriangle,
  CheckCircle, XCircle, Sliders, Filter
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────

interface TradingIntelligenceProps {
  trades: Trade[];
}

type SetupClassification = 'TRADE' | 'AVOID' | 'CAUTION' | 'INSUFFICIENT DATA';

interface SetupScore {
  setup: string;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  expectedValue: number;
  classification: SetupClassification;
}

interface EquityCurvePoint {
  date: string;
  actual: number;
  disciplined: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

const fmt = (n: number): string =>
  n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;

const classificationMeta: Record<SetupClassification, { label: string; bg: string; text: string }> = {
  'TRADE':             { label: 'TRADE',             bg: 'bg-success/15', text: 'text-success' },
  'AVOID':             { label: 'AVOID',             bg: 'bg-danger/15',  text: 'text-danger' },
  'CAUTION':           { label: 'CAUTION',           bg: 'bg-accent/15',  text: 'text-accent' },
  'INSUFFICIENT DATA': { label: 'INSUFFICIENT DATA', bg: 'bg-surfaceHighlight', text: 'text-textMuted' },
};

const classificationOrder: Record<SetupClassification, number> = {
  'TRADE': 0, 'CAUTION': 1, 'AVOID': 2, 'INSUFFICIENT DATA': 3,
};

// ── Component ───────────────────────────────────────────────────────

const TradingIntelligence: React.FC<TradingIntelligenceProps> = ({ trades }) => {
  // ── State ──
  const [maxLossesPerDay, setMaxLossesPerDay] = useState(2);
  const [maxTradesPerDay, setMaxTradesPerDay] = useState(3);

  const closedTrades = useMemo(
    () => trades.filter(t => t.status === TradeStatus.CLOSED && t.pnl !== undefined),
    [trades]
  );

  // All unique setups
  const allSetups = useMemo(() => {
    const s = new Set<string>();
    closedTrades.forEach(t => { if (t.setup) s.add(t.setup); });
    return Array.from(s).sort();
  }, [closedTrades]);

  const [enabledSetups, setEnabledSetups] = useState<Set<string>>(new Set(allSetups));

  // Keep enabledSetups in sync when allSetups changes
  React.useEffect(() => {
    setEnabledSetups(new Set(allSetups));
  }, [allSetups]);

  // ── Simulation logic ──

  // Group trades by date, sorted by entryTime within each day
  const tradesByDate = useMemo(() => {
    const map = new Map<string, Trade[]>();
    for (const t of closedTrades) {
      const list = map.get(t.date) || [];
      list.push(t);
      map.set(t.date, list);
    }
    // sort each day by entryTime
    for (const [, list] of map) {
      list.sort((a, b) => (a.entryTime || '00:00').localeCompare(b.entryTime || '00:00'));
    }
    return map;
  }, [closedTrades]);

  const sortedDates = useMemo(
    () => Array.from(tradesByDate.keys()).sort(),
    [tradesByDate]
  );

  // Rule 1: Stop after N losses per day
  const rule1Trades = useMemo(() => {
    const kept: Trade[] = [];
    for (const date of sortedDates) {
      const dayTrades = tradesByDate.get(date) || [];
      let lossCount = 0;
      for (const t of dayTrades) {
        if (lossCount >= maxLossesPerDay) break;
        kept.push(t);
        if ((t.pnl ?? 0) < 0) lossCount++;
      }
    }
    return kept;
  }, [tradesByDate, sortedDates, maxLossesPerDay]);

  // Rule 2: Only first N trades per day
  const rule2Trades = useMemo(() => {
    const kept: Trade[] = [];
    for (const date of sortedDates) {
      const dayTrades = tradesByDate.get(date) || [];
      kept.push(...dayTrades.slice(0, maxTradesPerDay));
    }
    return kept;
  }, [tradesByDate, sortedDates, maxTradesPerDay]);

  // Rule 3: Only trade enabled setups
  const rule3Trades = useMemo(
    () => closedTrades.filter(t => enabledSetups.has(t.setup)),
    [closedTrades, enabledSetups]
  );

  // Combined simulation: apply all 3 rules together
  const combinedTrades = useMemo(() => {
    const kept: Trade[] = [];
    for (const date of sortedDates) {
      const dayTrades = tradesByDate.get(date) || [];
      let lossCount = 0;
      let taken = 0;
      for (const t of dayTrades) {
        if (lossCount >= maxLossesPerDay) break;
        if (taken >= maxTradesPerDay) break;
        if (!enabledSetups.has(t.setup)) continue;
        kept.push(t);
        taken++;
        if ((t.pnl ?? 0) < 0) lossCount++;
      }
    }
    return kept;
  }, [tradesByDate, sortedDates, maxLossesPerDay, maxTradesPerDay, enabledSetups]);

  // ── PnL calculations ──
  const actualPnl = useMemo(
    () => closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0),
    [closedTrades]
  );

  const disciplinedPnl = useMemo(
    () => combinedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0),
    [combinedTrades]
  );

  const moneySaved = disciplinedPnl - actualPnl;
  const tradesAvoided = closedTrades.length - combinedTrades.length;

  // ── Equity curve data ──
  const equityCurve = useMemo((): EquityCurvePoint[] => {
    // Build a set of combined trade IDs for quick lookup
    const combinedIds = new Set(combinedTrades.map(t => t.id));

    // Walk through all trades chronologically
    const allSorted = [...closedTrades].sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) return dc;
      return (a.entryTime || '00:00').localeCompare(b.entryTime || '00:00');
    });

    let actualCum = 0;
    let discCum = 0;
    const points: EquityCurvePoint[] = [];
    const dateMap = new Map<string, { actual: number; disciplined: number }>();

    for (const t of allSorted) {
      actualCum += t.pnl ?? 0;
      if (combinedIds.has(t.id)) {
        discCum += t.pnl ?? 0;
      }
      dateMap.set(t.date, { actual: actualCum, disciplined: discCum });
    }

    for (const [date, vals] of dateMap) {
      points.push({
        date,
        actual: parseFloat(vals.actual.toFixed(2)),
        disciplined: parseFloat(vals.disciplined.toFixed(2)),
      });
    }

    return points;
  }, [closedTrades, combinedTrades]);

  // ── Setup Scorecard ──
  const setupScores = useMemo((): SetupScore[] => {
    const map = new Map<string, Trade[]>();
    for (const t of closedTrades) {
      const key = t.setup || 'Unknown';
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    }

    const scores: SetupScore[] = [];
    for (const [setup, sTrades] of map) {
      const count = sTrades.length;
      const wins = sTrades.filter(t => (t.pnl ?? 0) > 0).length;
      const losses = sTrades.filter(t => (t.pnl ?? 0) < 0).length;
      const winRate = count > 0 ? (wins / count) * 100 : 0;
      const totalPnl = sTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
      const avgPnl = count > 0 ? totalPnl / count : 0;

      const avgWin = wins > 0
        ? sTrades.filter(t => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0) / wins
        : 0;
      const avgLoss = losses > 0
        ? Math.abs(sTrades.filter(t => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0) / losses)
        : 0;
      const wr = winRate / 100;
      const expectedValue = (wr * avgWin) - ((1 - wr) * avgLoss);

      let classification: SetupClassification;
      if (count < 3) {
        classification = 'INSUFFICIENT DATA';
      } else if (winRate < 40 || totalPnl < -200) {
        classification = 'AVOID';
      } else if (winRate >= 50 && count >= 5 && totalPnl > 0) {
        classification = 'TRADE';
      } else {
        classification = 'CAUTION';
      }

      scores.push({ setup, count, wins, losses, winRate, totalPnl, avgPnl, expectedValue, classification });
    }

    scores.sort((a, b) => classificationOrder[a.classification] - classificationOrder[b.classification]);
    return scores;
  }, [closedTrades]);

  // ── Toggle setup ──
  const toggleSetup = (setup: string) => {
    setEnabledSetups(prev => {
      const next = new Set(prev);
      if (next.has(setup)) next.delete(setup);
      else next.add(setup);
      return next;
    });
  };

  // ── Custom tooltip ──
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg border px-3 py-2 text-xs shadow-lg"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      >
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {fmt(p.value)}
          </p>
        ))}
      </div>
    );
  };

  // ── Render ──
  if (closedTrades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-textMuted">
        <Target size={48} className="mb-4 opacity-40" />
        <p className="text-lg font-medium">No closed trades yet</p>
        <p className="text-sm mt-1">Complete some trades to unlock Trading Intelligence.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">

      {/* ══════════════════════════════════════════════════════════════
          SECTION 1 — WHAT-IF SIMULATOR
          ══════════════════════════════════════════════════════════ */}
      <section>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-primary/15">
            <Sliders size={22} className="text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">What-If Simulator</h2>
            <p className="text-sm text-textMuted">See how discipline changes your bottom line</p>
          </div>
        </div>

        {/* Controls — two cards side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

          {/* Left card — sliders */}
          <div className="bg-surface border border-surfaceHighlight rounded-xl p-5 space-y-5">
            {/* Max losses */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text flex items-center gap-2">
                  <Shield size={15} className="text-danger" />
                  Max losses per day
                </label>
                <span className="text-sm font-bold text-primary tabular-nums">{maxLossesPerDay}</span>
              </div>
              <input
                type="range"
                min={1} max={5} step={1}
                value={maxLossesPerDay}
                onChange={e => setMaxLossesPerDay(Number(e.target.value))}
                className="w-full accent-primary h-2 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-textMuted mt-1">
                <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
              </div>
            </div>

            {/* Max trades */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text flex items-center gap-2">
                  <Target size={15} className="text-accent" />
                  Max trades per day
                </label>
                <span className="text-sm font-bold text-primary tabular-nums">{maxTradesPerDay}</span>
              </div>
              <input
                type="range"
                min={1} max={10} step={1}
                value={maxTradesPerDay}
                onChange={e => setMaxTradesPerDay(Number(e.target.value))}
                className="w-full accent-primary h-2 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-textMuted mt-1">
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Right card — setup filter */}
          <div className="bg-surface border border-surfaceHighlight rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-text flex items-center gap-2">
                <Filter size={15} className="text-primary" />
                Setup Filter
              </p>
              <button
                onClick={() => {
                  if (enabledSetups.size === allSetups.length) setEnabledSetups(new Set());
                  else setEnabledSetups(new Set(allSetups));
                }}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {enabledSetups.size === allSetups.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
              {allSetups.map(setup => (
                <label
                  key={setup}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                    enabledSetups.has(setup)
                      ? 'bg-primary/10 text-text'
                      : 'bg-surfaceHighlight/40 text-textMuted line-through'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={enabledSetups.has(setup)}
                    onChange={() => toggleSetup(setup)}
                    className="accent-primary rounded"
                  />
                  {setup}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* KPI summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KPICard
            label="Actual PnL"
            value={fmt(actualPnl)}
            color={actualPnl >= 0 ? 'text-success' : 'text-danger'}
            icon={actualPnl >= 0 ? TrendingUp : TrendingDown}
          />
          <KPICard
            label="Disciplined PnL"
            value={fmt(disciplinedPnl)}
            color={disciplinedPnl >= 0 ? 'text-success' : 'text-danger'}
            icon={Shield}
          />
          <KPICard
            label="Money Saved"
            value={fmt(moneySaved)}
            color={moneySaved >= 0 ? 'text-success' : 'text-danger'}
            icon={CheckCircle}
          />
          <KPICard
            label="Trades Avoided"
            value={String(tradesAvoided)}
            color="text-primary"
            icon={XCircle}
          />
        </div>

        {/* Equity curve comparison chart */}
        <div className="bg-surface border border-surfaceHighlight rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text mb-4">Equity Curve Comparison</h3>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={equityCurve} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--danger)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDisciplined" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                stroke="var(--text-muted)"
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                stroke="var(--text-muted)"
                tickFormatter={(v: number) => `$${v}`}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }}
              />
              <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="var(--danger)"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="url(#gradActual)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="disciplined"
                name="Disciplined"
                stroke="var(--success)"
                strokeWidth={2}
                fill="url(#gradDisciplined)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 2 — SETUP SCORECARD
          ══════════════════════════════════════════════════════════ */}
      <section>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-accent/15">
            <Target size={22} className="text-accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">Setup Scorecard</h2>
            <p className="text-sm text-textMuted">Know your edge</p>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {setupScores.map(score => (
            <SetupCard key={score.setup} score={score} />
          ))}
        </div>
      </section>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
}

const KPICard: React.FC<KPICardProps> = ({ label, value, color, icon: Icon }) => (
  <div className="bg-surface border border-surfaceHighlight rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2">
      <Icon size={15} className={color} />
      <span className="text-xs text-textMuted">{label}</span>
    </div>
    <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
  </div>
);

interface SetupCardProps {
  score: SetupScore;
}

const SetupCard: React.FC<SetupCardProps> = ({ score }) => {
  const meta = classificationMeta[score.classification];
  const pnlColor = score.totalPnl >= 0 ? 'text-success' : 'text-danger';
  const evColor = score.expectedValue >= 0 ? 'text-success' : 'text-danger';

  return (
    <div className="bg-surface border border-surfaceHighlight rounded-xl p-5 space-y-3">
      {/* Setup name + badge */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-text">{score.setup}</h3>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
          {meta.label}
        </span>
      </div>

      {/* Win rate bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-textMuted">Win Rate</span>
          <span className="font-semibold text-text">{score.winRate.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full bg-surfaceHighlight overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(score.winRate, 100)}%`,
              backgroundColor:
                score.winRate >= 50 ? 'var(--success)' :
                score.winRate >= 40 ? 'var(--accent)' :
                'var(--danger)',
            }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
        <div>
          <span className="text-textMuted">Total PnL</span>
          <p className={`font-semibold ${pnlColor}`}>{fmt(score.totalPnl)}</p>
        </div>
        <div>
          <span className="text-textMuted">Trades</span>
          <p className="font-semibold text-text">{score.count}</p>
        </div>
        <div>
          <span className="text-textMuted">Avg PnL / Trade</span>
          <p className={`font-semibold ${score.avgPnl >= 0 ? 'text-success' : 'text-danger'}`}>
            {fmt(score.avgPnl)}
          </p>
        </div>
        <div>
          <span className="text-textMuted">Expected Value</span>
          <p className={`font-semibold ${evColor}`}>{fmt(score.expectedValue)}</p>
        </div>
      </div>

      {/* Win / Loss count */}
      <div className="flex items-center gap-3 text-xs text-textMuted pt-1 border-t border-surfaceHighlight">
        <span className="flex items-center gap-1">
          <CheckCircle size={12} className="text-success" />
          {score.wins}W
        </span>
        <span className="flex items-center gap-1">
          <XCircle size={12} className="text-danger" />
          {score.losses}L
        </span>
      </div>
    </div>
  );
};

export default TradingIntelligence;
