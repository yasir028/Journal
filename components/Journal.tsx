import React, { useState, useMemo, useEffect } from 'react';
import { Trade, TradeType, TradeStatus, Emotion, DailyAnalysis, TradeHistoryItem, Playbook, DEFAULT_MISTAKES, Instrument, FUTURES_CONTRACTS, TradeExit } from '../types';
import { Plus, Filter, ArrowUpRight, ArrowDownRight, Image as ImageIcon, Upload, X, CheckSquare, Square, Layers, LayoutList, BookOpen, Trash2, Eye, Pencil, History, RotateCcw, ArrowLeft, ChevronDown, ChevronRight, MessageSquare, AlertTriangle, Book, Target, ShieldAlert, Maximize2, FileText, ZoomIn, ZoomOut } from 'lucide-react';
import RichTextEditor from './RichTextEditor';

interface JournalProps {
  trades: Trade[];
  playbooks?: Playbook[];
  dailyAnalysis?: DailyAnalysis;
  onAddTrade: (trade: Trade) => void;
  onUpdateTrade: (trade: Trade) => void;
  onDeleteTrade: (tradeId: string) => void;
  onUpdatePlaybooks?: (playbooks: Playbook[]) => void;
  focusedTradeId?: string | null;
  onClearFocus?: () => void;
}

