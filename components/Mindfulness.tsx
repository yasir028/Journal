import React, { useState, useEffect } from 'react';
import { AlertTriangle, Zap, Book, Calendar, Plus, Save, CheckSquare, Moon } from 'lucide-react';
import { DailyAnalysis, DailyReview } from '../types';
import { generateDailyAffirmation } from '../services/ollamaService';
import RichTextEditor from './RichTextEditor';

interface MindfulnessProps {
  dailyAnalysis?:   DailyAnalysis;
  dailyReviews?:    DailyReview;
  onSaveAnalysis?:  (date: string, text: string) => void;
  onSaveReview?:    (date: string, text: string) => void;
}

const CHECKLIST_ITEMS = [
  'Did I sleep well (7+ hours)?',
  'Have I reviewed major economic news?',
  'Is my daily loss limit set?',
  'Am I feeling calm and neutral?',
  'Do I have a clear thesis for my watchlist?',
];

const Mindfulness: React.FC<MindfulnessProps> = ({
  dailyAnalysis = {},
  dailyReviews = {},
  onSaveAnalysis,
  onSaveReview,
}) => {
  const [affirmation, setAffirmation] = useState('Loading thought of the day...');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [analysisText, setAnalysisText] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [checklist, setChecklist] = useState<boolean[]>(new Array(CHECKLIST_ITEMS.length).fill(false));

  useEffect(() => { generateDailyAffirmation().then(setAffirmation); }, []);

  useEffect(() => {
    setAnalysisText(dailyAnalysis[selectedDate] || '');
    setReviewText(dailyReviews[selectedDate] || '');
    try {
      const stored = localStorage.getItem(`mindful_checklist_${selectedDate}`);
      setChecklist(stored ? JSON.parse(stored) : new Array(CHECKLIST_ITEMS.length).fill(false));
    } catch {
      setChecklist(new Array(CHECKLIST_ITEMS.length).fill(false));
    }
  }, [dailyAnalysis, dailyReviews, selectedDate]);

  const handleChecklistToggle = (i: number) => {
    const updated = [...checklist];
    updated[i] = !updated[i];
    setChecklist(updated);
    localStorage.setItem(`mindful_checklist_${selectedDate}`, JSON.stringify(updated));
  };

  const handleAddTemplate = () => {
    const tpl = `\n## Market Plan\n- **Context:** \n- **Key Levels:** \n- **Bias:** Neutral/Bullish/Bearish\n\n## Scenarios\n1. If price holds ... then ...\n2. If price breaks ... then ...\n`;
    setAnalysisText(prev => prev + tpl);
  };

  const readiness = checklist.filter(Boolean).length;
  const readinessPct = (readiness / CHECKLIST_ITEMS.length) * 100;

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6">

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <div className="w-full lg:w-60 flex flex-col gap-3 shrink-0">

        {/* Daily Focus */}
        <div className="bg-surface p-5 rounded-xl border border-surfaceHighlight shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-accent">
            <Zap size={16} />
            <span className="text-xs font-bold uppercase tracking-wider">Daily Focus</span>
          </div>
          <p className="text-text text-sm italic leading-relaxed">"{affirmation}"</p>
        </div>

        {/* Today's Readiness + Checklist */}
        <div className="bg-surface rounded-xl border border-surfaceHighlight shadow-sm flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-surfaceHighlight">
            <p className="text-xs text-textMuted uppercase tracking-wider mb-2 font-semibold flex items-center gap-1.5">
              <CheckSquare size={13} /> Today's Readiness
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-surfaceHighlight rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
                  style={{ width: `${readinessPct}%` }}
                />
              </div>
              <span className="text-xs font-bold text-text tabular-nums">{readiness}/{CHECKLIST_ITEMS.length}</span>
            </div>
          </div>

          {/* Compact checklist */}
          <div className="p-3 space-y-1.5 overflow-y-auto">
            {CHECKLIST_ITEMS.map((item, idx) => (
              <label
                key={idx}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  checklist[idx]
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-background/50 border-surfaceHighlight hover:border-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checklist[idx]}
                  onChange={() => handleChecklistToggle(idx)}
                  className="mt-0.5 w-3.5 h-3.5 rounded border-gray-600 accent-primary shrink-0"
                />
                <span className={`text-xs leading-snug ${checklist[idx] ? 'line-through text-textMuted' : 'text-text'}`}>
                  {item}
                </span>
              </label>
            ))}
          </div>

          {/* Rule reminder */}
          <div className="mx-3 mb-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-blue-400 font-bold text-xs mb-1 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Rule #1
            </p>
            <p className="text-blue-200 text-[11px] italic leading-snug">
              "No adding to losing positions. Respect stops immediately."
            </p>
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-0 bg-surface rounded-xl border border-surfaceHighlight shadow-sm overflow-hidden min-h-0">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surfaceHighlight shrink-0">
          <h2 className="text-lg font-bold text-text">Trading Journal</h2>
          <div className="flex items-center gap-2 bg-background border border-surfaceHighlight rounded-lg px-3 py-1.5">
            <Calendar size={14} className="text-textMuted" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm text-text outline-none cursor-pointer"
            />
          </div>
        </div>

        {/* Side-by-side editors */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-surfaceHighlight">

          {/* Pre-Market Analysis */}
          <div className="flex flex-col min-h-0 p-5">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                <Book size={15} className="text-primary" /> Pre-Market Analysis
              </h3>
              <div className="flex gap-1.5">
                <button
                  onClick={handleAddTemplate}
                  className="text-[11px] bg-surfaceHighlight px-2 py-1 rounded text-textMuted flex items-center gap-1 hover:text-text transition-colors"
                >
                  <Plus size={11} /> Template
                </button>
              </div>
            </div>
            <p className="text-[11px] text-textMuted mb-3 shrink-0">Market thesis for {selectedDate}</p>
            <div className="flex-1 min-h-0">
              <RichTextEditor
                value={analysisText}
                onChange={setAnalysisText}
                placeholder="E.g. SPY is gapping up into resistance at 450..."
                minHeight="100%"
              />
            </div>
            <div className="flex justify-end mt-3 shrink-0">
              <button
                onClick={() => onSaveAnalysis?.(selectedDate, analysisText)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-all active:scale-95"
              >
                <Save size={14} /> Save Analysis
              </button>
            </div>
          </div>

          {/* End of Day Review */}
          <div className="flex flex-col min-h-0 p-5">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                <Moon size={15} className="text-accent" /> End of Day Review
              </h3>
            </div>
            <p className="text-[11px] text-textMuted mb-3 shrink-0">Reflect on today's trading</p>
            <div className="flex-1 min-h-0">
              <RichTextEditor
                value={reviewText}
                onChange={setReviewText}
                placeholder="What went well? What triggered me? What will I improve tomorrow?"
                minHeight="100%"
              />
            </div>
            <div className="flex justify-end mt-3 shrink-0">
              <button
                onClick={() => onSaveReview?.(selectedDate, reviewText)}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent/90 transition-all active:scale-95"
              >
                <Save size={14} /> Save Review
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Mindfulness;
