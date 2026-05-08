import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Sun,
  Target,
  Shield,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Brain,
} from 'lucide-react';
import { Trade, TradeStatus } from '../types';

interface StartMyDayProps {
  isOpen: boolean;
  onClose: () => void;
  trades: Trade[];
  dailyReviews: Record<string, string>;
  onSaveDailyAnalysis: (date: string, content: string) => void;
}

interface FormData {
  yesterdayLesson: string;
  todayThesis: string;
  feeling: string;
  maxLosses: number;
  maxTrades: number;
  maxDollarLoss: number;
}

const FEELING_OPTIONS = ['Confident', 'Neutral', 'Cautious', 'Anxious', 'Tired'];

const STEP_ICONS = [Sun, Target, Shield, CheckCircle] as const;
const STEP_LABELS = ["Yesterday's Review", "Today's Game Plan", 'Set Your Limits', 'Commitment'] as const;

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getYesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

function formatCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Component ───────────────────────────────────────────────────

const StartMyDay: React.FC<StartMyDayProps> = ({
  isOpen,
  onClose,
  trades,
  dailyReviews,
  onSaveDailyAnalysis,
}) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    yesterdayLesson: '',
    todayThesis: '',
    feeling: 'Neutral',
    maxLosses: 2,
    maxTrades: 5,
    maxDollarLoss: 500,
  });
  const [commitments, setCommitments] = useState([false, false, false]);

  // ── Yesterday's stats ───────────────────────────────────────────

  const yesterdayKey = useMemo(() => toDateKey(getYesterday()), []);

  const yesterdayStats = useMemo(() => {
    const ydTrades = trades.filter(
      (t) => t.date === yesterdayKey && t.status === TradeStatus.CLOSED
    );
    const wins = ydTrades.filter((t) => (t.pnl ?? 0) > 0).length;
    const losses = ydTrades.filter((t) => (t.pnl ?? 0) < 0).length;
    const netPnl = ydTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const mistakes = ydTrades.flatMap((t) => t.mistakes ?? []);
    const uniqueMistakes = [...new Set(mistakes)];
    return { total: ydTrades.length, wins, losses, netPnl, mistakes: uniqueMistakes };
  }, [trades, yesterdayKey]);

  // ── Streak calculation ──────────────────────────────────────────

  const streak = useMemo(() => {
    const dailyPnl = new Map<string, number>();
    for (const t of trades) {
      if (t.status !== TradeStatus.CLOSED) continue;
      dailyPnl.set(t.date, (dailyPnl.get(t.date) ?? 0) + (t.pnl ?? 0));
    }

    const sortedDays = [...dailyPnl.entries()]
      .sort(([a], [b]) => b.localeCompare(a)); // descending

    if (sortedDays.length === 0) return { count: 0, type: 'none' as const };

    const firstPnl = sortedDays[0][1];
    if (firstPnl === 0) return { count: 0, type: 'none' as const };

    const isWinning = firstPnl > 0;
    let count = 0;
    for (const [, pnl] of sortedDays) {
      if ((isWinning && pnl > 0) || (!isWinning && pnl < 0)) {
        count++;
      } else {
        break;
      }
    }

    return { count, type: isWinning ? ('winning' as const) : ('losing' as const) };
  }, [trades]);

  // ── Savings from stopping after N losses ────────────────────────

  const savingsEstimate = useMemo(() => {
    // Group trades by date, sorted by time within each day
    const dayMap = new Map<string, Trade[]>();
    for (const t of trades) {
      if (t.status !== TradeStatus.CLOSED) continue;
      const existing = dayMap.get(t.date) ?? [];
      existing.push(t);
      dayMap.set(t.date, existing);
    }

    const maxLosses = formData.maxLosses;
    let totalSaved = 0;
    let daysAnalyzed = 0;

    for (const [, dayTrades] of dayMap) {
      // Sort by entry time (best-effort; trades without entryTime go last)
      dayTrades.sort((a, b) => (a.entryTime ?? '99:99').localeCompare(b.entryTime ?? '99:99'));

      let lossCount = 0;
      let shouldHaveStopped = false;
      let lostAfterLimit = 0;

      for (const t of dayTrades) {
        if (shouldHaveStopped) {
          lostAfterLimit += t.pnl ?? 0;
        } else {
          if ((t.pnl ?? 0) < 0) {
            lossCount++;
            if (lossCount >= maxLosses) {
              shouldHaveStopped = true;
            }
          }
        }
      }

      if (shouldHaveStopped && lostAfterLimit < 0) {
        totalSaved += Math.abs(lostAfterLimit);
      }
      daysAnalyzed++;
    }

    // Rough monthly estimate (assume ~21 trading days/month)
    const daysInData = daysAnalyzed || 1;
    const monthlySaved = (totalSaved / daysInData) * 21;

    return Math.round(monthlySaved);
  }, [trades, formData.maxLosses]);

  // ── Pre-fill yesterday's review ─────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    // Reset state when modal opens
    setStep(1);
    setCommitments([false, false, false]);
    setFormData((prev) => ({
      ...prev,
      yesterdayLesson: dailyReviews[yesterdayKey] ?? '',
      todayThesis: '',
      feeling: 'Neutral',
      maxLosses: 2,
      maxTrades: 5,
      maxDollarLoss: 500,
    }));
  }, [isOpen, dailyReviews, yesterdayKey]);

  // ── Keyboard handling ───────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (step === 1) {
          onClose();
        } else {
          setStep((s) => s - 1);
        }
      }
    },
    [isOpen, step, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Actions ─────────────────────────────────────────────────────

  const handleNext = () => setStep((s) => Math.min(s + 1, 4));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleStartTrading = () => {
    const todayKey = toDateKey(new Date());
    const content = [
      `## Pre-Market Plan`,
      `**Feeling:** ${formData.feeling}`,
      `**Thesis:** ${formData.todayThesis}`,
      '',
      `## Limits`,
      `- Max losses before stopping: ${formData.maxLosses}`,
      `- Max trades today: ${formData.maxTrades}`,
      `- Max dollar loss: $${formData.maxDollarLoss}`,
      '',
      `## Yesterday's Lesson`,
      formData.yesterdayLesson || '_No lesson recorded_',
    ].join('\n');

    onSaveDailyAnalysis(todayKey, content);
    onClose();
  };

  const toggleCommitment = (index: number) => {
    setCommitments((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const allChecked = commitments.every(Boolean);

  // ── Don't render if closed ──────────────────────────────────────

  if (!isOpen) return null;

  // ── Step indicator ──────────────────────────────────────────────

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-3 mb-8">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === step;
        const isComplete = stepNum < step;
        return (
          <div key={label} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-primary text-white scale-110'
                    : isComplete
                      ? 'bg-primary/30 text-primary'
                      : 'bg-surfaceHighlight text-textMuted'
                }`}
              >
                {isComplete ? <CheckCircle size={16} /> : stepNum}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors duration-300 ${
                  isActive ? 'text-primary' : 'text-textMuted'
                }`}
              >
                {label}
              </span>
            </div>
            {i < 3 && (
              <div
                className={`w-10 h-0.5 rounded-full transition-colors duration-300 mb-4 ${
                  isComplete ? 'bg-primary/50' : 'bg-surfaceHighlight'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // ── Step header ─────────────────────────────────────────────────

  const StepHeader = ({ stepIndex }: { stepIndex: number }) => {
    const Icon = STEP_ICONS[stepIndex];
    return (
      <div className="flex flex-col items-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mb-3">
          <Icon size={28} className="text-primary" />
        </div>
        <h2 className="text-xl font-bold text-text">{STEP_LABELS[stepIndex]}</h2>
      </div>
    );
  };

  // ── Navigation buttons ──────────────────────────────────────────

  const NavButtons = ({ showBack = true, nextLabel = 'Next' }: { showBack?: boolean; nextLabel?: string }) => (
    <div className="flex justify-between mt-8">
      {showBack && step > 1 ? (
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-textMuted hover:text-text hover:bg-surfaceHighlight transition-all duration-200"
        >
          <ChevronLeft size={18} />
          Back
        </button>
      ) : (
        <div />
      )}
      <button
        onClick={handleNext}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-all duration-200"
      >
        {nextLabel}
        <ChevronRight size={18} />
      </button>
    </div>
  );

  // ── Step 1: Yesterday's Review ──────────────────────────────────

  const renderStep1 = () => (
    <div className="animate-fadeIn">
      <StepHeader stepIndex={0} />

      {yesterdayStats.total === 0 ? (
        <div className="text-center py-8 text-textMuted">
          <p className="text-lg mb-1">No trades found for yesterday</p>
          <p className="text-sm">That is okay — rest days are important too.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surfaceHighlight rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-text">{yesterdayStats.total}</p>
              <p className="text-xs text-textMuted mt-1">Trades</p>
            </div>
            <div className="bg-surfaceHighlight rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{yesterdayStats.wins}</p>
              <p className="text-xs text-textMuted mt-1">Wins</p>
            </div>
            <div className="bg-surfaceHighlight rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-red-400">{yesterdayStats.losses}</p>
              <p className="text-xs text-textMuted mt-1">Losses</p>
            </div>
          </div>

          {/* Net P&L */}
          <div className="bg-surfaceHighlight rounded-xl p-4 flex items-center justify-between">
            <span className="text-textMuted text-sm">Net P&L</span>
            <span
              className={`text-xl font-bold ${
                yesterdayStats.netPnl >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {formatCurrency(yesterdayStats.netPnl)}
            </span>
          </div>

          {/* Mistakes */}
          {yesterdayStats.mistakes.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-400" />
                <span className="text-sm font-medium text-red-400">Mistakes Made</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {yesterdayStats.mistakes.map((m) => (
                  <span
                    key={m}
                    className="px-2.5 py-1 bg-red-500/15 text-red-300 text-xs rounded-lg"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key Lesson */}
          {dailyReviews[yesterdayKey] && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain size={16} className="text-primary" />
                <span className="text-sm font-medium text-primary">Key Lesson</span>
              </div>
              <p className="text-sm text-textMuted leading-relaxed">{dailyReviews[yesterdayKey]}</p>
            </div>
          )}
        </div>
      )}

      {/* Lesson textarea */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-textMuted mb-2">
          What did I learn?
        </label>
        <textarea
          value={formData.yesterdayLesson}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, yesterdayLesson: e.target.value }))
          }
          placeholder="Reflect on yesterday's performance..."
          rows={3}
          className="w-full bg-background border border-surfaceHighlight rounded-xl px-4 py-3 text-text text-sm placeholder-textMuted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 resize-none transition-all duration-200"
        />
      </div>

      <NavButtons showBack={false} />
    </div>
  );

  // ── Step 2: Today's Game Plan ───────────────────────────────────

  const renderStep2 = () => (
    <div className="animate-fadeIn">
      <StepHeader stepIndex={1} />

      <p className="text-center text-textMuted text-sm mb-6">{formatDate(new Date())}</p>

      {/* Streak */}
      {streak.type !== 'none' && (
        <div
          className={`flex items-center justify-center gap-2 mb-6 px-4 py-2.5 rounded-xl text-sm font-medium ${
            streak.type === 'winning'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {streak.type === 'winning' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          {streak.count}-day {streak.type} streak
        </div>
      )}

      {/* Thesis */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-textMuted mb-2">
          What is your thesis for today?
        </label>
        <textarea
          value={formData.todayThesis}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, todayThesis: e.target.value }))
          }
          placeholder="e.g., Expecting continuation in NQ after strong close. Looking for pullback entries above 18,500..."
          rows={4}
          className="w-full bg-background border border-surfaceHighlight rounded-xl px-4 py-3 text-text text-sm placeholder-textMuted/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 resize-none transition-all duration-200"
        />
      </div>

      {/* Feeling */}
      <div>
        <label className="block text-sm font-medium text-textMuted mb-2">
          How are you feeling?
        </label>
        <select
          value={formData.feeling}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, feeling: e.target.value }))
          }
          className="w-full bg-background border border-surfaceHighlight rounded-xl px-4 py-3 text-text text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all duration-200 appearance-none cursor-pointer"
        >
          {FEELING_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <NavButtons />
    </div>
  );

  // ── Step 3: Set Your Limits ─────────────────────────────────────

  const renderStep3 = () => (
    <div className="animate-fadeIn">
      <StepHeader stepIndex={2} />

      <div className="space-y-5">
        {/* Max losses */}
        <div>
          <label className="block text-sm font-medium text-textMuted mb-2">
            Maximum losses before stopping
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={formData.maxLosses}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                maxLosses: Math.max(1, parseInt(e.target.value) || 1),
              }))
            }
            className="w-full bg-background border border-surfaceHighlight rounded-xl px-4 py-3 text-text text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all duration-200"
          />
        </div>

        {/* Max trades */}
        <div>
          <label className="block text-sm font-medium text-textMuted mb-2">
            Maximum trades today
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={formData.maxTrades}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                maxTrades: Math.max(1, parseInt(e.target.value) || 1),
              }))
            }
            className="w-full bg-background border border-surfaceHighlight rounded-xl px-4 py-3 text-text text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all duration-200"
          />
        </div>

        {/* Max dollar loss */}
        <div>
          <label className="block text-sm font-medium text-textMuted mb-2">
            Maximum dollar loss today
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted text-sm">$</span>
            <input
              type="number"
              min={0}
              step={50}
              value={formData.maxDollarLoss}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  maxDollarLoss: Math.max(0, parseInt(e.target.value) || 0),
                }))
              }
              className="w-full bg-background border border-surfaceHighlight rounded-xl pl-8 pr-4 py-3 text-text text-sm focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all duration-200"
            />
          </div>
        </div>

        {/* Savings warning */}
        {savingsEstimate > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-300 leading-relaxed">
              Based on your data, stopping after{' '}
              <span className="font-semibold">{formData.maxLosses} loss{formData.maxLosses !== 1 ? 'es' : ''}</span>{' '}
              saves you{' '}
              <span className="font-semibold">${savingsEstimate.toLocaleString()}/month</span> on
              average.
            </p>
          </div>
        )}
      </div>

      <NavButtons />
    </div>
  );

  // ── Step 4: Commitment ──────────────────────────────────────────

  const renderStep4 = () => {
    const commitmentItems = [
      'I will follow my rules today',
      'I will stop trading after hitting my loss limit',
      'I will only trade my proven setups',
    ];

    return (
      <div className="animate-fadeIn">
        <StepHeader stepIndex={3} />

        {/* Summary */}
        <div className="space-y-3 mb-6">
          {/* Yesterday's lesson */}
          {formData.yesterdayLesson && (
            <div className="bg-surfaceHighlight rounded-xl p-4">
              <p className="text-xs font-medium text-textMuted mb-1">Yesterday's Lesson</p>
              <p className="text-sm text-text leading-relaxed">{formData.yesterdayLesson}</p>
            </div>
          )}

          {/* Today's plan */}
          {formData.todayThesis && (
            <div className="bg-surfaceHighlight rounded-xl p-4">
              <p className="text-xs font-medium text-textMuted mb-1">Today's Plan</p>
              <p className="text-sm text-text leading-relaxed">{formData.todayThesis}</p>
            </div>
          )}

          {/* Limits */}
          <div className="bg-surfaceHighlight rounded-xl p-4">
            <p className="text-xs font-medium text-textMuted mb-2">Today's Limits</p>
            <div className="flex flex-wrap gap-3 text-sm text-text">
              <span className="px-3 py-1 bg-background rounded-lg">
                {formData.maxLosses} max loss{formData.maxLosses !== 1 ? 'es' : ''}
              </span>
              <span className="px-3 py-1 bg-background rounded-lg">
                {formData.maxTrades} max trades
              </span>
              <span className="px-3 py-1 bg-background rounded-lg">
                ${formData.maxDollarLoss} max $ loss
              </span>
            </div>
          </div>

          {/* Mental state */}
          <div className="bg-surfaceHighlight rounded-xl p-4 flex items-center justify-between">
            <p className="text-xs font-medium text-textMuted">Mental State</p>
            <span className="text-sm font-medium text-text">{formData.feeling}</span>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-3 mb-8">
          {commitmentItems.map((item, i) => (
            <button
              key={item}
              onClick={() => toggleCommitment(i)}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left group cursor-pointer"
              style={{
                borderColor: commitments[i] ? 'var(--color-primary)' : 'var(--color-surfaceHighlight)',
                backgroundColor: commitments[i] ? 'rgba(var(--color-primary-rgb, 99, 102, 241), 0.08)' : 'transparent',
              }}
            >
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                  commitments[i]
                    ? 'bg-primary border-primary'
                    : 'border-textMuted/30 group-hover:border-primary/50'
                }`}
              >
                {commitments[i] && <CheckCircle size={14} className="text-white" />}
              </div>
              <span
                className={`text-sm transition-colors duration-200 ${
                  commitments[i] ? 'text-text font-medium' : 'text-textMuted'
                }`}
              >
                {item}
              </span>
            </button>
          ))}
        </div>

        {/* Start Trading button */}
        <div className="flex justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-textMuted hover:text-text hover:bg-surfaceHighlight transition-all duration-200"
          >
            <ChevronLeft size={18} />
            Back
          </button>
          <button
            onClick={handleStartTrading}
            disabled={!allChecked}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${
              allChecked
                ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/25 cursor-pointer'
                : 'bg-surfaceHighlight text-textMuted cursor-not-allowed'
            }`}
          >
            <CheckCircle size={18} />
            Start Trading
          </button>
        </div>
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          if (step === 1) onClose();
        }}
      />

      {/* Card */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-surface rounded-2xl border border-surfaceHighlight shadow-2xl overflow-hidden flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-textMuted hover:text-text hover:bg-surfaceHighlight transition-all duration-200 z-10 cursor-pointer"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="overflow-y-auto p-8 flex-1">
          <StepIndicator />
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>
      </div>
    </div>
  );
};

export default StartMyDay;
