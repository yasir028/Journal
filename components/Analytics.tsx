import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ScatterChart, Scatter, ReferenceLine, Legend, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Trade, TradeStatus, TradeType, Rule, RuleCheck, RuleSettings, AIRecap, RecapPeriodType, PsychProfile as PsychProfileType, PsychProfilePeriod, DeepAnalysis as DeepAnalysisType, DeepAnalysisPeriod } from '../types';
import { Calendar as CalendarIcon, Clock, BarChart2, TrendingUp, TrendingDown, Activity, AlertTriangle, Target, DollarSign, Filter, BrainCircuit, Zap, Timer, Award, TrendingDown as StreakDown, TrendingUp as StreakUp, Flame, ShieldCheck, Sparkles, Globe, GitCompare, Brain } from 'lucide-react';
import PnLCalendar from './PnLCalendar';
import RuleTracker from './RuleTracker';
import AIRecaps from './AIRecaps';
import DeepAnalysis from './DeepAnalysis';
import PsychProfile from './PsychProfile';

type AnalyticsTab = 'performance' | 'calendar' | 'progress' | 'recaps';

interface AnalyticsProps {
  trades: Trade[];
  onFilterTrades?: (type: 'symbol' | 'setup' | 'playbook' | 'emotion' | 'mistake', value: string) => void;
  // Calendar props
  onNavigateToDay?: (date: string) => void;
  // Progress Tracker props
  rules?: Rule[];
  ruleChecks?: RuleCheck[];
  ruleSettings?: RuleSettings;
  onAddRule?: (rule: Rule) => void;
  onUpdateRule?: (rule: Rule) => void;
  onDeleteRule?: (id: string) => void;
  onToggleCheck?: (check: RuleCheck) => void;
  onUpdateSettings?: (s: RuleSettings) => void;
  onResetProgress?: () => void;
  // AI Recaps props
  aiRecaps?: AIRecap[];
  onGenerateRecap?: (type: RecapPeriodType, start: string, end: string) => Promise<void>;
  onDeleteRecap?: (id: string) => void;
  // Deep Analysis props
  deepAnalyses?: DeepAnalysisType[];
  onGenerateDeepAnalysis?: (type: DeepAnalysisPeriod, start: string, end: string) => Promise<void>;
  onDeleteDeepAnalysis?: (id: string) => void;
  // Psych Profile props
  psychProfiles?: PsychProfileType[];
  onGeneratePsychProfile?: (type: PsychProfilePeriod, start: string, end: string) => Promise<void>;
  onDeletePsychProfile?: (id: string) => void;
}

const TABS: { id: AnalyticsTab; label: string; icon: React.ElementType }[] = [
  { id: 'performance', label: 'Performance', icon: BarChart2 },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'progress', label: 'Progress Tracker', icon: ShieldCheck },
  { id: 'recaps', label: 'Recaps & Insights', icon: Sparkles },
];

