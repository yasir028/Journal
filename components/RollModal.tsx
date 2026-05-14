import React, { useState, useMemo } from 'react';
import { X, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { Trade } from '../types';
import { formatOptionExpiry } from '../services/brokerParsers';

export interface RollFormData {
  rollCredit: number;
  newSymbol: string;
  newOptionType: 'CALL' | 'PUT';
  newEntryPrice: number;
  newQuantity: number;
  rollDate: string;
  notes: string;
}

interface RollModalProps {
  trade: Trade;
  onConfirm: (data: RollFormData) => void;
  onCancel: () => void;
}

// Extract the base underlying ticker from a formatted option symbol
// e.g. "BTCC CALL 19.5 Jan16'26" → "BTCC"
function extractUnderlying(symbol: string): string {
  return symbol.split(' ')[0] ?? symbol;
}

const RollModal: React.FC<RollModalProps> = ({ trade, onConfirm, onCancel }) => {
  const today = new Date().toISOString().split('T')[0];

  const [rollDate,      setRollDate]      = useState(today);
  const [closingPrice,  setClosingPrice]  = useState('');
  const [underlying,    setUnderlying]    = useState(extractUnderlying(trade.symbol));
  const [newOptionType, setNewOptionType] = useState<'CALL' | 'PUT'>((trade as any).optionType ?? 'CALL');
  const [newStrike,     setNewStrike]     = useState('');
  const [newExpiry,     setNewExpiry]     = useState('');
  const [newPremium,    setNewPremium]    = useState('');
  const [quantity,      setQuantity]      = useState(trade.quantity.toString());
  const [notes,         setNotes]         = useState('');

  // Live roll credit calculation: (newPremium - closingPrice) × qty × 100
  const rollCredit = useMemo(() => {
    const cp  = parseFloat(closingPrice) || 0;
    const np  = parseFloat(newPremium)   || 0;
    const qty = parseFloat(quantity)     || 1;
    return parseFloat(((np - cp) * qty * 100).toFixed(2));
  }, [closingPrice, newPremium, quantity]);

  // Auto-build symbol preview
  const newSymbol = useMemo(() => {
    const u  = underlying.trim().toUpperCase();
    const s  = parseFloat(newStrike);
    const ex = newExpiry;
    if (!u || !ex || isNaN(s)) return '';
    return `${u} ${newOptionType} ${s % 1 === 0 ? s.toFixed(0) : s} ${formatOptionExpiry(ex)}`;
  }, [underlying, newOptionType, newStrike, newExpiry]);

  const canConfirm =
    rollDate && closingPrice && newExpiry && newStrike && newPremium && quantity && newSymbol;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      rollCredit,
      newSymbol,
      newOptionType,
      newEntryPrice: parseFloat(newPremium),
      newQuantity:   parseFloat(quantity),
      rollDate,
      notes,
    });
  };

  const inputClass =
    'w-full bg-background border border-surfaceHighlight rounded-lg px-3 py-2 text-sm text-text focus:border-primary outline-none';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-surfaceHighlight rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surfaceHighlight">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <RefreshCw size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">Roll Option</h2>
              <p className="text-xs text-textMuted">{trade.symbol}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-surfaceHighlight rounded-lg transition-colors">
            <X size={18} className="text-textMuted" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Roll Date */}
          <div>
            <label className="block text-xs text-textMuted mb-1">Roll Date</label>
            <input type="date" value={rollDate} onChange={e => setRollDate(e.target.value)} className={inputClass} />
          </div>

          {/* Closing Price */}
          <div>
            <label className="block text-xs text-textMuted mb-1">Closing Price (buy-back cost per contract)</label>
            <input
              type="number" step="0.01" min="0"
              value={closingPrice} onChange={e => setClosingPrice(e.target.value)}
              placeholder="e.g. 0.86" className={inputClass}
            />
          </div>

          <div className="border-t border-surfaceHighlight pt-4">
            <p className="text-xs font-semibold text-textMuted uppercase tracking-wider mb-3">New Contract</p>

            {/* Underlying + Option Type */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-textMuted mb-1">Underlying</label>
                <input
                  type="text" value={underlying}
                  onChange={e => setUnderlying(e.target.value.toUpperCase())}
                  placeholder="BTCC" className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-textMuted mb-1">Contract Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewOptionType('CALL')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg border-2 transition-all ${newOptionType === 'CALL' ? 'border-success bg-success/10 text-success' : 'border-surfaceHighlight text-textMuted opacity-50'}`}
                  >
                    CALL ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewOptionType('PUT')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg border-2 transition-all ${newOptionType === 'PUT' ? 'border-danger bg-danger/10 text-danger' : 'border-surfaceHighlight text-textMuted opacity-50'}`}
                  >
                    PUT ↓
                  </button>
                </div>
              </div>
            </div>

            {/* Strike + Expiry */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-textMuted mb-1">New Strike</label>
                <input
                  type="number" step="0.5" min="0"
                  value={newStrike} onChange={e => setNewStrike(e.target.value)}
                  placeholder="e.g. 14.50" className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-textMuted mb-1">New Expiry</label>
                <input
                  type="date" value={newExpiry} onChange={e => setNewExpiry(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* New Premium + Quantity */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-textMuted mb-1">New Premium (credit received)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={newPremium} onChange={e => setNewPremium(e.target.value)}
                  placeholder="e.g. 0.96" className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-textMuted mb-1">Contracts</label>
                <input
                  type="number" step="1" min="1"
                  value={quantity} onChange={e => setQuantity(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Symbol Preview */}
            {newSymbol && (
              <div className="p-2 bg-surfaceHighlight/30 rounded-lg mb-3">
                <span className="text-xs text-textMuted">New symbol: </span>
                <span className="text-sm font-bold text-text">{newSymbol}</span>
              </div>
            )}
          </div>

          {/* Roll Credit Preview */}
          {closingPrice && newPremium && (
            <div className={`p-4 rounded-xl border-2 ${rollCredit >= 0 ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {rollCredit >= 0
                    ? <TrendingUp size={18} className="text-success" />
                    : <TrendingDown size={18} className="text-danger" />}
                  <span className="text-sm text-textMuted">Roll {rollCredit >= 0 ? 'Credit' : 'Debit'}</span>
                </div>
                <span className={`text-xl font-bold ${rollCredit >= 0 ? 'text-success' : 'text-danger'}`}>
                  {rollCredit >= 0 ? '+' : ''}${Math.abs(rollCredit).toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-textMuted mt-1">
                ({newPremium} − {closingPrice}) × {quantity} contracts × 100
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs text-textMuted mb-1">Notes (optional)</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Why are you rolling? Market conditions, strategy adjustment..."
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-surfaceHighlight">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-surfaceHighlight text-textMuted hover:bg-surfaceHighlight transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              canConfirm
                ? 'bg-amber-500 hover:bg-amber-400 text-white'
                : 'bg-surfaceHighlight text-textMuted cursor-not-allowed opacity-50'
            }`}
          >
            <RefreshCw size={15} /> Confirm Roll
          </button>
        </div>
      </div>
    </div>
  );
};

export default RollModal;
