import React, { useState, useMemo, useCallback } from 'react';
import { Trade, DailyAnalysis, DailyReview, Note, NoteCategory, TradeStatus } from '../types';
import {
  Search, Plus, Trash2, Star, ChevronRight, ChevronDown, ChevronLeft,
  FileText, BarChart2, Calendar, FolderOpen, FileStack, Filter,
  ArrowUpRight, ArrowDownRight, Eye, Sparkles, MoreHorizontal, Tag, X, Book
} from 'lucide-react';
import RichTextEditor from './RichTextEditor';

// ─── TYPES ──────────────────────────────────────────────────────────
type FolderType = 'all' | 'favorites' | 'trade_notes' | 'daily_journal' | 'sessions_recap' | 'my_notes';
type DisplayItemType = 'note' | 'daily' | 'trade_notes';

interface DisplayItem {
  id: string;
  type: DisplayItemType;
  title: string;
  date: string;
  folder: FolderType;
  isFavorite: boolean;
  isEditable: boolean;
  note?: Note;
  dailyData?: {
    dateStr: string;
    preMarket: string;
    postMarket: string;
    trades: Trade[];
    netPnl: number;
    tradeCount: number;
    winRate: number;
  };
  tradeData?: {
    dateStr: string;
    trades: { id: string; symbol: string; pnl: number; type: string; notes: string }[];
  };
}

interface FolderDef {
  type: FolderType;
  label: string;
  icon: React.ElementType;
}

// ─── CONSTANTS ──────────────────────────────────────────────────────
const FOLDERS: FolderDef[] = [
  { type: 'all', label: 'All notes', icon: FileText },
  { type: 'favorites', label: 'Favorites', icon: Star },
  { type: 'trade_notes', label: 'Trade Notes', icon: BarChart2 },
  { type: 'daily_journal', label: 'Daily Journal', icon: Calendar },
  { type: 'sessions_recap', label: 'Sessions Recap', icon: FileStack },
  { type: 'my_notes', label: 'My notes', icon: FolderOpen },
];

const PREP_TEMPLATE = `<h2>Preparation &amp; Game plan</h2>
<h3>Watchlist</h3><p></p>
<h3>Economic events</h3><p></p>
<h3>Daily/Weekly Bias</h3><p></p>
<h3>Levels to Watch</h3><p></p>
<h3>Gameplan</h3><p></p>`;

const SESSION_TEMPLATE = `<h2>Session log</h2>
<p>Log your thoughts with timestamps for future recaps. Use voice-to-text to help you.</p><p></p>`;

// ─── HELPERS ────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTitle(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── PROPS ──────────────────────────────────────────────────────────
interface NotebookProps {
  trades: Trade[];
  dailyAnalysis: DailyAnalysis;
  dailyReviews: DailyReview;
  notes: Note[];
  onSaveDailyReview: (date: string, text: string) => void;
  onSaveNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onNavigateToTrade?: (tradeId: string) => void;
  initialDate?: string;
}

