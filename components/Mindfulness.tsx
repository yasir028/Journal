import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Brain, MessageCircle, AlertTriangle, Zap, Activity, ArrowUpRight, Book, Calendar, Plus, Save, Wifi, WifiOff, Download } from 'lucide-react';
import { Trade, DailyAnalysis } from '../types';
import { analyzePsychology, getCoachResponse, generateDailyAffirmation, checkOllamaStatus, OllamaStatus, ChatMessage } from '../services/ollamaService';
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

// Timeframe → days for backend query
const TIMEFRAME_DAYS: Record<string, number> = {
  MONTH:   30,
  QUARTER: 90,
  YEAR:    365,
  ALL:     3650,
};

const Mindfulness: React.FC<MindfulnessProps> = ({ trades, dailyAnalysis = {}, onSaveAnalysis }) => {
  const [activeTab, setActiveTab] = useState<'coach' | 'analysis' | 'routine'>('routine');

  // Analysis state
  const [analysisTimeframe, setAnalysisTimeframe] = useState<'MONTH' | 'QUARTER' | 'YEAR' | 'ALL'>('MONTH');
  const [analysis, setAnalysis]     = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Chat state
  const [chatInput, setChatInput]   = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: 'ai', text: "I'm your trading psychology coach. I have access to your recent trades, emotions, plans and reviews. What's on your mind?" },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Affirmation
  const [affirmation, setAffirmation] = useState<string>('Loading thought of the day...');

  // Ollama status
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);

  // Routine tab
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [routineNote, setRoutineNote]   = useState('');

  // Checklist (localStorage — date-keyed)
  const [checklist, setChecklist] = useState<boolean[]>(new Array(CHECKLIST_ITEMS.length).fill(false));

  // ── Effects ──────────────────────────────────────────────────────

  useEffect(() => {
    generateDailyAffirmation().then(setAffirmation);
    checkOllamaStatus().then(setOllamaStatus);
  }, []);

  useEffect(() => {
    if (activeTab === 'coach') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, activeTab, isChatLoading]);

  useEffect(() => {
    setRoutineNote(dailyAnalysis[selectedDate] || '');
    try {
      const stored = localStorage.getItem(`mindful_checklist_${selectedDate}`);
      setChecklist(stored ? JSON.parse(stored) : new Array(CHECKLIST_ITEMS.length).fill(false));
    } catch {
      setChecklist(new Array(CHECKLIST_ITEMS.length).fill(false));
    }
  }, [dailyAnalysis, selectedDate]);

  // ── Derived stats (for trade count display only) ─────────────────
  const filteredCount = useMemo(() => {
    const now = new Date();
    const days = TIMEFRAME_DAYS[analysisTimeframe];
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);
    if (analysisTimeframe === 'ALL') return trades.length;
    return trades.filter(t => new Date(t.date) >= cutoff).length;
  }, [trades, analysisTimeframe]);

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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg = chatInput.trim();
    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', text: userMsg }];
    setChatHistory(newHistory);
    setChatInput('');
    setIsChatLoading(true);

    try {
      // Pass full history so coach has multi-turn context
      // Skip the initial hardcoded greeting — server expects history to start with a user turn
      const response = await getCoachResponse(userMsg, chatHistory.slice(1));
      setChatHistory(prev => [...prev, { role: 'ai', text: response }]);
    } catch {
      setChatHistory(prev => [...prev, { role: 'ai', text: "Sorry, I'm having trouble connecting. Is Ollama running?" }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysis(null);
    const days   = TIMEFRAME_DAYS[analysisTimeframe];
    const result = await analyzePsychology(days);
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  // ── Ollama status badge ──────────────────────────────────────────
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

        <button
          onClick={() => setActiveTab('routine')}
          className={`p-4 rounded-xl text-left border transition-all flex items-center gap-3
            ${activeTab === 'routine'
              ? 'bg-surface border-primary text-white shadow-md'
              : 'bg-surface border-transparent text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}
        >
          <Activity size={20} />
          <div>
            <p className="font-semibold">Pre-Session Routine</p>
            <p className="text-xs opacity-70">Get in the zone</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('coach')}
          className={`p-4 rounded-xl text-left border transition-all flex items-center gap-3
            ${activeTab === 'coach'
              ? 'bg-surface border-primary text-white shadow-md'
              : 'bg-surface border-transparent text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}
        >
          <Brain size={20} />
          <div>
            <p className="font-semibold">AI Coach</p>
            <p className="text-xs opacity-70">Chat about emotions</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('analysis')}
          className={`p-4 rounded-xl text-left border transition-all flex items-center gap-3
            ${activeTab === 'analysis'
              ? 'bg-surface border-primary text-white shadow-md'
              : 'bg-surface border-transparent text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}
        >
          <MessageCircle size={20} />
          <div>
            <p className="font-semibold">Psycho-Analysis</p>
            <p className="text-xs opacity-70">Review your patterns</p>
          </div>
        </button>

        {/* Ollama status — shown in sidebar */}
        <div className="mt-auto pt-4">
          <StatusBadge />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 bg-surface rounded-xl border border-surfaceHighlight overflow-hidden flex flex-col shadow-sm">

        {/* ── ROUTINE TAB ─────────────────────────────────────────── */}
        {activeTab === 'routine' && (
          <div className="flex-1 p-6 lg:p-8 overflow-y-auto animate-in fade-in slide-in-from-right-4">
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
        )}

        {/* ── COACH TAB ───────────────────────────────────────────── */}
        {activeTab === 'coach' && (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-surfaceHighlight bg-surfaceHighlight/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-full text-primary">
                  <Brain size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-text">AI Coach</h3>
                  <p className="text-xs text-textMuted">Powered by {ollamaStatus?.recommended ?? 'local AI'} — knows your journal</p>
                </div>
              </div>
              <StatusBadge />
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-tr-none'
                        : 'bg-surfaceHighlight text-text rounded-tl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex justify-start animate-in slide-in-from-bottom-2 fade-in">
                  <div className="bg-surfaceHighlight text-textMuted p-4 rounded-2xl rounded-tl-none text-xs flex items-center gap-1">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce delay-100">●</span>
                    <span className="animate-bounce delay-200">●</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-surfaceHighlight bg-surface">
              <div className="relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  disabled={isChatLoading}
                  placeholder="I just lost 3 trades in a row... / Am I revenge trading?"
                  className="w-full bg-background border border-surfaceHighlight rounded-full py-3 pl-6 pr-12 text-text focus:border-primary outline-none transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !chatInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── ANALYSIS TAB ────────────────────────────────────────── */}
        {activeTab === 'analysis' && (
          <div className="p-8 overflow-y-auto animate-in fade-in slide-in-from-right-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-text">Pattern Recognition</h2>
                <p className="text-textMuted mt-1">
                  Deep AI analysis — cross-references your trades, plans, reviews and rules.
                </p>
              </div>

              <div className="flex flex-col items-end gap-3">
                <StatusBadge />

                {/* Timeframe selector */}
                <div className="flex bg-surfaceHighlight p-1 rounded-lg">
                  {(['MONTH', 'QUARTER', 'YEAR', 'ALL'] as const).map(period => (
                    <button
                      key={period}
                      onClick={() => setAnalysisTimeframe(period)}
                      className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                        analysisTimeframe === period
                          ? 'bg-primary text-white shadow'
                          : 'text-textMuted hover:text-text'
                      }`}
                    >
                      {period === 'MONTH' ? '30 Days' : period === 'QUARTER' ? 'Quarter' : period === 'YEAR' ? 'YTD' : 'All Time'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-textMuted">{filteredCount} trades in range</span>
                  <button
                    onClick={runAnalysis}
                    disabled={isAnalyzing}
                    className="px-6 py-2 bg-accent hover:bg-purple-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-50"
                  >
                    {isAnalyzing
                      ? <Activity className="animate-spin" size={18} />
                      : <Brain size={18} />}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze Psychology'}
                  </button>
                </div>
              </div>
            </div>

            {/* Analysis result */}
            {analysis ? (
              <div className="bg-background rounded-xl p-6 border border-surfaceHighlight animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-center mb-4 border-b border-surfaceHighlight pb-2">
                  <span className="text-sm font-bold text-accent">Analysis Result — {analysisTimeframe}</span>
                  <button
                    onClick={() => setAnalysis(null)}
                    className="text-xs text-textMuted hover:text-text underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-text">
                  {analysis}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-textMuted border-2 border-dashed border-surfaceHighlight rounded-xl bg-background/50">
                <Brain size={48} className="mb-4 opacity-20" />
                <p className="text-center max-w-md">
                  Select a timeframe and click Analyze — the AI will cross-reference your trades,
                  pre-market plans, post-market reviews, and notebook rules to find patterns you're not seeing.
                </p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default Mindfulness;