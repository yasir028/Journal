import React, { useState, useMemo } from 'react';
import { Sparkles, RefreshCw, Trash2, ChevronDown, ChevronUp, Calendar, TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';
import { AIRecap, RecapPeriodType, Trade } from '../types';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Returns {start, end} for the Nth past week (0 = current week, 1 = last week, …) */
function getWeekRange(offsetWeeks: number): { start: string; end: string } {
  const monday = getMonday(new Date());
  const start = addDays(monday, -offsetWeeks * 7);
  const end   = addDays(start, 6);
  return { start: toDateStr(start), end: toDateStr(end) };
}

/** Returns {start, end} for the Nth past month (0 = current month, 1 = last month, …) */
function getMonthRange(offsetMonths: number): { start: string; end: string } {
  const now   = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1);
  const last  = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { start: toDateStr(first), end: toDateStr(last) };
}

function formatPeriodLabel(recap: AIRecap): string {
  if (recap.period_type === 'weekly') {
    const start = new Date(recap.period_start + 'T12:00:00');
    const end   = new Date(recap.period_end   + 'T12:00:00');
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return new Date(recap.period_start + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Very simple markdown → JSX renderer (handles ##, **, \n) */
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return <h3 key={i} className="text-base font-semibold text-text mt-4 mb-1">{line.slice(3)}</h3>;
        }
        if (line.startsWith('### ')) {
          return <h4 key={i} className="text-sm font-semibold text-text mt-3 mb-1">{line.slice(4)}</h4>;
        }
        if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
          return <p key={i} className="font-semibold text-primary">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          const content = line.slice(2);
          return (
            <div key={i} className="flex gap-2">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span className="text-textMuted">{renderInlineBold(content)}</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i} className="text-textMuted">{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="text-text font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
}

// ─── RECAP CARD ──────────────────────────────────────────────────────────────

interface RecapCardProps {
  recap: AIRecap;
  onRegenerate: (recap: AIRecap) => void;
  onDelete: (id: string) => void;
  isRegenerating: boolean;
}

function RecapCard({ recap, onRegenerate, onDelete, isRegenerating }: RecapCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isGreen = recap.net_pnl >= 0;

  return (
    <div className="bg-surface border border-surfaceHighlight rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-surfaceHighlight/30 transition-colors"
        onClick={() => setExpanded(x => !x)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isGreen ? 'bg-success/10' : 'bg-danger/10'}`}>
            {isGreen
              ? <TrendingUp size={18} className="text-success" />
              : <TrendingDown size={18} className="text-danger" />}
          </div>
          <div>
            <p className="font-semibold text-text text-sm">{formatPeriodLabel(recap)}</p>
            <p className="text-xs text-textMuted mt-0.5">
              {recap.trade_count} trade{recap.trade_count !== 1 ? 's' : ''} ·{' '}
              <span className={isGreen ? 'text-success' : 'text-danger'}>
                {isGreen ? '+' : ''}{recap.net_pnl.toFixed(2)}
              </span>
              {' '}· Generated {new Date(recap.generated_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onRegenerate(recap); }}
            disabled={isRegenerating}
            className="p-1.5 rounded text-textMuted hover:text-primary hover:bg-surfaceHighlight transition-colors disabled:opacity-40"
            title="Regenerate"
          >
            <RefreshCw size={14} className={isRegenerating ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(recap.id); }}
            className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-danger/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
          {expanded ? <ChevronUp size={16} className="text-textMuted" /> : <ChevronDown size={16} className="text-textMuted" />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-surfaceHighlight px-5 py-4">
          <MarkdownContent text={recap.content} />
        </div>
      )}
    </div>
  );
}

// ─── GENERATE BUTTON ROW ─────────────────────────────────────────────────────

interface GenerateRowProps {
  label: string;
  periodType: RecapPeriodType;
  start: string;
  end: string;
  existing: AIRecap | undefined;
  generating: boolean;
  onGenerate: (type: RecapPeriodType, start: string, end: string) => void;
}

function GenerateRow({ label, periodType, start, end, existing, generating, onGenerate }: GenerateRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-surfaceHighlight last:border-0">
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-xs text-textMuted">{start} → {end}</p>
      </div>
      <button
        onClick={() => onGenerate(periodType, start, end)}
        disabled={generating}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
          existing
            ? 'bg-surfaceHighlight text-textMuted hover:bg-surfaceHighlight/70'
            : 'bg-primary/10 text-primary hover:bg-primary/20'
        }`}
      >
        {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {existing ? 'Regenerate' : 'Generate'}
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

interface AIRecapsProps {
  recaps: AIRecap[];
  trades: Trade[];
  onGenerate: (type: RecapPeriodType, start: string, end: string) => Promise<void>;
  onDelete: (id: string) => void;
}

const AIRecaps: React.FC<AIRecapsProps> = ({ recaps, trades, onGenerate, onDelete }) => {
  const [activeTab, setActiveTab] = useState<RecapPeriodType>('weekly');
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  // ── Build period options ──
  const weekOptions = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => {
      const range = getWeekRange(i);
      return { label: i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i} weeks ago`, ...range };
    }), []);

  const monthOptions = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => {
      const range = getMonthRange(i);
      const d = new Date(range.start + 'T12:00:00');
      return {
        label: i === 0 ? 'This month' : i === 1 ? 'Last month' : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        ...range,
      };
    }), []);

  const options = activeTab === 'weekly' ? weekOptions : monthOptions;

  // ── Filter recaps by tab ──
  const tabRecaps = recaps
    .filter(r => r.period_type === activeTab)
    .sort((a, b) => b.period_start.localeCompare(a.period_start));

  const handleGenerate = async (type: RecapPeriodType, start: string, end: string) => {
    const id = `${type}-${start}`;
    setGeneratingId(id);
    try {
      await onGenerate(type, start, end);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleRegenerate = (recap: AIRecap) => {
    handleGenerate(recap.period_type, recap.period_start, recap.period_end);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this recap?')) onDelete(id);
  };

  const recapMap = useMemo(() => {
    const m: Record<string, AIRecap> = {};
    recaps.forEach(r => { m[r.id] = r; });
    return m;
  }, [recaps]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles size={20} className="text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-text">AI Recaps</h2>
          <p className="text-sm text-textMuted">Gemma 4 · Local · Weekly &amp; Monthly performance analysis</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surfaceHighlight/40 rounded-lg p-1 w-fit">
        {(['weekly', 'monthly'] as RecapPeriodType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'bg-surface text-text shadow-sm'
                : 'text-textMuted hover:text-text'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        {/* Left panel — generate buttons */}
        <div className="bg-surface border border-surfaceHighlight rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-text">Generate Recap</h3>
          </div>
          <div>
            {options.map(opt => {
              const id = `${activeTab}-${opt.start}`;
              return (
                <GenerateRow
                  key={id}
                  label={opt.label}
                  periodType={activeTab}
                  start={opt.start}
                  end={opt.end}
                  existing={recapMap[id]}
                  generating={generatingId === id}
                  onGenerate={handleGenerate}
                />
              );
            })}
          </div>

          {/* Ollama status note */}
          <div className="mt-4 p-3 bg-surfaceHighlight/40 rounded-lg flex gap-2">
            <AlertCircle size={14} className="text-textMuted shrink-0 mt-0.5" />
            <p className="text-xs text-textMuted leading-relaxed">
              Requires Ollama running locally with <code className="bg-surfaceHighlight px-1 rounded">gemma4:e4b</code> model. Generation takes ~15–30 seconds.
            </p>
          </div>
        </div>

        {/* Right panel — saved recaps */}
        <div className="space-y-3">
          {tabRecaps.length === 0 ? (
            <div className="bg-surface border border-surfaceHighlight rounded-xl flex flex-col items-center justify-center py-16 gap-3">
              <Sparkles size={32} className="text-textMuted opacity-40" />
              <p className="text-textMuted text-sm">No {activeTab} recaps yet</p>
              <p className="text-textMuted text-xs opacity-60">Pick a period on the left and hit Generate</p>
            </div>
          ) : (
            tabRecaps.map(recap => (
              <RecapCard
                key={recap.id}
                recap={recap}
                onRegenerate={handleRegenerate}
                onDelete={handleDelete}
                isRegenerating={generatingId === recap.id}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AIRecaps;