// ─── COMPONENT ──────────────────────────────────────────────────────
const Notebook: React.FC<NotebookProps> = ({
  trades, dailyAnalysis, dailyReviews, notes,
  onSaveDailyReview, onSaveNote, onDeleteNote, onNavigateToTrade
}) => {
  // --- STATE ---
  const [expandedFolders, setExpandedFolders] = useState<Set<FolderType>>(new Set());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [pnlExpanded, setPnlExpanded] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  // --- COMPUTE ALL DISPLAY ITEMS ---
  const allItems = useMemo<DisplayItem[]>(() => {
    const items: DisplayItem[] = [];

    // 1. Notes → DisplayItems
    notes.forEach(n => {
      items.push({
        id: n.id,
        type: 'note',
        title: n.title,
        date: n.updatedAt,
        folder: 'my_notes',
        isFavorite: (n.tags || []).includes('favorite'),
        isEditable: true,
        note: n,
      });
    });

    // 2. Daily Journal entries (merge dailyAnalysis + dailyReviews by date)
    const allDates = new Set([
      ...Object.keys(dailyAnalysis || {}),
      ...Object.keys(dailyReviews || {}),
    ]);
    allDates.forEach(dateStr => {
      const dayTrades = trades.filter(t => t.date === dateStr && t.status === TradeStatus.CLOSED);
      const netPnl = dayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
      const wins = dayTrades.filter(t => (t.pnl || 0) > 0).length;
      items.push({
        id: `daily-${dateStr}`,
        type: 'daily',
        title: formatDateTitle(dateStr),
        date: dateStr,
        folder: 'daily_journal',
        isFavorite: false,
        isEditable: true,
        dailyData: {
          dateStr,
          preMarket: (dailyAnalysis || {})[dateStr] || '',
          postMarket: (dailyReviews || {})[dateStr] || '',
          trades: dayTrades,
          netPnl,
          tradeCount: dayTrades.length,
          winRate: dayTrades.length > 0 ? (wins / dayTrades.length) * 100 : 0,
        },
      });
    });

    // 3. Trade Notes (group trades with notes by date)
    const tradesByDate: Record<string, { id: string; symbol: string; pnl: number; type: string; notes: string }[]> = {};
    trades.forEach(t => {
      if (t.notes && t.notes.trim()) {
        if (!tradesByDate[t.date]) tradesByDate[t.date] = [];
        tradesByDate[t.date].push({
          id: t.id,
          symbol: t.symbol,
          pnl: t.pnl || 0,
          type: t.type,
          notes: t.notes,
        });
      }
    });
    Object.entries(tradesByDate).forEach(([dateStr, tds]) => {
      items.push({
        id: `tradenotes-${dateStr}`,
        type: 'trade_notes',
        title: formatDateTitle(dateStr),
        date: dateStr,
        folder: 'trade_notes',
        isFavorite: false,
        isEditable: false,
        tradeData: { dateStr, trades: tds },
      });
    });

    // Sort all by date descending
    items.sort((a, b) => b.date.localeCompare(a.date));
    return items;
  }, [notes, dailyAnalysis, dailyReviews, trades]);

  // --- FOLDER ITEMS & COUNTS ---
  const folderData = useMemo(() => {
    const data: Record<FolderType, { items: DisplayItem[]; count: number }> = {
      all: { items: allItems, count: allItems.length },
      favorites: { items: allItems.filter(i => i.isFavorite), count: allItems.filter(i => i.isFavorite).length },
      trade_notes: { items: allItems.filter(i => i.type === 'trade_notes'), count: allItems.filter(i => i.type === 'trade_notes').length },
      daily_journal: { items: allItems.filter(i => i.type === 'daily'), count: allItems.filter(i => i.type === 'daily').length },
      sessions_recap: { items: [], count: 0 },
      my_notes: { items: allItems.filter(i => i.type === 'note'), count: allItems.filter(i => i.type === 'note').length },
    };
    return data;
  }, [allItems]);

  // --- SEARCH FILTERING ---
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return allItems.filter(i => i.title.toLowerCase().includes(q));
  }, [allItems, searchQuery]);

  // --- SELECTED ITEM ---
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return allItems.find(i => i.id === selectedItemId) || null;
  }, [allItems, selectedItemId]);

  // --- HANDLERS ---
  const toggleFolder = useCallback((folder: FolderType) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  const handleCreateNote = useCallback(() => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: 'Untitled Note',
      content: '',
      category: 'general' as NoteCategory,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
    };
    onSaveNote(newNote);
    setSelectedItemId(newNote.id);
    setExpandedFolders(prev => new Set(prev).add('my_notes'));
  }, [onSaveNote]);

  const handleUpdateNoteContent = useCallback((text: string) => {
    if (!selectedItem || !selectedItem.note) return;
    onSaveNote({ ...selectedItem.note, content: text, updatedAt: new Date().toISOString() });
  }, [selectedItem, onSaveNote]);

  const handleUpdateNoteTitle = useCallback((title: string) => {
    if (!selectedItem || !selectedItem.note) return;
    onSaveNote({ ...selectedItem.note, title, updatedAt: new Date().toISOString() });
  }, [selectedItem, onSaveNote]);

  const handleToggleFavorite = useCallback((item: DisplayItem) => {
    if (!item.note) return;
    const tags = [...(item.note.tags || [])];
    const idx = tags.indexOf('favorite');
    if (idx >= 0) tags.splice(idx, 1);
    else tags.push('favorite');
    onSaveNote({ ...item.note, tags, updatedAt: new Date().toISOString() });
  }, [onSaveNote]);

  const handleDeleteItem = useCallback((item: DisplayItem) => {
    if (item.type !== 'note' || !item.note) return;
    if (!window.confirm('Delete this note?')) return;
    onDeleteNote(item.note.id);
    if (selectedItemId === item.id) setSelectedItemId(null);
  }, [onDeleteNote, selectedItemId]);

  const handleInsertTemplate = useCallback((template: string) => {
    if (!selectedItem) return;
    if (selectedItem.type === 'daily' && selectedItem.dailyData) {
      const current = selectedItem.dailyData.postMarket || '';
      onSaveDailyReview(selectedItem.dailyData.dateStr, current + template);
    } else if (selectedItem.type === 'note' && selectedItem.note) {
      const current = selectedItem.note.content || '';
      onSaveNote({ ...selectedItem.note, content: current + template, updatedAt: new Date().toISOString() });
    }
    setShowTemplateMenu(false);
  }, [selectedItem, onSaveDailyReview, onSaveNote]);

  const handleAddTag = useCallback(() => {
    if (!tagInput.trim() || !selectedItem?.note) return;
    const tags = [...(selectedItem.note.tags || [])];
    if (!tags.includes(tagInput.trim())) tags.push(tagInput.trim());
    onSaveNote({ ...selectedItem.note, tags, updatedAt: new Date().toISOString() });
    setTagInput('');
    setShowTagInput(false);
  }, [tagInput, selectedItem, onSaveNote]);

  const handleRemoveTag = useCallback((tag: string) => {
    if (!selectedItem?.note) return;
    const tags = (selectedItem.note.tags || []).filter(t => t !== tag && t !== 'favorite');
    // Keep favorite tag if removing a different tag
    if ((selectedItem.note.tags || []).includes('favorite') && tag !== 'favorite') tags.push('favorite');
    onSaveNote({ ...selectedItem.note, tags: (selectedItem.note.tags || []).filter(t => t !== tag), updatedAt: new Date().toISOString() });
  }, [selectedItem, onSaveNote]);

  // ─── RENDER ───────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-120px)] bg-background text-text overflow-hidden rounded-xl border border-surfaceHighlight shadow-sm">

      {/* ════════ LEFT SIDEBAR ════════ */}
      <div className={`${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-72'} bg-surface border-r border-surfaceHighlight flex flex-col shrink-0 transition-all duration-200`}>

        {/* Header: Add folder + Collapse */}
        <div className="p-3 border-b border-surfaceHighlight flex items-center justify-between">
          <button onClick={handleCreateNote} className="flex items-center gap-2 text-sm text-textMuted hover:text-text transition-colors">
            <Plus size={14} /> Add folder
          </button>
          <button onClick={() => setSidebarCollapsed(true)} className="p-1 text-textMuted hover:text-text transition-colors">
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-surfaceHighlight">
          <div className="flex items-center gap-2 bg-background border border-surfaceHighlight rounded-lg px-3 py-2">
            <Search size={14} className="text-textMuted shrink-0" />
            <input
              type="text"
              placeholder="Search notes"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm outline-none w-full text-text placeholder-textMuted"
            />
            <Filter size={14} className="text-textMuted shrink-0" />
          </div>
        </div>

        {/* Folder Tree */}
        <div className="flex-1 overflow-y-auto">
          {searchQuery.trim() ? (
            // Search results mode
            <div className="p-2">
              <p className="px-3 py-1 text-[10px] text-textMuted uppercase tracking-wider">
                {searchResults?.length || 0} results
              </p>
              {searchResults?.map(item => (
                <NoteRow key={item.id} item={item} isSelected={selectedItemId === item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  onDelete={() => handleDeleteItem(item)}
                  onToggleFavorite={() => handleToggleFavorite(item)}
                />
              ))}
            </div>
          ) : (
            // Folder tree mode
            <div className="py-1">
              {FOLDERS.map(folder => {
                const data = folderData[folder.type];
                const isExpanded = expandedFolders.has(folder.type);
                const Icon = folder.icon;
                return (
                  <div key={folder.type}>
                    {/* Folder Header */}
                    <button
                      onClick={() => toggleFolder(folder.type)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-surfaceHighlight/50 transition-colors group"
                    >
                      <span className="text-textMuted">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <Icon size={16} className={`${folder.type === 'favorites' ? 'text-yellow-500' : 'text-textMuted'}`} />
                      <span className="flex-1 text-left text-text font-medium">{folder.label}</span>
                      {data.count > 0 && (
                        <span className="text-xs text-primary font-medium">{data.count}</span>
                      )}
                    </button>

                    {/* Expanded Items */}
                    {isExpanded && (
                      <div className="pb-1">
                        {/* Folder action bar */}
                        {folder.type === 'my_notes' && (
                          <div className="flex items-center justify-between px-4 py-1.5 ml-5">
                            <span className="text-[10px] text-textMuted">Select all</span>
                            <div className="flex items-center gap-1">
                              <button onClick={handleCreateNote} className="p-1 text-textMuted hover:text-primary transition-colors">
                                <Plus size={12} />
                              </button>
                              <button className="p-1 text-textMuted hover:text-text transition-colors">
                                <MoreHorizontal size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                        {folder.type === 'daily_journal' && data.items.length > 0 && (
                          <div className="flex items-center justify-between px-4 py-1.5 ml-5">
                            <span className="text-[10px] text-textMuted">Select all</span>
                            <div className="flex items-center gap-1">
                              <button className="p-1 text-textMuted hover:text-primary transition-colors">
                                <Plus size={12} />
                              </button>
                              <button className="p-1 text-textMuted hover:text-text transition-colors">
                                <MoreHorizontal size={12} />
                              </button>
                            </div>
                          </div>
                        )}

                        {data.items.length === 0 && (
                          <p className="text-xs text-textMuted px-8 py-2">No items</p>
                        )}
                        {data.items.map(item => (
                          <NoteRow key={item.id} item={item} isSelected={selectedItemId === item.id}
                            onClick={() => setSelectedItemId(item.id)}
                            onDelete={() => handleDeleteItem(item)}
                            onToggleFavorite={() => handleToggleFavorite(item)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tags footer */}
        <div className="p-3 border-t border-surfaceHighlight">
          <div className="flex items-center gap-2 text-textMuted text-xs">
            <Tag size={12} /> Tags
          </div>
        </div>
      </div>

      {/* Collapse expand button (when sidebar collapsed) */}
      {sidebarCollapsed && (
        <button onClick={() => setSidebarCollapsed(false)}
          className="w-8 bg-surface border-r border-surfaceHighlight flex items-center justify-center hover:bg-surfaceHighlight transition-colors shrink-0">
          <ChevronRight size={16} className="text-textMuted" />
        </button>
      )}

      {/* ════════ RIGHT CONTENT AREA ════════ */}
      <div className="flex-1 bg-background flex flex-col overflow-y-auto">

        {/* ──── DAILY JOURNAL VIEW ──── */}
        {selectedItem?.type === 'daily' && selectedItem.dailyData && (
          <DailyJournalView
            item={selectedItem}
            onSaveReview={onSaveDailyReview}
            onNavigateToTrade={onNavigateToTrade}
            showTemplateMenu={showTemplateMenu}
            setShowTemplateMenu={setShowTemplateMenu}
            onInsertTemplate={handleInsertTemplate}
            pnlExpanded={pnlExpanded}
            setPnlExpanded={setPnlExpanded}
          />
        )}

        {/* ──── TRADE NOTES VIEW ──── */}
        {selectedItem?.type === 'trade_notes' && selectedItem.tradeData && (
          <TradeNotesView item={selectedItem} onNavigateToTrade={onNavigateToTrade} />
        )}

        {/* ──── REGULAR NOTE VIEW ──── */}
        {selectedItem?.type === 'note' && selectedItem.note && (
          <NoteEditorView
            item={selectedItem}
            onUpdateTitle={handleUpdateNoteTitle}
            onUpdateContent={handleUpdateNoteContent}
            onToggleFavorite={() => handleToggleFavorite(selectedItem)}
            onDelete={() => handleDeleteItem(selectedItem)}
            showTagInput={showTagInput}
            setShowTagInput={setShowTagInput}
            tagInput={tagInput}
            setTagInput={setTagInput}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            showTemplateMenu={showTemplateMenu}
            setShowTemplateMenu={setShowTemplateMenu}
            onInsertTemplate={handleInsertTemplate}
          />
        )}

        {/* ──── EMPTY STATE ──── */}
        {!selectedItem && (
          <div className="flex flex-col items-center justify-center h-full text-textMuted">
            <Book size={64} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a note or create a new one</p>
            <p className="text-sm mt-1 opacity-60">Choose from the sidebar to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────

// Note row in sidebar list
const NoteRow: React.FC<{
  item: DisplayItem;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}> = ({ item, isSelected, onClick, onDelete, onToggleFavorite }) => (
  <div
    onClick={onClick}
    className={`group flex items-center gap-2 px-4 py-2 ml-5 mr-2 rounded-lg cursor-pointer transition-all text-sm ${
      isSelected
        ? 'bg-surfaceHighlight border-l-2 border-primary'
        : 'hover:bg-surfaceHighlight/50 border-l-2 border-transparent'
    }`}
  >
    <div className="flex-1 min-w-0">
      <p className={`truncate font-medium ${isSelected ? 'text-text' : 'text-textMuted group-hover:text-text'}`}>
        {item.title}
      </p>
      <p className="text-[10px] text-textMuted mt-0.5">{relativeTime(item.date)}</p>
    </div>
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
      {item.type === 'note' && (
        <>
          <button onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
            className={`p-1 transition-colors ${item.isFavorite ? 'text-yellow-500' : 'text-textMuted hover:text-yellow-500'}`}>
            <Star size={12} fill={item.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-textMuted hover:text-danger transition-colors">
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  </div>
);

// Daily Journal content view
const DailyJournalView: React.FC<{
  item: DisplayItem;
  onSaveReview: (date: string, text: string) => void;
  onNavigateToTrade?: (id: string) => void;
  showTemplateMenu: boolean;
  setShowTemplateMenu: (v: boolean) => void;
  onInsertTemplate: (t: string) => void;
  pnlExpanded: boolean;
  setPnlExpanded: (v: boolean) => void;
}> = ({ item, onSaveReview, onNavigateToTrade, showTemplateMenu, setShowTemplateMenu, onInsertTemplate, pnlExpanded, setPnlExpanded }) => {
  const d = item.dailyData!;
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-surfaceHighlight">
        <div className="flex items-center gap-3 mb-2">
          <Calendar size={20} className="text-primary" />
          <h2 className="text-2xl font-bold text-text">{item.title}</h2>
          <button onClick={() => onNavigateToTrade && d.trades.length > 0 && onNavigateToTrade(d.trades[0].id)}
            className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
            <Eye size={12} /> View trades
          </button>
        </div>
        <p className="text-xs text-textMuted">
          Created: {new Date(d.dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>

        {/* P&L Summary Card */}
        {d.tradeCount > 0 && (
          <button onClick={() => setPnlExpanded(!pnlExpanded)}
            className="mt-3 w-full flex items-center gap-3 bg-surface border border-surfaceHighlight rounded-lg p-3 hover:bg-surfaceHighlight/50 transition-colors text-left">
            <ChevronRight size={14} className={`text-textMuted transition-transform ${pnlExpanded ? 'rotate-90' : ''}`} />
            <span className="text-xs text-textMuted">Net P&L</span>
            <span className={`text-lg font-bold ${d.netPnl >= 0 ? 'text-success' : 'text-danger'}`}>
              ${d.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-textMuted ml-auto">{d.tradeCount} trades · {d.winRate.toFixed(0)}% win rate</span>
          </button>
        )}

        {/* Template + Tag bar */}
        <div className="mt-3 flex items-center gap-2 relative">
          <div className="relative">
            <button onClick={() => setShowTemplateMenu(!showTemplateMenu)}
              className="flex items-center gap-1.5 text-xs bg-surfaceHighlight hover:bg-surface border border-surfaceHighlight px-3 py-1.5 rounded-lg text-textMuted hover:text-text transition-colors">
              <Sparkles size={12} /> Templates
            </button>
            {showTemplateMenu && (
              <div className="absolute top-full left-0 mt-1 bg-surface border border-surfaceHighlight rounded-lg shadow-xl z-50 w-56 overflow-hidden">
                <button onClick={() => onInsertTemplate(PREP_TEMPLATE)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-surfaceHighlight text-text transition-colors">
                  Preparation & Game plan
                </button>
                <button onClick={() => onInsertTemplate(SESSION_TEMPLATE)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-surfaceHighlight text-text transition-colors border-t border-surfaceHighlight">
                  Session log
                </button>
              </div>
            )}
          </div>
          <button className="flex items-center gap-1.5 text-xs text-textMuted hover:text-text transition-colors px-2 py-1.5">
            <Plus size={12} /> Add tag
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* Pre-market section */}
        {d.preMarket && (
          <div>
            <h3 className="text-sm font-semibold text-text mb-2 flex items-center gap-2">
              <span className="text-lg">🎯</span> Preparation & Game plan
            </h3>
            <div className="bg-surface border border-surfaceHighlight rounded-lg p-4">
              <div className="prose prose-sm text-text" dangerouslySetInnerHTML={{ __html: d.preMarket }} />
            </div>
          </div>
        )}

        {/* Post-market / Session log */}
        <div>
          <h3 className="text-sm font-semibold text-text mb-2 flex items-center gap-2">
            <span className="text-lg">📝</span> Session log
          </h3>
          <p className="text-xs text-textMuted mb-2">Log your thoughts with timestamps for future recaps. Use voice-to-text to help you.</p>
          <RichTextEditor
            value={d.postMarket}
            onChange={(text) => onSaveReview(d.dateStr, text)}
            placeholder="Start writing your session log..."
            className="min-h-[200px]"
          />
        </div>

        {/* Trade list for the day */}
        {d.trades.length > 0 && pnlExpanded && (
          <div>
            <h3 className="text-sm font-semibold text-text mb-2">Trades</h3>
            <div className="space-y-2">
              {d.trades.map(t => (
                <div key={t.id}
                  onClick={() => onNavigateToTrade && onNavigateToTrade(t.id)}
                  className="flex items-center justify-between bg-surface border border-surfaceHighlight rounded-lg p-3 hover:bg-surfaceHighlight/50 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2">
                    {t.type === 'LONG' ? <ArrowUpRight size={14} className="text-success" /> : <ArrowDownRight size={14} className="text-danger" />}
                    <span className="text-sm font-medium text-text">{t.symbol}</span>
                  </div>
                  <span className={`text-sm font-mono font-medium ${(t.pnl || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                    {(t.pnl || 0) >= 0 ? '+' : ''}${(t.pnl || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Trade Notes read-only view
const TradeNotesView: React.FC<{
  item: DisplayItem;
  onNavigateToTrade?: (id: string) => void;
}> = ({ item, onNavigateToTrade }) => {
  const td = item.tradeData!;
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-surfaceHighlight">
        <div className="flex items-center gap-3">
          <BarChart2 size={20} className="text-primary" />
          <h2 className="text-2xl font-bold text-text">{item.title}</h2>
        </div>
        <p className="text-xs text-textMuted mt-1">{td.trades.length} trade{td.trades.length !== 1 ? 's' : ''} with notes</p>
      </div>
      <div className="flex-1 p-6 overflow-y-auto space-y-3">
        {td.trades.map(t => (
          <div key={t.id} className="bg-surface border border-surfaceHighlight rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {t.type === 'LONG' ? <ArrowUpRight size={14} className="text-success" /> : <ArrowDownRight size={14} className="text-danger" />}
                <span className="text-sm font-bold text-text">{t.symbol}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-mono font-medium ${t.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {t.pnl >= 0 ? '+' : ''}${t.pnl.toLocaleString()}
                </span>
                {onNavigateToTrade && (
                  <button onClick={() => onNavigateToTrade(t.id)}
                    className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Eye size={12} /> View
                  </button>
                )}
              </div>
            </div>
            <div className="text-sm text-textMuted leading-relaxed" dangerouslySetInnerHTML={{ __html: t.notes }} />
          </div>
        ))}
      </div>
    </div>
  );
};

// Regular note editor view
const NoteEditorView: React.FC<{
  item: DisplayItem;
  onUpdateTitle: (t: string) => void;
  onUpdateContent: (c: string) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  showTagInput: boolean;
  setShowTagInput: (v: boolean) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  onAddTag: () => void;
  onRemoveTag: (t: string) => void;
  showTemplateMenu: boolean;
  setShowTemplateMenu: (v: boolean) => void;
  onInsertTemplate: (t: string) => void;
}> = ({
  item, onUpdateTitle, onUpdateContent, onToggleFavorite, onDelete,
  showTagInput, setShowTagInput, tagInput, setTagInput, onAddTag, onRemoveTag,
  showTemplateMenu, setShowTemplateMenu, onInsertTemplate
}) => {
  const note = item.note!;
  const displayTags = (note.tags || []).filter(t => t !== 'favorite');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-surfaceHighlight">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={note.title}
              onChange={e => onUpdateTitle(e.target.value)}
              className="text-2xl font-bold bg-transparent outline-none text-text w-full placeholder-textMuted"
              placeholder="Note Title"
            />
            <div className="text-xs text-textMuted mt-1.5 flex items-center gap-3">
              <span>Created: {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span>·</span>
              <span>Last updated: {new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onToggleFavorite}
              className={`p-2 rounded-lg transition-colors ${item.isFavorite ? 'text-yellow-500' : 'text-textMuted hover:text-yellow-500'}`}>
              <Star size={18} fill={item.isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button onClick={onDelete}
              className="p-2 text-textMuted hover:text-danger hover:bg-surfaceHighlight rounded-lg transition-colors">
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Tags */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {displayTags.map(tag => (
            <span key={tag} className="flex items-center gap-1 text-xs bg-surfaceHighlight text-textMuted px-2 py-1 rounded-md">
              {tag}
              <button onClick={() => onRemoveTag(tag)} className="hover:text-danger transition-colors">
                <X size={10} />
              </button>
            </span>
          ))}
          {showTagInput ? (
            <form onSubmit={e => { e.preventDefault(); onAddTag(); }} className="flex items-center gap-1">
              <input autoFocus type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                className="bg-surfaceHighlight text-xs px-2 py-1 rounded-md outline-none text-text w-24"
                placeholder="Tag name" />
              <button type="button" onClick={() => setShowTagInput(false)} className="text-textMuted hover:text-text">
                <X size={12} />
              </button>
            </form>
          ) : (
            <button onClick={() => setShowTagInput(true)}
              className="flex items-center gap-1 text-xs text-textMuted hover:text-text transition-colors px-2 py-1">
              <Plus size={12} /> Add tag
            </button>
          )}
        </div>

        {/* Templates */}
        <div className="mt-3 relative">
          <button onClick={() => setShowTemplateMenu(!showTemplateMenu)}
            className="flex items-center gap-1.5 text-xs bg-surfaceHighlight hover:bg-surface border border-surfaceHighlight px-3 py-1.5 rounded-lg text-textMuted hover:text-text transition-colors">
            <Sparkles size={12} /> Templates
          </button>
          {showTemplateMenu && (
            <div className="absolute top-full left-0 mt-1 bg-surface border border-surfaceHighlight rounded-lg shadow-xl z-50 w-56 overflow-hidden">
              <button onClick={() => onInsertTemplate(PREP_TEMPLATE)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-surfaceHighlight text-text transition-colors">
                Preparation & Game plan
              </button>
              <button onClick={() => onInsertTemplate(SESSION_TEMPLATE)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-surfaceHighlight text-text transition-colors border-t border-surfaceHighlight">
                Session log
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 p-6">
        <RichTextEditor
          value={note.content}
          onChange={onUpdateContent}
          placeholder="Start typing your note..."
          className="h-full"
        />
      </div>
    </div>
  );
};

export default Notebook;
