import React, { useState, useMemo, useEffect } from 'react';
import { Trade, DailyAnalysis, DailyReview, TradeStatus, TradeType } from '../types';
import { 
  FileText, Calendar, Search, Filter, 
  MoreHorizontal, Plus, BrainCircuit, ChevronDown, ChevronUp, Save
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import RichTextEditor from './RichTextEditor';

interface DailyJournalProps {
  trades: Trade[];
  dailyAnalysis: DailyAnalysis;
  dailyReviews?: DailyReview;
  onSaveReview: (date: string, text: string) => void;
  initialDate?: string;
  onNavigateToTrade?: (tradeId: string) => void;
}

const DailyJournal: React.FC<DailyJournalProps> = ({ trades, dailyAnalysis, dailyReviews = {}, onSaveReview, initialDate, onNavigateToTrade }) => {
  // --- STATE ---
  const [timeframe, setTimeframe] = useState<'MONTH' | 'YEAR' | 'ALL'>('MONTH');
  
  // 1. Calculate ALL unique dates first
  const allDates = useMemo(() => {
    const dates = new Set<string>();
    trades.forEach(t => dates.add(t.date));
    Object.keys(dailyAnalysis).forEach(d => dates.add(d));
    Object.keys(dailyReviews).forEach(d => dates.add(d));
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [trades, dailyAnalysis, dailyReviews]);

  // 2. Filter dates based on selected timeframe
  const filteredDates = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return allDates.filter(dateStr => {
      const entryDate = new Date(dateStr + 'T12:00:00'); // Prevent timezone shifts
      if (timeframe === 'MONTH') {
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      }
      if (timeframe === 'YEAR') {
        return entryDate.getFullYear() === currentYear;
      }
      return true; // ALL
    });
  }, [allDates, timeframe]);

  const [selectedDate, setSelectedDate] = useState<string>(initialDate || filteredDates[0] || new Date().toISOString().split('T')[0]);
  const [showPreMarket, setShowPreMarket] = useState(true);
  const [reviewText, setReviewText] = useState('');

  // Sync editor text when date or database changes
  useEffect(() => {
    setReviewText(dailyReviews[selectedDate] || '');
  }, [selectedDate, dailyReviews]);

  useEffect(() => {
    if (initialDate) setSelectedDate(initialDate);
  }, [initialDate]);

  // --- HANDLERS ---
  const handleManualSave = () => {
    onSaveReview(selectedDate, reviewText);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  // --- STATS & DATA PROCESSING ---
  const todaysTrades = useMemo(() => trades.filter(t => t.date === selectedDate), [trades, selectedDate]);
  
  const dayStats = useMemo(() => {
    const dayTrades = todaysTrades.filter(t => t.status === TradeStatus.CLOSED);
    const totalTrades = dayTrades.length;
    const winners = dayTrades.filter(t => (t.pnl || 0) > 0).length;
    const losers = dayTrades.filter(t => (t.pnl || 0) <= 0).length;
    const netPnl = dayTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const grossPnl = dayTrades.reduce((acc, t) => acc + (t.pnl || 0 > 0 ? (t.pnl || 0) : 0), 0);
    const commissions = dayTrades.reduce((acc, t) => acc + (t.fees || 0), 0);
    const winRate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;
    const grossLoss = Math.abs(dayTrades.filter(t => (t.pnl || 0) < 0).reduce((acc, t) => acc + (t.pnl || 0), 0));
    const profitFactor = grossLoss === 0 ? (grossPnl > 0 ? 100 : 0) : grossPnl / grossLoss;
    const volume = dayTrades.reduce((acc, t) => acc + t.quantity, 0);

    return { totalTrades, winners, losers, netPnl, grossPnl, commissions, winRate, profitFactor, volume, trades: dayTrades };
  }, [todaysTrades]);

  const chartData = useMemo(() => {
    const sorted = [...dayStats.trades].sort((a, b) => (a.exitTime || '00:00').localeCompare(b.exitTime || '00:00'));
    let cumulative = 0;
    const data = [{ time: 'Start', pnl: 0 }];
    sorted.forEach(t => {
      cumulative += (t.pnl || 0);
      data.push({ time: t.exitTime || 'End', pnl: cumulative });
    });
    if (data.length === 1) data.push({ time: 'End', pnl: 0 });
    return data;
  }, [dayStats.trades]);

  const chartColor = dayStats.netPnl >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="flex h-full bg-background text-text overflow-hidden rounded-xl border border-surfaceHighlight">
      
      {/* PANE 1: DAY LIST with Timeframe Filter */}
      <div className="w-72 bg-surface border-r border-surfaceHighlight flex flex-col shrink-0 hidden md:flex">
        <div className="p-4 border-b border-surfaceHighlight flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="font-semibold flex items-center gap-2 text-sm"><FileText size={16} /> Log day</span>
            <Filter size={14} className="text-textMuted" />
          </div>
          
          {/* Timeframe Selector UI */}
          <div className="flex bg-surfaceHighlight p-1 rounded-lg border border-surfaceHighlight/50">
            {(['MONTH', 'YEAR', 'ALL'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`flex-1 px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                  timeframe === tf ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredDates.map(date => {
            const dTrades = trades.filter(t => t.date === date);
            const dPnl = dTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
            const isSelected = selectedDate === date;

            return (
              <div 
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`p-4 border-b border-surfaceHighlight cursor-pointer transition-colors hover:bg-surfaceHighlight/50 ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
              >
                <h4 className={`font-medium text-sm ${isSelected ? 'text-primary' : 'text-text'}`}>{formatDate(date)}</h4>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-textMuted">{dTrades.length} trades</span>
                  <span className={`text-xs font-mono font-bold ${dPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                    {dPnl >= 0 ? '+' : ''}${dPnl.toFixed(0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PANE 2: MAIN CONTENT */}
      <div className="flex-1 bg-background flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-surfaceHighlight flex justify-between items-start sticky top-0 bg-background z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-1 rounded bg-surfaceHighlight"><Calendar size={16} className="text-textMuted"/></div>
              <h2 className="text-xl font-bold text-text">{formatDate(selectedDate)}</h2>
            </div>
            <p className={`text-2xl font-bold ${dayStats.netPnl >= 0 ? 'text-success' : 'text-danger'}`}>
              Net P&L {dayStats.netPnl >= 0 ? '+' : ''}${dayStats.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <button className="p-2 hover:bg-surfaceHighlight rounded-full text-textMuted transition-colors"><MoreHorizontal size={20}/></button>
        </div>

        {/* Stats & Chart */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 border-b border-surfaceHighlight">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-highlight)" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis stroke="var(--text-muted)" fontSize={10} width={40} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }} 
                  itemStyle={{ color: chartColor }}
                />
                <Area type="monotone" dataKey="pnl" stroke={chartColor} strokeWidth={2} fillOpacity={1} fill="url(#chartGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-y-6 gap-x-12">
            <div><p className="text-xs text-textMuted mb-1">Winners</p><p className="text-lg font-bold text-text">{dayStats.winners}</p></div>
            <div><p className="text-xs text-textMuted mb-1">Winrate</p><p className="text-lg font-bold text-text">{dayStats.winRate.toFixed(0)}%</p></div>
            <div><p className="text-xs text-textMuted mb-1">Profit Factor</p><p className="text-lg font-bold text-text">{dayStats.profitFactor.toFixed(2)}</p></div>
            <div><p className="text-xs text-textMuted mb-1">Gross P&L</p><p className="text-lg font-bold text-text">${dayStats.grossPnl.toFixed(0)}</p></div>
          </div>
        </div>

        {/* TRADES LIST */}
        <div className="px-6 py-4 border-b border-surfaceHighlight">
          <div className="flex items-center gap-2 mb-4">
            <Search size={16} className="text-textMuted" />
            <span className="text-xs font-semibold text-textMuted uppercase tracking-wider">Trades for this day</span>
          </div>
          <div className="space-y-2">
            {todaysTrades.length > 0 ? (
              todaysTrades.map((trade) => (
                <div
                  key={trade.id}
                  onClick={() => onNavigateToTrade?.(trade.id)}
                  className="flex items-center justify-between p-3 bg-surface rounded-lg border border-surfaceHighlight hover:border-primary/50 cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-1 h-8 rounded-full ${trade.type === 'LONG' ? 'bg-success' : 'bg-danger'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{trade.symbol}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${trade.type === 'LONG' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                          {trade.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-textMuted">{trade.entryTime}</span>
                        {trade.setup && (
                          <span className="text-[10px] text-textMuted bg-surfaceHighlight px-1.5 rounded">{trade.setup}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${trade.pnl && trade.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                      {trade.pnl && trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-textMuted">{trade.quantity} units</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 bg-surfaceHighlight/20 rounded-lg border border-dashed border-surfaceHighlight">
                <p className="text-sm text-textMuted">No trades recorded for this date.</p>
              </div>
            )}
          </div>
        </div>

        {/* PRE-MARKET CONTEXT */}
        {dailyAnalysis[selectedDate] && (
           <div className="px-6 pt-6">
             <div className="bg-accent/5 border border-accent/20 rounded-xl overflow-hidden">
               <button onClick={() => setShowPreMarket(!showPreMarket)} className="w-full flex items-center justify-between p-3 bg-accent/10 hover:bg-accent/20 transition-colors">
                 <div className="flex items-center gap-2 text-sm font-bold text-accent"><BrainCircuit size={16} />Pre-Market Context</div>
                 {showPreMarket ? <ChevronUp size={16} className="text-accent"/> : <ChevronDown size={16} className="text-accent"/>}
               </button>
               {showPreMarket && (
                 <div className="p-4 text-sm text-text leading-relaxed border-t border-accent/10 prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: dailyAnalysis[selectedDate] }} />
               )}
             </div>
           </div>
        )}

        {/* EDITOR AREA with SAVE BUTTON */}
        <div className="flex-1 p-6 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-textMuted uppercase tracking-wider">End-of-Day Review</span>
              <button 
                onClick={handleManualSave}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-all active:scale-95 shadow-md shadow-primary/20"
              >
                <Save size={16} /> Save Review
              </button>
          </div>

          <RichTextEditor 
            value={reviewText}
            onChange={setReviewText}
            placeholder="Log your daily lessons, wins, and areas for improvement..."
            className="flex-1 min-h-[400px]"
          />
        </div>
      </div>
    </div>
  );
};

export default DailyJournal;