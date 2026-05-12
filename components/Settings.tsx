
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckInSettings, Trade, TradeType, Playbook } from '../types';
import { Save, Download, CheckCircle, AlertCircle, Plus, Trash2, Book, Clock, X, FileUp, Eye, ArrowRight, RefreshCw, ChevronDown, FolderOpen } from 'lucide-react';
import { parseCSV, BrokerFormat } from '../services/brokerParsers';

interface SettingsProps {
  trades?: Trade[];
  playbooks?: Playbook[];
  onImportTrades?: (trades: Trade[]) => void;
  onBatchImport?: (trades: Trade[]) => Promise<{ imported: number; skipped: number }>;
  onUpdatePlaybooks?: (playbooks: Playbook[]) => void;
  onUpdateSettings?: (settings: CheckInSettings) => void;
  initialSettings?: CheckInSettings;
}

const FORMAT_CONFIG: Record<BrokerFormat, { label: string; color: string; bgColor: string }> = {
  tradovate: { label: 'Tradovate', color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  interactivebrokers: { label: 'Interactive Brokers', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  questrade: { label: 'Questrade', color: 'text-green-400', bgColor: 'bg-green-500/10' },
  internal: { label: 'MindfulTrader', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  unknown: { label: 'Unknown', color: 'text-textMuted', bgColor: 'bg-surfaceHighlight' },
};

const Settings: React.FC<SettingsProps> = ({
  trades = [],
  playbooks = [],
  onImportTrades,
  onBatchImport,
  onUpdatePlaybooks,
  onUpdateSettings,
  initialSettings
}) => {
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
        marketReviewTimes: initialSettings.marketReviewTimes ||
          ((initialSettings as any).marketReviewTime ? [(initialSettings as any).marketReviewTime] : [])
      }));
    }
  }, [initialSettings]);

  // Playbook UI State
  const [newPlaybookName, setNewPlaybookName] = useState('');
  const [newPlaybookDesc, setNewPlaybookDesc] = useState('');

  // ── Unified Import State ──────────────────────────────────────
  const [parsedTrades, setParsedTrades] = useState<Trade[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState('');
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<BrokerFormat | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Obsidian Integration
  const [obsidianPath,       setObsidianPath]       = useState('');
  const [obsidianSaveStatus, setObsidianSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [obsidianTestStatus, setObsidianTestStatus] = useState<'idle'|'testing'|'ok'|'error'>('idle');
  const [obsidianTestMsg,    setObsidianTestMsg]    = useState('');

  useEffect(() => {
    fetch('http://localhost:3001/obsidian/path')
      .then(r => r.json())
      .then(d => { if (d.path) setObsidianPath(d.path); })
      .catch(() => {});
  }, []);

  // ── Broker File Handler ───────────────────────────────────────
  const handleBrokerFile = useCallback((file: File) => {
    setImportError('');
    setImportResult(null);
    setParsedTrades([]);
    setDetectedFormat(null);
    setImportWarnings([]);

    if (!file.name.endsWith('.csv')) {
      setImportError('Please upload a .csv file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseCSV(text);

        if (result.format === 'unknown') {
          setImportError('Unrecognized CSV format. Supported: Tradovate, Interactive Brokers, Questrade, or a previous MindfulTrader export.');
          return;
        }

        if (result.trades.length === 0) {
          setImportError(`Detected ${result.formatLabel} format but found no trades.${result.warnings.length ? ' ' + result.warnings[0] : ''}`);
          return;
        }

        setDetectedFormat(result.format);
        setParsedTrades(result.trades);
        setSelectedIds(new Set(result.trades.map(t => t.id)));
        setImportWarnings(result.warnings);
      } catch (err) {
        setImportError('Failed to parse CSV file. Please check the file format.');
        console.error(err);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleBrokerFile(file);
  }, [handleBrokerFile]);

  const handleImport = async () => {
    const selected = parsedTrades.filter(t => selectedIds.has(t.id));
    if (selected.length === 0) return;

    setImporting(true);
    setImportError('');

    try {
      if (onBatchImport) {
        const result = await onBatchImport(selected);
        setImportResult(result);
        setParsedTrades([]);
      } else if (onImportTrades) {
        onImportTrades(selected);
        setImportResult({ imported: selected.length, skipped: 0 });
        setParsedTrades([]);
      }
    } catch (err) {
      setImportError('Import failed. Please try again.');
      console.error(err);
    } finally {
      setImporting(false);
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

  const handleSaveObsidianPath = async () => {
    setObsidianSaveStatus('saving');
    try {
      const res = await fetch('http://localhost:3001/obsidian/path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultPath: obsidianPath.trim() }),
      });
      if (res.ok) {
        setObsidianSaveStatus('saved');
        setTimeout(() => setObsidianSaveStatus('idle'), 2500);
      } else {
        setObsidianSaveStatus('error');
      }
    } catch {
      setObsidianSaveStatus('error');
    }
  };

  const handleTestObsidianPath = async () => {
    setObsidianTestStatus('testing');
    setObsidianTestMsg('');
    const today = new Date().toISOString().split('T')[0];
    try {
      const res  = await fetch(`http://localhost:3001/obsidian/load/${today}`);
      const data = await res.json();
      if (res.ok) {
        setObsidianTestStatus('ok');
        setObsidianTestMsg(`✅ Connected! Found: ${data.filename}`);
      } else if (data.error === 'no-path') {
        setObsidianTestStatus('error');
        setObsidianTestMsg('❌ Save your path first, then test.');
      } else if (data.error === 'not-found') {
        setObsidianTestStatus('error');
        setObsidianTestMsg(`⚠️ Path is correct but no note for today (${data.filename}). Will work on days you have notes.`);
      } else {
        setObsidianTestStatus('error');
        setObsidianTestMsg(`❌ ${data.error}`);
      }
    } catch {
      setObsidianTestStatus('error');
      setObsidianTestMsg('❌ Could not reach server. Is server.cjs running?');
    }
    setTimeout(() => { setObsidianTestStatus('idle'); setObsidianTestMsg(''); }, 7000);
  };

  // --- CSV EXPORT ---
  const handleExport = () => {
    if (!trades.length) {
      alert("No trades to export.");
      return;
    }

    const headers = ['id', 'date', 'symbol', 'instrument', 'type', 'status', 'entryPrice', 'exitPrice', 'stopLoss', 'quantity', 'pnl', 'fees', 'r', 'entryTime', 'exitTime', 'setup', 'playbookId', 'mistakes', 'emotionPre', 'notes', 'tags', 'accountId'];

    const csvContent = [
      headers.join(','),
      ...trades.map(t => {
        return [
          t.id,
          t.date,
          t.symbol,
          t.instrument || '',
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
          `"${(t.notes || '').replace(/"/g, '""')}"`,
          `"${(t.tags?.join(';') || '').replace(/"/g, '""')}"`,
          t.accountId || '',
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `mindfultrader_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatConfig = detectedFormat ? FORMAT_CONFIG[detectedFormat] : null;

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

      {/* SECTION: UNIFIED IMPORT */}
      <div>
        <h2 className="text-2xl font-bold text-text mb-6">Import Trades</h2>
        <div className="bg-surface rounded-xl border border-surfaceHighlight overflow-hidden">
          <div className="p-6 border-b border-surfaceHighlight">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileUp size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text">Import from Broker</h3>
                <p className="text-sm text-textMuted">Auto-detects Tradovate, Interactive Brokers, Questrade, or MindfulTrader exports</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Collapsible Broker Instructions */}
            <div className="space-y-2">
              <details className="bg-background/60 rounded-lg border border-surfaceHighlight group">
                <summary className="p-3 cursor-pointer text-sm text-textMuted hover:text-text flex items-center gap-2">
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                  <span className="font-semibold text-orange-400">Tradovate</span>
                  <span className="text-textMuted">— How to export</span>
                </summary>
                <ol className="px-4 pb-3 space-y-1.5 text-sm text-textMuted ml-5">
                  <li>1. Log into Tradovate and go to the <strong className="text-text">Performance</strong> tab</li>
                  <li>2. Set the date range for trades you want to import</li>
                  <li>3. Click <strong className="text-text">Export</strong> to download the CSV</li>
                </ol>
              </details>

              <details className="bg-background/60 rounded-lg border border-surfaceHighlight group">
                <summary className="p-3 cursor-pointer text-sm text-textMuted hover:text-text flex items-center gap-2">
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                  <span className="font-semibold text-red-400">Interactive Brokers</span>
                  <span className="text-textMuted">— How to export</span>
                </summary>
                <ol className="px-4 pb-3 space-y-1.5 text-sm text-textMuted ml-5">
                  <li>1. Log into <strong className="text-text">Client Portal</strong> or <strong className="text-text">TWS</strong></li>
                  <li>2. Go to <strong className="text-text">Reports &gt; Activity Statements</strong> or use <strong className="text-text">Flex Queries</strong></li>
                  <li>3. Select the period and export as <strong className="text-text">CSV</strong></li>
                  <li>4. Make sure the <strong className="text-text">Trades</strong> section is included</li>
                </ol>
              </details>

              <details className="bg-background/60 rounded-lg border border-surfaceHighlight group">
                <summary className="p-3 cursor-pointer text-sm text-textMuted hover:text-text flex items-center gap-2">
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                  <span className="font-semibold text-green-400">Questrade</span>
                  <span className="text-textMuted">— How to export</span>
                </summary>
                <ol className="px-4 pb-3 space-y-1.5 text-sm text-textMuted ml-5">
                  <li>1. Log into Questrade and go to <strong className="text-text">Accounts &gt; Activity</strong></li>
                  <li>2. Set the date range and filter by <strong className="text-text">Trades</strong></li>
                  <li>3. Click <strong className="text-text">Export</strong> to download the CSV</li>
                </ol>
              </details>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : 'border-surfaceHighlight hover:border-gray-500 hover:bg-background/50'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBrokerFile(file);
                  e.target.value = '';
                }}
              />
              <FileUp size={32} className={`mx-auto mb-3 ${dragOver ? 'text-primary' : 'text-textMuted'}`} />
              <p className="text-text font-medium">Drop broker CSV here</p>
              <p className="text-xs text-textMuted mt-1">or click to browse files</p>
            </div>

            {/* Error */}
            {importError && (
              <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg">
                <AlertCircle size={16} className="text-danger flex-shrink-0" />
                <p className="text-sm text-danger">{importError}</p>
              </div>
            )}

            {/* Warnings */}
            {importWarnings.length > 0 && parsedTrades.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <AlertCircle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-300">
                  {importWarnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              </div>
            )}

            {/* Success Result */}
            {importResult && (
              <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/30 rounded-lg">
                <CheckCircle size={20} className="text-success flex-shrink-0" />
                <div>
                  <p className="text-success font-semibold">Import Complete</p>
                  <p className="text-sm text-textMuted">
                    {importResult.imported} trade{importResult.imported !== 1 ? 's' : ''} imported
                    {importResult.skipped > 0 && `, ${importResult.skipped} duplicate${importResult.skipped !== 1 ? 's' : ''} skipped`}
                  </p>
                </div>
                <button onClick={() => setImportResult(null)} className="ml-auto text-textMuted hover:text-text"><X size={16} /></button>
              </div>
            )}

            {/* Preview Table */}
            {parsedTrades.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Eye size={16} className="text-primary" />
                    <h4 className="text-text font-semibold text-sm">Preview ({parsedTrades.length} trades)</h4>
                    {formatConfig && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${formatConfig.bgColor} ${formatConfig.color}`}>
                        {formatConfig.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-textMuted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === parsedTrades.length}
                        onChange={(e) => {
                          setSelectedIds(e.target.checked ? new Set(parsedTrades.map(t => t.id)) : new Set());
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
                      {parsedTrades.map(trade => (
                        <tr key={trade.id} className={`hover:bg-surfaceHighlight/30 ${!selectedIds.has(trade.id) ? 'opacity-40' : ''}`}>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(trade.id)}
                              onChange={() => {
                                setSelectedIds(prev => {
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
                          parsedTrades.filter(t => selectedIds.has(t.id)).reduce((s, t) => s + (t.pnl ?? 0), 0) >= 0 ? 'text-success' : 'text-danger'
                        }`}>
                          ${parsedTrades.filter(t => selectedIds.has(t.id)).reduce((s, t) => s + (t.pnl ?? 0), 0).toFixed(2)}
                        </td>
                        <td className="p-2 text-right text-textMuted">
                          ${parsedTrades.filter(t => selectedIds.has(t.id)).reduce((s, t) => s + (t.fees ?? 0), 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Import Button */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => { setParsedTrades([]); setSelectedIds(new Set()); setDetectedFormat(null); setImportWarnings([]); }}
                    className="text-sm text-textMuted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={selectedIds.size === 0 || importing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {importing ? (
                      <><RefreshCw size={16} className="animate-spin" /> Importing...</>
                    ) : (
                      <><ArrowRight size={16} /> Import {selectedIds.size} Trade{selectedIds.size !== 1 ? 's' : ''}</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: DATA MANAGEMENT — Export Only */}
      <div>
        <h2 className="text-2xl font-bold text-text mb-6">Data Management</h2>
        <div className="bg-surface rounded-xl border border-surfaceHighlight overflow-hidden">
          <div className="p-6 border-b border-surfaceHighlight">
            <h3 className="text-lg font-semibold text-text mb-1">Export</h3>
            <p className="text-sm text-textMuted">Backup your journal as a universal CSV (re-importable).</p>
          </div>

          <div className="p-6">
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
      {/* OBSIDIAN INTEGRATION SECTION */}
      <div>
        <h2 className="text-2xl font-bold text-text mb-6">Obsidian Integration</h2>
        <div className="bg-surface rounded-xl border border-surfaceHighlight overflow-hidden">
          <div className="p-6 border-b border-surfaceHighlight">
            <h3 className="text-lg font-semibold text-text mb-1 flex items-center gap-2">
              <FolderOpen size={18} className="text-accent" />
              Daily Logs Folder
            </h3>
            <p className="text-sm text-textMuted">
              Paste the path to your Obsidian <strong className="text-text">Daily logs</strong> folder once.
              The app will find each day's note automatically inside the correct month subfolder.
            </p>
          </div>
          <div className="p-6 space-y-5">
            <div className="bg-surfaceHighlight/30 border border-surfaceHighlight rounded-lg p-4 text-xs text-textMuted space-y-1.5">
              <p className="font-semibold text-text text-sm mb-2">How to find your path:</p>
              <p>1. Open <strong className="text-text">File Explorer</strong></p>
              <p>2. Navigate to your vault → <code className="bg-surfaceHighlight px-1 rounded">03 - Notes</code> → <code className="bg-surfaceHighlight px-1 rounded">Trading</code> → <code className="bg-surfaceHighlight px-1 rounded">Daily logs</code></p>
              <p>3. Click the address bar at the top — it shows the full path. Copy it and paste below.</p>
              <p className="font-mono bg-background px-3 py-1.5 rounded border border-surfaceHighlight text-text mt-2">
                Example: C:\Users\Yasir\Documents\MyVault\03 - Notes\Trading\Daily logs
              </p>
            </div>

            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={obsidianPath}
                onChange={e => setObsidianPath(e.target.value)}
                placeholder="C:\Users\Yasir\Documents\MyVault\03 - Notes\Trading\Daily logs"
                className="flex-1 bg-background border border-surfaceHighlight rounded-lg px-4 py-2.5 text-sm text-text font-mono outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={handleSaveObsidianPath}
                disabled={obsidianSaveStatus === 'saving' || !obsidianPath.trim()}
                className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 shrink-0 ${
                  obsidianSaveStatus === 'saved'
                    ? 'bg-success/20 text-success border border-success/30'
                    : 'bg-accent text-white hover:bg-accent/80 disabled:opacity-50'
                }`}
              >
                <Save size={15} />
                {obsidianSaveStatus === 'saving' ? 'Saving…'
                  : obsidianSaveStatus === 'saved' ? 'Saved ✓'
                  : 'Save Path'}
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleTestObsidianPath}
                disabled={obsidianTestStatus === 'testing'}
                className="flex items-center gap-2 px-4 py-2 bg-surfaceHighlight hover:bg-gray-700 text-text text-sm font-medium rounded-lg border border-gray-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={obsidianTestStatus === 'testing' ? 'animate-spin' : ''} />
                {obsidianTestStatus === 'testing' ? 'Testing…' : 'Test Connection'}
              </button>
              {obsidianTestMsg && (
                <p className={`text-xs ${obsidianTestStatus === 'ok' ? 'text-success' : 'text-amber-400'}`}>
                  {obsidianTestMsg}
                </p>
              )}
            </div>

            <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-xs text-textMuted space-y-1">
              <p className="font-semibold text-text mb-1">How this works:</p>
              <p>• Your Obsidian note is split at the <strong className="text-text">📝 Daily Debrief</strong> line</p>
              <p>• Everything above → loads into <strong className="text-text">Pre-Market Context</strong></p>
              <p>• Everything below → loads into <strong className="text-text">End-of-Day Review</strong></p>
              <p>• Use the <strong className="text-text">Sync from Obsidian</strong> button in the Mindfulness page to load any day's note</p>
              <p>• Today's note auto-loads when you open the Journal (if no saved data exists yet for that day)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
