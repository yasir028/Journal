import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Brain, MessageCircle, AlertTriangle, Zap, Activity, ArrowUpRight, Book, Calendar, Plus, Filter, Save } from 'lucide-react';
import { Trade, DailyAnalysis } from '../types';
import { analyzePsychology, getCoachResponse, generateDailyAffirmation } from '../services/geminiService';
import RichTextEditor from './RichTextEditor';

interface MindfulnessProps {
  trades: Trade[];
  dailyAnalysis?: DailyAnalysis;
  onSaveAnalysis?: (date: string, text: string) => void;
}

const CHECKLIST_ITEMS = [
  'Did I sleep well (7+ hours)?',
  'Have I reviewed major economic news?',
  'Is my daily loss limit set?',
  'Am I feeling calm and neutral?',
  'Do I have a clear thesis for my watchlist?'
];

const Mindfulness: React.FC<MindfulnessProps> = ({ trades, dailyAnalysis = {}, onSaveAnalysis }) => {
  const [activeTab, setActiveTab] = useState<'coach' | 'analysis' | 'routine'>('routine');
  
  // Analysis State
  const [analysisTimeframe, setAnalysisTimeframe] = useState<'MONTH' | 'QUARTER' | 'YEAR' | 'ALL'>('MONTH');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', text: string}[]>([
    { role: 'ai', text: "I'm your trading psychology coach. Feeling tilted? Anxious? Let's talk it through before you take the next trade." }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [affirmation, setAffirmation] = useState<string>('Loading thought of the day...');
  
  // Routine Tab State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [routineNote, setRoutineNote] = useState('');
  
  // Checklist State (Persisted in LocalStorage)
  const [checklist, setChecklist] = useState<boolean[]>(new Array(CHECKLIST_ITEMS.length).fill(false));

  useEffect(() => {
    generateDailyAffirmation().then(setAffirmation);
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'coach') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, activeTab, isChatLoading]);

  // Load data when date changes
  useEffect(() => {
    // Load Note
    setRoutineNote(dailyAnalysis[selectedDate] || '');

    // Load Checklist from LocalStorage
    try {
      const stored = localStorage.getItem(`mindful_checklist_${selectedDate}`);
      if (stored) {
        setChecklist(JSON.parse(stored));
      } else {
        setChecklist(new Array(CHECKLIST_ITEMS.length).fill(false));
      }
    } catch (e) {
      console.error("Failed to load checklist", e);
    }
  }, [dailyAnalysis, selectedDate]);

  // Filter Trades for Analysis based on Timeframe
  const filteredAnalysisTrades = useMemo(() => {
    let data = [...trades].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const now = new Date();
    if (analysisTimeframe === 'MONTH') {
      const past = new Date(); past.setDate(now.getDate() - 30);
      data = data.filter(t => new Date(t.date) >= past);
    } else if (analysisTimeframe === 'QUARTER') {
      const past = new Date(); past.setDate(now.getDate() - 90);
      data = data.filter(t => new Date(t.date) >= past);
    } else if (analysisTimeframe === 'YEAR') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      data = data.filter(t => new Date(t.date) >= startOfYear);
    }
    
    return data;
  }, [trades, analysisTimeframe]);

  const handleRoutineNoteChange = (text: string) => {
    setRoutineNote(text);
    // We removed the auto-save here so you can use the manual button, 
    // or you can leave it if you want both.
  };

  const handleManualSave = () => {
    if (onSaveAnalysis) {
        onSaveAnalysis(selectedDate, routineNote);
    }
  };

  const handleChecklistToggle = (index: number) => {
    const newChecklist = [...checklist];
    newChecklist[index] = !newChecklist[index];
    setChecklist(newChecklist);
    localStorage.setItem(`mindful_checklist_${selectedDate}`, JSON.stringify(newChecklist));
  };

  const handleAddTemplate = () => {
    const template = `\n## Market Plan\n- **Context:** \n- **Key Levels:** \n- **Bias:** Neutral/Bullish/Bearish\n\n## Scenarios\n1. If price holds ... then ...\n2. If price breaks ... then ...\n`;
    const newVal = routineNote + template;
    handleRoutineNoteChange(newVal);
  };

  const handleAddTag = () => {
    const tag = " #setup ";
    handleRoutineNoteChange(routineNote + tag);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg = chatInput;
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await getCoachResponse(userMsg, `User has ${trades.length} trades logged.`);
      setChatHistory(prev => [...prev, { role: 'ai', text: response }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'ai', text: "Sorry, I'm having trouble connecting right now." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (filteredAnalysisTrades.length === 0) {
      setAnalysis(`No trades found for the selected timeframe (${analysisTimeframe}). Please adjust the filter or log more trades.`);
      return;
    }
    setIsAnalyzing(true);
    // Send the filtered list to the service
    const result = await analyzePsychology(filteredAnalysisTrades);
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6">
      
      {/* Sidebar / Menu */}
      <div className="w-full lg:w-64 flex flex-col gap-2 shrink-0">
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
            ${activeTab === 'routine' ? 'bg-surface border-primary text-white shadow-md' : 'bg-surface border-transparent text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}
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
            ${activeTab === 'coach' ? 'bg-surface border-primary text-white shadow-md' : 'bg-surface border-transparent text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}
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
            ${activeTab === 'analysis' ? 'bg-surface border-primary text-white shadow-md' : 'bg-surface border-transparent text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}
        >
          <MessageCircle size={20} />
          <div>
            <p className="font-semibold">Psycho-Analysis</p>
            <p className="text-xs opacity-70">Review your patterns</p>
          </div>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-surface rounded-xl border border-surfaceHighlight overflow-hidden flex flex-col shadow-sm">
        
        {/* ROUTINE TAB */}
        {activeTab === 'routine' && (
          <div className="flex-1 p-6 lg:p-8 overflow-y-auto animate-in fade-in slide-in-from-right-4">
            {/* Date Selection */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-text">Pre-Trading Checklist</h2>
              <div className="flex items-center gap-2 bg-background border border-surfaceHighlight rounded-lg px-3 py-1.5">
                <Calendar size={16} className="text-textMuted" />
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-sm text-text outline-none focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
              {/* Left Column: Checklist */}
              <div>
                <div className="space-y-4 mb-8">
                  {CHECKLIST_ITEMS.map((item, idx) => (
                    <label key={idx} className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${checklist[idx] ? 'bg-primary/10 border-primary/30' : 'bg-background border-surfaceHighlight hover:border-gray-600'}`}>
                      <input 
                        type="checkbox" 
                        checked={checklist[idx]}
                        onChange={() => handleChecklistToggle(idx)}
                        className="w-5 h-5 rounded border-gray-600 text-primary focus:ring-offset-0 bg-surface accent-primary" 
                      />
                      <span className={`text-text ${checklist[idx] ? 'line-through text-textMuted' : ''}`}>{item}</span>
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

              {/* Right Column: Analysis Editor */}
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
                          <Plus size={12}/> Add template
                        </button>
                        <button 
                          onClick={handleAddTag}
                          className="text-xs text-textMuted hover:text-text flex items-center gap-1"
                        >
                          <Plus size={12}/> Add tag
                        </button>
                    </div>
                 </div>
                 <p className="text-xs text-textMuted mb-4">Write down your market thesis for {selectedDate}.</p>
                 
                 <RichTextEditor 
                   value={routineNote}
                   onChange={handleRoutineNoteChange}
                   placeholder="E.g. SPY is gapping up into resistance at 450..."
                   minHeight="350px"
                 />

                 {/* --- SAVE BUTTON ADDED HERE --- */}
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

        {/* AI COACH TAB */}
        {activeTab === 'coach' && (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-surfaceHighlight bg-surfaceHighlight/30 flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full text-primary">
                <Brain size={20} />
              </div>
              <div>
                <h3 className="font-bold text-text">Dr. Gemini</h3>
                <p className="text-xs text-textMuted">Trading Psychologist</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    msg.role === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-surfaceHighlight text-text rounded-tl-none'
                  }`}>
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
                  placeholder="I just lost 3 trades in a row... / I feel anxious..."
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

        {/* ANALYSIS TAB */}
        {activeTab === 'analysis' && (
          <div className="p-8 overflow-y-auto animate-in fade-in slide-in-from-right-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
               <div>
                 <h2 className="text-2xl font-bold text-text">Pattern Recognition</h2>
                 <p className="text-textMuted mt-1">AI Analysis of your recent trades & notes.</p>
               </div>
               
               <div className="flex flex-col items-end gap-3">
                 {/* Timeframe Selector */}
                 <div className="flex bg-surfaceHighlight p-1 rounded-lg">
                   {(['MONTH', 'QUARTER', 'YEAR', 'ALL'] as const).map((period) => (
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
                    <span className="text-xs text-textMuted">{filteredAnalysisTrades.length} trades selected</span>
                    <button 
                      onClick={runAnalysis}
                      disabled={isAnalyzing}
                      className="px-6 py-2 bg-accent hover:bg-purple-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-50"
                    >
                      {isAnalyzing ? <Activity className="animate-spin" size={18}/> : <Brain size={18} />}
                      {isAnalyzing ? 'Analyzing...' : 'Analyze Psychology'}
                    </button>
                 </div>
               </div>
            </div>

            {analysis ? (
              <div className="bg-background rounded-xl p-6 border border-surfaceHighlight animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-center mb-4 border-b border-surfaceHighlight pb-2">
                   <span className="text-sm font-bold text-accent">Analysis Result</span>
                   <button onClick={() => setAnalysis(null)} className="text-xs text-textMuted hover:text-text underline">Clear</button>
                </div>
                <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                  {analysis}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-textMuted border-2 border-dashed border-surfaceHighlight rounded-xl bg-background/50">
                <Brain size={48} className="mb-4 opacity-20" />
                <p>Select a timeframe and click the button to scan your journal for emotional leaks.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default Mindfulness;