const Journal: React.FC<JournalProps> = ({ trades, playbooks = [], dailyAnalysis = {}, onAddTrade, onUpdateTrade, onDeleteTrade, onUpdatePlaybooks, focusedTradeId, onClearFocus }) => {
  const [timeframe, setTimeframe] = useState<'MONTH' | 'YEAR' | 'ALL'>('MONTH');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Expanded Row State
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Floating Window State
  const [floatingView, setFloatingView] = useState<{
    title: string;
    content: React.ReactNode;
    type: 'image' | 'text';
  } | null>(null);

  // Zoom State for floating view
  const [zoom, setZoom] = useState(100);

  // History View State
  const [showHistory, setShowHistory] = useState(false);
  const [currentTradeHistory, setCurrentTradeHistory] = useState<TradeHistoryItem[]>([]);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter State
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterType, setFilterType] = useState<TradeType | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<TradeStatus | 'ALL'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Trade Form State
  const [symbol, setSymbol] = useState('');
  const [instrument, setInstrument] = useState<Instrument>(Instrument.STOCK);
  const [type, setType] = useState<TradeType>(TradeType.LONG);
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [multiplier, setMultiplier] = useState('1'); // Contract Multiplier (e.g. 100 for options)
  const [fees, setFees] = useState(''); // NEW: Commission/Fees State
  const [entryTime, setEntryTime] = useState('');
  const [exitTime, setExitTime] = useState('');
  const [setup, setSetup] = useState('');
  
  // Custom Input States
  const [playbookId, setPlaybookId] = useState('');
  const [isAddingPlaybook, setIsAddingPlaybook] = useState(false);
  const [newPlaybookName, setNewPlaybookName] = useState('');

  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([]);
  const [customMistake, setCustomMistake] = useState('');

  const [notes, setNotes] = useState('');
  const [emotion, setEmotion] = useState<string>(Emotion.NEUTRAL);
  const [isCustomEmotion, setIsCustomEmotion] = useState(false);
  const [customEmotion, setCustomEmotion] = useState('');

  const [imageUrl, setImageUrl] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Multi-Exit State
  const [exits, setExits] = useState<{price: string, quantity: string}[]>([]);

  // Reset Zoom when closing floating view
  useEffect(() => {
    if (!floatingView) setZoom(100);
  }, [floatingView]);

  const clearFilters = () => {
    setFilterSymbol('');
    setFilterType('ALL');
    setFilterStatus('ALL');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  // Handle Focused Trade Navigation
  useEffect(() => {
    if (focusedTradeId) {
      // 1. Clear filters so the trade is visible
      clearFilters();
      
      // 2. Expand the trade
      setExpandedId(focusedTradeId);
      
      // 3. Scroll into view
      setTimeout(() => {
        const element = document.getElementById(`trade-row-${focusedTradeId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100); // Small delay to allow render

      // 4. Clear focus prop to prevent loop
      if (onClearFocus) onClearFocus();
    }
  }, [focusedTradeId, onClearFocus]);

  // Derived Risk Calculations
  const calculatedRisk = useMemo(() => {
    const entry = parseFloat(entryPrice);
    const stop = parseFloat(stopLoss);
    const qty = parseFloat(quantity);
    const mult = parseFloat(multiplier) || 1;
    
    if (isNaN(entry) || isNaN(stop) || isNaN(qty)) return null;
    
    const perUnitRisk = Math.abs(entry - stop);
    const totalRisk = perUnitRisk * qty * mult;
    return totalRisk;
  }, [entryPrice, stopLoss, quantity, multiplier]);

  // Calculate Weighted Average Exit Price from partial exits
  const calculatedAvgExit = useMemo(() => {
    if (exits.length === 0) return null;
    let totalVal = 0;
    let totalQty = 0;
    exits.forEach(e => {
      const p = parseFloat(e.price) || 0;
      const q = parseFloat(e.quantity) || 0;
      totalVal += p * q;
      totalQty += q;
    });
    return totalQty > 0 ? (totalVal / totalQty).toFixed(2) : null;
  }, [exits]);

  // Auto-update exit price if exits exist
  useEffect(() => {
    if (calculatedAvgExit !== null) {
      setExitPrice(calculatedAvgExit);
    }
  }, [calculatedAvgExit]);

  const calculatedReward = useMemo(() => {
    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    const qty = parseFloat(quantity);
    const mult = parseFloat(multiplier) || 1;
    const comm = parseFloat(fees) || 0;
    
    if (isNaN(entry) || isNaN(exit) || isNaN(qty)) return null;
    
    const perUnitDiff = type === TradeType.LONG ? (exit - entry) : (entry - exit);
    return (perUnitDiff * qty * mult) - comm; // Subtract fees from reward preview
  }, [entryPrice, exitPrice, quantity, multiplier, type, fees]);

  // Filter Logic
  const filteredTrades = useMemo(() => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return trades.filter(trade => {
    const tradeDate = new Date(trade.date);

    // Timeframe Filter
    if (timeframe === 'MONTH') {
      if (tradeDate.getMonth() !== currentMonth || tradeDate.getFullYear() !== currentYear) return false;
    } else if (timeframe === 'YEAR') {
      if (tradeDate.getFullYear() !== currentYear) return false;
    }

    // Existing Filters
    if (filterSymbol && !trade.symbol.includes(filterSymbol.toUpperCase())) return false;
    if (filterType !== 'ALL' && trade.type !== filterType) return false;
    if (filterStatus !== 'ALL' && trade.status !== filterStatus) return false;
    return true;
  });
}, [trades, timeframe, filterSymbol, filterType, filterStatus]);

  const hasActiveFilters = filterSymbol || filterType !== 'ALL' || filterStatus !== 'ALL' || filterStartDate || filterEndDate;

  // Handlers
  const handleSelectTrade = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.size === filteredTrades.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredTrades.map(t => t.id)));
  };

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleCombine = () => {
    if (selectedIds.size < 2) return;
    const toCombine = trades.filter(t => selectedIds.has(t.id));
    
    const totalQty = toCombine.reduce((acc, t) => acc + t.quantity, 0);
    const totalPnl = toCombine.reduce((acc, t) => acc + (t.pnl || 0), 0);
    // Weighted avg entry
    const avgEntry = toCombine.reduce((acc, t) => acc + (t.entryPrice * t.quantity), 0) / totalQty;
    const closedCount = toCombine.filter(t => t.status === TradeStatus.CLOSED).length;
    
    const status = closedCount === toCombine.length ? TradeStatus.CLOSED : TradeStatus.OPEN;
    
    const consolidatedTrade: Trade = {
      ...toCombine[0],
      id: Date.now().toString(),
      entryPrice: parseFloat(avgEntry.toFixed(2)),
      quantity: totalQty,
      pnl: totalPnl,
      status: status,
      notes: `Combined ${toCombine.length} trades. ${toCombine[0].notes}`,
      setup: 'Consolidated'
    };
    
    onAddTrade(consolidatedTrade);
    setSelectedIds(new Set());
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteTrade(id);
  };

  const toggleMistake = (mistake: string) => {
    setSelectedMistakes(prev => 
      prev.includes(mistake) ? prev.filter(m => m !== mistake) : [...prev, mistake]
    );
  };
  
  const handleAddCustomMistake = () => {
    if (customMistake.trim()) {
      toggleMistake(customMistake.trim());
      setCustomMistake('');
    }
  };

  const handleInstrumentChange = (inst: Instrument) => {
    setInstrument(inst);
    if (inst === Instrument.OPTION) {
      setMultiplier('100');
    } else {
      setMultiplier('1');
    }
  };

  const handleAddExit = () => {
    setExits(prev => [...prev, { price: '', quantity: '' }]);
  };

  const handleRemoveExit = (index: number) => {
    setExits(prev => prev.filter((_, i) => i !== index));
  };

  const handleExitChange = (index: number, field: 'price' | 'quantity', value: string) => {
    const newExits = [...exits];
    newExits[index] = { ...newExits[index], [field]: value };
    setExits(newExits);
  };

  const openAddModal = () => {
    setEditingId(null);
    setShowHistory(false);
    setSymbol(''); setInstrument(Instrument.STOCK); setType(TradeType.LONG);
    setEntryPrice(''); setExitPrice(''); setStopLoss('');
    setQuantity('1'); setMultiplier('1'); setFees(''); // Reset Fees
    setNotes(''); setSetup(''); setImageUrl('');
    setEntryTime(''); setExitTime(''); 
    setEmotion(Emotion.NEUTRAL); setIsCustomEmotion(false); setCustomEmotion('');
    setPlaybookId(''); setIsAddingPlaybook(false); setNewPlaybookName('');
    setSelectedMistakes([]); setCustomMistake('');
    setExits([]);
    setDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

const populateForm = (trade: Trade | TradeHistoryItem) => {
    setSymbol(trade.symbol);
    setInstrument(trade.instrument || Instrument.STOCK);
    setType(trade.type);
    setEntryPrice(trade.entryPrice.toString());
    setExitPrice(trade.exitPrice?.toString() || '');
    setStopLoss(trade.stopLoss?.toString() || '');
    setQuantity(trade.quantity.toString());
    setFees(trade.fees?.toString() || ''); 
    setEntryTime(trade.entryTime || '');
    setExitTime(trade.exitTime || '');
    setSetup(trade.setup);
    setNotes(trade.notes);
    
    // Emotion Logic
    const isStandardEmotion = Object.values(Emotion).includes(trade.emotionPre as any);
    if (isStandardEmotion) {
        setEmotion(trade.emotionPre);
        setIsCustomEmotion(false);
    } else {
        setEmotion('CUSTOM');
        setIsCustomEmotion(true);
        setCustomEmotion(trade.emotionPre);
    }

    setImageUrl(trade.imageUrl || '');
    setPlaybookId(trade.playbookId || '');
    setSelectedMistakes(trade.mistakes || []);
    setDate(trade.date);
    
    // Load exits
    if (trade.exits && trade.exits.length > 0) {
      setExits(trade.exits.map(e => ({ price: e.price.toString(), quantity: e.quantity.toString() })));
    } else {
      setExits([]);
    }

    // --- FIX: INTELLIGENT MULTIPLIER LOADING ---
    let mult = 1;
    if (trade.instrument === Instrument.OPTION) {
        mult = 100;
    } else if (trade.instrument === Instrument.FUTURE) {
        // Look up the correct multiplier from your contracts list
        const contract = FUTURES_CONTRACTS.find(c => c.symbol === trade.symbol);
        if (contract) {
            mult = contract.multiplier;
        }
    }
    
    // Optional: Only overwrite if we calculated PnL previously and it doesn't match
    // (This block helps if you have custom manual multipliers)
    if (trade.pnl && trade.exitPrice && trade.entryPrice && trade.quantity) {
        const priceDiff = Math.abs(trade.exitPrice - trade.entryPrice);
        if (priceDiff > 0) {
            const impliedMult = Math.abs(trade.pnl) / (trade.quantity * priceDiff);
            // If the implied math is very close to a whole number, assume that was the custom multiplier
            if (Math.abs(impliedMult - Math.round(impliedMult)) < 0.01) {
                // Only override if we didn't find a known future contract
                if (trade.instrument !== Instrument.FUTURE) {
                    mult = Math.round(impliedMult);
                }
            }
        }
    }
    setMultiplier(mult.toString());
  };

  const openEditModal = (trade: Trade) => {
    setEditingId(trade.id);
    setShowHistory(false);
    setCurrentTradeHistory(trade.history || []);
    populateForm(trade);
    setIsModalOpen(true);
  };

  const handleRestore = (historyItem: TradeHistoryItem) => {
    if (window.confirm(`Restore version from ${new Date(historyItem.archivedAt).toLocaleString()}? Unsaved changes will be lost.`)) {
      populateForm(historyItem);
      setShowHistory(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = parseFloat(entryPrice);
    const qty = parseFloat(quantity);
    const mult = parseFloat(multiplier) || 1;
    const comm = parseFloat(fees) || 0; // Parse Fees
    const exit = exitPrice ? parseFloat(exitPrice) : undefined;
    const stop = stopLoss ? parseFloat(stopLoss) : undefined;
    
    // Handle New Playbook creation
    let finalPlaybookId = playbookId;
    if (isAddingPlaybook && newPlaybookName.trim()) {
        const newId = `pb_${Date.now()}`;
        if (onUpdatePlaybooks) {
            onUpdatePlaybooks([...playbooks, { id: newId, name: newPlaybookName.trim(), description: 'Added from Trade Log' }]);
        }
        finalPlaybookId = newId;
    }

    // Handle Custom Emotion
    let finalEmotion = emotion;
    if (isCustomEmotion && customEmotion.trim()) {
        finalEmotion = customEmotion.trim();
    }
    
    let pnl: number | undefined = undefined;
    let r: number | undefined = undefined;
    let status = TradeStatus.OPEN;

    if (exit !== undefined && !isNaN(exit)) {
      status = TradeStatus.CLOSED;
      // Calculate PnL (including fees)
      let grossPnl = type === TradeType.LONG ? (exit - entry) : (entry - exit);
      grossPnl = grossPnl * qty * mult;
      pnl = grossPnl - comm;
      
      pnl = Math.round(pnl * 100) / 100;
    }
    
    if (stop && exit) {
       const riskPerShare = Math.abs(entry - stop);
       const rewardPerShare = type === TradeType.LONG ? (exit - entry) : (entry - exit);
       if (riskPerShare > 0) {
         r = parseFloat((rewardPerShare / riskPerShare).toFixed(2));
       }
    }

    const tradeData: Trade = {
      id: editingId || Date.now().toString(),
      symbol: symbol.toUpperCase(),
      instrument,
      type,
      entryPrice: entry,
      exitPrice: exit,
      stopLoss: stop,
      quantity: qty,
      fees: comm > 0 ? comm : undefined, // Save Fees
      status,
      pnl,
      r,
      date,
      entryTime: entryTime || undefined,
      exitTime: exitTime || undefined,
      setup,
      playbookId: finalPlaybookId || undefined,
      mistakes: selectedMistakes.length > 0 ? selectedMistakes : undefined,
      notes,
      emotionPre: finalEmotion,
      imageUrl: imageUrl || undefined,
      history: currentTradeHistory,
      exits: exits.length > 0 ? exits.map((e, idx) => ({ id: idx.toString(), price: parseFloat(e.price), quantity: parseFloat(e.quantity) })) : undefined
    };

    if (editingId) {
      onUpdateTrade(tradeData);
    } else {
      onAddTrade(tradeData);
    }
    setIsModalOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 500000) {
        alert("Image too large. Please upload an image under 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) setImageUrl(event.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-text">Trade Journal</h2>
          {selectedIds.size > 0 && (
            <button onClick={handleCombine} className="flex items-center gap-2 px-3 py-1 bg-accent text-white text-sm rounded hover:bg-purple-600 transition-colors">
              <Layers size={14} /> Combine ({selectedIds.size})
            </button>
          )}
        </div>
        <div className="flex gap-3">
        <div className="flex bg-surfaceHighlight rounded-lg p-1 border border-surfaceHighlight">
  {(['MONTH', 'YEAR', 'ALL'] as const).map((tf) => (
    <button
      key={tf}
      onClick={() => setTimeframe(tf)}
      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
        timeframe === tf ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'
      }`}
    >
      {tf}
    </button>
  ))}
</div>
          <button onClick={() => setIsCompact(!isCompact)} className={`p-2 rounded-lg border transition-colors ${isCompact ? 'bg-primary text-white border-primary' : 'bg-surfaceHighlight text-textMuted border-gray-700'}`}>
            <LayoutList size={20} />
          </button>
          <button onClick={() => setIsFilterOpen(!isFilterOpen)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${isFilterOpen || hasActiveFilters ? 'bg-surfaceHighlight text-primary border-primary' : 'bg-surfaceHighlight text-text border-gray-700 hover:bg-gray-700'}`}>
            <Filter size={16} /> Filter {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-primary ml-1"></span>}
          </button>
          <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors">
            <Plus size={16} /> Add Trade
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {isFilterOpen && (
        <div className="bg-surface rounded-xl border border-surfaceHighlight p-4 mb-4 grid grid-cols-1 md:grid-cols-6 gap-4 animate-in slide-in-from-top-2 duration-200">
           <div className="md:col-span-1">
            <label className="block text-xs text-textMuted mb-1">Symbol</label>
            <input type="text" value={filterSymbol} onChange={(e) => setFilterSymbol(e.target.value)} placeholder="AAPL" className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-sm text-text focus:border-primary outline-none" />
           </div>
           <div className="md:col-span-1">
             <label className="block text-xs text-textMuted mb-1">Type</label>
             <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-sm text-text outline-none">
               <option value="ALL">All</option><option value={TradeType.LONG}>Long</option><option value={TradeType.SHORT}>Short</option>
             </select>
           </div>
           <div className="md:col-span-1">
             <label className="block text-xs text-textMuted mb-1">Status</label>
             <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-sm text-text outline-none">
               <option value="ALL">All</option><option value={TradeStatus.OPEN}>Open</option><option value={TradeStatus.CLOSED}>Closed</option><option value={TradeStatus.BE}>Break Even</option>
             </select>
           </div>
           <div className="md:col-span-2 grid grid-cols-2 gap-2">
             <div><label className="block text-xs text-textMuted mb-1">From</label><input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text outline-none" /></div>
             <div><label className="block text-xs text-textMuted mb-1">To</label><input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text outline-none" /></div>
           </div>
           <div className="md:col-span-1 flex items-end">
             <button onClick={clearFilters} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surfaceHighlight hover:bg-gray-700 text-textMuted text-sm transition-colors"><X size={14} /> Clear</button>
           </div>
        </div>
      )}

      {/* Trades Table */}
      <div className="flex-1 overflow-hidden bg-surface rounded-xl border border-surfaceHighlight flex flex-col shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surfaceHighlight/50 text-textMuted text-xs uppercase font-semibold sticky top-0 z-10 backdrop-blur-sm">
              <tr>
                <th className="w-8 py-3 pl-4"></th>
                <th className="w-10 py-3"><button onClick={handleSelectAll} className="text-textMuted hover:text-text">{selectedIds.size > 0 && selectedIds.size === filteredTrades.length ? <CheckSquare size={16}/> : <Square size={16}/>}</button></th>
                <th className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'}`}>Date</th>
                <th className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'}`}>Symbol</th>
                <th className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'}`}>Side</th>
                <th className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} text-right`}>Qty</th>
                <th className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} text-right`}>Entry</th>
                <th className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} text-right`}>Exit</th>
                <th className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} text-right`}>P&L</th>
                <th className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} text-center`}>Status</th>
                <th className={`${isCompact ? 'px-3 py-2' : 'px-4 py-3'} text-center`}>Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm text-text divide-y divide-surfaceHighlight/50">
              {filteredTrades.length > 0 ? (
                filteredTrades.map((trade) => {
                  const isLoss = (trade.pnl || 0) < 0;
                  const isWin = (trade.pnl || 0) > 0;
                  const isLong = trade.type === TradeType.LONG;
                  
                  return (
                  <React.Fragment key={trade.id}>
                  <tr 
                    id={`trade-row-${trade.id}`}
                    onClick={() => toggleExpand(trade.id)}
                    className={`cursor-pointer group hover:bg-surfaceHighlight/30 transition-colors ${selectedIds.has(trade.id) ? 'bg-primary/5' : ''} ${expandedId === trade.id ? 'bg-surfaceHighlight/20' : ''}`}
                  >
                    <td className="pl-4 py-4 text-textMuted group-hover:text-primary transition-colors">
                      {expandedId === trade.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                    <td className="py-4"><button onClick={(e) => handleSelectTrade(trade.id, e)} className={`${selectedIds.has(trade.id) ? 'text-primary' : 'text-textMuted hover:text-text'}`}>{selectedIds.has(trade.id) ? <CheckSquare size={16}/> : <Square size={16}/>}</button></td>
                    
                    <td className={`${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-4 text-textMuted'}`}>{trade.date}</td>
                    
                    <td className={`${isCompact ? 'px-3 py-2 font-bold' : 'px-4 py-4 font-bold'}`}>
                      <div className="flex items-center gap-2">
                        <span className={trade.instrument === Instrument.CRYPTO ? "text-accent" : "text-text"}>{trade.symbol}</span>
                        {trade.instrument && trade.instrument !== Instrument.STOCK && <span className="px-1.5 py-0.5 bg-surfaceHighlight rounded text-[10px] text-textMuted font-normal">{trade.instrument}</span>}
                      </div>
                    </td>
                    
                    <td className={`${isCompact ? 'px-3 py-2' : 'px-4 py-4'}`}>
                      <span className={`inline-flex items-center gap-1 font-medium ${isLong ? 'text-success' : 'text-danger'}`}>
                        {isLong ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} 
                        {isCompact ? (isLong ? 'L' : 'S') : trade.type}
                      </span>
                    </td>
                    
                    <td className={`${isCompact ? 'px-3 py-2' : 'px-4 py-4'} text-right`}>{trade.quantity}</td>
                    <td className={`${isCompact ? 'px-3 py-2' : 'px-4 py-4'} text-right text-textMuted`}>{trade.entryPrice}</td>
                    <td className={`${isCompact ? 'px-3 py-2' : 'px-4 py-4'} text-right text-textMuted`}>{trade.exitPrice || '-'}</td>
                    
                    <td className={`${isCompact ? 'px-3 py-2' : 'px-4 py-4'} text-right font-mono font-medium ${trade.status === TradeStatus.OPEN ? 'text-textMuted' : isWin ? 'text-success' : 'text-danger'}`}>
                      {trade.status === TradeStatus.OPEN ? 'Open' : (trade.pnl ? (isWin ? '+' : '') + trade.pnl.toFixed(2) : '-')}
                    </td>
                    
                    <td className={`${isCompact ? 'px-3 py-2' : 'px-4 py-4'} text-center`}>
                      <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                        trade.status === TradeStatus.OPEN ? 'bg-blue-500/10 text-blue-400' :
                        isWin ? 'bg-green-500/10 text-green-500' :
                        isLoss ? 'bg-red-500/10 text-red-500' :
                        'bg-gray-500/10 text-gray-400'
                      }`}>
                        {trade.status === TradeStatus.CLOSED ? (isWin ? 'WIN' : isLoss ? 'LOSS' : 'BE') : 'OPEN'}
                      </span>
                    </td>
                    
                    <td className={`${isCompact ? 'px-3 py-2' : 'px-4 py-4'} text-center`}>
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); openEditModal(trade); }} className="p-1.5 hover:bg-surfaceHighlight rounded text-textMuted hover:text-accent transition-colors" title="Edit">
                           <Pencil size={16} />
                        </button>
                        <button onClick={(e) => handleDelete(trade.id, e)} className="p-1.5 hover:bg-surfaceHighlight rounded text-textMuted hover:text-danger transition-colors" title="Delete">
                           <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* EXPANDED DETAIL ROW */}
                  {expandedId === trade.id && (
                    <tr className="bg-surfaceHighlight/5 animate-in slide-in-from-top-2 duration-200">
                      <td colSpan={15} className="p-4 border-b border-surfaceHighlight">
                        <div className="flex flex-col gap-6 bg-surfaceHighlight/10 border border-surfaceHighlight/30 rounded-xl p-6 shadow-inner">
                           
                           {/* SECTION 1: SCREENSHOT (Full Width, Top) */}
                           <div 
                              className="flex flex-col gap-2 w-full cursor-pointer group/image transition-transform hover:scale-[1.002]"
                              onClick={() => setFloatingView({
                                title: `Trade Screenshot - ${trade.symbol}`,
                                type: 'image',
                                content: trade.imageUrl ? <img src={trade.imageUrl} alt="Trade" className="w-full h-auto object-contain rounded-lg shadow-xl" /> : <div className="p-10 text-center">No image available</div>
                              })}
                           >
                              <div className="flex items-center justify-between text-success font-semibold uppercase text-xs tracking-wider mb-1">
                                <div className="flex items-center gap-2"><ImageIcon size={14} /> Screenshot</div>
                                <div className="flex items-center gap-1 text-xs opacity-0 group-hover/image:opacity-100 transition-opacity"><Maximize2 size={12}/> Expand</div>
                              </div>
                              <div className="w-full bg-surface rounded-lg border border-surfaceHighlight shadow-sm flex items-center justify-center overflow-hidden min-h-[400px] max-h-[600px] relative hover:border-success/50 transition-colors">
                                {trade.imageUrl ? (
                                  <>
                                    <img src={trade.imageUrl} alt="Trade setup" className="w-full h-full object-contain" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center">
                                       <span className="bg-black/60 text-white px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md flex items-center gap-2">
                                          <Maximize2 size={14}/> Click to Expand
                                       </span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex flex-col items-center gap-2 text-surfaceHighlight p-12">
                                    <ImageIcon size={64} strokeWidth={1} />
                                    <span className="text-sm font-medium text-textMuted">No image attached</span>
                                  </div>
                                )}
                              </div>
                           </div>

                           {/* SECTION 2 & 3: NOTES & CONTEXT (GRID) */}
                           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                               
                               {/* EXECUTION NOTES */}
                               <div 
                                  className="flex flex-col gap-2 cursor-pointer group/notes"
                                  onClick={() => setFloatingView({
                                    title: 'Execution Notes & Details',
                                    type: 'text',
                                    content: (
                                      <div className="space-y-6">
                                        <div className="prose prose-invert max-w-none bg-surface p-6 rounded-lg border border-surfaceHighlight">
                                          <h4 className="text-sm font-bold text-textMuted uppercase mb-2">Trade Notes</h4>
                                          <div className="text-lg leading-relaxed text-text" dangerouslySetInnerHTML={{ __html: trade.notes || "<p>No notes recorded.</p>" }} />
                                        </div>
                                        
                                        {(trade.mistakes?.length || 0) > 0 && (
                                          <div>
                                            <h4 className="text-sm font-bold text-textMuted uppercase mb-2">Mistakes Tagged</h4>
                                            <div className="flex flex-wrap gap-2">
                                              {trade.mistakes!.map(m => (
                                                <span key={m} className="px-3 py-1 bg-red-500/10 text-danger text-sm uppercase font-bold rounded border border-red-500/20">{m}</span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        
                                        {trade.playbookId && (
                                          <div className="bg-surfaceHighlight/10 p-4 rounded-lg border border-surfaceHighlight">
                                              <h4 className="text-sm font-bold text-accent uppercase mb-1">Strategy Playbook</h4>
                                              <p className="text-text font-medium text-lg">{playbooks.find(p => p.id === trade.playbookId)?.name}</p>
                                              <p className="text-textMuted text-sm">{playbooks.find(p => p.id === trade.playbookId)?.description}</p>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                               >
                                 <div className="flex items-center justify-between text-primary font-semibold uppercase text-xs tracking-wider mb-1">
                                   <div className="flex items-center gap-2"><MessageSquare size={14} /> Execution Notes</div>
                                   <div className="flex items-center gap-1 text-xs opacity-0 group-hover/notes:opacity-100 transition-opacity"><Maximize2 size={12}/> Expand</div>
                                 </div>
                                 <div className="flex-1 text-sm text-text bg-surface p-4 rounded-lg border border-surfaceHighlight shadow-sm min-h-[200px] hover:border-primary/50 transition-colors group-hover/notes:bg-surfaceHighlight/5">
                                   <div className="prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: trade.notes || "<span class='text-textMuted italic'>No notes recorded.</span>" }} />
                                   
                                   {(trade.mistakes?.length || 0) > 0 && (
                                    <div className="mt-4 pt-3 border-t border-surfaceHighlight">
                                      <div className="flex flex-wrap gap-2">
                                        {trade.mistakes!.map(m => (
                                          <span key={m} className="px-2 py-0.5 bg-red-500/10 text-danger text-[10px] uppercase font-bold rounded border border-red-500/20">{m}</span>
                                        ))}
                                      </div>
                                    </div>
                                   )}
                                   
                                   {trade.playbookId && (
                                    <div className="mt-3 text-xs text-textMuted">
                                      <span className="font-semibold text-accent">Strategy:</span> {playbooks.find(p => p.id === trade.playbookId)?.name}
                                    </div>
                                   )}
                                 </div>
                               </div>

                               {/* PRE-MARKET CONTEXT */}
                               <div 
                                  className="flex flex-col gap-2 cursor-pointer group/context"
                                  onClick={() => setFloatingView({
                                    title: `Pre-Market Context - ${trade.date}`,
                                    type: 'text',
                                    content: (
                                       <div className="bg-surface p-8 rounded-xl border border-surfaceHighlight shadow-lg relative overflow-hidden">
                                          <div className="text-xl leading-relaxed text-text relative z-10 font-medium prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: dailyAnalysis[trade.date] || "No pre-market analysis recorded for this date." }} />
                                       </div>
                                    )
                                  })}
                               >
                                 <div className="flex items-center justify-between text-accent font-semibold uppercase text-xs tracking-wider mb-1">
                                   <div className="flex items-center gap-2"><BookOpen size={14} /> Pre-Market Context</div>
                                   <div className="flex items-center gap-1 text-xs opacity-0 group-hover/context:opacity-100 transition-opacity"><Maximize2 size={12}/> Expand</div>
                                 </div>
                                 <div className="flex-1 text-sm text-text bg-surface p-4 rounded-lg border border-surfaceHighlight shadow-sm relative overflow-hidden min-h-[200px] hover:border-accent/50 transition-colors group-hover/context:bg-surfaceHighlight/5">
                                   {dailyAnalysis[trade.date] ? (
                                     <>
                                       <div className="relative z-10 prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: dailyAnalysis[trade.date] }} />
                                     </>
                                   ) : (
                                     <div className="h-full flex items-center justify-center text-textMuted italic">
                                       No pre-market analysis for {trade.date}
                                     </div>
                                   )}
                                 </div>
                               </div>
                           </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  )
                })
              ) : (
                <tr><td colSpan={15} className="px-6 py-12 text-center text-textMuted">No trades match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Window (Full Screen Modal) */}
      {floatingView && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-200">
           {/* Header */}
           <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-surface/50 shrink-0">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                {floatingView.type === 'image' ? <ImageIcon size={24} className="text-success"/> : <FileText size={24} className="text-primary"/>}
                {floatingView.title}
              </h3>
              
              <div className="flex items-center gap-4">
                {floatingView.type === 'image' && (
                  <div className="flex items-center bg-gray-800 rounded-lg p-1">
                    <button onClick={() => setZoom(z => Math.max(10, z - 25))} className="p-2 hover:bg-gray-700 rounded text-white" title="Zoom Out"><ZoomOut size={18}/></button>
                    <span className="w-16 text-center text-sm font-mono text-white">{zoom}%</span>
                    <button onClick={() => setZoom(z => z + 25)} className="p-2 hover:bg-gray-700 rounded text-white" title="Zoom In"><ZoomIn size={18}/></button>
                    <div className="w-px h-4 bg-gray-600 mx-1"></div>
                    <button onClick={() => setZoom(100)} className="p-2 hover:bg-gray-700 rounded text-white" title="Reset Zoom"><RotateCcw size={16}/></button>
                  </div>
                )}
                <button onClick={() => setFloatingView(null)} className="p-2 hover:bg-red-500/20 rounded-full text-gray-400 hover:text-red-400 transition-colors">
                  <X size={28} />
                </button>
              </div>
           </div>
           
           {/* Content */}
           <div className="flex-1 overflow-auto p-8 flex justify-center items-start" onClick={() => floatingView.type === 'image' && setFloatingView(null)}>
              <div className={`transition-all duration-200 ${floatingView.type === 'image' ? '' : 'w-full max-w-5xl bg-surface p-8 rounded-xl border border-surfaceHighlight shadow-2xl'}`} onClick={e => e.stopPropagation()}>
                 {floatingView.type === 'image' && React.isValidElement(floatingView.content) ? (
                    /* Apply Zoom Style to Image Container */
                    <div style={{ width: `${zoom}%`, maxWidth: 'none', transition: 'width 0.2s ease-out' }} className="mx-auto">
                      {floatingView.content}
                    </div>
                 ) : (
                    floatingView.content
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Add/Edit Trade Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface w-full max-w-7xl rounded-2xl border border-surfaceHighlight shadow-2xl flex flex-col max-h-[95vh]">
            
            <div className="flex justify-between items-center p-6 border-b border-surfaceHighlight">
               <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-lg ${editingId ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'}`}>
                   {editingId ? <Pencil size={24}/> : <Plus size={24}/>}
                 </div>
                 <div>
                   <h3 className="text-xl font-bold text-text">{editingId ? 'Edit Trade' : 'New Trade Entry'}</h3>
                   <p className="text-xs text-textMuted">{new Date().toDateString()}</p>
                 </div>
               </div>
               <div className="flex gap-2">
                 {editingId && (
                   <button 
                     type="button" 
                     onClick={() => setShowHistory(!showHistory)} 
                     className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-accent text-white' : 'bg-surfaceHighlight text-textMuted hover:text-text'}`}
                     title="View Edit History"
                   >
                     <History size={18} />
                   </button>
                 )}
                 <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surfaceHighlight rounded-lg text-textMuted">
                   <X size={20} />
                 </button>
               </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-background/50">
            {/* History View */}
            {showHistory ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                 <div className="flex items-center gap-2 mb-4 pb-4 border-b border-surfaceHighlight">
                    <button onClick={() => setShowHistory(false)} className="text-textMuted hover:text-text"><ArrowLeft size={18} /></button>
                    <h4 className="font-semibold text-text">Version History</h4>
                 </div>
                 {currentTradeHistory.length > 0 ? (
                    currentTradeHistory.map((historyItem, idx) => (
                      <div key={idx} className="p-4 bg-surface border border-surfaceHighlight rounded-lg flex justify-between items-center">
                          <div>
                             <p className="text-sm font-medium text-text">Archived: {new Date(historyItem.archivedAt).toLocaleString()}</p>
                             <div className="flex gap-4 mt-1 text-xs text-textMuted">
                                <span>Price: {historyItem.entryPrice}</span>
                                <span>Qty: {historyItem.quantity}</span>
                                <span>P&L: {historyItem.pnl || '-'}</span>
                             </div>
                          </div>
                          <button onClick={() => handleRestore(historyItem)} className="text-xs bg-surfaceHighlight hover:bg-primary hover:text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1">
                            <RotateCcw size={12}/> Restore
                          </button>
                       </div>
                    ))
                 ) : (
                    <p className="text-textMuted text-sm">No history available for this trade.</p>
                 )}
              </div>
            ) : (
              /* Edit Form */
              <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in">
                
                {/* 1. TOP BAR: ASSET & DIRECTION */}
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Left: Instrument Selector */}
                  <div className="flex-1 bg-surface p-4 rounded-xl border border-surfaceHighlight shadow-sm">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider mb-3 block">Instrument</label>
                    <div className="flex gap-2">
                      {Object.values(Instrument).map(inst => (
                        <button
                          type="button"
                          key={inst}
                          onClick={() => handleInstrumentChange(inst)}
                          className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${instrument === inst ? 'bg-surfaceHighlight border-primary text-primary' : 'bg-transparent border-surfaceHighlight text-textMuted hover:border-gray-500'}`}
                        >
                          {inst}
                        </button>
                      ))}
                    </div>
                    {instrument === Instrument.FUTURE && (
                        <select 
                          className="w-full mt-3 bg-surfaceHighlight/30 border border-surfaceHighlight rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-primary"
                          /* FIX 1: Bind value to 'symbol' state so it remembers your selection when editing */
                          value={symbol} 
                          onChange={(e) => {
                            const c = FUTURES_CONTRACTS.find(f => f.symbol === e.target.value);
                            if (c) {
                              setSymbol(c.symbol);
                              setMultiplier(c.multiplier.toString());
                            }
                          }}
                        >
                          {/* FIX 2: Dark background for options */}
                          <option value="" disabled className="bg-gray-900 text-white">Select Contract (Auto-fills multiplier)</option>
                          {FUTURES_CONTRACTS.map(c => (
                            <option key={c.symbol} value={c.symbol} className="bg-gray-900 text-white">
                              {c.symbol} - {c.name}
                            </option>
                          ))}
                        </select>
                    )}
                  </div>

                  {/* Right: Direction Toggle */}
                  <div className="flex-1 bg-surface p-4 rounded-xl border border-surfaceHighlight shadow-sm">
                    <label className="text-xs font-bold text-textMuted uppercase tracking-wider mb-3 block">Direction</label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setType(TradeType.LONG)}
                        className={`flex-1 py-2 rounded-lg border-2 font-bold flex items-center justify-center gap-2 transition-all ${type === TradeType.LONG ? 'border-success bg-success/10 text-success' : 'border-surfaceHighlight text-textMuted opacity-50'}`}
                      >
                        <ArrowUpRight /> LONG
                      </button>
                      <button
                        type="button"
                        onClick={() => setType(TradeType.SHORT)}
                        className={`flex-1 py-2 rounded-lg border-2 font-bold flex items-center justify-center gap-2 transition-all ${type === TradeType.SHORT ? 'border-danger bg-danger/10 text-danger' : 'border-surfaceHighlight text-textMuted opacity-50'}`}
                      >
                        <ArrowDownRight /> SHORT
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. MAIN INPUTS GRID */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* LEFT: EXECUTION & RISK (8 cols) */}
                  <div className="lg:col-span-8 space-y-6">
                    
                    {/* Execution Details */}
                    <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
                      <h4 className="text-sm font-bold text-text mb-4 flex items-center gap-2"><Target size={16} className="text-primary"/> Execution Details</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs text-textMuted mb-1">Ticker Symbol</label>
                          <input type="text" required value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-lg font-bold text-text focus:border-primary outline-none placeholder-surfaceHighlight" placeholder="AAPL" />
                        </div>
                        <div>
                          <label className="block text-xs text-textMuted mb-1">Entry Price</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-textMuted">$</span>
                            <input type="number" step="any" required value={entryPrice} onChange={e => setEntryPrice(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg pl-6 pr-3 py-2 text-text focus:border-primary outline-none" placeholder="0.00" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-textMuted mb-1">Quantity</label>
                          <input type="number" required value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text focus:border-primary outline-none" placeholder="100" />
                        </div>
                        
                        <div>
                          <label className="block text-xs text-textMuted mb-1">Date</label>
                          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text focus:border-primary outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs text-textMuted mb-1">Entry Time</label>
                          <input type="time" value={entryTime} onChange={e => setEntryTime(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text focus:border-primary outline-none" />
                        </div>
                        {(instrument === Instrument.OPTION || instrument === Instrument.FUTURE) && (
                          <div>
                            <label className="block text-xs text-textMuted mb-1">Multiplier</label>
                            <input type="number" value={multiplier} onChange={e => setMultiplier(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text focus:border-primary outline-none" />
                          </div>
                        )}
                        {/* NEW: FEES INPUT */}
                        <div>
                          <label className="block text-xs text-textMuted mb-1">Comm/Fees</label>
                          <div className="relative">
                             <span className="absolute left-3 top-2.5 text-textMuted">$</span>
                             <input type="number" step="any" value={fees} onChange={e => setFees(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg pl-6 pr-3 py-2 text-text focus:border-primary outline-none" placeholder="0.00" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Risk Management */}
                    <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-accent"></div>
                      <h4 className="text-sm font-bold text-text mb-4 flex items-center gap-2"><ShieldAlert size={16} className="text-accent"/> Risk Management</h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <label className="block text-xs text-textMuted mb-1">Stop Loss</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-textMuted">$</span>
                            <input type="number" step="any" value={stopLoss} onChange={e => setStopLoss(e.target.value)} className="w-full bg-background border border-red-500/30 focus:border-red-500 rounded-lg pl-6 pr-3 py-2 text-text outline-none" placeholder="0.00" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-textMuted mb-1">Avg Exit Price</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-textMuted">$</span>
                            <input 
                              type="number" 
                              step="any" 
                              value={exitPrice} 
                              onChange={e => setExitPrice(e.target.value)} 
                              className={`w-full bg-background border border-green-500/30 focus:border-green-500 rounded-lg pl-6 pr-3 py-2 text-text outline-none ${exits.length > 0 ? 'opacity-70 cursor-not-allowed' : ''}`}
                              placeholder="0.00" 
                              readOnly={exits.length > 0}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-textMuted mb-1">Exit Time</label>
                          <input type="time" value={exitTime} onChange={e => setExitTime(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text focus:border-primary outline-none" />
                        </div>
                      </div>

                      {/* Multi-Exit UI */}
                      <div className="mt-4 border-t border-surfaceHighlight pt-4">
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-xs text-textMuted font-bold uppercase tracking-wider">Partial Exits / Scale Out</label>
                          <button type="button" onClick={handleAddExit} className="text-xs text-primary flex items-center gap-1 hover:text-blue-400 font-medium">
                            <Plus size={12}/> Add Exit
                          </button>
                        </div>
                        {exits.length > 0 ? (
                          <div className="space-y-2">
                            {exits.map((exit, idx) => (
                              <div key={idx} className="flex gap-2 items-center animate-in fade-in slide-in-from-left-2">
                                <span className="text-xs text-textMuted w-4">{idx + 1}.</span>
                                <div className="relative flex-1">
                                   <input 
                                     type="number" 
                                     step="any"
                                     placeholder="Qty" 
                                     value={exit.quantity} 
                                     onChange={(e) => handleExitChange(idx, 'quantity', e.target.value)}
                                     className="w-full bg-background border border-surfaceHighlight rounded px-2 py-1 text-sm text-text outline-none focus:border-primary"
                                   />
                                </div>
                                <span className="text-textMuted text-xs">@</span>
                                <div className="relative flex-1">
                                   <input 
                                     type="number"
                                     step="any"
                                     placeholder="Price" 
                                     value={exit.price} 
                                     onChange={(e) => handleExitChange(idx, 'price', e.target.value)}
                                     className="w-full bg-background border border-surfaceHighlight rounded px-2 py-1 text-sm text-text outline-none focus:border-primary"
                                   />
                                </div>
                                <button type="button" onClick={() => handleRemoveExit(idx)} className="text-textMuted hover:text-danger p-1"><Trash2 size={14}/></button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-textMuted italic">No partial exits added. Single exit used.</p>
                        )}
                      </div>

                      {/* Live Risk Calc Bar */}
                      {calculatedRisk !== null && (
                        <div className="bg-surfaceHighlight/30 rounded-lg p-3 flex justify-between items-center mt-4">
                           <div className="flex items-center gap-3">
                             <div className="text-right">
                               <p className="text-[10px] uppercase text-textMuted font-bold">Total Risk</p>
                               <p className="text-lg font-bold text-danger">-${calculatedRisk.toFixed(2)}</p>
                             </div>
                             <div className="h-8 w-px bg-surfaceHighlight mx-2"></div>
                             <div>
                               <p className="text-[10px] uppercase text-textMuted font-bold">Reward</p>
                               <p className={`text-lg font-bold ${calculatedReward && calculatedReward > 0 ? 'text-success' : 'text-textMuted'}`}>
                                 {calculatedReward ? `+$${calculatedReward.toFixed(2)}` : '--'}
                               </p>
                             </div>
                           </div>
                           
                           {/* R-Multiple Preview */}
                           {calculatedRisk > 0 && calculatedReward !== null && (
                             <div className="text-center bg-background border border-surfaceHighlight px-3 py-1 rounded">
                               <span className="text-xs text-textMuted block">R-Multiple</span>
                               <span className="text-lg font-bold text-primary">{(calculatedReward / calculatedRisk).toFixed(2)}R</span>
                             </div>
                           )}
                        </div>
                      )}
                    </div>

                    {/* Rich Note Editor */}
                    <div className="flex flex-col">
                       <span className="text-xs font-bold text-textMuted uppercase tracking-wider mb-2">Entry Note</span>
                       <RichTextEditor 
                          value={notes} 
                          onChange={setNotes} 
                          placeholder="What is your thesis? Market conditions?"
                       />
                    </div>

                  </div>

                  {/* RIGHT: CONTEXT & TAGS (4 cols) */}
                  <div className="lg:col-span-4 space-y-6">
                    
                    {/* Strategy Context */}
                    <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm h-fit">
                       <h4 className="text-sm font-bold text-text mb-4 flex items-center gap-2"><Book size={16} className="text-accent"/> Strategy Context</h4>
                       
                       <div className="space-y-4">
                         <div>
                           <label className="block text-xs text-textMuted mb-1">Setup / Pattern</label>
                           <input type="text" value={setup} onChange={e => setSetup(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text outline-none focus:border-accent" placeholder="e.g. Bull Flag" />
                         </div>
                         
                         <div>
                           <label className="block text-xs text-textMuted mb-1">Playbook</label>
                           <div className="flex gap-2">
                               {!isAddingPlaybook ? (
                                   <select value={playbookId} onChange={e => setPlaybookId(e.target.value)} className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text outline-none focus:border-accent">
                                     <option value="">-- Select Playbook --</option>
                                     {playbooks.map(pb => (
                                       <option key={pb.id} value={pb.id}>{pb.name}</option>
                                     ))}
                                   </select>
                               ) : (
                                   <input 
                                     type="text" 
                                     value={newPlaybookName} 
                                     onChange={e => setNewPlaybookName(e.target.value)} 
                                     className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text outline-none focus:border-accent"
                                     placeholder="New Playbook Name..."
                                     autoFocus
                                   />
                               )}
                               <button 
                                 type="button" 
                                 onClick={() => setIsAddingPlaybook(!isAddingPlaybook)}
                                 className={`p-2 rounded border ${isAddingPlaybook ? 'bg-accent border-accent text-white' : 'bg-surfaceHighlight border-surfaceHighlight text-textMuted hover:text-text'}`}
                                 title={isAddingPlaybook ? "Cancel" : "Add New Playbook"}
                               >
                                 {isAddingPlaybook ? <X size={16}/> : <Plus size={16}/>}
                               </button>
                           </div>
                         </div>

                         <div>
                           <label className="block text-xs text-textMuted mb-1">Emotional State</label>
                           <select 
                             value={isCustomEmotion ? 'CUSTOM' : emotion} 
                             onChange={e => {
                                 if (e.target.value === 'CUSTOM') {
                                     setIsCustomEmotion(true);
                                     setCustomEmotion('');
                                 } else {
                                     setIsCustomEmotion(false);
                                     setEmotion(e.target.value as Emotion);
                                 }
                             }} 
                             className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text outline-none focus:border-accent mb-2"
                           >
                             {Object.values(Emotion).map(e => <option key={e} value={e}>{e}</option>)}
                             <option value="CUSTOM">+ Add Custom Emotion...</option>
                           </select>
                           
                           {isCustomEmotion && (
                               <div className="animate-in slide-in-from-top-2 fade-in">
                                   <input 
                                     type="text" 
                                     value={customEmotion} 
                                     onChange={e => setCustomEmotion(e.target.value)}
                                     placeholder="Type emotion (e.g. Hesitant)"
                                     className="w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-text outline-none focus:border-accent"
                                     autoFocus
                                   />
                               </div>
                           )}
                         </div>
                       </div>
                    </div>

                    {/* Mistakes Tracker */}
                    <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
                       <h4 className="text-sm font-bold text-text mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-danger"/> Mistakes?</h4>
                       <div className="flex flex-wrap gap-2 mb-3">
                         {DEFAULT_MISTAKES.map(mistake => (
                           <button
                             type="button"
                             key={mistake}
                             onClick={() => toggleMistake(mistake)}
                             className={`px-2 py-1 text-[10px] uppercase font-bold rounded border transition-colors ${selectedMistakes.includes(mistake) ? 'bg-red-500/20 border-red-500 text-danger' : 'bg-background border-surfaceHighlight text-textMuted hover:border-gray-500'}`}
                           >
                             {mistake}
                           </button>
                         ))}
                         {selectedMistakes.filter(m => !DEFAULT_MISTAKES.includes(m)).map(mistake => (
                             <button
                                 type="button"
                                 key={mistake}
                                 onClick={() => toggleMistake(mistake)}
                                 className="px-2 py-1 text-[10px] uppercase font-bold rounded border transition-colors bg-red-500/20 border-red-500 text-danger"
                             >
                                 {mistake}
                             </button>
                         ))}
                       </div>
                       
                       <div className="flex gap-2 mt-2 pt-2 border-t border-surfaceHighlight/50">
                           <input 
                             type="text" 
                             value={customMistake} 
                             onChange={e => setCustomMistake(e.target.value)} 
                             className="flex-1 bg-background border border-surfaceHighlight rounded px-2 py-1 text-xs text-text outline-none focus:border-danger"
                             placeholder="Add custom mistake..."
                           />
                           <button 
                             type="button" 
                             onClick={handleAddCustomMistake}
                             disabled={!customMistake.trim()}
                             className="px-2 py-1 bg-surfaceHighlight hover:bg-gray-700 text-textMuted text-xs rounded transition-colors disabled:opacity-50"
                           >
                             Add
                           </button>
                       </div>
                    </div>

                    {/* Image Upload */}
                    <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
                      <h4 className="text-sm font-bold text-text mb-4 flex items-center gap-2"><ImageIcon size={16}/> Chart</h4>
                      <div className="relative h-32 bg-background border-2 border-dashed border-surfaceHighlight rounded-lg flex flex-col items-center justify-center text-textMuted hover:border-primary hover:text-primary transition-colors cursor-pointer group overflow-hidden">
                        {imageUrl ? (
                          <img src={imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-20 transition-opacity" />
                        ) : null}
                        <Upload size={24} className="mb-2 relative z-10" />
                        <span className="text-xs relative z-10">{imageUrl ? 'Change Image' : 'Upload Screenshot'}</span>
                        <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer z-20" />
                      </div>
                    </div>

                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-surfaceHighlight sticky bottom-0 bg-surface z-10 pb-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl bg-transparent hover:bg-surfaceHighlight text-textMuted font-medium transition-colors border border-surfaceHighlight">Cancel</button>
                  <button type="submit" className="flex-1 px-6 py-3 rounded-xl bg-primary hover:bg-blue-600 text-white font-bold text-lg transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                    <CheckSquare size={20}/> {editingId ? 'Update Trade Log' : 'Save Trade Log'}
                  </button>
                </div>
              </form>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Journal;