const Analytics: React.FC<AnalyticsProps> = ({
  trades, onFilterTrades,
  onNavigateToDay,
  rules = [], ruleChecks = [], ruleSettings = { trading_days: ['Mon','Tue','Wed','Thu','Fri'] },
  onAddRule, onUpdateRule, onDeleteRule, onToggleCheck, onUpdateSettings, onResetProgress,
  aiRecaps = [], onGenerateRecap, onDeleteRecap,
  deepAnalyses = [], onGenerateDeepAnalysis, onDeleteDeepAnalysis,
  psychProfiles = [], onGeneratePsychProfile, onDeletePsychProfile,
}) => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('performance');
  const [recapsSubTab, setRecapsSubTab] = useState<'recaps' | 'deep' | 'psych'>('recaps');
  const [timeRange, setTimeRange] = useState<'30d' | '90d' | 'YTD' | 'ALL' | 'custom'>('ALL');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');

  // --- FILTERING ---
  const filteredTrades = useMemo(() => {
    let data = trades.filter(t => t.status === TradeStatus.CLOSED);
    
    if (timeRange === '30d') {
      const past = new Date(); past.setDate(past.getDate() - 30);
      const cutoff = past.toISOString().split('T')[0];
      data = data.filter(t => t.date >= cutoff);
    } else if (timeRange === '90d') {
      const past = new Date(); past.setDate(past.getDate() - 90);
      const cutoff = past.toISOString().split('T')[0];
      data = data.filter(t => t.date >= cutoff);
    } else if (timeRange === 'YTD') {
      const cutoff = `${new Date().getFullYear()}-01-01`;
      data = data.filter(t => t.date >= cutoff);
    } else if (timeRange === 'custom') {
      if (customStart) data = data.filter(t => t.date >= customStart);
      if (customEnd)   data = data.filter(t => t.date <= customEnd);
    }

    return data.sort((a, b) => a.date.localeCompare(b.date));
  }, [trades, timeRange, customStart, customEnd]);

  // --- CALCULATIONS ---
  const stats = useMemo(() => {
    const wins = filteredTrades.filter(t => (t.pnl || 0) > 0);
    const losses = filteredTrades.filter(t => (t.pnl || 0) <= 0);
    
    const totalPnl = filteredTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const grossProfit = wins.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0));
    
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
    const winRate = filteredTrades.length > 0 ? (wins.length / filteredTrades.length) * 100 : 0;
    
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const expectancy = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);
    
    // Hold Time Calculation
    const getHoldTime = (t: Trade) => {
        if (!t.entryTime || !t.exitTime) return 0;
        const start = parseInt(t.entryTime.replace(':', ''));
        const end = parseInt(t.exitTime.replace(':', ''));
        return Math.max(0, end - start);
    };

    const avgHoldWin = wins.length > 0 ? wins.reduce((acc, t) => acc + getHoldTime(t), 0) / wins.length : 0;
    const avgHoldLoss = losses.length > 0 ? losses.reduce((acc, t) => acc + getHoldTime(t), 0) / losses.length : 0;

    // Consecutive Streaks
    let maxWinStreak = 0, maxLossStreak = 0;
    let currWin = 0, currLoss = 0;
    
    filteredTrades.forEach(t => {
        if ((t.pnl || 0) > 0) {
            currWin++; currLoss = 0;
            maxWinStreak = Math.max(maxWinStreak, currWin);
        } else {
            currLoss++; currWin = 0;
            maxLossStreak = Math.max(maxLossStreak, currLoss);
        }
    });

    // NEW: Sharpe Ratio (simplified - assumes risk-free rate of 0)
    const returns = filteredTrades.map(t => (t.pnl || 0));
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0 
      ? returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returns.length 
      : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    // NEW: Profit Factor by Month
    const monthlyPF: Record<string, { profit: number, loss: number }> = {};
    filteredTrades.forEach(t => {
      const month = t.date.substring(0, 7); // YYYY-MM
      if (!monthlyPF[month]) monthlyPF[month] = { profit: 0, loss: 0 };
      if ((t.pnl || 0) > 0) monthlyPF[month].profit += (t.pnl || 0);
      else monthlyPF[month].loss += Math.abs(t.pnl || 0);
    });

    return { 
        totalPnl, profitFactor, winRate, avgWin, avgLoss, expectancy, 
        avgHoldWin, avgHoldLoss, maxWinStreak, maxLossStreak, totalTrades: filteredTrades.length,
        sharpeRatio
    };
  }, [filteredTrades]);

  // --- NEW: WIN/LOSS STREAK ANALYSIS ---
  const streakData = useMemo(() => {
    const streaks: Array<{ type: 'win' | 'loss', length: number, startDate: string, endDate: string, totalPnl: number }> = [];
    let currentType: 'win' | 'loss' | null = null;
    let currentLength = 0;
    let currentStartDate = '';
    let currentPnl = 0;

    filteredTrades.forEach((t, idx) => {
      const isWin = (t.pnl || 0) > 0;
      const type: 'win' | 'loss' = isWin ? 'win' : 'loss';

      if (type === currentType) {
        currentLength++;
        currentPnl += (t.pnl || 0);
      } else {
        if (currentType !== null && currentLength >= 2) {
          streaks.push({
            type: currentType,
            length: currentLength,
            startDate: currentStartDate,
            endDate: filteredTrades[idx - 1].date,
            totalPnl: currentPnl
          });
        }
        currentType = type;
        currentLength = 1;
        currentStartDate = t.date;
        currentPnl = t.pnl || 0;
      }
    });

    // Push final streak
    if (currentType !== null && currentLength >= 2) {
      streaks.push({
        type: currentType,
        length: currentLength,
        startDate: currentStartDate,
        endDate: filteredTrades[filteredTrades.length - 1]?.date || currentStartDate,
        totalPnl: currentPnl
      });
    }

    return streaks.sort((a, b) => b.length - a.length).slice(0, 10);
  }, [filteredTrades]);

  // --- NEW: TRADING HOURS HEATMAP ---
  const hourlyHeatmap = useMemo(() => {
    const heatmap: Record<string, Record<number, { trades: number, pnl: number, wins: number }>> = {
      'Mon': {}, 'Tue': {}, 'Wed': {}, 'Thu': {}, 'Fri': {}
    };

    const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    filteredTrades.forEach(t => {
      if (!t.entryTime) return;
      const hour = parseInt(t.entryTime.split(':')[0]);
      const dayOfWeek = dayMap[new Date(t.date + 'T12:00:00').getDay()];

      if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dayOfWeek)) return;

      if (!heatmap[dayOfWeek][hour]) {
        heatmap[dayOfWeek][hour] = { trades: 0, pnl: 0, wins: 0 };
      }

      heatmap[dayOfWeek][hour].trades++;
      heatmap[dayOfWeek][hour].pnl += (t.pnl || 0);
      if ((t.pnl || 0) > 0) heatmap[dayOfWeek][hour].wins++;
    });

    return heatmap;
  }, [filteredTrades]);

  // --- NEW: EMOTIONAL PATTERN ANALYSIS ---
  const emotionAnalysis = useMemo(() => {
    const map: Record<string, { 
      trades: number, 
      wins: number, 
      totalPnl: number, 
      avgPnl: number, 
      winRate: number,
      bestTrade: number,
      worstTrade: number
    }> = {};

    filteredTrades.forEach(t => {
      const emotion = t.emotionPre || 'Unknown';
      if (!map[emotion]) {
        map[emotion] = { trades: 0, wins: 0, totalPnl: 0, avgPnl: 0, winRate: 0, bestTrade: -Infinity, worstTrade: Infinity };
      }

      map[emotion].trades++;
      map[emotion].totalPnl += (t.pnl || 0);
      if ((t.pnl || 0) > 0) map[emotion].wins++;
      map[emotion].bestTrade = Math.max(map[emotion].bestTrade, t.pnl || 0);
      map[emotion].worstTrade = Math.min(map[emotion].worstTrade, t.pnl || 0);
    });

    return Object.entries(map).map(([emotion, data]) => ({
      emotion,
      ...data,
      avgPnl: data.trades > 0 ? data.totalPnl / data.trades : 0,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0
    })).sort((a, b) => b.avgPnl - a.avgPnl);
  }, [filteredTrades]);

  // --- NEW: SETUP PERFORMANCE COMPARISON ---
  const setupPerformance = useMemo(() => {
    const map: Record<string, {
      trades: number,
      wins: number,
      totalPnl: number,
      avgPnl: number,
      winRate: number,
      profitFactor: number,
      avgWin: number,
      avgLoss: number,
      bestTrade: number,
      worstTrade: number
    }> = {};

    filteredTrades.forEach(t => {
      const setup = t.setup || 'No Setup';
      if (!map[setup]) {
        map[setup] = {
          trades: 0, wins: 0, totalPnl: 0, avgPnl: 0, winRate: 0, 
          profitFactor: 0, avgWin: 0, avgLoss: 0,
          bestTrade: -Infinity, worstTrade: Infinity
        };
      }

      map[setup].trades++;
      map[setup].totalPnl += (t.pnl || 0);
      if ((t.pnl || 0) > 0) map[setup].wins++;
      map[setup].bestTrade = Math.max(map[setup].bestTrade, t.pnl || 0);
      map[setup].worstTrade = Math.min(map[setup].worstTrade, t.pnl || 0);
    });

    return Object.entries(map).map(([setup, data]) => {
      const wins = filteredTrades.filter(t => (t.setup || 'No Setup') === setup && (t.pnl || 0) > 0);
      const losses = filteredTrades.filter(t => (t.setup || 'No Setup') === setup && (t.pnl || 0) <= 0);
      
      const grossProfit = wins.reduce((acc, t) => acc + (t.pnl || 0), 0);
      const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0));
      
      return {
        setup,
        ...data,
        avgPnl: data.trades > 0 ? data.totalPnl / data.trades : 0,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
        profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
        avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
        avgLoss: losses.length > 0 ? grossLoss / losses.length : 0
      };
    }).sort((a, b) => b.totalPnl - a.totalPnl);
  }, [filteredTrades]);

  // --- EQUITY & DRAWDOWN CURVE ---
  const equityData = useMemo(() => {
      let equity = 0;
      let peak = 0;
      return filteredTrades.map(t => {
          equity += (t.pnl || 0);
          if (equity > peak) peak = equity;
          const drawdown = peak === 0 ? 0 : equity - peak;
          return {
              date: t.date,
              equity: equity,
              drawdown: drawdown
          };
      });
  }, [filteredTrades]);

  const maxDrawdown = useMemo(() => {
      if (equityData.length === 0) return 0;
      return Math.min(...equityData.map(d => d.drawdown));
  }, [equityData]);

  // --- P&L DISTRIBUTION ---
  const distributionData = useMemo(() => {
      return filteredTrades.map((t, idx) => ({
          x: idx + 1,
          y: t.pnl || 0,
          r: Math.abs(t.r || 0),
          status: (t.pnl || 0) > 0 ? 'Win' : 'Loss'
      }));
  }, [filteredTrades]);

  // --- TIME OF DAY PERFORMANCE ---
  const timeOfDayData = useMemo(() => {
      const buckets: Record<string, number> = { 
        'Opening (9:30-10:30)': 0, 
        'Mid-Day (10:30-13:00)': 0, 
        'Power Hour (13:00-16:00)': 0 
      };
      
      filteredTrades.forEach(t => {
          if (!t.entryTime) return;
          const h = parseInt(t.entryTime.split(':')[0]);
          const m = parseInt(t.entryTime.split(':')[1]);
          const timeVal = h + (m / 60);

          if (timeVal >= 9.5 && timeVal < 10.5) buckets['Opening (9:30-10:30)'] += (t.pnl || 0);
          else if (timeVal >= 10.5 && timeVal < 13) buckets['Mid-Day (10:30-13:00)'] += (t.pnl || 0);
          else buckets['Power Hour (13:00-16:00)'] += (t.pnl || 0);
      });

      return Object.entries(buckets).map(([name, pnl]) => ({ name, pnl }));
  }, [filteredTrades]);

  // --- NEW: MONTHLY PERFORMANCE REPORT DATA ---
  const monthlyReport = useMemo(() => {
    const months: Record<string, {
      trades: number,
      wins: number,
      pnl: number,
      profitFactor: number,
      sharpe: number
    }> = {};

    filteredTrades.forEach(t => {
      const month = t.date.substring(0, 7);
      if (!months[month]) {
        months[month] = { trades: 0, wins: 0, pnl: 0, profitFactor: 0, sharpe: 0 };
      }
      months[month].trades++;
      months[month].pnl += (t.pnl || 0);
      if ((t.pnl || 0) > 0) months[month].wins++;
    });

    // Calculate metrics for each month
    Object.keys(months).forEach(month => {
      const monthTrades = filteredTrades.filter(t => t.date.startsWith(month));
      const wins = monthTrades.filter(t => (t.pnl || 0) > 0);
      const losses = monthTrades.filter(t => (t.pnl || 0) <= 0);
      
      const grossProfit = wins.reduce((acc, t) => acc + (t.pnl || 0), 0);
      const grossLoss = Math.abs(losses.reduce((acc, t) => acc + (t.pnl || 0), 0));
      
      months[month].profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

      // Sharpe for month
      const returns = monthTrades.map(t => t.pnl || 0);
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      months[month].sharpe = stdDev > 0 ? avgReturn / stdDev : 0;
    });

    return Object.entries(months).map(([month, data]) => ({
      month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      ...data
    }));
  }, [filteredTrades]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ═══════ TAB BAR ═══════ */}
      <div className="border-b border-surfaceHighlight">
        <div className="flex items-center gap-1 -mb-px">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-textMuted hover:text-text hover:border-surfaceHighlight'
                }`}
              >
                <Icon size={16} />
                {tab.label}
                {tab.id === 'performance' && (
                  <span className="text-[9px] bg-primary text-white px-1.5 py-0.5 rounded font-bold uppercase">New</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════ CALENDAR TAB ═══════ */}
      {activeTab === 'calendar' && (
        <PnLCalendar trades={trades} onNavigateToDay={onNavigateToDay} />
      )}

      {/* ═══════ PROGRESS TRACKER TAB ═══════ */}
      {activeTab === 'progress' && onAddRule && onUpdateRule && onDeleteRule && onToggleCheck && onUpdateSettings && onResetProgress && (
        <RuleTracker
          rules={rules}
          ruleChecks={ruleChecks}
          ruleSettings={ruleSettings}
          trades={trades}
          onAddRule={onAddRule}
          onUpdateRule={onUpdateRule}
          onDeleteRule={onDeleteRule}
          onToggleCheck={onToggleCheck}
          onUpdateSettings={onUpdateSettings}
          onResetProgress={onResetProgress}
        />
      )}

      {/* ═══════ RECAPS & INSIGHTS TAB ═══════ */}
      {activeTab === 'recaps' && (
        <div className="space-y-6">
          {/* Sub-tab bar */}
          <div className="flex gap-1 bg-surfaceHighlight/40 rounded-lg p-1 w-fit">
            {([
              { id: 'recaps' as const, label: 'Recaps', icon: Sparkles },
              { id: 'deep' as const, label: 'Deep Analysis', icon: Brain },
              { id: 'psych' as const, label: 'Psych Profile', icon: BrainCircuit },
            ]).map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRecapsSubTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    recapsSubTab === tab.id
                      ? 'bg-surface text-text shadow-sm'
                      : 'text-textMuted hover:text-text'
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Sub-tab content */}
          {recapsSubTab === 'recaps' && onGenerateRecap && onDeleteRecap && (
            <AIRecaps recaps={aiRecaps} trades={trades} onGenerate={onGenerateRecap} onDelete={onDeleteRecap} />
          )}

          {recapsSubTab === 'deep' && onGenerateDeepAnalysis && onDeleteDeepAnalysis && (
            <DeepAnalysis analyses={deepAnalyses} trades={trades} onGenerate={onGenerateDeepAnalysis} onDelete={onDeleteDeepAnalysis} />
          )}

          {recapsSubTab === 'psych' && onGeneratePsychProfile && onDeletePsychProfile && (
            <PsychProfile profiles={psychProfiles} trades={trades} onGenerate={onGeneratePsychProfile} onDelete={onDeletePsychProfile} />
          )}
        </div>
      )}

      {/* ═══════ PERFORMANCE TAB ═══════ */}
      {activeTab === 'performance' && (
      <div className="space-y-8">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-text">Advanced Analytics</h2>
            <p className="text-textMuted text-sm">Deep dive optimization metrics</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-surfaceHighlight p-1 rounded-lg">
              {(['30d', '90d', 'YTD', 'ALL', 'custom'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${timeRange === r ? 'bg-primary text-white shadow' : 'text-textMuted hover:text-text'}`}
                >
                  {r === 'custom' ? 'Custom' : r}
                </button>
              ))}
            </div>
            {timeRange === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="bg-background border border-surfaceHighlight rounded-md px-2 py-1 text-xs text-text outline-none focus:border-primary"
                />
                <span className="text-textMuted text-xs">–</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="bg-background border border-surfaceHighlight rounded-md px-2 py-1 text-xs text-text outline-none focus:border-primary"
                />
              </div>
            )}
          </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
         {/* Profit Factor */}
         <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-textMuted uppercase tracking-wider">Profit Factor</span>
                <TrendingUp size={16} className="text-primary"/>
            </div>
            <div className="text-2xl font-bold text-text">{stats.profitFactor.toFixed(2)}</div>
            <p className="text-xs text-textMuted mt-1">Goal: &gt; 1.5</p>
         </div>

         {/* Expectancy */}
         <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-textMuted uppercase tracking-wider">Expectancy</span>
                <Target size={16} className="text-accent"/>
            </div>
            <div className={`text-2xl font-bold ${stats.expectancy > 0 ? 'text-success' : 'text-danger'}`}>
                ${stats.expectancy.toFixed(2)}
            </div>
            <p className="text-xs text-textMuted mt-1">Avg value per trade</p>
         </div>

         {/* Drawdown */}
         <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-textMuted uppercase tracking-wider">Max Drawdown</span>
                <TrendingDown size={16} className="text-danger"/>
            </div>
            <div className="text-2xl font-bold text-danger">${maxDrawdown.toFixed(2)}</div>
            <p className="text-xs text-textMuted mt-1">From peak equity</p>
         </div>

         {/* Win Rate */}
         <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-textMuted uppercase tracking-wider">Win Rate</span>
                <Activity size={16} className="text-success"/>
            </div>
            <div className="text-2xl font-bold text-text">{stats.winRate.toFixed(1)}%</div>
            <p className="text-xs text-textMuted mt-1">{stats.totalTrades} total trades</p>
         </div>

         {/* NEW: Sharpe Ratio */}
         <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-textMuted uppercase tracking-wider">Sharpe Ratio</span>
                <Zap size={16} className="text-accent"/>
            </div>
            <div className="text-2xl font-bold text-accent">{stats.sharpeRatio.toFixed(2)}</div>
            <p className="text-xs text-textMuted mt-1">Risk-adjusted return</p>
         </div>
      </div>

      {/* NEW: WIN/LOSS STREAKS SECTION */}
      <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
        <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2">
          <Flame size={16} className="text-orange-500"/> Streak Analysis
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Longest Win Streak */}
          <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <StreakUp className="text-success" size={20}/>
              <span className="text-xs text-green-400 uppercase font-bold tracking-wider">Longest Win Streak</span>
            </div>
            <p className="text-3xl font-bold text-success">{stats.maxWinStreak} trades</p>
          </div>

          {/* Longest Loss Streak */}
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <StreakDown className="text-danger" size={20}/>
              <span className="text-xs text-red-400 uppercase font-bold tracking-wider">Longest Loss Streak</span>
            </div>
            <p className="text-3xl font-bold text-danger">{stats.maxLossStreak} trades</p>
          </div>
        </div>

        {/* Streak History Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surfaceHighlight/50 text-textMuted text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Length</th>
                <th className="px-4 py-2 text-left">Period</th>
                <th className="px-4 py-2 text-right">Total P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surfaceHighlight/30">
              {streakData.slice(0, 5).map((streak, idx) => (
                <tr key={idx} className="hover:bg-surfaceHighlight/20">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${
                      streak.type === 'win' ? 'bg-green-500/20 text-success' : 'bg-red-500/20 text-danger'
                    }`}>
                      {streak.type === 'win' ? <StreakUp size={12}/> : <StreakDown size={12}/>}
                      {streak.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-text">{streak.length} trades</td>
                  <td className="px-4 py-3 text-textMuted text-xs">{streak.startDate} to {streak.endDate}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${streak.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                    {streak.totalPnl >= 0 ? '+' : ''}${streak.totalPnl.toFixed(2)}
                  </td>
                </tr>
              ))}
              {streakData.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-textMuted text-xs">No significant streaks found (2+ trades)</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW: TRADING HOURS HEATMAP */}
      <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
        <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2">
          <Clock size={16}/> Best Trading Hours Heatmap
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-surfaceHighlight p-2 text-xs text-textMuted bg-surfaceHighlight/30">Hour</th>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                  <th key={day} className="border border-surfaceHighlight p-2 text-xs text-textMuted bg-surfaceHighlight/30 min-w-[80px]">{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 7 }, (_, i) => i + 9).map(hour => (
                <tr key={hour}>
                  <td className="border border-surfaceHighlight p-2 text-xs text-textMuted font-bold bg-surfaceHighlight/30">{hour}:00</td>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => {
                    const cell = hourlyHeatmap[day]?.[hour];
                    if (!cell || cell.trades === 0) {
                      return <td key={day} className="border border-surfaceHighlight p-2 bg-background"></td>;
                    }
                    
                    const winRate = (cell.wins / cell.trades) * 100;
                    const avgPnl = cell.pnl / cell.trades;
                    const intensity = Math.min(100, (cell.trades / 5) * 100);
                    
                    let bgColor = avgPnl > 0 ? `rgba(34, 197, 94, ${intensity / 100})` : `rgba(239, 68, 68, ${intensity / 100})`;
                    
                    const isEarly = hour < 11;
                    const tooltipPosition = isEarly 
                      ? "top-full mt-2 left-1/2 -translate-x-1/2" 
                      : "-top-2 left-1/2 -translate-x-1/2 -translate-y-full";

                    return (
                      <td 
                        key={day} 
                        className="border border-surfaceHighlight p-2 text-center relative group cursor-pointer"
                        style={{ backgroundColor: bgColor }}
                      >
                        <div className="text-xs font-mono font-bold text-white drop-shadow-lg">
                          {cell.trades}
                        </div>
                        <div className={`absolute hidden group-hover:block bg-surface border border-surfaceHighlight rounded-lg p-3 shadow-xl z-50 w-40 ${tooltipPosition}`}>
                          <div className="text-xs space-y-1">
                            <p className="font-bold text-text">{day} {hour}:00</p>
                            <p className="text-textMuted">Trades: {cell.trades}</p>
                            <p className={avgPnl >= 0 ? 'text-success' : 'text-danger'}>Avg P&L: ${avgPnl.toFixed(2)}</p>
                            <p className="text-textMuted">Win Rate: {winRate.toFixed(0)}%</p>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-textMuted mt-4 italic">Hover over cells to see details. Color intensity = trade volume. Green = profitable, Red = losses.</p>
      </div>

      {/* NEW: EMOTIONAL PATTERN ANALYSIS */}
      <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
        <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2">
          <BrainCircuit size={16}/> Emotional State Performance
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart */}
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={emotionAnalysis}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                <XAxis dataKey="emotion" stroke="var(--text-muted)" fontSize={11} angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  cursor={{fill: 'var(--surface-highlight)'}}
                />
                <ReferenceLine y={0} stroke="var(--text-muted)" />
                <Bar dataKey="avgPnl" name="Avg P&L">
                  {emotionAnalysis.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.avgPnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="overflow-y-auto max-h-[300px]">
            <table className="w-full text-sm">
              <thead className="bg-surfaceHighlight/50 text-textMuted text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Emotion</th>
                  <th className="px-3 py-2 text-right">Trades</th>
                  <th className="px-3 py-2 text-right">Win Rate</th>
                  <th className="px-3 py-2 text-right">Avg P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surfaceHighlight/30">
                {emotionAnalysis.map((item, idx) => (
                  <tr key={idx} className="hover:bg-surfaceHighlight/20">
                    <td className="px-3 py-2 font-medium text-text">{item.emotion}</td>
                    <td className="px-3 py-2 text-right text-textMuted">{item.trades}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs ${item.winRate >= 50 ? 'bg-green-500/10 text-success' : 'bg-red-500/10 text-danger'}`}>
                        {item.winRate.toFixed(0)}%
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-bold ${item.avgPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                      {item.avgPnl >= 0 ? '+' : ''}${item.avgPnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-blue-400 font-medium">💡 Insight: Trade when you're {emotionAnalysis[0]?.emotion || 'Neutral'} for best results (Avg: ${emotionAnalysis[0]?.avgPnl.toFixed(2) || '0.00'})</p>
        </div>
      </div>

      {/* NEW: SETUP PERFORMANCE COMPARISON */}
      <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
        <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2">
          <Target size={16}/> Setup Performance Leaderboard
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surfaceHighlight/50 text-textMuted text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Rank</th>
                <th className="px-4 py-3 text-left">Setup</th>
                <th className="px-4 py-3 text-right">Trades</th>
                <th className="px-4 py-3 text-right">Win Rate</th>
                <th className="px-4 py-3 text-right">Profit Factor</th>
                <th className="px-4 py-3 text-right">Avg P&L</th>
                <th className="px-4 py-3 text-right">Total P&L</th>
                <th className="px-4 py-3 text-right">Best Trade</th>
                <th className="px-4 py-3 text-right">Worst Trade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surfaceHighlight/30">
              {setupPerformance.map((setup, idx) => (
                <tr 
                  key={idx} 
                  className="hover:bg-surfaceHighlight/20 cursor-pointer transition-colors"
                  onClick={() => onFilterTrades && onFilterTrades('setup', setup.setup === 'No Setup' ? '' : setup.setup)}
                >
                  <td className="px-4 py-3">
                    {idx < 3 ? (
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        idx === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                        idx === 1 ? 'bg-gray-400/20 text-gray-400' :
                        'bg-orange-500/20 text-orange-500'
                      }`}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                      </span>
                    ) : (
                      <span className="text-textMuted">{idx + 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold text-text">{setup.setup}</td>
                  <td className="px-4 py-3 text-right text-textMuted">{setup.trades}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${setup.winRate >= 50 ? 'bg-green-500/10 text-success' : 'bg-red-500/10 text-danger'}`}>
                      {setup.winRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-accent font-bold">{setup.profitFactor.toFixed(2)}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${setup.avgPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                    ${setup.avgPnl.toFixed(2)}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${setup.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                    {setup.totalPnl >= 0 ? '+' : ''}${setup.totalPnl.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-success text-xs">+${setup.bestTrade.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono text-danger text-xs">${setup.worstTrade.toFixed(2)}</td>
                </tr>
              ))}
              {setupPerformance.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-textMuted text-xs">No setups logged yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RATIOS & STREAKS (Existing) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm lg:col-span-2">
             <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2"><DollarSign size={16}/> Win/Loss Ratio Analysis</h3>
             <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-textMuted">Avg Winner</span>
                            <span className="text-success font-bold">${stats.avgWin.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-surfaceHighlight h-2 rounded-full overflow-hidden">
                            <div className="bg-success h-full" style={{width: '100%'}}></div>
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-textMuted">Avg Loser</span>
                            <span className="text-danger font-bold">-${stats.avgLoss.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-surfaceHighlight h-2 rounded-full overflow-hidden">
                            <div className="bg-danger h-full" style={{width: `${(stats.avgLoss / (stats.avgWin || 1)) * 100}%`}}></div>
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                     <div className="flex justify-between items-center border-b border-surfaceHighlight pb-2">
                        <span className="text-xs text-textMuted">Risk/Reward Ratio</span>
                        <span className="font-bold text-text">1 : {(stats.avgWin / (stats.avgLoss || 1)).toFixed(2)}</span>
                     </div>
                     <div className="flex justify-between items-center border-b border-surfaceHighlight pb-2">
                        <span className="text-xs text-textMuted">Avg Hold (Winners)</span>
                        <span className="font-mono text-success">{stats.avgHoldWin.toFixed(0)}m</span>
                     </div>
                     <div className="flex justify-between items-center border-b border-surfaceHighlight pb-2">
                        <span className="text-xs text-textMuted">Avg Hold (Losers)</span>
                        <span className="font-mono text-danger">{stats.avgHoldLoss.toFixed(0)}m</span>
                     </div>
                     {stats.avgHoldLoss > stats.avgHoldWin * 1.5 && (
                         <div className="text-xs text-danger flex items-center gap-1 bg-red-500/10 p-2 rounded">
                            <AlertTriangle size={12}/> You hold losers too long.
                         </div>
                     )}
                </div>
             </div>
          </div>

          <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
              <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2"><Activity size={16}/> Current Streaks</h3>
              <div className="flex flex-col gap-6">
                 <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl text-center">
                    <span className="text-xs text-green-400 uppercase font-bold tracking-wider">Best Win Streak</span>
                    <p className="text-3xl font-bold text-success mt-2">{stats.maxWinStreak}</p>
                 </div>
                 <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-center">
                    <span className="text-xs text-red-400 uppercase font-bold tracking-wider">Worst Loss Streak</span>
                    <p className="text-3xl font-bold text-danger mt-2">{stats.maxLossStreak}</p>
                 </div>
              </div>
          </div>
      </div>

      {/* EQUITY & DRAWDOWN CHARTS (Existing) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm h-[350px]">
            <h3 className="text-sm font-bold text-textMuted uppercase mb-4">Equity Curve</h3>
            <ResponsiveContainer width="100%" height="90%">
                <AreaChart data={equityData}>
                    <defs>
                        <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis stroke="var(--text-muted)" fontSize={10} width={40} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} 
                        labelStyle={{ color: 'var(--text)' }}
                        itemStyle={{ color: '#3b82f6' }}
                    />
                    <Area type="monotone" dataKey="equity" stroke="#3b82f6" strokeWidth={2} fill="url(#equityGradient)" />
                </AreaChart>
            </ResponsiveContainer>
         </div>

         <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm h-[350px]">
            <h3 className="text-sm font-bold text-textMuted uppercase mb-4">Drawdown Analysis</h3>
            <ResponsiveContainer width="100%" height="90%">
                <AreaChart data={equityData}>
                    <defs>
                        <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis stroke="var(--text-muted)" fontSize={10} width={40} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} 
                        labelStyle={{ color: 'var(--text)' }}
                        itemStyle={{ color: '#ef4444' }}
                    />
                    <ReferenceLine y={0} stroke="var(--text-muted)" />
                    <Area type="step" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fill="url(#drawdownGradient)" />
                </AreaChart>
            </ResponsiveContainer>
         </div>
      </div>

      {/* DISTRIBUTION & TIME OF DAY (Existing) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm h-[350px]">
             <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2">
                <BarChart2 size={16}/> Trade Distribution (Consistency)
             </h3>
             <ResponsiveContainer width="100%" height="90%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" />
                    <XAxis type="number" dataKey="x" name="Trade #" hide />
                    <YAxis type="number" dataKey="y" name="P&L" stroke="var(--text-muted)" fontSize={10} width={40} />
                    <Tooltip 
                        cursor={{ strokeDasharray: '3 3' }} 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                        itemStyle={{ color: '#3b82f6' }}
                    />
                    <ReferenceLine y={0} stroke="var(--text-muted)" />
                    <Scatter name="Trades" data={distributionData} fill="#8884d8">
                        {distributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.y > 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                    </Scatter>
                </ScatterChart>
             </ResponsiveContainer>
         </div>

         <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm h-[350px]">
             <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2">
                <Clock size={16}/> Performance by Time of Day
             </h3>
             <ResponsiveContainer width="100%" height="90%">
                <BarChart data={timeOfDayData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" horizontal={false} />
                    <XAxis type="number" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={11} width={120} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                        cursor={{fill: 'var(--surface-highlight)'}}
                        itemStyle={{ color: '#3b82f6' }}
                    />
                    <ReferenceLine x={0} stroke="var(--text-muted)" />
                    <Bar dataKey="pnl">
                        {timeOfDayData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.pnl > 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                    </Bar>
                </BarChart>
             </ResponsiveContainer>
         </div>
      </div>

      {/* NEW: MONTHLY PERFORMANCE REPORT */}
      <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
        <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2">
          <Award size={16}/> Monthly Performance Report
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surfaceHighlight/50 text-textMuted text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Month</th>
                <th className="px-4 py-3 text-right">Trades</th>
                <th className="px-4 py-3 text-right">Wins</th>
                <th className="px-4 py-3 text-right">P&L</th>
                <th className="px-4 py-3 text-right">Profit Factor</th>
                <th className="px-4 py-3 text-right">Sharpe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surfaceHighlight/30">
              {monthlyReport.map((month, idx) => (
                <tr key={idx} className="hover:bg-surfaceHighlight/20">
                  <td className="px-4 py-3 font-medium text-text">{month.month}</td>
                  <td className="px-4 py-3 text-right text-textMuted">{month.trades}</td>
                  <td className="px-4 py-3 text-right text-success">{month.wins}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${month.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                    {month.pnl >= 0 ? '+' : ''}${month.pnl.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-accent">{month.profitFactor.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono text-text">{month.sharpe.toFixed(2)}</td>
                </tr>
              ))}
              {monthlyReport.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-textMuted text-xs">No monthly data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      </div>
      )}

    </div>
  );
};

export default Analytics;
