import React, { useState, useMemo, useEffect } from 'react';
import { Trade, DailyAnalysis, DailyReview, TradeStatus, Playbook } from '../types';
import {
  FileText, Calendar, Search, Filter,
  MoreHorizontal, BrainCircuit, ChevronDown, ChevronUp, Save,
  Download, X, FileDown, Loader2
} from 'lucide-react';
import TradeDetail from './TradeDetail';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import RichTextEditor from './RichTextEditor';
import { generateReport, generateObsidianReport, getDateRange, ReportPeriod } from '../services/reportService';

interface DailyJournalProps {
  trades: Trade[];
  playbooks?: Playbook[];
  dailyAnalysis: DailyAnalysis;
  dailyReviews?: DailyReview;
  onSaveReview: (date: string, text: string) => void;
  initialDate?: string;
  onNavigateToTrade?: (tradeId: string) => void;
}

const DailyJournal: React.FC<DailyJournalProps> = ({ trades, playbooks = [], dailyAnalysis, dailyReviews = {}, onSaveReview, initialDate }) => {
  // --- STATE ---
  const [timeframe, setTimeframe] = useState<'MONTH' | 'YEAR' | 'ALL' | 'CUSTOM'>('MONTH');
  const [tfCustomStart, setTfCustomStart] = useState('');
  const [tfCustomEnd,   setTfCustomEnd]   = useState('');
  
  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('weekly');
  const [reportFormat, setReportFormat] = useState<'docx' | 'obsidian'>('docx');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  
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
      const entryDate = new Date(dateStr + 'T12:00:00');
      if (timeframe === 'MONTH') {
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      }
      if (timeframe === 'YEAR') {
        return entryDate.getFullYear() === currentYear;
      }
      if (timeframe === 'CUSTOM') {
        if (tfCustomStart && dateStr < tfCustomStart) return false;
        if (tfCustomEnd   && dateStr > tfCustomEnd)   return false;
        return true;
      }
      return true; // ALL
    });
  }, [allDates, timeframe, tfCustomStart, tfCustomEnd]);

  const [selectedDate, setSelectedDate] = useState<string>(initialDate || filteredDates[0] || new Date().toISOString().split('T')[0]);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
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

  // --- REPORT GENERATION ---
  const handleGenerateReport = async () => {
    setIsGenerating(true);
    setReportError(null);

    try {
      let startDate: string;
      let endDate: string;

      if (reportPeriod === 'custom') {
        if (!customStart || !customEnd) {
          throw new Error('Please select both start and end dates.');
        }
        if (customStart > customEnd) {
          throw new Error('Start date must be before end date.');
        }
        startDate = customStart;
        endDate = customEnd;
      } else {
        // Use the currently selected date as the reference point
        const range = getDateRange(reportPeriod, selectedDate);
        startDate = range.startDate;
        endDate = range.endDate;
      }

      const reportConfig = { period: reportPeriod, startDate, endDate, trades, dailyAnalysis, dailyReviews };
      if (reportFormat === 'obsidian') {
        generateObsidianReport(reportConfig);
      } else {
        await generateReport(reportConfig);
      }

      setShowReportModal(false);
    } catch (err: any) {
      setReportError(err.message || 'Failed to generate report.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Report period preview (shows what range will be exported)
  const reportPreview = useMemo(() => {
    if (reportPeriod === 'custom') {
      if (!customStart || !customEnd) return 'Select date range';
      return `${customStart} to ${customEnd}`;
    }
    const range = getDateRange(reportPeriod, selectedDate);
    const fmt = (d: string) => {
      const dt = new Date(d + 'T12:00:00');
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    if (reportPeriod === 'daily') return fmt(range.startDate);
    return `${fmt(range.startDate)} – ${fmt(range.endDate)}`;
  }, [reportPeriod, selectedDate, customStart, customEnd]);

  // Count trades in report range for preview
  const reportTradeCount = useMemo(() => {
    let start: string, end: string;
    if (reportPeriod === 'custom') {
      start = customStart || '';
      end = customEnd || '';
    } else {
      const range = getDateRange(reportPeriod, selectedDate);
      start = range.startDate;
      end = range.endDate;
    }
    if (!start || !end) return 0;
    return trades.filter(t => t.date >= start && t.date <= end).length;
  }, [reportPeriod, selectedDate, customStart, customEnd, trades]);

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
            {(['MONTH', 'YEAR', 'ALL', 'CUSTOM'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`flex-1 px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                  timeframe === tf ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'
                }`}
              >
                {tf === 'CUSTOM' ? 'DATE' : tf}
              </button>
            ))}
          </div>
          {timeframe === 'CUSTOM' && (
            <div className="flex flex-col gap-1">
              <input
                type="date"
                value={tfCustomStart}
                onChange={e => setTfCustomStart(e.target.value)}
                className="w-full bg-background border border-surfaceHighlight rounded-md px-2 py-1 text-xs text-text outline-none focus:border-primary"
                placeholder="Start"
              />
              <input
                type="date"
                value={tfCustomEnd}
                onChange={e => setTfCustomEnd(e.target.value)}
                className="w-full bg-background border border-surfaceHighlight rounded-md px-2 py-1 text-xs text-text outline-none focus:border-primary"
                placeholder="End"
              />
            </div>
          )}
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

        {/* REPORT BUTTON — bottom of sidebar */}
        <div className="p-3 border-t border-surfaceHighlight">
          <button
            onClick={() => setShowReportModal(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-primary/10 text-primary font-semibold text-sm rounded-lg hover:bg-primary/20 transition-all border border-primary/20"
          >
            <FileDown size={16} />
            Export Report
          </button>
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
          <div className="flex items-center gap-2">
            {/* Mobile report button */}
            <button 
              onClick={() => setShowReportModal(true)}
              className="p-2 hover:bg-primary/10 rounded-full text-primary transition-colors md:hidden"
              title="Export Report"
            >
              <FileDown size={20}/>
            </button>
            <button className="p-2 hover:bg-surfaceHighlight rounded-full text-textMuted transition-colors"><MoreHorizontal size={20}/></button>
          </div>
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
                  onClick={() => setSelectedTradeId(trade.id)}
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

      {/* ── REPORT MODAL ────────────────────────────────────────────────── */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-surfaceHighlight rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-surfaceHighlight">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileDown size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-text text-lg">Export Report</h3>
                  <p className="text-xs text-textMuted">
                    {reportFormat === 'obsidian' ? 'Obsidian Markdown (.md)' : 'Word Document (.docx)'}
                  </p>
                </div>
              </div>
              <button onClick={() => { setShowReportModal(false); setReportError(null); }} className="p-1.5 hover:bg-surfaceHighlight rounded-lg transition-colors">
                <X size={18} className="text-textMuted" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5">

              {/* Format Selector */}
              <div>
                <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'docx',     label: 'Word (.docx)', sub: 'Formatted report' },
                    { value: 'obsidian', label: 'Obsidian (.md)', sub: 'Markdown + frontmatter' },
                  ] as { value: 'docx' | 'obsidian'; label: string; sub: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setReportFormat(opt.value)}
                      className={`py-2.5 px-3 text-left rounded-lg border transition-all ${
                        reportFormat === opt.value
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-surfaceHighlight text-textMuted border-surfaceHighlight hover:text-text hover:border-primary/30'
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-xs opacity-70">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Period Selector */}
              <div>
                <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">Period</label>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { value: 'daily', label: 'Day' },
                    { value: 'weekly', label: 'Week' },
                    { value: 'monthly', label: 'Month' },
                    { value: 'custom', label: 'Custom' },
                  ] as { value: ReportPeriod; label: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setReportPeriod(opt.value)}
                      className={`py-2 px-3 text-sm font-semibold rounded-lg border transition-all ${
                        reportPeriod === opt.value
                          ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                          : 'bg-surfaceHighlight text-textMuted border-surfaceHighlight hover:text-text hover:border-primary/30'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Range */}
              {reportPeriod === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-textMuted mb-1">Start Date</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-surfaceHighlight rounded-lg text-text text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-textMuted mb-1">End Date</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-surfaceHighlight rounded-lg text-text text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}

              {/* Preview */}
              <div className="bg-background border border-surfaceHighlight rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-textMuted">Date Range</span>
                  <span className="text-sm font-semibold text-text">{reportPreview}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-textMuted">Trades Found</span>
                  <span className={`text-sm font-bold ${reportTradeCount > 0 ? 'text-primary' : 'text-textMuted'}`}>{reportTradeCount}</span>
                </div>
              </div>

              {/* Error */}
              {reportError && (
                <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg p-3">
                  {reportError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-surfaceHighlight flex gap-3">
              <button
                onClick={() => { setShowReportModal(false); setReportError(null); }}
                className="flex-1 py-2.5 text-sm font-semibold text-textMuted bg-surfaceHighlight rounded-lg hover:bg-surfaceHighlight/70 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateReport}
                disabled={isGenerating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-primary rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    {reportFormat === 'obsidian' ? 'Download .md' : 'Download .docx'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Trade Detail Modal */}
      {selectedTradeId && (() => {
        const trade = trades.find(t => t.id === selectedTradeId);
        if (!trade) return null;
        return (
          <TradeDetail
            trade={trade}
            trades={trades}
            playbooks={playbooks}
            onClose={() => setSelectedTradeId(null)}
            onNavigate={(id) => setSelectedTradeId(id)}
          />
        );
      })()}
    </div>
  );
};

export default DailyJournal;