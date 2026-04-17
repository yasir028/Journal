
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import { Trade, TradeStatus, Playbook, RuleCheck, Rule, RuleSettings } from '../types';
import { ChevronLeft, ChevronRight, ChevronDown, Info, Calendar as CalendarIcon, BarChart2, AlertTriangle, Plus } from 'lucide-react';

interface DashboardProps {
  trades: Trade[];
  playbooks?: Playbook[];
  ruleChecks?: RuleCheck[];
  rules?: Rule[];
  ruleSettings?: RuleSettings;
  onNavigateToJournal?: (date: string) => void;
  onNavigateToRules?: () => void;
  onFilterTrades?: (type: 'symbol' | 'setup' | 'playbook' | 'emotion' | 'mistake', value: string) => void;
}

// Mini donut SVG component
const MiniDonut: React.FC<{ value: number; max?: number; color: string; size?: number }> = ({ value, max = 100, color, size = 40 }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} className="-rotate-90">
      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--surface-highlight)" strokeWidth="3.5" />
      <circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${pct * 0.88} 100`} strokeLinecap="round" />
    </svg>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ trades, playbooks = [], ruleChecks = [], rules = [], ruleSettings, onNavigateToJournal, onNavigateToRules, onFilterTrades }) => {
  // --- STATE ---
  const [viewDate, setViewDate] = useState(() => {
    if (trades.length > 0) {
      const sorted = [...trades].sort((a, b) => b.date.localeCompare(a.date));
      const [y, m, d] = sorted[0].date.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  });

  const [timeframe, setTimeframe] = useState<'month' | 'year' | 'all'>('month');
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [recentTab, setRecentTab] = useState<'recent' | 'open'>('recent');
  const monthPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(event.target as Node)) {
        setIsMonthPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- FILTERING ---
  const filteredTrades = useMemo(() => {
    if (timeframe === 'all') {
      return trades.filter(t => t.status === TradeStatus.CLOSED);
    }
    const targetYear = viewDate.getFullYear();
    const targetMonth = viewDate.getMonth();
    return trades.filter(t => {
      if (t.status !== TradeStatus.CLOSED) return false;
      const tDate = new Date(t.date + 'T12:00:00');
      const tYear = tDate.getFullYear();
      const tMonth = tDate.getMonth();
      if (timeframe === 'year') return tYear === targetYear;
      return tYear === targetYear && tMonth === targetMonth;
    });
  }, [trades, viewDate, timeframe]);

  // --- STATS ---
  const stats = useMemo(() => {
    const totalTrades = filteredTrades.length;
    const wins = filteredTrades.filter(t => (t.pnl || 0) > 0).length;
    const losses = filteredTrades.filter(t => (t.pnl || 0) <= 0).length;
    const totalPnl = filteredTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const totalR = filteredTrades.reduce((acc, t) => acc + (t.r || 0), 0);
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    const grossProfit = filteredTrades.filter(t => (t.pnl || 0) > 0).reduce((acc, t) => acc + (t.pnl || 0), 0);
    const grossLoss = Math.abs(filteredTrades.filter(t => (t.pnl || 0) < 0).reduce((acc, t) => acc + (t.pnl || 0), 0));
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 100 : 0) : grossProfit / grossLoss;

    // Day Win %
    const dailyPnlMap: Record<string, number> = {};
    filteredTrades.forEach(t => { dailyPnlMap[t.date] = (dailyPnlMap[t.date] || 0) + (t.pnl || 0); });
    const tradingDays = Object.keys(dailyPnlMap).length;
    const winningDays = Object.values(dailyPnlMap).filter(p => p > 0).length;
    const dayWinRate = tradingDays > 0 ? (winningDays / tradingDays) * 100 : 0;

    // Avg Win/Loss
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 1;
    const avgWinLoss = avgWin / avgLoss;

    // Cost of Mistakes
    const mistakesTrades = filteredTrades.filter(t => t.mistakes && t.mistakes.length > 0 && (t.pnl || 0) < 0);
    const costOfMistakes = Math.abs(mistakesTrades.reduce((acc, t) => acc + (t.pnl || 0), 0));

    return { totalTrades, wins, losses, totalPnl, winRate, totalR, profitFactor, dayWinRate, avgWinLoss, costOfMistakes, grossProfit, grossLoss };
  }, [filteredTrades]);

  // --- COMPOSITE PERFORMANCE SCORE ---
  const compositeScore = useMemo(() => {
    if (filteredTrades.length < 3) return null;
    const closed = filteredTrades;
    const winsList = closed.filter(t => (t.pnl || 0) > 0);
    const lossList = closed.filter(t => (t.pnl || 0) < 0);
    const grossProfit = winsList.reduce((a, t) => a + (t.pnl || 0), 0);
    const grossLoss = Math.abs(lossList.reduce((a, t) => a + (t.pnl || 0), 0));
    const totalPnl = closed.reduce((a, t) => a + (t.pnl || 0), 0);
    const winRate = (winsList.length / closed.length) * 100;
    const pf = grossLoss === 0 ? (grossProfit > 0 ? 3 : 0) : grossProfit / grossLoss;
    const avgWin = winsList.length > 0 ? grossProfit / winsList.length : 0;
    const avgLoss = lossList.length > 0 ? grossLoss / lossList.length : 1;

    const winScore = Math.min(100, Math.max(0, (winRate / 65) * 100));
    const pfScore = Math.min(100, Math.max(0, (Math.min(pf, 3) / 3) * 100));
    const rrRatio = avgWin / (avgLoss || 1);
    const rrScore = Math.min(100, Math.max(0, (Math.min(rrRatio, 3) / 3) * 100));

    let peak = 0, maxDD = 0, cum = 0;
    [...closed].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
      cum += (t.pnl || 0);
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDD) maxDD = dd;
    });
    const ddRatio = maxDD / (Math.abs(totalPnl) + maxDD || 1);
    const drawdownScore = Math.min(100, Math.max(0, (1 - ddRatio) * 100));

    const pnlVals = closed.map(t => t.pnl || 0);
    const avgPnl = pnlVals.reduce((a, b) => a + b, 0) / pnlVals.length;
    const stdDev = Math.sqrt(pnlVals.reduce((a, v) => a + Math.pow(v - avgPnl, 2), 0) / pnlVals.length);
    const cv = stdDev / (Math.abs(avgPnl) || 1);
    const consistScore = Math.min(100, Math.max(0, 100 - Math.min(cv * 25, 100)));

    const mistakeTrades = closed.filter(t => t.mistakes && t.mistakes.length > 0).length;
    const disciplineScore = Math.min(100, Math.max(0, ((closed.length - mistakeTrades) / closed.length) * 100));

    const overall = Math.round((winScore + pfScore + rrScore + drawdownScore + consistScore + disciplineScore) / 6);
    const scoreColor = overall >= 70 ? '#22c55e' : overall >= 45 ? '#f59e0b' : '#ef4444';

    return {
      overall, scoreColor,
      axes: [
        { subject: 'Win %', score: Math.round(winScore) },
        { subject: 'Consistency', score: Math.round(consistScore) },
        { subject: 'Prof. Factor', score: Math.round(pfScore) },
        { subject: 'Avg W/L', score: Math.round(rrScore) },
        { subject: 'Max Drawdown', score: Math.round(drawdownScore) },
        { subject: 'Recovery', score: Math.round(disciplineScore) },
      ],
    };
  }, [filteredTrades]);

  // --- EQUITY CURVE (Cumulative P&L) ---
  const equityData = useMemo(() => {
    let cumulative = 0;
    const sorted = [...filteredTrades].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map(t => {
      cumulative += (t.pnl || 0);
      return { date: t.date, pnl: cumulative };
    });
  }, [filteredTrades]);

  // --- PERIOD PERFORMANCE (Daily/Monthly Bars) ---
  const periodPerformanceData = useMemo(() => {
    if (timeframe === 'month') {
      const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
      const data = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayTrades = filteredTrades.filter(t => t.date === dateStr);
        const dailyPnl = dayTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
        data.push({ name: String(d), pnl: dailyPnl, fullDate: dateStr, count: dayTrades.length });
      }
      return data;
    } else if (timeframe === 'year') {
      const data = [];
      const year = viewDate.getFullYear();
      for (let m = 0; m < 12; m++) {
        const monthName = new Date(year, m, 1).toLocaleString('default', { month: 'short' });
        const monthTrades = filteredTrades.filter(t => { const d = new Date(t.date + 'T12:00:00'); return d.getMonth() === m; });
        const monthlyPnl = monthTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
        data.push({ name: monthName, pnl: monthlyPnl, count: monthTrades.length });
      }
      return data;
    } else {
      if (filteredTrades.length === 0) return [];
      const sorted = [...filteredTrades].sort((a, b) => a.date.localeCompare(b.date));
      const start = new Date(sorted[0].date);
      const end = new Date(sorted[sorted.length - 1].date);
      const data = [];
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      const endDate = new Date(end.getFullYear(), end.getMonth(), 1);
      while (current <= endDate) {
        const y = current.getFullYear();
        const m = current.getMonth();
        const label = current.toLocaleString('default', { month: 'short', year: '2-digit' });
        const monthTrades = filteredTrades.filter(t => { const d = new Date(t.date + 'T12:00:00'); return d.getFullYear() === y && d.getMonth() === m; });
        const pnl = monthTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
        data.push({ name: label, pnl, count: monthTrades.length });
        current.setMonth(current.getMonth() + 1);
      }
      return data;
    }
  }, [filteredTrades, timeframe, viewDate]);

  // --- DRAWDOWN DATA ---
  const drawdownData = useMemo(() => {
    let peak = 0, cum = 0;
    const sorted = [...filteredTrades].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map(t => {
      cum += (t.pnl || 0);
      if (cum > peak) peak = cum;
      return { date: t.date, drawdown: cum - peak };
    });
  }, [filteredTrades]);

  // --- ACCOUNT BALANCE (Cumulative over ALL closed trades) ---
  const accountBalanceData = useMemo(() => {
    let balance = 0;
    const allClosed = [...trades].filter(t => t.status === TradeStatus.CLOSED).sort((a, b) => a.date.localeCompare(b.date));
    // Aggregate by date
    const dateMap: Record<string, number> = {};
    allClosed.forEach(t => { dateMap[t.date] = (dateMap[t.date] || 0) + (t.pnl || 0); });
    return Object.entries(dateMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, pnl]) => {
      balance += pnl;
      return { date, balance };
    });
  }, [trades]);

  // --- RECENT TRADES / OPEN POSITIONS ---
  const recentTradesData = useMemo(() => {
    const recent = [...trades].filter(t => t.status === TradeStatus.CLOSED).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    const open = trades.filter(t => t.status === TradeStatus.OPEN);
    return { recent, open };
  }, [trades]);

  // --- PROGRESS TRACKER HEATMAP ---
  const progressData = useMemo(() => {
    // Build a heatmap of trading activity for the last ~14 weeks
    const today = new Date();
    const weeks = 14;
    const cells: Array<{ date: string; dayOfWeek: number; weekIdx: number; intensity: number }> = [];

    // Find the start: go back 'weeks' weeks from the most recent Sunday
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - startDate.getDay() - (weeks - 1) * 7);

    // Build daily P&L map from all closed trades
    const dailyPnl: Record<string, number> = {};
    trades.filter(t => t.status === TradeStatus.CLOSED).forEach(t => {
      dailyPnl[t.date] = (dailyPnl[t.date] || 0) + (t.pnl || 0);
    });

    // Also use ruleChecks for compliance data
    const dailyCompliance: Record<string, { followed: number; total: number }> = {};
    const activeRules = rules.filter(r => r.active);
    ruleChecks.forEach(c => {
      if (!dailyCompliance[c.date]) dailyCompliance[c.date] = { followed: 0, total: 0 };
      dailyCompliance[c.date].total++;
      if (c.followed) dailyCompliance[c.date].followed++;
    });

    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + w * 7 + d);
        const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;

        let intensity = 0;
        // Priority: rule compliance, then trading activity
        if (dailyCompliance[dateStr] && dailyCompliance[dateStr].total > 0) {
          intensity = dailyCompliance[dateStr].followed / dailyCompliance[dateStr].total;
        } else if (dailyPnl[dateStr] !== undefined) {
          intensity = dailyPnl[dateStr] > 0 ? 0.8 : dailyPnl[dateStr] < 0 ? 0.3 : 0.1;
        }

        cells.push({ date: dateStr, dayOfWeek: d, weekIdx: w, intensity });
      }
    }

    // Today's rule score
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayChecks = ruleChecks.filter(c => c.date === todayStr);
    const todayFollowed = todayChecks.filter(c => c.followed).length;

    // Get month labels for weeks
    const monthLabels: Array<{ label: string; weekIdx: number }> = [];
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(startDate.getDate() + w * 7);
      const m = cellDate.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ label: cellDate.toLocaleString('default', { month: 'short' }), weekIdx: w });
        lastMonth = m;
      }
    }

    return { cells, todayScore: todayFollowed, todayTotal: activeRules.length, monthLabels };
  }, [trades, ruleChecks, rules]);

  // --- CALENDAR ---
  const calendarData = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const monthTrades = trades.filter(t => {
      if (t.status !== TradeStatus.CLOSED) return false;
      const d = new Date(t.date + 'T12:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const map: Record<string, { pnl: number; count: number }> = {};
    let totalPnl = 0;
    let tradingDays = 0;
    monthTrades.forEach(t => {
      if (!map[t.date]) { map[t.date] = { pnl: 0, count: 0 }; tradingDays++; }
      map[t.date].pnl += (t.pnl || 0);
      map[t.date].count += 1;
      totalPnl += (t.pnl || 0);
    });
    return { map, totalPnl, count: monthTrades.length, tradingDays };
  }, [trades, viewDate]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { days, firstDay, year, month };
  };

  const { days, firstDay, year, month } = getDaysInMonth(viewDate);
  const monthName = viewDate.toLocaleString('default', { month: 'long' });

  const calendarWeeks = useMemo(() => {
    const weeks: Array<Array<{ day: number | null; dateStr: string }>> = [];
    let currentWeek: Array<{ day: number | null; dateStr: string }> = [];
    for (let i = 0; i < firstDay; i++) currentWeek.push({ day: null, dateStr: '' });
    for (let d = 1; d <= days; d++) {
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      currentWeek.push({ day: d, dateStr });
    }
    while (currentWeek.length < 7) currentWeek.push({ day: null, dateStr: '' });
    weeks.push(currentWeek);
    return weeks;
  }, [days, firstDay, year, month]);

  // --- HANDLERS ---
  const handleMonthSelect = (newMonthIndex: number) => { setViewDate(new Date(year, newMonthIndex, 1)); setIsMonthPickerOpen(false); };
  const handleNav = (inc: number) => {
    if (timeframe === 'month') setViewDate(new Date(year, month + inc, 1));
    else setViewDate(new Date(year + inc, month, 1));
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Heatmap color helper
  const getHeatColor = (intensity: number) => {
    if (intensity <= 0) return 'var(--surface-highlight)';
    if (intensity < 0.25) return 'rgba(59,130,246,0.2)';
    if (intensity < 0.5) return 'rgba(59,130,246,0.4)';
    if (intensity < 0.75) return 'rgba(59,130,246,0.6)';
    return 'rgba(59,130,246,0.85)';
  };

  return (
    <div className="space-y-6">

      {/* ═══════════════ HEADER CONTROLS ═══════════════ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-4 rounded-xl border border-surfaceHighlight">
        <div className="flex items-center gap-2 bg-surfaceHighlight p-1 rounded-lg">
          {(['month', 'year', 'all'] as const).map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${timeframe === tf ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}>
              {tf === 'month' ? 'Monthly' : tf === 'year' ? 'Yearly' : 'All Time'}
            </button>
          ))}
        </div>

        {timeframe !== 'all' && (
          <div className="flex items-center gap-4 relative">
            <button onClick={() => setViewDate(new Date())} className="text-xs font-medium px-3 py-1 rounded bg-surfaceHighlight hover:bg-surface border border-transparent hover:border-surfaceHighlight text-textMuted transition-colors uppercase tracking-wider">
              Current
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => handleNav(-1)} className="p-1.5 hover:bg-surfaceHighlight rounded-full text-text transition-colors"><ChevronLeft size={20} /></button>
              <div className="relative">
                <button onClick={() => setIsMonthPickerOpen(!isMonthPickerOpen)} className="text-xl font-bold text-text min-w-[140px] text-center hover:bg-surfaceHighlight rounded px-2 py-1 transition-colors flex items-center justify-center gap-2">
                  {timeframe === 'month' ? `${monthName} ${year}` : `${year}`} <ChevronDown size={16} className={`text-textMuted transition-transform ${isMonthPickerOpen ? 'rotate-180' : ''}`} />
                </button>
                {isMonthPickerOpen && (
                  <div ref={monthPickerRef} className="absolute top-full right-0 mt-2 bg-surface border border-surfaceHighlight rounded-xl shadow-2xl z-50 w-[280px] p-4">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-surfaceHighlight">
                      <span className="text-xs text-textMuted">Select Period</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {MONTHS.map((m, idx) => (
                        <button key={m} disabled={timeframe === 'year'} onClick={() => handleMonthSelect(idx)}
                          className={`text-sm py-2 rounded transition-colors ${idx === month ? 'bg-primary text-white' : 'text-textMuted hover:bg-surfaceHighlight'} ${timeframe === 'year' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                    {timeframe === 'year' && <p className="text-xs text-center mt-2 text-textMuted">Use arrows to change Year</p>}
                  </div>
                )}
              </div>
              <button onClick={() => handleNav(1)} className="p-1.5 hover:bg-surfaceHighlight rounded-full text-text transition-colors"><ChevronRight size={20} /></button>
            </div>
          </div>
        )}
        {timeframe === 'all' && (
          <div className="text-textMuted text-sm font-medium px-4">Showing metrics since inception</div>
        )}
      </div>

      {/* ═══════════════ STATS CARDS ROW ═══════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        {/* Net P&L */}
        <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-textMuted text-xs font-medium flex items-center gap-1">Net P&L <Info size={11} className="opacity-40" /> <span className="ml-1 bg-surfaceHighlight text-textMuted text-[10px] px-1.5 py-0.5 rounded-full">{stats.totalTrades}</span></p>
              <p className={`text-2xl font-bold mt-1.5 ${stats.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                ${stats.totalPnl.toLocaleString()}
              </p>
            </div>
            <MiniDonut value={stats.totalPnl >= 0 ? 75 : 25} color={stats.totalPnl >= 0 ? '#22c55e' : '#ef4444'} />
          </div>
        </div>

        {/* Trade Win % */}
        <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-textMuted text-xs font-medium flex items-center gap-1">Trade Win % <Info size={11} className="opacity-40" /></p>
              <p className="text-2xl font-bold mt-1.5 text-text">{stats.winRate.toFixed(1)}%</p>
            </div>
            <MiniDonut value={stats.winRate} color={stats.winRate >= 50 ? '#22c55e' : '#ef4444'} />
          </div>
          <div className="flex gap-1.5 mt-2">
            <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded">{stats.wins}</span>
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{stats.totalTrades - stats.wins - stats.losses}</span>
            <span className="text-[10px] bg-danger/10 text-danger px-1.5 py-0.5 rounded">{stats.losses}</span>
          </div>
        </div>

        {/* Profit Factor */}
        <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-textMuted text-xs font-medium flex items-center gap-1">Profit Factor <Info size={11} className="opacity-40" /></p>
              <p className="text-2xl font-bold mt-1.5 text-accent">{stats.profitFactor.toFixed(2)}</p>
            </div>
            <MiniDonut value={Math.min(stats.profitFactor, 3)} max={3} color="#8b5cf6" />
          </div>
        </div>

        {/* Day Win % */}
        <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-textMuted text-xs font-medium flex items-center gap-1">Day Win % <Info size={11} className="opacity-40" /></p>
              <p className="text-2xl font-bold mt-1.5 text-text">{stats.dayWinRate.toFixed(1)}%</p>
            </div>
            <MiniDonut value={stats.dayWinRate} color={stats.dayWinRate >= 50 ? '#22c55e' : '#f59e0b'} />
          </div>
        </div>

        {/* Avg Win/Loss */}
        <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
          <div>
            <p className="text-textMuted text-xs font-medium flex items-center gap-1">Avg Win/Loss <Info size={11} className="opacity-40" /></p>
            <p className="text-2xl font-bold mt-1.5 text-text">{stats.avgWinLoss.toFixed(2)}</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-surfaceHighlight h-1.5 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(stats.avgWinLoss / 4 * 100, 100)}%` }}></div>
            </div>
            <div className="flex gap-2 text-[10px]">
              <span className="text-success">${stats.grossProfit > 0 ? Math.round(stats.grossProfit / (stats.wins || 1)).toLocaleString() : '0'}</span>
              <span className="text-danger">-${stats.grossLoss > 0 ? Math.round(stats.grossLoss / (stats.losses || 1)).toLocaleString() : '0'}</span>
            </div>
          </div>
        </div>

        {/* Cost of Mistakes */}
        <div className="bg-red-500/5 p-5 rounded-xl border border-red-500/20 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-red-400/80 text-xs font-medium flex items-center gap-1"><AlertTriangle size={12} /> Cost of Mistakes</p>
              <p className="text-2xl font-bold text-danger mt-1.5">-${stats.costOfMistakes.toLocaleString()}</p>
              <p className="text-[10px] text-red-400/60 mt-1">Lost to errors</p>
            </div>
          </div>
        </div>

        {/* Total R */}
        <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-textMuted text-xs font-medium flex items-center gap-1">Total R <Info size={11} className="opacity-40" /></p>
              <p className={`text-2xl font-bold mt-1.5 ${stats.totalR >= 0 ? 'text-success' : 'text-danger'}`}>{stats.totalR.toFixed(1)}R</p>
            </div>
            <MiniDonut value={Math.abs(stats.totalR)} max={Math.max(Math.abs(stats.totalR), 10)} color={stats.totalR >= 0 ? '#22c55e' : '#ef4444'} />
          </div>
        </div>
      </div>

      {/* ═══════════════ MIDDLE ROW: Score | Progress | Cumulative ═══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Performance Score (Zella Score style) */}
        <div className="bg-surface rounded-xl border border-surfaceHighlight shadow-sm overflow-hidden">
          <div className="p-4 border-b border-surfaceHighlight flex items-center gap-2">
            <BarChart2 size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-text">Performance Score</h3>
            <Info size={12} className="text-textMuted opacity-40" />
          </div>
          <div className="p-4">
            {compositeScore ? (
              <>
                {/* Radar Chart */}
                <div className="h-[180px] -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={compositeScore.axes}>
                      <PolarGrid stroke="var(--surface-highlight)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                      <Radar name="Score" dataKey="score" stroke={compositeScore.scoreColor} fill={compositeScore.scoreColor} fillOpacity={0.2} strokeWidth={2} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)', fontSize: 12 }} formatter={(val: number) => [`${val}/100`, 'Score']} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                {/* Score Bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-textMuted">Your Score</span>
                    <span className="text-lg font-bold" style={{ color: compositeScore.scoreColor }}>{compositeScore.overall}</span>
                  </div>
                  <div className="relative w-full h-2 rounded-full overflow-hidden bg-surfaceHighlight">
                    <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(90deg, #ef4444 0%, #f59e0b 40%, #22c55e 70%, #22c55e 100%)' }} />
                    <div className="absolute inset-0 bg-surfaceHighlight rounded-full" style={{ left: `${compositeScore.overall}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-textMuted mt-1">
                    <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[240px] text-textMuted text-sm">
                Need 3+ trades for score
              </div>
            )}
          </div>
        </div>

        {/* Progress Tracker */}
        <div className="bg-surface rounded-xl border border-surfaceHighlight shadow-sm overflow-hidden">
          <div className="p-4 border-b border-surfaceHighlight flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-text">Progress Tracker</h3>
              <Info size={12} className="text-textMuted opacity-40" />
            </div>
            <span className="text-xs text-primary cursor-pointer hover:underline" onClick={() => onNavigateToRules && onNavigateToRules()}>View more</span>
          </div>
          <div className="p-4">
            {/* Month labels */}
            <div className="flex gap-0.5 mb-1 ml-8">
              {progressData.monthLabels.map((ml, i) => (
                <span key={i} className="text-[10px] text-textMuted" style={{ marginLeft: ml.weekIdx > 0 ? `${(ml.weekIdx - (i > 0 ? progressData.monthLabels[i-1].weekIdx : 0) - 1) * 14}px` : 0 }}>{ml.label}</span>
              ))}
            </div>
            {/* Heatmap Grid */}
            <div className="flex gap-1">
              <div className="flex flex-col gap-0.5 mr-1">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="h-3 flex items-center text-[9px] text-textMuted leading-none">{d}</div>
                ))}
              </div>
              <div className="grid gap-0.5" style={{ gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gridAutoColumns: '12px' }}>
                {progressData.cells.map((cell, idx) => (
                  <div key={idx} className="w-3 h-3 rounded-[2px] transition-colors" style={{ backgroundColor: getHeatColor(cell.intensity) }}
                    title={`${cell.date}: ${Math.round(cell.intensity * 100)}%`} />
                ))}
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-1 mt-3 justify-end">
              <span className="text-[10px] text-textMuted">Less</span>
              {[0, 0.2, 0.4, 0.6, 0.85].map((v, i) => (
                <div key={i} className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: getHeatColor(v) }} />
              ))}
              <span className="text-[10px] text-textMuted">More</span>
            </div>
            {/* Today's Score */}
            <div className="mt-4 pt-4 border-t border-surfaceHighlight flex items-center justify-between">
              <div>
                <p className="text-xs text-textMuted flex items-center gap-1">Today's score <Info size={10} className="opacity-40" /></p>
                <p className="text-2xl font-bold text-text">{progressData.todayScore}/{progressData.todayTotal}</p>
              </div>
              <button className="text-xs bg-surfaceHighlight hover:bg-primary/10 text-textMuted hover:text-primary px-3 py-1.5 rounded-lg transition-colors font-medium">
                Daily checklist
              </button>
            </div>
          </div>
        </div>

        {/* Daily Net Cumulative P&L */}
        <div className="bg-surface rounded-xl border border-surfaceHighlight shadow-sm overflow-hidden">
          <div className="p-4 border-b border-surfaceHighlight flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text">Daily Net Cumulative P&L</h3>
            <Info size={12} className="text-textMuted opacity-40" />
          </div>
          <div className="p-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="colorCumPnl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 9 }} tickMargin={8} minTickGap={40} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)', fontSize: 12 }} formatter={(val: number) => [`$${val.toLocaleString()}`, 'Cumulative P&L']} />
                <Area type="monotone" dataKey="pnl" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorCumPnl)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ═══════════════ THIRD ROW: Daily P&L | Recent Trades | Account Balance ═══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Net Daily P&L */}
        <div className="bg-surface rounded-xl border border-surfaceHighlight shadow-sm overflow-hidden">
          <div className="p-4 border-b border-surfaceHighlight flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text">Net Daily P&L</h3>
            <Info size={12} className="text-textMuted opacity-40" />
          </div>
          <div className="p-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={periodPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={9} interval={timeframe === 'month' ? 2 : 0} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <ReferenceLine y={0} stroke="var(--text-muted)" strokeOpacity={0.5} />
                <Tooltip cursor={{ fill: 'var(--surface-highlight)' }} contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)', fontSize: 12 }} />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                  {periodPerformanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Trades / Open Positions */}
        <div className="bg-surface rounded-xl border border-surfaceHighlight shadow-sm overflow-hidden">
          <div className="flex border-b border-surfaceHighlight">
            <button onClick={() => setRecentTab('recent')}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${recentTab === 'recent' ? 'text-primary border-b-2 border-primary' : 'text-textMuted hover:text-text'}`}>
              Recent Trades
            </button>
            <button onClick={() => setRecentTab('open')}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${recentTab === 'open' ? 'text-primary border-b-2 border-primary' : 'text-textMuted hover:text-text'}`}>
              Open Positions
            </button>
          </div>
          <div className="overflow-y-auto max-h-[280px]">
            <table className="w-full text-left">
              <tbody className="text-sm divide-y divide-surfaceHighlight/50">
                {(recentTab === 'recent' ? recentTradesData.recent : recentTradesData.open).map((t, idx) => (
                  <tr key={idx} className="hover:bg-surfaceHighlight/30 transition-colors">
                    <td className="px-4 py-2.5 text-textMuted text-xs">{t.date}</td>
                    <td className="px-4 py-2.5 text-text text-xs font-medium">{t.symbol}</td>
                    <td className={`px-4 py-2.5 text-right text-xs font-mono font-medium ${(t.pnl || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                      {(t.pnl || 0) >= 0 ? '+' : ''}${(t.pnl || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {(recentTab === 'recent' ? recentTradesData.recent : recentTradesData.open).length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-textMuted text-xs">No {recentTab === 'recent' ? 'recent trades' : 'open positions'}</td></tr>
                )}
              </tbody>
            </table>
            {recentTradesData.recent.length > 6 && recentTab === 'recent' && (
              <div className="text-center py-2 border-t border-surfaceHighlight">
                <span className="text-xs text-primary cursor-pointer hover:underline">View More</span>
              </div>
            )}
          </div>
        </div>

        {/* Account Balance */}
        <div className="bg-surface rounded-xl border border-surfaceHighlight shadow-sm overflow-hidden">
          <div className="p-4 border-b border-surfaceHighlight flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text">Account Balance</h3>
            <Info size={12} className="text-textMuted opacity-40" />
          </div>
          <div className="p-4">
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary/60"></div>
                <span className="text-[10px] text-textMuted">Account Balance</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-danger/60"></div>
                <span className="text-[10px] text-textMuted">Deposits / Withdrawals</span>
              </div>
            </div>
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={accountBalanceData}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 9 }} tickMargin={8} minTickGap={40} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)', fontSize: 12 }} formatter={(val: number) => [`$${val.toLocaleString()}`, 'Balance']} />
                  <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorBalance)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ BOTTOM ROW: Calendar + Drawdown ═══════════════ */}
      {timeframe !== 'all' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* P&L Calendar */}
          <div className="lg:col-span-3 bg-surface rounded-xl border border-surfaceHighlight overflow-visible relative shadow-sm">
            <div className="p-4 border-b border-surfaceHighlight flex flex-col md:flex-row justify-between items-center gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => handleNav(-1)} className="p-1 hover:bg-surfaceHighlight rounded text-textMuted"><ChevronLeft size={16} /></button>
                <h3 className="text-sm font-bold text-text">{monthName} {year}</h3>
                <button onClick={() => handleNav(1)} className="p-1 hover:bg-surfaceHighlight rounded text-textMuted"><ChevronRight size={16} /></button>
                <button onClick={() => setViewDate(new Date())} className="text-[10px] text-textMuted bg-surfaceHighlight px-2 py-0.5 rounded hover:text-text transition-colors">This month</button>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-textMuted">Monthly stats:</span>
                <span className={`font-bold ${calendarData.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>${calendarData.totalPnl.toFixed(0)}</span>
                <span className="text-textMuted">{calendarData.tradingDays} days</span>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row">
              <div className="flex-1 p-4">
                <div className="grid grid-cols-7 mb-2 h-6">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-[10px] font-medium text-textMuted flex items-center justify-center">{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5 auto-rows-[80px]">
                  {calendarWeeks.map((week, wIdx) => (
                    <React.Fragment key={wIdx}>
                      {week.map((cell, dIdx) => {
                        const data = cell.dateStr ? calendarData.map[cell.dateStr] : null;
                        const hasData = data && data.count > 0;
                        const isPositive = data && data.pnl > 0;
                        const isNegative = data && data.pnl < 0;
                        let bgClass = "bg-background/50 border-surfaceHighlight";
                        let textClass = "text-textMuted";
                        if (hasData) {
                          if (isPositive) { bgClass = "hover:opacity-80"; }
                          else if (isNegative) { bgClass = "hover:opacity-80"; }
                          else { bgClass = "bg-surfaceHighlight border-gray-600"; textClass = "text-text"; }
                        }
                        // Colorblind-friendly: teal for wins, burnt orange for losses
                        const cellStyle: React.CSSProperties = {};
                        if (hasData && isPositive) {
                          cellStyle.backgroundColor = 'rgba(0, 150, 136, 0.15)';
                          cellStyle.borderColor = 'rgba(0, 150, 136, 0.4)';
                        } else if (hasData && isNegative) {
                          cellStyle.backgroundColor = 'rgba(230, 81, 0, 0.15)';
                          cellStyle.borderColor = 'rgba(230, 81, 0, 0.4)';
                        }
                        return (
                          <div key={`${wIdx}-${dIdx}`}
                            onClick={() => cell.day && cell.dateStr && onNavigateToJournal && onNavigateToJournal(cell.dateStr)}
                            style={cellStyle}
                            className={`relative rounded-lg border p-1.5 flex flex-col justify-between transition-colors ${!cell.day ? 'invisible' : ''} ${cell.day ? 'cursor-pointer' : ''} ${bgClass}`}>
                            {cell.day && (
                              <>
                                <span className="text-[10px] font-medium text-textMuted self-end">{cell.day}</span>
                                <div className="flex flex-col items-center justify-center flex-1">
                                  {hasData ? (
                                    <>
                                      <span className="font-bold text-xs" style={{ color: isPositive ? '#009688' : '#e65100' }}>{isPositive ? '+' : ''}${data.pnl.toFixed(0)}</span>
                                      <span className="text-[9px] text-textMuted">{data.count} trades</span>
                                    </>
                                  ) : null}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Weekly Stats Sidebar */}
              <div className="w-full lg:w-36 border-t lg:border-t-0 lg:border-l border-surfaceHighlight bg-surfaceHighlight/10 p-3">
                <div className="grid grid-cols-1 gap-1.5 auto-rows-[80px]">
                  {calendarWeeks.map((week, idx) => {
                    const weeklyPnl = week.reduce((acc, cell) => {
                      if (cell.dateStr && calendarData.map[cell.dateStr]) return acc + calendarData.map[cell.dateStr].pnl;
                      return acc;
                    }, 0);
                    const weekDays = week.filter(c => c.dateStr && calendarData.map[c.dateStr]).length;
                    if (!week.some(c => c.day !== null)) return <div key={idx} className="h-full border border-transparent" />;
                    return (
                      <div key={idx} className="bg-surface border border-surfaceHighlight rounded-lg p-2 flex flex-col justify-center h-full shadow-sm">
                        <span className="text-[10px] text-textMuted">Week {idx + 1}</span>
                        <span className={`text-sm font-bold ${weeklyPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                          ${weeklyPnl.toFixed(0)}
                        </span>
                        <span className="text-[9px] text-textMuted">{weekDays} days</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Drawdown Chart */}
          <div className="lg:col-span-2 bg-surface rounded-xl border border-surfaceHighlight shadow-sm overflow-hidden">
            <div className="p-4 border-b border-surfaceHighlight flex items-center gap-2">
              <h3 className="text-sm font-semibold text-text">Drawdown</h3>
              <Info size={12} className="text-textMuted opacity-40" />
            </div>
            <div className="p-4 h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drawdownData}>
                  <defs>
                    <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 9 }} tickMargin={8} minTickGap={40} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)', fontSize: 12 }} formatter={(val: number) => [`$${val.toLocaleString()}`, 'Drawdown']} />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeOpacity={0.3} />
                  <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#colorDrawdown)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
