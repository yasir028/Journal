import React, { useState, useEffect, useCallback } from 'react';
import { Trade, TradeType, TradeStatus, Playbook } from '../types';
import { X, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Image as ImageIcon, Star, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface TradeDetailProps {
  trade: Trade;
  trades: Trade[]; // filteredTrades array to navigate through
  playbooks: Playbook[];
  onClose: () => void;
  onNavigate: (tradeId: string) => void;
}

const TradeDetail: React.FC<TradeDetailProps> = ({ trade, trades, playbooks, onClose, onNavigate }) => {
  const [zoom, setZoom] = useState(100);

  const currentIndex = trades.findIndex(t => t.id === trade.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < trades.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(trades[currentIndex - 1].id);
  }, [hasPrev, currentIndex, trades, onNavigate]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(trades[currentIndex + 1].id);
  }, [hasNext, currentIndex, trades, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext]);

  // Reset zoom on trade change
  useEffect(() => { setZoom(100); }, [trade.id]);

  const isWin = (trade.pnl || 0) > 0;
  const isLoss = (trade.pnl || 0) < 0;
  const isLong = trade.type === TradeType.LONG;
  const playbook = playbooks.find(p => p.id === trade.playbookId);
  const imageUrl = trade.imageUrl || ((trade as any).imageUrls?.[0]);

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            size={16}
            className={i <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 bg-surface/80 hover:bg-red-500/20 rounded-full text-gray-400 hover:text-red-400 transition-colors backdrop-blur-sm"
      >
        <X size={24} />
      </button>

      {/* Arrow Navigation */}
      {hasPrev && (
        <button
          onClick={goPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-surface/80 hover:bg-surfaceHighlight rounded-full text-textMuted hover:text-text transition-colors backdrop-blur-sm"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {hasNext && (
        <button
          onClick={goNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 bg-surface/80 hover:bg-surfaceHighlight rounded-full text-textMuted hover:text-text transition-colors backdrop-blur-sm"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Main Content */}
      <div className="w-full max-w-7xl mx-8 max-h-[92vh] bg-surface rounded-2xl border border-surfaceHighlight shadow-2xl flex flex-col lg:flex-row overflow-hidden">

        {/* LEFT PANEL (40%) - Stats & Details */}
        <div className="lg:w-[40%] p-6 overflow-y-auto border-b lg:border-b-0 lg:border-r border-surfaceHighlight">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-text">{trade.symbol}</h2>
                <span className={`inline-flex items-center gap-1 text-sm font-bold ${isLong ? 'text-success' : 'text-danger'}`}>
                  {isLong ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  {trade.type}
                </span>
              </div>
              <p className="text-sm text-textMuted mt-1">{trade.date} {trade.entryTime ? `at ${trade.entryTime}` : ''}</p>
            </div>
            <div className="text-right">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                trade.status === TradeStatus.OPEN ? 'bg-blue-500/10 text-blue-400' :
                isWin ? 'bg-emerald-500 text-white' :
                isLoss ? 'bg-red-500 text-white' :
                'bg-gray-500 text-white'
              }`}>
                {trade.status === TradeStatus.CLOSED ? (isWin ? 'WIN' : isLoss ? 'LOSS' : 'BE') : 'OPEN'}
              </span>
              <p className="text-xs text-textMuted mt-1">{currentIndex + 1} of {trades.length}</p>
            </div>
          </div>

          {/* P&L */}
          <div className={`p-4 rounded-xl mb-4 ${isWin ? 'bg-success/10 border border-success/20' : isLoss ? 'bg-danger/10 border border-danger/20' : 'bg-surfaceHighlight/30 border border-surfaceHighlight'}`}>
            <p className="text-xs text-textMuted uppercase font-bold mb-1">Net P&L</p>
            <p className={`text-3xl font-bold font-mono ${isWin ? 'text-success' : isLoss ? 'text-danger' : 'text-textMuted'}`}>
              {trade.pnl !== undefined ? `${isWin ? '+' : ''}$${trade.pnl.toFixed(2)}` : 'Open'}
            </p>
            <div className="flex gap-4 mt-2 text-xs text-textMuted">
              {trade.r !== undefined && <span>R-Value: <span className="text-text font-bold">{trade.r}R</span></span>}
              {trade.fees !== undefined && trade.fees > 0 && <span>Fees: <span className="text-text">${trade.fees.toFixed(2)}</span></span>}
            </div>
          </div>

          {/* Execution Details */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-surfaceHighlight/20 p-3 rounded-lg">
              <p className="text-[10px] text-textMuted uppercase font-bold">Entry</p>
              <p className="text-text font-mono font-medium">${trade.entryPrice}</p>
            </div>
            <div className="bg-surfaceHighlight/20 p-3 rounded-lg">
              <p className="text-[10px] text-textMuted uppercase font-bold">Exit</p>
              <p className="text-text font-mono font-medium">{trade.exitPrice ? `$${trade.exitPrice}` : '-'}</p>
            </div>
            <div className="bg-surfaceHighlight/20 p-3 rounded-lg">
              <p className="text-[10px] text-textMuted uppercase font-bold">Quantity</p>
              <p className="text-text font-mono font-medium">{trade.quantity}</p>
            </div>
            <div className="bg-surfaceHighlight/20 p-3 rounded-lg">
              <p className="text-[10px] text-textMuted uppercase font-bold">Stop Loss</p>
              <p className="text-text font-mono font-medium">{trade.stopLoss ? `$${trade.stopLoss}` : '-'}</p>
            </div>
          </div>

          {/* Setup & Playbook */}
          {(trade.setup || playbook) && (
            <div className="mb-4 p-3 bg-surfaceHighlight/20 rounded-lg">
              {trade.setup && (
                <div className="mb-2">
                  <p className="text-[10px] text-textMuted uppercase font-bold">Setup</p>
                  <p className="text-text font-medium">{trade.setup}</p>
                </div>
              )}
              {playbook && (
                <div>
                  <p className="text-[10px] text-accent uppercase font-bold">Playbook</p>
                  <p className="text-text font-medium">{playbook.name}</p>
                </div>
              )}
            </div>
          )}

          {/* Rating */}
          {(trade as any).rating > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-textMuted uppercase font-bold mb-1">Rating</p>
              {renderStars((trade as any).rating)}
            </div>
          )}

          {/* Emotion */}
          {trade.emotionPre && (
            <div className="mb-4">
              <p className="text-[10px] text-textMuted uppercase font-bold mb-1">Emotional State</p>
              <span className="px-2.5 py-1 bg-surfaceHighlight rounded-lg text-sm text-text font-medium">{trade.emotionPre}</span>
            </div>
          )}

          {/* Mistakes */}
          {trade.mistakes && trade.mistakes.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-textMuted uppercase font-bold mb-2">Mistakes</p>
              <div className="flex flex-wrap gap-2">
                {trade.mistakes.map(m => (
                  <span key={m} className="px-2 py-0.5 bg-red-500/10 text-danger text-xs uppercase font-bold rounded border border-red-500/20">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {(trade as any).tags && (trade as any).tags.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-textMuted uppercase font-bold mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {(trade as any).tags.map((tag: string) => (
                  <span key={tag} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full border border-primary/20">#{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {trade.notes && (
            <div className="mb-4">
              <p className="text-[10px] text-textMuted uppercase font-bold mb-2">Notes</p>
              <div className="prose prose-sm prose-invert max-w-none bg-surfaceHighlight/10 p-3 rounded-lg border border-surfaceHighlight text-sm text-text" dangerouslySetInnerHTML={{ __html: trade.notes }} />
            </div>
          )}
        </div>

        {/* RIGHT PANEL (60%) - Screenshot/Chart */}
        <div className="lg:w-[60%] bg-background flex flex-col">
          {imageUrl ? (
            <>
              {/* Zoom controls */}
              <div className="flex items-center justify-end gap-2 p-3 border-b border-surfaceHighlight bg-surface/50">
                <div className="flex items-center bg-surfaceHighlight rounded-lg p-0.5">
                  <button onClick={() => setZoom(z => Math.max(25, z - 25))} className="p-1.5 hover:bg-gray-700 rounded text-textMuted hover:text-text" title="Zoom Out"><ZoomOut size={16}/></button>
                  <span className="w-12 text-center text-xs font-mono text-textMuted">{zoom}%</span>
                  <button onClick={() => setZoom(z => Math.min(300, z + 25))} className="p-1.5 hover:bg-gray-700 rounded text-textMuted hover:text-text" title="Zoom In"><ZoomIn size={16}/></button>
                  <button onClick={() => setZoom(100)} className="p-1.5 hover:bg-gray-700 rounded text-textMuted hover:text-text" title="Reset"><RotateCcw size={14}/></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                <div style={{ width: `${zoom}%`, transition: 'width 0.2s ease-out' }}>
                  <img src={imageUrl} alt={`${trade.symbol} trade chart`} className="w-full h-auto object-contain rounded-lg" />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-surfaceHighlight">
              <ImageIcon size={80} strokeWidth={1} />
              <p className="text-textMuted mt-4 text-sm">No chart image attached</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TradeDetail;
