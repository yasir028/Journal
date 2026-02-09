
import React, { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ScatterChart, Scatter, ReferenceLine, Legend } from 'recharts';
import { Trade, TradeStatus, TradeType } from '../types';
import { Calendar, Clock, BarChart2, TrendingUp, TrendingDown, Activity, AlertTriangle, Target, DollarSign, Filter, BrainCircuit } from 'lucide-react';

interface AnalyticsProps {
  trades: Trade[];
}

const Analytics: React.FC<AnalyticsProps> = ({ trades }) => {
  const [timeRange, setTimeRange] = useState<'30d' | '90d' | 'YTD' | 'ALL'>('ALL');

  // --- FILTERING ---
  const filteredTrades = useMemo(() => {
    let data = trades.filter(t => t.status === TradeStatus.CLOSED);
    
    const now = new Date();
    if (timeRange === '30d') {
      const past = new Date(); past.setDate(now.getDate() - 30);
      data = data.filter(t => new Date(t.date) >= past);
    } else if (timeRange === '90d') {
      const past = new Date(); past.setDate(now.getDate() - 90);
      data = data.filter(t => new Date(t.date) >= past);
    } else if (timeRange === 'YTD') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      data = data.filter(t => new Date(t.date) >= startOfYear);
    }
    
    // Sort chronologically
    return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [trades, timeRange]);

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
        return Math.max(0, end - start); // Rough calc in "minutes-ish"
    };

    const avgHoldWin = wins.length > 0 ? wins.reduce((acc, t) => acc + getHoldTime(t), 0) / wins.length : 0;
    const avgHoldLoss = losses.length > 0 ? losses.reduce((acc, t) => acc + getHoldTime(t), 0) / losses.length : 0;

    // Consecutive
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currWin = 0;
    let currLoss = 0;
    
    filteredTrades.forEach(t => {
        if ((t.pnl || 0) > 0) {
            currWin++;
            currLoss = 0;
            maxWinStreak = Math.max(maxWinStreak, currWin);
        } else {
            currLoss++;
            currWin = 0;
            maxLossStreak = Math.max(maxLossStreak, currLoss);
        }
    });

    return { 
        totalPnl, profitFactor, winRate, avgWin, avgLoss, expectancy, 
        avgHoldWin, avgHoldLoss, maxWinStreak, maxLossStreak, totalTrades: filteredTrades.length 
    };
  }, [filteredTrades]);

  // --- CHART DATA PREP ---

  // 1. Equity & Drawdown Curve
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

  // Max Drawdown Value
  const maxDrawdown = useMemo(() => {
      if (equityData.length === 0) return 0;
      return Math.min(...equityData.map(d => d.drawdown));
  }, [equityData]);

  // 2. P&L Distribution (Scatter)
  const distributionData = useMemo(() => {
      return filteredTrades.map((t, idx) => ({
          x: idx + 1,
          y: t.pnl || 0,
          r: Math.abs(t.r || 0),
          status: (t.pnl || 0) > 0 ? 'Win' : 'Loss'
      }));
  }, [filteredTrades]);

  // 3. Time of Day Performance
  const timeOfDayData = useMemo(() => {
      const buckets: Record<string, number> = { 'Opening (9:30-10:30)': 0, 'Mid-Day (10:30-13:00)': 0, 'Power Hour (13:00-16:00)': 0 };
      
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

  // 4. Psychology / Emotion Performance
  const emotionData = useMemo(() => {
      const map: Record<string, { pnl: number, count: number }> = {};
      filteredTrades.forEach(t => {
          const em = t.emotionPre || 'Unknown';
          if (!map[em]) map[em] = { pnl: 0, count: 0 };
          map[em].pnl += (t.pnl || 0);
          map[em].count++;
      });
      return Object.entries(map)
        .map(([name, d]) => ({ name, pnl: d.pnl, count: d.count }))
        .sort((a, b) => b.pnl - a.pnl);
  }, [filteredTrades]);


  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-text">Advanced Analytics</h2>
            <p className="text-textMuted text-sm">Deep dive optimization metrics</p>
          </div>
          <div className="flex bg-surfaceHighlight p-1 rounded-lg">
            {['30d', '90d', 'YTD', 'ALL'].map(r => (
                <button 
                  key={r}
                  onClick={() => setTimeRange(r as any)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${timeRange === r ? 'bg-primary text-white shadow' : 'text-textMuted hover:text-text'}`}
                >
                  {r}
                </button>
            ))}
          </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>

      {/* RATIOS & STREAKS */}
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
              <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2"><Activity size={16}/> Streaks</h3>
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

      {/* EQUITY & DRAWDOWN CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Equity Curve */}
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

         {/* Drawdown Curve */}
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

      {/* DISTRIBUTION & OPTIMIZATION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* PnL Distribution */}
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

         {/* Time of Day */}
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

      {/* PSYCHOLOGY CORRELATION */}
      <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
         <h3 className="text-sm font-bold text-textMuted uppercase mb-4 flex items-center gap-2">
            <BrainCircuit size={16}/> Psychology Correlation (P&L by Pre-Trade Emotion)
         </h3>
         <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={emotionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                        cursor={{fill: 'var(--surface-highlight)'}}
                        itemStyle={{ color: '#3b82f6' }}
                    />
                    <ReferenceLine y={0} stroke="var(--text-muted)" />
                    <Bar dataKey="pnl">
                        {emotionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.pnl > 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
         </div>
      </div>

    </div>
  );
};

export default Analytics;
