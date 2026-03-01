
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine } from 'recharts';
import { Trade, TradeStatus, Playbook } from '../types';
import { ChevronLeft, ChevronRight, ChevronDown, PieChart, Tag, Activity, Clock, Calendar as CalendarIcon, BarChart2, AlertTriangle, Book, Timer } from 'lucide-react';

interface DashboardProps {
  trades: Trade[];
  playbooks?: Playbook[];
  onNavigateToJournal?: (date: string) => void;
  onFilterTrades?: (type: 'symbol' | 'setup' | 'playbook' | 'emotion' | 'mistake', value: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ trades, playbooks = [], onNavigateToJournal, onFilterTrades }) => {
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
  const [breakdownTab, setBreakdownTab] = useState<'setups' | 'symbols' | 'emotions' | 'playbooks' | 'mistakes'>('setups');
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
      const tDate = new Date(t.date + 'T12:00:00'); // Safe parsing
      const tYear = tDate.getFullYear();
      const tMonth = tDate.getMonth();

      if (timeframe === 'year') {
        return tYear === targetYear;
      } else {
        return tYear === targetYear && tMonth === targetMonth;
      }
    });
  }, [trades, viewDate, timeframe]);

  // --- STATS CALCULATION (Based on Filtered Trades) ---
  const stats = useMemo(() => {
    const totalTrades = filteredTrades.length;
    const wins = filteredTrades.filter(t => (t.pnl || 0) > 0).length;
    const losses = filteredTrades.filter(t => (t.pnl || 0) <= 0).length;
    const totalPnl = filteredTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const totalR = filteredTrades.reduce((acc, t) => acc + (t.r || 0), 0);
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    
    // Profit Factor
    const grossProfit = filteredTrades.filter(t => (t.pnl || 0) > 0).reduce((acc, t) => acc + (t.pnl || 0), 0);
    const grossLoss = Math.abs(filteredTrades.filter(t => (t.pnl || 0) < 0).reduce((acc, t) => acc + (t.pnl || 0), 0));
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 100 : 0) : grossProfit / grossLoss;
    
    // Expected Value (EV) per trade
    const ev = totalTrades > 0 ? totalPnl / totalTrades : 0;
    const evR = totalTrades > 0 ? totalR / totalTrades : 0;

    // Cost of Mistakes
    const mistakesTrades = filteredTrades.filter(t => t.mistakes && t.mistakes.length > 0 && (t.pnl || 0) < 0);
    const costOfMistakes = Math.abs(mistakesTrades.reduce((acc, t) => acc + (t.pnl || 0), 0));

    return { totalTrades, wins, losses, totalPnl, winRate, totalR, profitFactor, ev, evR, costOfMistakes };
  }, [filteredTrades]);

  // --- CHARTS DATA ---
  
  // Equity Curve (Cumulative for the selected period)
  const equityData = useMemo(() => {
    let cumulative = 0;
    // Sort chronologically
    const sorted = [...filteredTrades].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map(t => {
      cumulative += (t.pnl || 0);
      return { date: t.date, pnl: cumulative };
    });
  }, [filteredTrades]);

  // Period Performance Chart (Daily Bars, Monthly Bars, or All Time Monthly)
  const periodPerformanceData = useMemo(() => {
    if (timeframe === 'month') {
      // Show Daily P&L for the specific month
      const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
      const data = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        // Sum pnl for this day
        const dayTrades = filteredTrades.filter(t => t.date === dateStr);
        const dailyPnl = dayTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
        data.push({ name: String(d), pnl: dailyPnl, fullDate: dateStr, count: dayTrades.length });
      }
      return data;
    } else if (timeframe === 'year') {
      // Show Monthly P&L for the specific year
      const data = [];
      const year = viewDate.getFullYear();
      for (let m = 0; m < 12; m++) {
        const monthName = new Date(year, m, 1).toLocaleString('default', { month: 'short' });
        const monthTrades = filteredTrades.filter(t => {
          const d = new Date(t.date + 'T12:00:00');
          return d.getMonth() === m;
        });
        const monthlyPnl = monthTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
        data.push({ name: monthName, pnl: monthlyPnl, count: monthTrades.length });
      }
      return data;
    } else {
      // All Time: Group by Month-Year
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
        
        const monthTrades = filteredTrades.filter(t => {
          const d = new Date(t.date + 'T12:00:00');
          return d.getFullYear() === y && d.getMonth() === m;
        });

        const pnl = monthTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
        data.push({ name: label, pnl, count: monthTrades.length });

        current.setMonth(current.getMonth() + 1);
      }
      return data;
    }
  }, [filteredTrades, timeframe, viewDate]);

  // --- ADVANCED ANALYTICS ---
  
  // Day of Week Analysis
  const dayOfWeekData = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const map = days.map(day => ({ name: day.slice(0, 3), pnl: 0, count: 0 }));
    
    filteredTrades.forEach(t => {
      const dayIdx = new Date(t.date + 'T12:00:00').getDay();
      map[dayIdx].pnl += (t.pnl || 0);
      map[dayIdx].count += 1;
    });
    return map.filter(d => d.name !== 'Sun' && d.name !== 'Sat' || d.count > 0);
  }, [filteredTrades]);

  // Hourly Performance
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ name: `${i}:00`, pnl: 0, count: 0 }));
    filteredTrades.forEach(t => {
      if (t.entryTime) {
        const hour = parseInt(t.entryTime.split(':')[0]);
        if (!isNaN(hour) && hour >= 0 && hour < 24) {
          hours[hour].pnl += (t.pnl || 0);
          hours[hour].count += 1;
        }
      }
    });
    return hours.filter(h => h.count > 0);
  }, [filteredTrades]);

  // Duration Buckets
  const durationData = useMemo(() => {
    const buckets = [
      { name: '0-5m', min: 0, max: 5, pnl: 0, count: 0 },
      { name: '5-15m', min: 5, max: 15, pnl: 0, count: 0 },
      { name: '15-60m', min: 15, max: 60, pnl: 0, count: 0 },
      { name: '1-4h', min: 60, max: 240, pnl: 0, count: 0 },
      { name: '4h+', min: 240, max: Infinity, pnl: 0, count: 0 },
    ];

    filteredTrades.forEach(t => {
      if (t.entryTime && t.exitTime) {
        const start = new Date(`2000-01-01T${t.entryTime}`).getTime();
        const end = new Date(`2000-01-01T${t.exitTime}`).getTime();
        let diff = (end - start) / 60000;
        if (diff < 0) diff += 24 * 60; 

        const bucket = buckets.find(b => diff >= b.min && diff < b.max);
        if (bucket) {
          bucket.pnl += (t.pnl || 0);
          bucket.count++;
        }
      }
    });

    return buckets.filter(b => b.count > 0);
  }, [filteredTrades]);

  // Hold Time Analysis
  const holdTimeData = useMemo(() => {
    let winTime = 0, winCount = 0;
    let lossTime = 0, lossCount = 0;

    filteredTrades.forEach(t => {
      if (t.entryTime && t.exitTime) {
        const start = new Date(`2000-01-01T${t.entryTime}`).getTime();
        const end = new Date(`2000-01-01T${t.exitTime}`).getTime();
        let diff = (end - start) / 60000;
        if (diff < 0) diff += 24 * 60; 

        if ((t.pnl || 0) > 0) { winTime += diff; winCount++; } 
        else { lossTime += diff; lossCount++; }
      }
    });

    return [
      { name: 'Winners', minutes: winCount ? Math.round(winTime / winCount) : 0 },
      { name: 'Losers', minutes: lossCount ? Math.round(lossTime / lossCount) : 0 }
    ];
  }, [filteredTrades]);

  // --- BREAKDOWN DATA ---
  const breakdownData = useMemo(() => {
    const map: Record<string, { count: number; pnl: number; wins: number; label: string }> = {};
    
    // Flatten trades for 'mistakes' since it's an array
    if (breakdownTab === 'mistakes') {
       filteredTrades.forEach(t => {
          if (t.mistakes && t.mistakes.length > 0) {
            t.mistakes.forEach(m => {
              if (!map[m]) map[m] = { count: 0, pnl: 0, wins: 0, label: m };
              map[m].count++;
              map[m].pnl += (t.pnl || 0); 
              if ((t.pnl || 0) > 0) map[m].wins++;
            });
          }
       });
    } else {
       filteredTrades.forEach(t => {
          let key = 'Unknown';
          let label = 'Unknown';

          if (breakdownTab === 'setups') {
             key = t.setup || 'No Setup';
             label = key;
          }
          if (breakdownTab === 'symbols') {
             key = t.symbol;
             label = key;
          }
          if (breakdownTab === 'emotions') {
             key = t.emotionPre;
             label = key;
          }
          if (breakdownTab === 'playbooks') {
            key = t.playbookId || 'No Playbook';
            const pb = playbooks.find(p => p.id === t.playbookId);
            label = pb ? pb.name : 'No Playbook';
          }

          if (!map[key]) map[key] = { count: 0, pnl: 0, wins: 0, label };
          map[key].count++;
          map[key].pnl += (t.pnl || 0);
          if ((t.pnl || 0) > 0) map[key].wins++;
       });
    }

    return Object.entries(map)
      .map(([id, data]) => ({ id, name: data.label, count: data.count, pnl: data.pnl, winRate: (data.wins / data.count) * 100 }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [filteredTrades, breakdownTab, playbooks]);

  const handleRowClick = (id: string) => {
      if (!onFilterTrades) return;
      
      if (breakdownTab === 'setups') onFilterTrades('setup', id === 'No Setup' ? '' : id);
      if (breakdownTab === 'symbols') onFilterTrades('symbol', id);
      if (breakdownTab === 'emotions') onFilterTrades('emotion', id);
      if (breakdownTab === 'playbooks') onFilterTrades('playbook', id === 'No Playbook' ? '' : id);
      if (breakdownTab === 'mistakes') onFilterTrades('mistake', id);
  };

  // --- CALENDAR LOGIC ---
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
    
    monthTrades.forEach(t => {
      if (!map[t.date]) map[t.date] = { pnl: 0, count: 0 };
      map[t.date].pnl += (t.pnl || 0);
      map[t.date].count += 1;
      totalPnl += (t.pnl || 0);
    });

    return { map, totalPnl, count: monthTrades.length };
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
  const handleMonthSelect = (newMonthIndex: number) => { 
    setViewDate(new Date(year, newMonthIndex, 1)); 
    setIsMonthPickerOpen(false); 
  };
  
  const handleNav = (inc: number) => {
    if (timeframe === 'month') {
      setViewDate(new Date(year, month + inc, 1));
    } else {
      setViewDate(new Date(year + inc, month, 1));
    }
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="space-y-8">
      
      {/* HEADER CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-4 rounded-xl border border-surfaceHighlight">
        <div className="flex items-center gap-2 bg-surfaceHighlight p-1 rounded-lg">
          <button 
            onClick={() => setTimeframe('month')} 
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${timeframe === 'month' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}
          >
            Monthly
          </button>
          <button 
            onClick={() => setTimeframe('year')} 
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${timeframe === 'year' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}
          >
            Yearly
          </button>
          <button 
            onClick={() => setTimeframe('all')} 
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${timeframe === 'all' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}
          >
            All Time
          </button>
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
                  <div ref={monthPickerRef} className="absolute top-full right-0 mt-2 bg-surface border border-surfaceHighlight rounded-xl shadow-2xl z-50 w-[280px] p-4 animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-surfaceHighlight">
                       <span className="text-xs text-textMuted">Select Period</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {MONTHS.map((m, idx) => (
                        <button 
                          key={m} 
                          disabled={timeframe === 'year'}
                          onClick={() => handleMonthSelect(idx)} 
                          className={`text-sm py-2 rounded transition-colors ${idx === month ? 'bg-primary text-white' : 'text-textMuted hover:bg-surfaceHighlight'} ${timeframe === 'year' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
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

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <p className="text-textMuted text-sm font-medium">Net P&L</p>
          <p className={`text-2xl font-bold mt-2 ${stats.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
            ${stats.totalPnl.toLocaleString()}
          </p>
        </div>
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <p className="text-textMuted text-sm font-medium">Win Rate</p>
          <p className="text-2xl font-bold text-text mt-2">{stats.winRate.toFixed(1)}%</p>
          <div className="w-full bg-gray-700/50 h-1 mt-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full transition-all duration-500" style={{ width: `${stats.winRate}%` }}></div>
          </div>
        </div>
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <p className="text-textMuted text-sm font-medium">Profit Factor</p>
          <p className="text-2xl font-bold text-accent mt-2">{stats.profitFactor.toFixed(2)}</p>
        </div>
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <p className="text-textMuted text-sm font-medium">Exp. Value (EV)</p>
          <div className="flex flex-col mt-2">
            <span className={`text-lg font-bold ${stats.ev >= 0 ? 'text-success' : 'text-danger'}`}>
              ${stats.ev.toFixed(2)}
            </span>
            <span className={`text-xs ${stats.evR >= 0 ? 'text-success' : 'text-danger'}`}>
              {stats.evR.toFixed(2)}R
            </span>
          </div>
        </div>
        {/* Cost of Mistakes */}
        <div className="bg-red-500/5 p-6 rounded-xl border border-red-500/20 shadow-sm">
          <p className="text-red-400/80 text-sm font-medium flex items-center gap-1"><AlertTriangle size={14}/> Cost of Mistakes</p>
          <p className="text-2xl font-bold text-danger mt-2">
            -${stats.costOfMistakes.toLocaleString()}
          </p>
          <p className="text-xs text-red-400/60 mt-1">Lost to errors</p>
        </div>
         <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <p className="text-textMuted text-sm font-medium">Total R</p>
          <p className={`text-2xl font-bold mt-2 ${stats.totalR >= 0 ? 'text-success' : 'text-danger'}`}>
            {stats.totalR.toFixed(1)}R
          </p>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equity Curve */}
        <div className="lg:col-span-2 bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <h3 className="text-lg font-semibold text-text mb-4">Equity Curve ({timeframe === 'all' ? 'All Time' : timeframe})</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData}>
                <defs>
                  <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-muted)" tick={{fontSize: 10}} tickMargin={10} minTickGap={30} />
                <YAxis stroke="var(--text-muted)" tick={{fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} 
                  itemStyle={{ color: '#3b82f6' }}
                  labelStyle={{ color: 'var(--text)' }}
                />
                <Area type="monotone" dataKey="pnl" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPnl)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Period Performance */}
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center justify-between">
            <span>Period Performance</span>
            <span className="text-xs text-textMuted uppercase border border-surfaceHighlight px-2 py-0.5 rounded">
              {timeframe === 'month' ? 'Daily P&L' : timeframe === 'year' ? 'Monthly P&L' : 'Monthly P&L (All)'}
            </span>
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={periodPerformanceData}>
                 <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                 <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} interval={timeframe === 'month' ? 2 : 0} />
                 <YAxis stroke="var(--text-muted)" fontSize={10} />
                 <ReferenceLine y={0} stroke="var(--text-muted)" />
                 <Tooltip cursor={{fill: 'var(--surface-highlight)'}} contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} itemStyle={{ color: '#3b82f6' }} labelStyle={{ color: 'var(--text)' }} />
                 <Bar dataKey="pnl">
                    {periodPerformanceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                    ))}
                 </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ADVANCED ANALYTICS (Time & Duration) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Performance */}
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <Clock size={18} /> Performance by Hour
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <ReferenceLine y={0} stroke="var(--text-muted)" />
                <Tooltip cursor={{fill: 'var(--surface-highlight)'}} contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} itemStyle={{ color: '#3b82f6' }} labelStyle={{ color: 'var(--text)' }} />
                <Bar dataKey="pnl">
                  {hourlyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Duration Performance */}
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
           <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <Timer size={18} /> Performance by Duration
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={durationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <ReferenceLine y={0} stroke="var(--text-muted)" />
                <Tooltip cursor={{fill: 'var(--surface-highlight)'}} contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} itemStyle={{ color: '#3b82f6' }} labelStyle={{ color: 'var(--text)' }} />
                <Bar dataKey="pnl">
                  {durationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Day of Week */}
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <CalendarIcon size={18} /> Day of Week Performance
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayOfWeekData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <ReferenceLine y={0} stroke="var(--text-muted)" />
                <Tooltip cursor={{fill: 'var(--surface-highlight)'}} contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} itemStyle={{ color: '#3b82f6' }} labelStyle={{ color: 'var(--text)' }} />
                <Bar dataKey="pnl">
                  {dayOfWeekData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hold Time */}
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight shadow-sm">
          <h3 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <Clock size={18} /> Avg. Hold Time (Minutes)
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={holdTimeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" horizontal={false} />
                <XAxis type="number" stroke="var(--text-muted)" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={12} width={60} />
                <Tooltip cursor={{fill: 'var(--surface-highlight)'}} contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} itemStyle={{ color: '#3b82f6' }} labelStyle={{ color: 'var(--text)' }} />
                <Bar dataKey="minutes">
                   <Cell fill="#22c55e" />
                   <Cell fill="#ef4444" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* BREAKDOWN WIDGET */}
      <div className="bg-surface rounded-xl border border-surfaceHighlight overflow-hidden shadow-sm">
        <div className="p-4 border-b border-surfaceHighlight flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text">Performance Breakdown ({timeframe === 'all' ? 'All Time' : timeframe})</h3>
          <div className="flex bg-background rounded-lg p-1 gap-1">
            <button onClick={() => setBreakdownTab('setups')} className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-2 ${breakdownTab === 'setups' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}>
              <Tag size={12} /> Setups
            </button>
             <button onClick={() => setBreakdownTab('playbooks')} className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-2 ${breakdownTab === 'playbooks' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}>
              <Book size={12} /> Playbooks
            </button>
            <button onClick={() => setBreakdownTab('symbols')} className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-2 ${breakdownTab === 'symbols' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}>
              <PieChart size={12} /> Symbols
            </button>
            <button onClick={() => setBreakdownTab('mistakes')} className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-2 ${breakdownTab === 'mistakes' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}>
              <AlertTriangle size={12} /> Mistakes
            </button>
            <button onClick={() => setBreakdownTab('emotions')} className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-2 ${breakdownTab === 'emotions' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}>
              <Activity size={12} /> Emotions
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surfaceHighlight/50 text-textMuted text-xs uppercase font-medium">
              <tr>
                <th className="px-6 py-3">{breakdownTab.slice(0, -1)}</th>
                <th className="px-6 py-3 text-right">Trades</th>
                <th className="px-6 py-3 text-right">Win Rate</th>
                <th className="px-6 py-3 text-right">Net P&L</th>
              </tr>
            </thead>
            <tbody className="text-sm text-text divide-y divide-gray-800/20">
              {breakdownData.map((row, idx) => (
                <tr key={idx} onClick={() => handleRowClick(row.id)} className="hover:bg-surfaceHighlight/30 transition-colors cursor-pointer">
                  <td className="px-6 py-3 font-medium">{row.name}</td>
                  <td className="px-6 py-3 text-right text-textMuted">{row.count}</td>
                  <td className="px-6 py-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs ${row.winRate >= 50 ? 'bg-green-500/10 text-success' : 'bg-red-500/10 text-danger'}`}>
                      {row.winRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className={`px-6 py-3 text-right font-mono ${row.pnl >= 0 ? 'text-success' : 'text-danger'}`}>{row.pnl >= 0 ? '+' : ''}${row.pnl.toLocaleString()}</td>
                </tr>
              ))}
              {breakdownData.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-textMuted text-xs">No closed trades found for this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* CALENDAR SECTION */}
      {timeframe !== 'all' && (
        <div className="bg-surface rounded-xl border border-surfaceHighlight overflow-visible relative shadow-sm">
          <div className="p-6 border-b border-surfaceHighlight flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-bold text-text flex items-center gap-2"><CalendarIcon size={20} /> Monthly Calendar</h3>
              <span className="text-textMuted text-sm font-medium">{monthName} {year}</span>
            </div>
            <div className="flex items-center gap-4">
               <div className="text-right">
                 <p className="text-xs text-textMuted uppercase">Monthly P&L</p>
                 <p className={`font-bold ${calendarData.totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>${calendarData.totalPnl.toFixed(2)}</p>
               </div>
               <div className="h-8 w-px bg-surfaceHighlight mx-2 hidden md:block"></div>
               <div className="text-right"><p className="text-xs text-textMuted uppercase">Trades</p><p className="font-bold text-text">{calendarData.count}</p></div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 p-4">
              <div className="grid grid-cols-7 mb-2 h-8">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="text-center text-xs font-medium text-textMuted flex items-center justify-center">{day}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-2 auto-rows-[100px]">
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
                         if (isPositive) { bgClass = "bg-green-500/10 border-green-500/30 hover:bg-green-500/20"; textClass = "text-success"; }
                         else if (isNegative) { bgClass = "bg-red-500/10 border-red-500/30 hover:bg-red-500/20"; textClass = "text-danger"; }
                         else { bgClass = "bg-surfaceHighlight border-gray-600"; textClass = "text-text"; }
                      }
                      return (
                        <div 
                          key={`${wIdx}-${dIdx}`} 
                          onClick={() => cell.day && cell.dateStr && onNavigateToJournal && onNavigateToJournal(cell.dateStr)}
                          className={`relative rounded-lg border p-2 flex flex-col justify-between transition-colors ${!cell.day ? 'invisible' : ''} ${cell.day ? 'cursor-pointer' : ''} ${bgClass}`}
                        >
                          {cell.day && (
                            <>
                              <span className="text-xs font-medium text-textMuted self-end">{cell.day}</span>
                              <div className="flex flex-col items-center justify-center flex-1">
                                {hasData ? (
                                  <><span className={`font-bold text-sm md:text-base ${textClass}`}>{isPositive ? '+' : ''}${data.pnl.toFixed(0)}</span><span className="text-[10px] text-textMuted mt-1">{data.count} trades</span></>
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
            <div className="w-full lg:w-48 border-t lg:border-t-0 lg:border-l border-surfaceHighlight bg-surfaceHighlight/10 p-4">
               <h3 className="text-xs font-bold text-textMuted uppercase mb-0 h-8 flex items-center justify-center lg:justify-start tracking-wider">Weekly Stats</h3>
               <div className="mt-2 grid grid-cols-1 gap-2 auto-rows-[100px]">
                  {calendarWeeks.map((week, idx) => {
                    const weeklyPnl = week.reduce((acc, cell) => {
                      if (cell.dateStr && calendarData.map[cell.dateStr]) return acc + calendarData.map[cell.dateStr].pnl;
                      return acc;
                    }, 0);
                    if (!week.some(c => c.day !== null)) return <div key={idx} className="h-full border border-transparent" />;
                    return (
                      <div key={idx} className="bg-surface border border-surfaceHighlight rounded-lg p-3 flex flex-col justify-center h-full shadow-sm">
                        <span className="text-xs text-textMuted mb-1">Week {idx + 1}</span>
                        <span className={`text-lg font-bold ${weeklyPnl >= 0 ? 'text-success' : 'text-danger'}`}>{weeklyPnl >= 0 ? '+' : ''}${weeklyPnl.toFixed(2)}</span>
                      </div>
                    );
                  })}
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
