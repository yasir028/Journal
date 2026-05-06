import React, { useState, useMemo } from 'react';
import { Sparkles, RefreshCw, Trash2, ChevronDown, ChevronUp, Calendar, TrendingUp, TrendingDown, Loader2, AlertCircle, Brain, Wifi, WifiOff, Download } from 'lucide-react';
import { PsychProfile as PsychProfileType, PsychProfilePeriod, Trade } from '../types';
import { checkOllamaStatus, OllamaStatus } from '../services/ollamaService';

// ─── HELPERS ─────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getToday(): string {
  return toDateStr(new Date());
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Daily periods: last 7 days */
function getDailyOptions() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(new Date(), -i);
    const ds = toDateStr(d);
    return {
      label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      start: ds,
      end: ds,
    };
  });
}

/** Weekly periods: last 8 weeks */
function getWeeklyOptions() {
  const monday = getMonday(new Date());
  return Array.from({ length: 8 }, (_, i) => {
    const start = addDays(monday, -i * 7);
    const end = addDays(start, 6);
    return {
      label: i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i} weeks ago`,
      start: toDateStr(start),
      end: toDateStr(end),
    };
  });
}

/** Monthly periods: last 6 months */
function getMonthlyOptions() {
  return Array.from({ length: 6 }, (_, i) => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return {
      label: i === 0 ? 'This month' : i === 1 ? 'Last month' : first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      start: toDateStr(first),
      end: toDateStr(last),
    };
  });
}

/** Yearly periods: current year + last 2 */
function getYearlyOptions() {
  const now = new Date();
  return Array.from({ length: 3 }, (_, i) => {
    const year = now.getFullYear() - i;
    return {
      label: i === 0 ? 'This year' : `${year}`,
      start: `${year}-01-01`,
      end: `${year}-12-31`,
    };
  });
}

function formatPeriodLabel(profile: PsychProfileType): string {
  if (profile.period_type === 'daily') {
    const d = new Date(profile.period_start + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (profile.period_type === 'weekly') {
    const start = new Date(profile.period_start + 'T12:00:00');
    const end = new Date(profile.period_end + 'T12:00:00');
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  if (profile.period_type === 'monthly') {
    return new Date(profile.period_start + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return profile.period_start.slice(0, 4);
}

/** Simple markdown renderer */
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
          return <p key={i} className="font-semibold text-accent">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const content = line.slice(2);
          return (
            <div key={i} className="flex gap-2">
              <span className="text-accent mt-0.5 shrink-0">-</span>
              <span className="text-textMuted">{renderInlineBold(content)}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          const match = line.match(/^(\d+\.)\s(.*)$/);
          if (match) {
            return (
              <div key={i} className="flex gap-2">
                <span className="text-accent font-semibold shrink-0">{match[1]}</span>
                <span className="text-textMuted">{renderInlineBold(match[2])}</span>
              </div>
            );
          }
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

// ─── PROFILE CARD ───────────────────────────────────────────────

interface ProfileCardProps {
  profile: PsychProfileType;
  onRegenerate: (profile: PsychProfileType) => void;
  onDelete: (id: string) => void;
  isRegenerating: boolean;
}

function ProfileCard({ profile, onRegenerate, onDelete, isRegenerating }: ProfileCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isGreen = profile.net_pnl >= 0;

  return (
    <div className="bg-surface border border-surfaceHighlight rounded-xl overflow-hidden">
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
            <p className="font-semibold text-text text-sm">{formatPeriodLabel(profile)}</p>
            <p className="text-xs text-textMuted mt-0.5">
              {profile.trade_count} trade{profile.trade_count !== 1 ? 's' : ''} ·{' '}
              <span className={isGreen ? 'text-success' : 'text-danger'}>
                {isGreen ? '+' : ''}{profile.net_pnl.toFixed(2)}
              </span>
              {' '}· Generated {new Date(profile.generated_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize font-medium">
            {profile.period_type}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onRegenerate(profile); }}
            disabled={isRegenerating}
            className="p-1.5 rounded text-textMuted hover:text-accent hover:bg-surfaceHighlight transition-colors disabled:opacity-40"
            title="Regenerate"
          >
            <RefreshCw size={14} className={isRegenerating ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(profile.id); }}
            className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-danger/10 transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
          {expanded ? <ChevronUp size={16} className="text-textMuted" /> : <ChevronDown size={16} className="text-textMuted" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-surfaceHighlight px-5 py-4">
          <MarkdownContent text={profile.content} />
        </div>
      )}
    </div>
  );
}

// ─── GENERATE BUTTON ROW ────────────────────────────────────────

interface GenerateRowProps {
  label: string;
  periodType: PsychProfilePeriod;
  start: string;
  end: string;
  existing: PsychProfileType | undefined;
  generating: boolean;
  onGenerate: (type: PsychProfilePeriod, start: string, end: string) => void;
}

function GenerateRow({ label, periodType, start, end, existing, generating, onGenerate }: GenerateRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-surfaceHighlight last:border-0">
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-xs text-textMuted">{start === end ? start : `${start} → ${end}`}</p>
      </div>
      <button
        onClick={() => onGenerate(periodType, start, end)}
        disabled={generating}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
          existing
            ? 'bg-surfaceHighlight text-textMuted hover:bg-surfaceHighlight/70'
            : 'bg-accent/10 text-accent hover:bg-accent/20'
        }`}
      >
        {generating ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
        {existing ? 'Regenerate' : 'Generate'}
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────

interface PsychProfileProps {
  profiles: PsychProfileType[];
  trades: Trade[];
  onGenerate: (type: PsychProfilePeriod, start: string, end: string) => Promise<void>;
  onDelete: (id: string) => void;
}

const PsychProfile: React.FC<PsychProfileProps> = ({ profiles, trades, onGenerate, onDelete }) => {
  const [activePeriod, setActivePeriod] = useState<PsychProfilePeriod>('weekly');
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);

  React.useEffect(() => {
    checkOllamaStatus().then(setOllamaStatus);
  }, []);

  // Build period options
  const options = useMemo(() => {
    switch (activePeriod) {
      case 'daily': return getDailyOptions();
      case 'weekly': return getWeeklyOptions();
      case 'monthly': return getMonthlyOptions();
      case 'yearly': return getYearlyOptions();
    }
  }, [activePeriod]);

  // Filter profiles by active period
  const periodProfiles = profiles
    .filter(p => p.period_type === activePeriod)
    .sort((a, b) => b.period_start.localeCompare(a.period_start));

  const handleGenerate = async (type: PsychProfilePeriod, start: string, end: string) => {
    const id = `psych-${type}-${start}`;
    setGeneratingId(id);
    try {
      await onGenerate(type, start, end);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleRegenerate = (profile: PsychProfileType) => {
    handleGenerate(profile.period_type, profile.period_start, profile.period_end);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this psychological profile?')) onDelete(id);
  };

  const profileMap = useMemo(() => {
    const m: Record<string, PsychProfileType> = {};
    profiles.forEach(p => { m[p.id] = p; });
    return m;
  }, [profiles]);

  const StatusBadge = () => {
    if (!ollamaStatus) return null;
    if (ollamaStatus.online && ollamaStatus.hasGemma4) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
          <Wifi size={12} />
          <span>{ollamaStatus.recommended} ready</span>
        </div>
      );
    }
    if (ollamaStatus.online && !ollamaStatus.hasGemma4) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
          <Download size={12} />
          <span>Run: ollama pull {ollamaStatus.recommended}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
        <WifiOff size={12} />
        <span>Ollama offline — run: ollama serve</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Brain size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">Psychological Profile</h2>
            <p className="text-sm text-textMuted">Deep behavioral &amp; psychological pattern analysis</p>
          </div>
        </div>
        <StatusBadge />
      </div>

      {/* Period tabs */}
      <div className="flex gap-1 bg-surfaceHighlight/40 rounded-lg p-1 w-fit">
        {(['daily', 'weekly', 'monthly', 'yearly'] as PsychProfilePeriod[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActivePeriod(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              activePeriod === tab
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
            <Calendar size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-text">Generate Profile</h3>
          </div>
          <div>
            {options.map(opt => {
              const id = `psych-${activePeriod}-${opt.start}`;
              return (
                <GenerateRow
                  key={id}
                  label={opt.label}
                  periodType={activePeriod}
                  start={opt.start}
                  end={opt.end}
                  existing={profileMap[id]}
                  generating={generatingId === id}
                  onGenerate={handleGenerate}
                />
              );
            })}
          </div>

          <div className="mt-4 p-3 bg-surfaceHighlight/40 rounded-lg flex gap-2">
            <AlertCircle size={14} className="text-textMuted shrink-0 mt-0.5" />
            <p className="text-xs text-textMuted leading-relaxed">
              Analyses emotional landscape, self-concept, cognitive framing, defense mechanisms, and developmental trajectory. Generation takes ~30–60 seconds.
            </p>
          </div>
        </div>

        {/* Right panel — saved profiles */}
        <div className="space-y-3">
          {periodProfiles.length === 0 ? (
            <div className="bg-surface border border-surfaceHighlight rounded-xl flex flex-col items-center justify-center py-16 gap-3">
              <Brain size={32} className="text-textMuted opacity-40" />
              <p className="text-textMuted text-sm">No {activePeriod} profiles yet</p>
              <p className="text-textMuted text-xs opacity-60">Pick a period on the left and hit Generate</p>
            </div>
          ) : (
            periodProfiles.map(profile => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onRegenerate={handleRegenerate}
                onDelete={handleDelete}
                isRegenerating={generatingId === profile.id}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PsychProfile;
