
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckInSettings, Trade, TradeType, TradeStatus, Emotion, Playbook, Instrument, FUTURES_CONTRACTS } from '../types';
import { Save, Download, Upload, CheckCircle, AlertCircle, Plus, Trash2, Book, Clock, X, FileUp, Eye, ArrowRight, RefreshCw } from 'lucide-react';

interface SettingsProps {
  trades?: Trade[];
  playbooks?: Playbook[];
  onImportTrades?: (trades: Trade[]) => void;
  onBatchImport?: (trades: Trade[]) => Promise<{ imported: number; skipped: number }>;
  onUpdatePlaybooks?: (playbooks: Playbook[]) => void;
  onUpdateSettings?: (settings: CheckInSettings) => void;
  initialSettings?: CheckInSettings;
}

const Settings: React.FC<SettingsProps> = ({
  trades = [],
  playbooks = [],
  onImportTrades,
  onBatchImport,
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

  // ── Tradovate Import State ─────────────────────────────────────
  const [tvParsedTrades, setTvParsedTrades] = useState<Trade[]>([]);
  const [tvSelected, setTvSelected] = useState<Set<string>>(new Set());
  const [tvImporting, setTvImporting] = useState(false);
  const [tvResult, setTvResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [tvError, setTvError] = useState('');
  const [tvDragOver, setTvDragOver] = useState(false);
  const tvFileRef = useRef<HTMLInputElement>(null);

  // ── Tradovate CSV Parser ───────────────────────────────────────
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

  const parsePnl = (s: string): number => {
    if (!s) return 0;
    const neg = s.includes('(');
    const clean = s.replace(/[$(),\s]/g, '');
    return neg ? -parseFloat(clean) : parseFloat(clean);
  };

  const parseTimestamp = (ts: string): { date: string; time: string } => {
    const [datePart = '', timePart = ''] = ts.trim().split(' ');
    const [mm = '01', dd = '01', yyyy = '2000'] = datePart.split('/');
    return {
      date: `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
      time: timePart,
    };
  };

  const generateTradovateId = (date: string, symbol: string, entryTime: string, entryPrice: number, exitPrice: number): string => {
    const raw = `${date}|${symbol}|${entryTime}|${entryPrice}|${exitPrice}`;
    // Simple hash
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const chr = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return `tv-${Math.abs(hash).toString(36)}`;
  };

  const handleTradovateFile = useCallback((file: File) => {
    setTvError('');
    setTvResult(null);
    setTvParsedTrades([]);

    if (!file.name.endsWith('.csv')) {
      setTvError('Please upload a .csv file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error('File is empty or invalid');

        const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
        const isPlatform = headers.includes('boughttimestamp') || headers.includes('buyprice');

        if (!isPlatform) {
          setTvError('This does not appear to be a Tradovate CSV export. Please export from Tradovate Performance tab.');
          return;
        }

        const parsed: Trade[] = [];
        for (let i = 1; i < lines.length; i++) {
          const row = parseLine(lines[i]);
          const getVal = (keys: string[]) => {
            const idx = headers.findIndex(h => keys.includes(h));
            return idx !== -1 ? row[idx]?.trim() : undefined;
          };

          const symbol = getVal(['symbol']);
          if (!symbol) continue;

          const boughtTs = getVal(['boughttimestamp']) || '';
          const soldTs   = getVal(['soldtimestamp'])   || '';
          const bought   = parseTimestamp(boughtTs);
          const sold     = parseTimestamp(soldTs);

          const boughtMs = new Date(`${bought.date}T${bought.time}`).getTime();
          const soldMs   = new Date(`${sold.date}T${sold.time}`).getTime();
          const isLong   = boughtMs <= soldMs;

          const buyPrice  = parseFloat(getVal(['buyprice'])  || '0');
          const sellPrice = parseFloat(getVal(['sellprice']) || '0');
          const entryPrice = isLong ? buyPrice  : sellPrice;
          const exitPrice  = isLong ? sellPrice : buyPrice;
          const entryTime  = isLong ? bought.time : sold.time;
          const exitTime   = isLong ? sold.time   : bought.time;
          const date       = isLong ? bought.date  : sold.date;
          const pnl        = parsePnl(getVal(['pnl']) || '');
          const qty        = parseFloat(getVal(['qty', 'quantity']) || '0');
          const fees       = parsePnl(getVal(['fees', 'commission', 'commissions']) || '');

          // Clean symbol — strip contract month/year (e.g. "MESM5" → "MES")
          const cleanSymbol = symbol.replace(/[A-Z]\d+$/i, '').toUpperCase();
          const futureContract = FUTURES_CONTRACTS.find(f => f.symbol === cleanSymbol);

          const tradeId = generateTradovateId(date, cleanSymbol, entryTime, entryPrice, exitPrice);

          parsed.push({
            id: tradeId,
            date,
            symbol: cleanSymbol,
            instrument: Instrument.FUTURE,
            type: isLong ? TradeType.LONG : TradeType.SHORT,
            status: TradeStatus.CLOSED,
            entryPrice,
            exitPrice,
            quantity: qty,
            pnl: futureContract ? undefined : pnl, // recalculate if we know multiplier
            fees: Math.abs(fees),
            entryTime,
            exitTime,
            emotionPre: Emotion.NEUTRAL,
            notes: '',
            setup: '',
            tags: ['tradovate'],
          });

          // Recalculate PnL using futures multiplier if available
          const lastTrade = parsed[parsed.length - 1];
          if (futureContract && lastTrade.exitPrice !== undefined) {
            const diff = lastTrade.type === TradeType.LONG
              ? (lastTrade.exitPrice - lastTrade.entryPrice)
              : (lastTrade.entryPrice - lastTrade.exitPrice);
            lastTrade.pnl = parseFloat((diff * futureContract.multiplier * lastTrade.quantity).toFixed(2));
          } else {
            lastTrade.pnl = pnl;
          }
        }

        if (parsed.length === 0) {
          setTvError('No trades found in the CSV file.');
          return;
        }

        setTvParsedTrades(parsed);
        setTvSelected(new Set(parsed.map(t => t.id)));
      } catch (err) {
        setTvError('Failed to parse CSV file. Make sure it\'s exported from Tradovate Performance tab.');
        console.error(err);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleTvDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setTvDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleTradovateFile(file);
  }, [handleTradovateFile]);

  const handleTvImport = async () => {
    const selectedTrades = tvParsedTrades.filter(t => tvSelected.has(t.id));
    if (selectedTrades.length === 0) return;

    setTvImporting(true);
    setTvError('');

    try {
      if (onBatchImport) {
        const result = await onBatchImport(selectedTrades);
        setTvResult(result);
        setTvParsedTrades([]);
      }
    } catch (err) {
      setTvError('Import failed. Please try again.');
      console.error(err);
    } finally {
      setTvImporting(false);
    }
  };

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

      {/* SECTION: BROKER IMPORT */}
      <div>
        <h2 className="text-2xl font-bold text-text mb-6">Broker Import</h2>
        <div className="bg-surface rounded-xl border border-surfaceHighlight overflow-hidden">
          <div className="p-6 border-b border-surfaceHighlight">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <span className="text-lg font-bold text-orange-400">T</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text">Import from Tradovate</h3>
                <p className="text-sm text-textMuted">Import completed trades from your Tradovate account</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Instructions */}
            <div className="bg-background/60 rounded-lg p-4 border border-surfaceHighlight">
              <p className="text-xs font-semibold text-textMuted uppercase mb-3">How to export from Tradovate</p>
              <ol className="space-y-2 text-sm text-textMuted">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">1</span>
                  <span>Log into <strong className="text-text">Tradovate</strong> and go to the <strong className="text-text">Performance</strong> tab</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">2</span>
                  <span>Set the <strong className="text-text">date range</strong> for trades you want to import</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">3</span>
                  <span>Click the <strong className="text-text">Export</strong> button to download the CSV</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">4</span>
                  <span>Drag the file below or click to browse</span>
                </li>
              </ol>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setTvDragOver(true); }}
              onDragLeave={() => setTvDragOver(false)}
              onDrop={handleTvDrop}
              onClick={() => tvFileRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                tvDragOver
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : 'border-surfaceHighlight hover:border-gray-500 hover:bg-background/50'
              }`}
            >
              <input
                ref={tvFileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleTradovateFile(file);
                  e.target.value = '';
                }}
              />
              <FileUp size={32} className={`mx-auto mb-3 ${tvDragOver ? 'text-primary' : 'text-textMuted'}`} />
              <p className="text-text font-medium">Drop Tradovate CSV here</p>
              <p className="text-xs text-textMuted mt-1">or click to browse files</p>
            </div>

            {/* Error */}
            {tvError && (
              <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg">
                <AlertCircle size={16} className="text-danger flex-shrink-0" />
                <p className="text-sm text-danger">{tvError}</p>
              </div>
            )}

            {/* Success Result */}
            {tvResult && (
              <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/30 rounded-lg">
                <CheckCircle size={20} className="text-success flex-shrink-0" />
                <div>
                  <p className="text-success font-semibold">Import Complete</p>
                  <p className="text-sm text-textMuted">
                    {tvResult.imported} trade{tvResult.imported !== 1 ? 's' : ''} imported
                    {tvResult.skipped > 0 && `, ${tvResult.skipped} duplicate${tvResult.skipped !== 1 ? 's' : ''} skipped`}
                  </p>
                </div>
                <button onClick={() => setTvResult(null)} className="ml-auto text-textMuted hover:text-text"><X size={16} /></button>
              </div>
            )}

            {/* Preview Table */}
            {tvParsedTrades.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye size={16} className="text-primary" />
                    <h4 className="text-text font-semibold text-sm">Preview ({tvParsedTrades.length} trades found)</h4>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-textMuted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tvSelected.size === tvParsedTrades.length}
                        onChange={(e) => {
                          setTvSelected(e.target.checked ? new Set(tvParsedTrades.map(t => t.id)) : new Set());
                        }}
                        className="rounded"
                      />
                      Select All
                    </label>
                  </div>
                </div>

                <div className="max-h-72 overflow-auto border border-surfaceHighlight rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-surfaceHighlight/50 sticky top-0">
                      <tr>
                        <th className="w-8 p-2"></th>
                        <th className="text-left p-2 text-textMuted font-medium">Date</th>
                        <th className="text-left p-2 text-textMuted font-medium">Symbol</th>
                        <th className="text-left p-2 text-textMuted font-medium">Side</th>
                        <th className="text-right p-2 text-textMuted font-medium">Entry</th>
                        <th className="text-right p-2 text-textMuted font-medium">Exit</th>
                        <th className="text-right p-2 text-textMuted font-medium">Qty</th>
                        <th className="text-right p-2 text-textMuted font-medium">P&L</th>
                        <th className="text-right p-2 text-textMuted font-medium">Fees</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surfaceHighlight">
                      {tvParsedTrades.map(trade => (
                        <tr key={trade.id} className={`hover:bg-surfaceHighlight/30 ${!tvSelected.has(trade.id) ? 'opacity-40' : ''}`}>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={tvSelected.has(trade.id)}
                              onChange={() => {
                                setTvSelected(prev => {
                                  const next = new Set(prev);
                                  next.has(trade.id) ? next.delete(trade.id) : next.add(trade.id);
                                  return next;
                                });
                              }}
                              className="rounded"
                            />
                          </td>
                          <td className="p-2 text-text">{trade.date}</td>
                          <td className="p-2 text-text font-medium">{trade.symbol}</td>
                          <td className="p-2">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${trade.type === TradeType.LONG ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                              {trade.type}
                            </span>
                          </td>
                          <td className="p-2 text-right text-text">{trade.entryPrice.toFixed(2)}</td>
                          <td className="p-2 text-right text-text">{trade.exitPrice?.toFixed(2)}</td>
                          <td className="p-2 text-right text-text">{trade.quantity}</td>
                          <td className={`p-2 text-right font-semibold ${(trade.pnl ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                            ${(trade.pnl ?? 0).toFixed(2)}
                          </td>
                          <td className="p-2 text-right text-textMuted">${(trade.fees ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-surfaceHighlight/30 border-t border-surfaceHighlight">
                      <tr>
                        <td colSpan={7} className="p-2 text-right text-textMuted font-medium">Total P&L:</td>
                        <td className={`p-2 text-right font-bold ${
                          tvParsedTrades.filter(t => tvSelected.has(t.id)).reduce((s, t) => s + (t.pnl ?? 0), 0) >= 0 ? 'text-success' : 'text-danger'
                        }`}>
                          ${tvParsedTrades.filter(t => tvSelected.has(t.id)).reduce((s, t) => s + (t.pnl ?? 0), 0).toFixed(2)}
                        </td>
                        <td className="p-2 text-right text-textMuted">
                          ${tvParsedTrades.filter(t => tvSelected.has(t.id)).reduce((s, t) => s + (t.fees ?? 0), 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Import Button */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => { setTvParsedTrades([]); setTvSelected(new Set()); }}
                    className="text-sm text-textMuted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTvImport}
                    disabled={tvSelected.size === 0 || tvImporting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {tvImporting ? (
                      <><RefreshCw size={16} className="animate-spin" /> Importing...</>
                    ) : (
                      <><ArrowRight size={16} /> Import {tvSelected.size} Trade{tvSelected.size !== 1 ? 's' : ''}</>
                    )}
                  </button>
                </div>
              </div>
            )}
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
