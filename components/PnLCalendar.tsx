import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Calendar, Flame, Zap } from 'lucide-react';
import { Trade, TradeStatus } from '../types';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface DayData {
  date: string;         // YYYY-MM-DD
  pnl: number;
  tradeCount: number;
  wins: number;
  losses: number;
}

interface TooltipState {
  day: DayData;
  x: number;
  y: number;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa'];

/** Returns how many days are in a given month */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Returns 0=Sun … 6=Sat for the first day of a month */
function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Normalise P&L to a 1–5 intensity bucket */
function intensityBucket(pnl: number, maxAbs: number): 1 | 2 | 3 | 4 | 5 {
  if (maxAbs === 0) return 1;
  const ratio = Math.abs(pnl) / maxAbs;
  if (ratio < 0.15) return 1;
  if (ratio < 0.35) return 2;
  if (ratio < 0.60) return 3;
  if (ratio < 0.85) return 4;
  return 5;
}

/** Tailwind-safe colour strings for green / red buckets */
const GREEN_SHADES = [
  '',                                         // 0 = no trade
  'bg-emerald-900/60 border-emerald-700/40',  // 1 tiny win
  'bg-emerald-700/70 border-emerald-600/50',  // 2
  'bg-emerald-600/80 border-emerald-500/60',  // 3
  'bg-emerald-500    border-emerald-400/70',  // 4
  'bg-emerald-400    border-emerald-300/80',  // 5 huge win
];
const RED_SHADES = [
  '',
  'bg-rose-900/60   border-rose-700/40',
  'bg-rose-700/70   border-rose-600/50',
  'bg-rose-600/80   border-rose-500/60',
  'bg-rose-500      border-rose-400/70',
  'bg-rose-400      border-rose-300/80',
];

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────

function DayTooltip({ tip }: { tip: TooltipState }) {
  const { day, x, y } = tip;
  const d = new Date(day.date + 'T12:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const isGreen = day.pnl >= 0;

  return (
    <div
      className="fixed z-50 pointer-events-none bg-surface border border-surfaceHighlight rounded-lg shadow-2xl px-3 py-2.5 text-xs min-w-[160px]"
      style={{ left: x + 12, top: y - 10 }}
    >
      <p className="font-semibold text-text mb-1">{label}</p>
      <p className={`font-bold text-base ${isGreen ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isGreen ? '+' : ''}{day.pnl.toFixed(2)}
      </p>
      <p className="text-textMuted mt-1">{day.tradeCount} trade{day.tradeCount !== 1 ? 's' : ''} · {day.wins}W / {day.losses}L</p>
    </div>
  );
}

// ─── MONTH GRID ───────────────────────────────────────────────────────────────

interface MonthGridProps {
  year: number;
  month: number;
  dayMap: Map<string, DayData>;
  maxAbs: number;
  today: string;
  onHover: (tip: TooltipState | null) => void;
  onClickDay: (date: string) => void;
}

function MonthGrid({ year, month, dayMap, maxAbs, today, onHover, onClickDay }: MonthGridProps) {
  const totalDays  = daysInMonth(year, month);
  const startDay   = firstDayOfMonth(year, month);

  // Build cell array: nulls for leading blanks, then day numbers
  const cells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-surface border border-surfaceHighlight rounded-xl p-4">
      <p className="text-sm font-semibold text-text mb-3">{MONTH_NAMES[month]}</p>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[10px] text-textMuted font-medium">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`blank-${idx}`} />;

          const mm = String(month + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const dateStr = `${year}-${mm}-${dd}`;
          const data = dayMap.get(dateStr);
          const isToday = dateStr === today;

          let cellClass = 'bg-surfaceHighlight/20 border-surfaceHighlight/30';
          if (data) {
            const bucket = intensityBucket(data.pnl, maxAbs);
            cellClass = data.pnl >= 0 ? GREEN_SHADES[bucket] : RED_SHADES[bucket];
          }

          return (
            <div
              key={dateStr}
              className={`
                relative aspect-square rounded-sm border text-[10px] flex items-center justify-center
                transition-all duration-100
                ${cellClass}
                ${data ? 'cursor-pointer hover:ring-1 hover:ring-white/30 hover:brightness-110' : 'cursor-default'}
                ${isToday ? 'ring-1 ring-primary' : ''}
              `}
              onMouseEnter={data ? (e) => {
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                onHover({ day: data, x: rect.right, y: rect.top + window.scrollY });
              } : undefined}
              onMouseLeave={() => onHover(null)}
              onClick={() => data && onClickDay(dateStr)}
            >
              <span className={`select-none ${data ? 'text-white/80' : 'text-textMuted/40'}`}>
                {day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── LEGEND ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-textMuted">
      <span>Loss</span>
      {[5,4,3,2,1].map(i => (
        <div key={`r${i}`} className={`w-4 h-4 rounded-sm border ${RED_SHADES[i]}`} />
      ))}
      <div className="w-4 h-4 rounded-sm bg-surfaceHighlight/20 border border-surfaceHighlight/30" />
      {[1,2,3,4,5].map(i => (
        <div key={`g${i}`} className={`w-4 h-4 rounded-sm border ${GREEN_SHADES[i]}`} />
      ))}
      <span>Profit</span>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

interface PnLCalendarProps {
  trades: Trade[];
  onNavigateToDay?: (date: string) => void;
}

const PnLCalendar: React.FC<PnLCalendarProps> = ({ trades, onNavigateToDay }) => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const today = new Date().toISOString().split('T')[0];

  // ── Build daily P&L map from trades ──
  const dayMap = useMemo(() => {
    const map = new Map<string, DayData>();
    trades
      .filter(t => t.status === TradeStatus.CLOSED && t.pnl != null && t.date)
      .forEach(t => {
        const existing = map.get(t.date);
        if (existing) {
          existing.pnl        += t.pnl!;
          existing.tradeCount += 1;
          if ((t.pnl!) > 0) existing.wins++;
          else               existing.losses++;
        } else {
          map.set(t.date, {
            date:       t.date,
            pnl:        t.pnl!,
            tradeCount: 1,
            wins:       (t.pnl!) > 0 ? 1 : 0,
            losses:     (t.pnl!) <= 0 ? 1 : 0,
          });
        }
      });
    return map;
  }, [trades]);

  // ── Filter to current year for colour scaling ──
  const yearDays = useMemo(() =>
    Array.from(dayMap.values()).filter(d => d.date.startsWith(String(year))),
    [dayMap, year]
  );

  const maxAbs = useMemo(() =>
    yearDays.reduce((m, d) => Math.max(m, Math.abs(d.pnl)), 0),
    [yearDays]
  );

  // ── Year-level stats ──
  const stats = useMemo(() => {
    const tradingDays = yearDays.length;
    const greenDays   = yearDays.filter(d => d.pnl > 0).length;
    const redDays     = yearDays.filter(d => d.pnl < 0).length;
    const netPnl      = yearDays.reduce((s, d) => s + d.pnl, 0);
    const best        = yearDays.reduce<DayData | null>((b, d) => !b || d.pnl > b.pnl ? d : b, null);
    const worst       = yearDays.reduce<DayData | null>((w, d) => !w || d.pnl < w.pnl ? d : w, null);
    const winPct      = tradingDays > 0 ? Math.round((greenDays / tradingDays) * 100) : 0;

    // Current win streak
    const sorted = [...yearDays].sort((a, b) => b.date.localeCompare(a.date));
    let streak = 0;
    for (const d of sorted) {
      if (d.pnl > 0) streak++;
      else if (d.pnl < 0) { streak = streak > 0 ? streak : streak - 1; break; }
    }

    return { tradingDays, greenDays, redDays, netPnl, best, worst, winPct, streak };
  }, [yearDays]);

  const handleClickDay = (date: string) => {
    setTooltip(null);
    onNavigateToDay?.(date);
  };

  // ── Available years (range of trade data + current) ──
  const allYears = useMemo(() => {
    const ys = new Set<number>([currentYear]);
    dayMap.forEach((_, date) => ys.add(parseInt(date.slice(0, 4))));
    return Array.from(ys).sort((a, b) => b - a);
  }, [dayMap, currentYear]);

  return (
    <div className="space-y-6" onMouseLeave={() => setTooltip(null)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Calendar size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">P&amp;L Calendar</h2>
            <p className="text-sm text-textMuted">Daily performance heatmap</p>
          </div>
        </div>

        {/* Year navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(y => y - 1)}
            disabled={!allYears.includes(year - 1) && year - 1 < Math.min(...allYears)}
            className="p-2 rounded-lg text-textMuted hover:text-text hover:bg-surfaceHighlight transition-colors disabled:opacity-30"
          >
            <ChevronLeft size={18} />
          </button>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-surfaceHighlight border border-surfaceHighlight rounded-lg px-3 py-1.5 text-sm text-text font-semibold cursor-pointer"
          >
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setYear(y => y + 1)}
            disabled={year >= currentYear}
            className="p-2 rounded-lg text-textMuted hover:text-text hover:bg-surfaceHighlight transition-colors disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Net P&L',
            value: `${stats.netPnl >= 0 ? '+' : ''}$${stats.netPnl.toFixed(0)}`,
            sub: `${year}`,
            color: stats.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400',
            icon: stats.netPnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />,
          },
          {
            label: 'Trading Days',
            value: String(stats.tradingDays),
            sub: 'with closed trades',
            color: 'text-text',
            icon: <Calendar size={16} />,
          },
          {
            label: 'Win Rate',
            value: `${stats.winPct}%`,
            sub: `${stats.greenDays}G / ${stats.redDays}R`,
            color: stats.winPct >= 50 ? 'text-emerald-400' : 'text-rose-400',
            icon: <Zap size={16} />,
          },
          {
            label: 'Best Day',
            value: stats.best ? `+$${stats.best.pnl.toFixed(0)}` : '—',
            sub: stats.best ? stats.best.date : 'no data',
            color: 'text-emerald-400',
            icon: <TrendingUp size={16} />,
          },
          {
            label: 'Worst Day',
            value: stats.worst ? `$${stats.worst.pnl.toFixed(0)}` : '—',
            sub: stats.worst ? stats.worst.date : 'no data',
            color: 'text-rose-400',
            icon: <TrendingDown size={16} />,
          },
          {
            label: 'Win Streak',
            value: stats.streak > 0 ? `🔥 ${stats.streak}` : stats.streak < 0 ? `${Math.abs(stats.streak)}` : '—',
            sub: stats.streak > 0 ? 'green days' : stats.streak < 0 ? 'red days' : '',
            color: stats.streak > 0 ? 'text-emerald-400' : stats.streak < 0 ? 'text-rose-400' : 'text-textMuted',
            icon: <Flame size={16} />,
          },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-surfaceHighlight rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-textMuted mb-1">
              {s.icon}
              <span className="text-xs">{s.label}</span>
            </div>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-textMuted mt-0.5 truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <Legend />

      {/* Calendar grid — 12 months */}
      {stats.tradingDays === 0 ? (
        <div className="bg-surface border border-surfaceHighlight rounded-xl flex flex-col items-center justify-center py-20 gap-3">
          <Calendar size={40} className="text-textMuted opacity-30" />
          <p className="text-textMuted">No closed trades in {year}</p>
          <p className="text-xs text-textMuted opacity-60">Try a different year or add some trades</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, m) => (
            <MonthGrid
              key={m}
              year={year}
              month={m}
              dayMap={dayMap}
              maxAbs={maxAbs}
              today={today}
              onHover={setTooltip}
              onClickDay={handleClickDay}
            />
          ))}
        </div>
      )}

      {/* Floating tooltip */}
      {tooltip && <DayTooltip tip={tooltip} />}

      {onNavigateToDay && stats.tradingDays > 0 && (
        <p className="text-xs text-textMuted text-center opacity-60">
          Click any coloured day to open its journal entry
        </p>
      )}
    </div>
  );
};

export default PnLCalendar;
