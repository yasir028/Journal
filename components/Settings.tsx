
import React, { useState, useEffect } from 'react';
import { CheckInSettings, Trade, TradeType, TradeStatus, Emotion, Playbook } from '../types';
import { Save, Download, Upload, CheckCircle, AlertCircle, Plus, Trash2, Book, Clock, X } from 'lucide-react';

interface SettingsProps {
  trades?: Trade[];
  playbooks?: Playbook[];
  onImportTrades?: (trades: Trade[]) => void;
  onUpdatePlaybooks?: (playbooks: Playbook[]) => void;
  onUpdateSettings?: (settings: CheckInSettings) => void;
  initialSettings?: CheckInSettings;
}

const Settings: React.FC<SettingsProps> = ({ 
  trades = [], 
  playbooks = [], 
  onImportTrades, 
  onUpdatePlaybooks,
  onUpdateSettings,
  initialSettings
}) => {
  // Config state
  const [settings, setSettings] = useState<CheckInSettings>(initialSettings || {
    requirePreTrade: true,
    checkInAfterLoss: true,
    checkInStreak: 2,
    dailyReflectionTime: '17:00',
    marketReviewEnabled: false,
    marketReviewTimes: ['16:00']
  });

  const [newReviewTime, setNewReviewTime] = useState('');

  useEffect(() => {
    if (initialSettings) {
      setSettings(_prev => ({
        ...initialSettings,
        // Backward compatibility if marketReviewTime exists but not marketReviewTimes
        marketReviewTimes: initialSettings.marketReviewTimes ||
          ((initialSettings as any).marketReviewTime ? [(initialSettings as any).marketReviewTime] : [])
      }));
    }
  }, [initialSettings]);

  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');

  // Playbook UI State
  const [newPlaybookName, setNewPlaybookName] = useState('');
  const [newPlaybookDesc, setNewPlaybookDesc] = useState('');

  const handleToggle = (key: keyof CheckInSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveSettings = () => {
    if (onUpdateSettings) {
      onUpdateSettings(settings);
      alert('Preferences saved successfully!');
    }
  };

  const handleAddReviewTime = () => {
    if (newReviewTime && !settings.marketReviewTimes.includes(newReviewTime)) {
      setSettings(prev => ({
        ...prev,
        marketReviewTimes: [...prev.marketReviewTimes, newReviewTime].sort()
      }));
      setNewReviewTime('');
    }
  };

  const handleRemoveReviewTime = (timeToRemove: string) => {
    setSettings(prev => ({
      ...prev,
      marketReviewTimes: prev.marketReviewTimes.filter(t => t !== timeToRemove)
    }));
  };

  // --- PLAYBOOKS ---
  const handleAddPlaybook = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPlaybookName.trim() && onUpdatePlaybooks) {
      const newPlaybook: Playbook = {
        id: `pb_${Date.now()}`,
        name: newPlaybookName.trim(),
        description: newPlaybookDesc.trim()
      };
      onUpdatePlaybooks([...playbooks, newPlaybook]);
      setNewPlaybookName('');
      setNewPlaybookDesc('');
    }
  };

  const handleDeletePlaybook = (id: string) => {
    if (onUpdatePlaybooks && window.confirm('Are you sure you want to delete this playbook? Trades using it will keep the ID but lose the reference.')) {
      onUpdatePlaybooks(playbooks.filter(p => p.id !== id));
    }
  };

  // --- CSV EXPORT ---
  const handleExport = () => {
    if (!trades.length) {
      alert("No trades to export.");
      return;
    }

    // Define headers
    const headers = ['id', 'date', 'symbol', 'type', 'status', 'entryPrice', 'exitPrice', 'stopLoss', 'quantity', 'pnl', 'fees', 'r', 'entryTime', 'exitTime', 'setup', 'playbookId', 'mistakes', 'emotionPre', 'notes'];
    
    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...trades.map(t => {
        return [
          t.id,
          t.date,
          t.symbol,
          t.type,
          t.status,
          t.entryPrice,
          t.exitPrice || '',
          t.stopLoss || '',
          t.quantity,
          t.pnl || 0,
          t.fees || 0,
          t.r || 0,
          t.entryTime || '',
          t.exitTime || '',
          `"${(t.setup || '').replace(/"/g, '""')}"`, 
          t.playbookId || '',
          `"${(t.mistakes?.join(';') || '').replace(/"/g, '""')}"`,
          t.emotionPre,
          `"${(t.notes || '').replace(/"/g, '""')}"`
        ].join(',');
      })
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `mindfultrader_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- CSV IMPORT ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error("File is empty or invalid format");

        // Robust CSV line parser (handles quoted fields)
        const parseLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuote = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
              else { inQuote = !inQuote; }
            } else if (char === ',' && !inQuote) {
              result.push(current); current = '';
            } else {
              current += char;
            }
          }
          result.push(current);
          return result;
        };

        const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());

        // ── Detect format ────────────────────────────────────────────
        // Platform export (NinjaTrader / Tradovate style) has boughtTimestamp + buyPrice
        const isPlatformFormat = headers.includes('boughttimestamp') || headers.includes('buyprice');

        const parsedTrades: Trade[] = [];

        // ── Helper: parse platform PnL  "$144.00" / "$(55.00)" ──────
        const parsePnl = (s: string): number => {
          if (!s) return 0;
          const neg = s.includes('(');
          const clean = s.replace(/[$(),\s]/g, '');
          return neg ? -parseFloat(clean) : parseFloat(clean);
        };

        // ── Helper: parse "MM/DD/YYYY HH:MM:SS" → { date, time } ───
        const parseTimestamp = (ts: string): { date: string; time: string } => {
          const [datePart = '', timePart = ''] = ts.trim().split(' ');
          const [mm = '01', dd = '01', yyyy = '2000'] = datePart.split('/');
          return {
            date: `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
            time: timePart,
          };
        };

        for (let i = 1; i < lines.length; i++) {
          const row = parseLine(lines[i]);
          const getVal = (keys: string[]) => {
            const idx = headers.findIndex(h => keys.includes(h));
            return idx !== -1 ? row[idx]?.trim() : undefined;
          };

          const symbol = getVal(['symbol']);
          if (!symbol) continue;

          if (isPlatformFormat) {
            // ── Platform format ──────────────────────────────────────
            const boughtTs = getVal(['boughttimestamp']) || '';
            const soldTs   = getVal(['soldtimestamp'])   || '';
            const bought   = parseTimestamp(boughtTs);
            const sold     = parseTimestamp(soldTs);

            // LONG = bought before sold; SHORT = sold before bought
            const boughtMs = new Date(`${bought.date}T${bought.time}`).getTime();
            const soldMs   = new Date(`${sold.date}T${sold.time}`).getTime();
            const isLong   = boughtMs <= soldMs;
            const type     = isLong ? TradeType.LONG : TradeType.SHORT;

            const buyPrice  = parseFloat(getVal(['buyprice'])  || '0');
            const sellPrice = parseFloat(getVal(['sellprice']) || '0');
            const entryPrice = isLong ? buyPrice  : sellPrice;
            const exitPrice  = isLong ? sellPrice : buyPrice;
            const entryTime  = isLong ? bought.time : sold.time;
            const exitTime   = isLong ? sold.time   : bought.time;
            const date       = isLong ? bought.date  : sold.date;

            const pnlRaw = getVal(['pnl']) || '';
            const pnl    = parsePnl(pnlRaw);
            const qty    = parseFloat(getVal(['qty', 'quantity']) || '0');

            parsedTrades.push({
              id:          `${getVal(['buyfillid']) || Date.now()}_${getVal(['sellfillid']) || i}`,
              date,
              symbol:      symbol.toUpperCase(),
              type,
              status:      TradeStatus.CLOSED,
              entryPrice,
              exitPrice,
              quantity:    qty,
              pnl,
              entryTime,
              exitTime,
              emotionPre:  Emotion.NEUTRAL,
              notes:       '',
              setup:       '',
            });

          } else {
            // ── Internal format (existing export schema) ─────────────
            const date     = getVal(['date']) || new Date().toISOString().slice(0, 10);
            const sideStr  = getVal(['side', 'type'])?.toUpperCase();
            const type     = sideStr === 'SHORT' ? TradeType.SHORT : TradeType.LONG;
            const quantity = parseFloat(getVal(['qty', 'quantity']) || '0');
            const entryPrice = parseFloat(getVal(['entry', 'entryprice']) || '0');
            const exitStr  = getVal(['exit', 'exitprice']);
            const exitPrice  = exitStr ? parseFloat(exitStr) : undefined;
            const stopStr  = getVal(['stop', 'stoploss']);
            const stopLoss   = stopStr ? parseFloat(stopStr) : undefined;
            const pnlStr   = getVal(['pnl']);
            const pnl      = pnlStr ? parseFloat(pnlStr) : undefined;
            const feesStr  = getVal(['fees', 'commission', 'commissions']);
            const fees     = feesStr ? parseFloat(feesStr) : undefined;
            const rStr     = getVal(['r']);
            let r          = rStr ? parseFloat(rStr) : undefined;
            const entryTime  = getVal(['entrytime', 'time']);
            const exitTime   = getVal(['exittime']);
            const setup      = getVal(['setup']) || '';
            const emotionStr = getVal(['emotionpre', 'emotion']);
            const emotionPre = Object.values(Emotion).includes(emotionStr as Emotion)
              ? (emotionStr as Emotion) : Emotion.NEUTRAL;
            const rawNotes = getVal(['notes']) || '';
            const tags     = getVal(['tags']);
            const notes    = tags ? `${rawNotes}\nTags: ${tags}`.trim() : rawNotes;
            const mistakesStr = getVal(['mistakes']);
            const mistakes = mistakesStr ? mistakesStr.split(';').map(m => m.trim()) : undefined;
            const playbookId = getVal(['playbookid', 'playbook']);

            let status = TradeStatus.OPEN;
            const statusVal = getVal(['status'])?.toUpperCase();
            if (statusVal === 'CLOSED' || statusVal === 'OPEN' || statusVal === 'BE') {
              status = statusVal as TradeStatus;
            } else if (exitPrice !== undefined || pnl !== undefined) {
              status = TradeStatus.CLOSED;
            }

            if (r === undefined && entryPrice && stopLoss && exitPrice) {
              const risk   = Math.abs(entryPrice - stopLoss);
              const reward = type === TradeType.LONG ? exitPrice - entryPrice : entryPrice - exitPrice;
              if (risk > 0) r = parseFloat((reward / risk).toFixed(2));
            }

            parsedTrades.push({
              id: getVal(['id']) || (Date.now() + i).toString(),
              date, symbol: symbol.toUpperCase(), type, status,
              entryPrice, exitPrice, stopLoss, quantity, pnl, fees, r,
              entryTime, exitTime, setup, playbookId, mistakes, emotionPre, notes,
            });
          }
        }

        if (onImportTrades) {
          onImportTrades(parsedTrades);
          setImportStatus('success');
          setImportMessage(`Successfully imported ${parsedTrades.length} trade${parsedTrades.length !== 1 ? 's' : ''} (${isPlatformFormat ? 'platform export' : 'internal'} format).`);
        }
      } catch (err) {
        setImportStatus('error');
        setImportMessage("Failed to parse CSV. Check the file format.");
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      
      {/* SECTION 1: PLAYBOOKS */}
      <div>
        <h2 className="text-2xl font-bold text-text mb-6">Strategy & Playbooks</h2>
        <div className="bg-surface rounded-xl border border-surfaceHighlight overflow-hidden">
          <div className="p-6 border-b border-surfaceHighlight">
            <h3 className="text-lg font-semibold text-text mb-1 flex items-center gap-2"><Book size={18} /> Manage Playbooks</h3>
            <p className="text-sm text-textMuted">Define your strategies to track performance by playbook.</p>
          </div>

          <div className="p-6">
            <div className="space-y-3 mb-6">
              {playbooks.map(pb => (
                <div key={pb.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-surfaceHighlight">
                  <div>
                    <h4 className="font-semibold text-text text-sm">{pb.name}</h4>
                    <p className="text-xs text-textMuted">{pb.description}</p>
                  </div>
                  <button onClick={() => handleDeletePlaybook(pb.id)} className="text-textMuted hover:text-danger p-2"><Trash2 size={16}/></button>
                </div>
              ))}
              {playbooks.length === 0 && <p className="text-sm text-textMuted italic">No playbooks defined yet.</p>}
            </div>

            <form onSubmit={handleAddPlaybook} className="flex flex-col gap-3 bg-surfaceHighlight/20 p-4 rounded-lg">
              <span className="text-xs font-semibold text-textMuted uppercase">Add New Playbook</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input 
                  type="text" 
                  value={newPlaybookName} 
                  onChange={e => setNewPlaybookName(e.target.value)} 
                  placeholder="Playbook Name (e.g. Gap & Go)"
                  className="bg-background border border-surfaceHighlight rounded px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
                <input 
                  type="text" 
                  value={newPlaybookDesc} 
                  onChange={e => setNewPlaybookDesc(e.target.value)} 
                  placeholder="Description (Optional)"
                  className="bg-background border border-surfaceHighlight rounded px-3 py-2 text-sm text-text outline-none focus:border-primary"
                />
              </div>
              <button type="submit" disabled={!newPlaybookName} className="self-end px-4 py-2 bg-primary disabled:opacity-50 text-white text-xs font-bold rounded hover:bg-blue-600 transition-colors flex items-center gap-2">
                <Plus size={14}/> Add Playbook
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* SECTION 2: DATA MANAGEMENT */}
      <div>
        <h2 className="text-2xl font-bold text-text mb-6">Data Management</h2>
        <div className="bg-surface rounded-xl border border-surfaceHighlight overflow-hidden">
          <div className="p-6 border-b border-surfaceHighlight">
            <h3 className="text-lg font-semibold text-text mb-1">Import / Export</h3>
            <p className="text-sm text-textMuted">Backup your journal or migrate data from other platforms.</p>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* EXPORT */}
            <div className="bg-background/50 border border-surfaceHighlight rounded-xl p-5 flex flex-col items-center justify-center text-center hover:border-gray-600 transition-colors">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-primary mb-3">
                <Download size={24} />
              </div>
              <h4 className="font-semibold text-text mb-1">Export Data</h4>
              <p className="text-xs text-textMuted mb-4">Download all trades as a .csv file</p>
              <button 
                onClick={handleExport}
                className="px-4 py-2 bg-surfaceHighlight hover:bg-gray-700 text-text text-sm font-medium rounded-lg transition-colors border border-gray-600"
              >
                Download CSV
              </button>
            </div>

            {/* IMPORT */}
            <div className="bg-background/50 border border-surfaceHighlight rounded-xl p-5 flex flex-col items-center justify-center text-center hover:border-gray-600 transition-colors relative">
               <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-accent mb-3">
                <Upload size={24} />
              </div>
              <h4 className="font-semibold text-text mb-1">Import Data</h4>
              <p className="text-xs text-textMuted mb-4">Upload a .csv file to load trades</p>
              
              <label className="px-4 py-2 bg-surfaceHighlight hover:bg-gray-700 text-text text-sm font-medium rounded-lg transition-colors border border-gray-600 cursor-pointer">
                Select File
                <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
              </label>

              {importStatus === 'success' && (
                <div className="absolute inset-0 bg-surface/95 flex flex-col items-center justify-center rounded-xl animate-in fade-in">
                  <CheckCircle className="text-success mb-2" size={32} />
                  <p className="text-success font-bold">Import Complete</p>
                  <p className="text-xs text-textMuted mt-1">{importMessage}</p>
                  <button onClick={() => setImportStatus('idle')} className="mt-3 text-xs underline text-textMuted hover:text-text">Dismiss</button>
                </div>
              )}

              {importStatus === 'error' && (
                <div className="absolute inset-0 bg-surface/95 flex flex-col items-center justify-center rounded-xl animate-in fade-in">
                  <AlertCircle className="text-danger mb-2" size={32} />
                  <p className="text-danger font-bold">Import Failed</p>
                  <p className="text-xs text-textMuted mt-1">{importMessage}</p>
                  <button onClick={() => setImportStatus('idle')} className="mt-3 text-xs underline text-textMuted hover:text-text">Try Again</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: CONFIG */}
      <div>
        <h2 className="text-2xl font-bold text-text mb-6">Mindfulness Configuration</h2>
        <div className="bg-surface rounded-xl border border-surfaceHighlight overflow-hidden">
          <div className="p-6 border-b border-surfaceHighlight">
            <h3 className="text-lg font-semibold text-text mb-1">Triggers & Prompts</h3>
            <p className="text-sm text-textMuted">Define when the app should interrupt you for a mental check-in.</p>
          </div>
          
          <div className="divide-y divide-gray-800">
            {/* Question 1: Pre-trade strictness */}
            <div className="p-6 flex items-center justify-between">
              <div>
                <p className="text-text font-medium">Pre-Trade Checklist Required</p>
                <p className="text-xs text-textMuted mt-1">Force a checklist popup before logging a new trade.</p>
              </div>
              <button 
                onClick={() => handleToggle('requirePreTrade')}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.requirePreTrade ? 'bg-success' : 'bg-gray-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.requirePreTrade ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {/* Question 2: Loss triggers */}
            <div className="p-6 flex items-center justify-between">
              <div>
                <p className="text-text font-medium">Auto-Check After Loss</p>
                <p className="text-xs text-textMuted mt-1">Trigger AI Coach immediately after closing a losing trade.</p>
              </div>
              <button 
                onClick={() => handleToggle('checkInAfterLoss')}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.checkInAfterLoss ? 'bg-success' : 'bg-gray-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.checkInAfterLoss ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

             {/* Question 3: Streak definition */}
             <div className="p-6 flex items-center justify-between">
              <div>
                <p className="text-text font-medium">Tilt Prevention (Loss Streak)</p>
                <p className="text-xs text-textMuted mt-1">How many losses in a row constitute a "Streak"?</p>
              </div>
              <div className="flex items-center gap-3">
                 <input
                   type="number"
                   min="1"
                   value={settings.checkInStreak}
                   onChange={(e) => {
                     const val = parseInt(e.target.value);
                     if (!isNaN(val) && val >= 1) {
                       setSettings(p => ({ ...p, checkInStreak: val }));
                     }
                   }}
                   className="w-20 bg-background border border-surfaceHighlight rounded px-3 py-1.5 text-sm text-text outline-none focus:border-primary text-center"
                 />
                 <span className="text-sm text-textMuted">losses</span>
              </div>
            </div>

            {/* Question 4: Market Review Notifications */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-start gap-3">
                  <Clock size={20} className="text-primary mt-1" />
                  <div>
                    <p className="text-text font-medium">Daily Market Review Notifications</p>
                    <p className="text-xs text-textMuted mt-1">Get notifications to review your trades and market context.</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleToggle('marketReviewEnabled')}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.marketReviewEnabled ? 'bg-success' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.marketReviewEnabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {settings.marketReviewEnabled && (
                <div className="ml-8 bg-surfaceHighlight/20 p-4 rounded-lg animate-in slide-in-from-top-2">
                  <div className="flex items-center gap-4 mb-3">
                    <input 
                      type="time" 
                      value={newReviewTime} 
                      onChange={(e) => setNewReviewTime(e.target.value)}
                      className="bg-background border border-surfaceHighlight rounded px-3 py-1.5 text-sm text-text outline-none focus:border-primary"
                    />
                    <button 
                      onClick={handleAddReviewTime}
                      disabled={!newReviewTime}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs font-bold rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
                    >
                      <Plus size={12} /> Add Time
                    </button>
                  </div>
                  
                  {settings.marketReviewTimes && settings.marketReviewTimes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {settings.marketReviewTimes.map((time, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-surfaceHighlight border border-gray-700 px-3 py-1 rounded-full text-sm text-text">
                          <Clock size={12} className="text-primary"/>
                          <span>{time}</span>
                          <button onClick={() => handleRemoveReviewTime(time)} className="hover:text-danger ml-1 transition-colors"><X size={14}/></button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-textMuted italic">No active times set.</p>
                  )}
                </div>
              )}
            </div>

          </div>
          
          <div className="p-6 bg-surfaceHighlight/30 flex justify-end">
             <button onClick={handleSaveSettings} className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 font-medium">
               <Save size={18} />
               Save Preferences
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
