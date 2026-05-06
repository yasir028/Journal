import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Zap, Activity, Book, Calendar, Plus, Save } from 'lucide-react';
import { Trade, DailyAnalysis } from '../types';
import { generateDailyAffirmation } from '../services/ollamaService';
import RichTextEditor from './RichTextEditor';

interface MindfulnessProps {
  trades:          Trade[];
  dailyAnalysis?:  DailyAnalysis;
  onSaveAnalysis?: (date: string, text: string) => void;
}

const CHECKLIST_ITEMS = [
  'Did I sleep well (7+ hours)?',
  'Have I reviewed major economic news?',
  'Is my daily loss limit set?',
  'Am I feeling calm and neutral?',
  'Do I have a clear thesis for my watchlist?',
];

const Mindfulness: React.FC<MindfulnessProps> = ({ trades, dailyAnalysis = {}, onSaveAnalysis }) => {
  // Affirmation
  const [affirmation, setAffirmation] = useState<string>('Loading thought of the day...');

  // Routine
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [routineNote, setRoutineNote]   = useState('');

  // Checklist (localStorage — date-keyed)
  const [checklist, setChecklist] = useState<boolean[]>(new Array(CHECKLIST_ITEMS.length).fill(false));

  // ── Effects ──────────────────────────────────────────────────────

  useEffect(() => {
    generateDailyAffirmation().then(setAffirmation);
  }, []);

  useEffect(() => {
    setRoutineNote(dailyAnalysis[selectedDate] || '');
    try {
      const stored = localStorage.getItem(`mindful_checklist_${selectedDate}`);
      setChecklist(stored ? JSON.parse(stored) : new Array(CHECKLIST_ITEMS.length).fill(false));
    } catch {
      setChecklist(new Array(CHECKLIST_ITEMS.length).fill(false));
    }
  }, [dailyAnalysis, selectedDate]);

  // ── Handlers ─────────────────────────────────────────────────────

  const handleRoutineNoteChange = (text: string) => setRoutineNote(text);

  const handleManualSave = () => {
    if (onSaveAnalysis) onSaveAnalysis(selectedDate, routineNote);
  };

  const handleChecklistToggle = (index: number) => {
    const updated = [...checklist];
    updated[index] = !updated[index];
    setChecklist(updated);
    localStorage.setItem(`mindful_checklist_${selectedDate}`, JSON.stringify(updated));
  };

  const handleAddTemplate = () => {
    const template = `\n## Market Plan\n- **Context:** \n- **Key Levels:** \n- **Bias:** Neutral/Bullish/Bearish\n\n## Scenarios\n1. If price holds ... then ...\n2. If price breaks ... then ...\n`;
    handleRoutineNoteChange(routineNote + template);
  };

  const handleAddTag = () => handleRoutineNoteChange(routineNote + ' #setup ');

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col lg:flex-row gap-6">

      {/* Sidebar */}
      <div className="w-full lg:w-64 flex flex-col gap-2 shrink-0">

        {/* Daily affirmation */}
        <div className="bg-surface p-6 rounded-xl border border-surfaceHighlight mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-accent">
            <Zap size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Daily Focus</span>
          </div>
          <p className="text-text text-sm italic leading-relaxed">"{affirmation}"</p>
        </div>

        {/* Quick stats */}
        <div className="bg-surface p-4 rounded-xl border border-surfaceHighlight shadow-sm">
          <p className="text-xs text-textMuted uppercase tracking-wider mb-2 font-semibold">Today's Readiness</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-surfaceHighlight rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
                style={{ width: `${(checklist.filter(Boolean).length / CHECKLIST_ITEMS.length) * 100}%` }}
              />
            </div>
            <span className="text-sm font-bold text-text">
              {checklist.filter(Boolean).length}/{CHECKLIST_ITEMS.length}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 bg-surface rounded-xl border border-surfaceHighlight overflow-hidden flex flex-col shadow-sm">
        <div className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-text">Pre-Trading Checklist</h2>
            <div className="flex items-center gap-2 bg-background border border-surfaceHighlight rounded-lg px-3 py-1.5">
              <Calendar size={16} className="text-textMuted" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm text-text outline-none focus:ring-0 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
            {/* Checklist */}
            <div>
              <div className="space-y-4 mb-8">
                {CHECKLIST_ITEMS.map((item, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                      checklist[idx]
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-background border-surfaceHighlight hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checklist[idx]}
                      onChange={() => handleChecklistToggle(idx)}
                      className="w-5 h-5 rounded border-gray-600 text-primary focus:ring-offset-0 bg-surface accent-primary"
                    />
                    <span className={`text-text ${checklist[idx] ? 'line-through text-textMuted' : ''}`}>
                      {item}
                    </span>
                  </label>
                ))}
              </div>

              <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
                  <AlertTriangle size={18} />
                  Rule #1 Reminder
                </h3>
                <p className="text-blue-200 text-sm italic">
                  "I will not add to a losing position today. I will respect my stop losses immediately."
                </p>
              </div>
            </div>

            {/* Pre-market editor */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-text flex items-center gap-2">
                  <Book size={18} /> Pre-Market Analysis
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddTemplate}
                    className="text-xs bg-surfaceHighlight px-2 py-1 rounded-full text-text flex items-center gap-1 hover:bg-gray-700 transition-colors"
                  >
                    <Plus size={12} /> Add template
                  </button>
                  <button
                    onClick={handleAddTag}
                    className="text-xs text-textMuted hover:text-text flex items-center gap-1"
                  >
                    <Plus size={12} /> Add tag
                  </button>
                </div>
              </div>
              <p className="text-xs text-textMuted mb-4">Write your market thesis for {selectedDate}.</p>

              <RichTextEditor
                value={routineNote}
                onChange={handleRoutineNoteChange}
                placeholder="E.g. SPY is gapping up into resistance at 450..."
                minHeight="350px"
              />

              <div className="flex justify-end mt-4">
                <button
                  onClick={handleManualSave}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-all active:scale-95 shadow-md"
                >
                  <Save size={18} />
                  Save Analysis
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Mindfulness;
