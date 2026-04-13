import React, { useState, useMemo, useEffect } from 'react';
import { LayoutDashboard, BookOpen, BrainCircuit, Settings as SettingsIcon, ChevronDown, Plus, CreditCard, Sun, Moon, Notebook as NotebookIcon, BarChart2, Calendar, Trash2, ShieldCheck, Sparkles } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Journal from './components/Journal';
import Notebook from './components/Notebook';
import DailyJournal from './components/DailyJournal';
import Mindfulness from './components/Mindfulness';
import Analytics from './components/Analytics';
import Settings from './components/Settings';
import RuleTracker from './components/RuleTracker';
import AIRecaps from './components/AIRecaps';
import PnLCalendar from './components/PnLCalendar';
import ToastContainer, { ToastMessage, ToastType } from './components/Toast';
import { Trade, Account, DailyAnalysis, DailyReview, Playbook, DEFAULT_PLAYBOOKS, CheckInSettings, Note, Rule, RuleCheck, RuleSettings, AIRecap, RecapPeriodType } from './types';

// ─── API CONFIGURATION ────────────────────────────────────────
// Vite proxies /api → http://localhost:3001 (see vite.config.ts)
// So you never need to change this URL when deploying.
const API_URL = '/api';

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'daily_journal' | 'notebook' | 'journal' | 'mindfulness' | 'analytics' | 'rules' | 'recaps' | 'calendar' | 'settings'>('dashboard');
  
  // Navigation State
  const [journalDate, setJournalDate] = useState<string | undefined>(undefined);
  const [focusedTradeId, setFocusedTradeId] = useState<string | null>(null);
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // --- DATA STATE ---
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('default');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>(DEFAULT_PLAYBOOKS);
  const [isLoading, setIsLoading] = useState(true);
  
  // UI State
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Rule Tracker
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleChecks, setRuleChecks] = useState<RuleCheck[]>([]);
  const [ruleSettings, setRuleSettings] = useState<RuleSettings>({ trading_days: ['Mon','Tue','Wed','Thu','Fri'] });

  // AI Recaps
  const [aiRecaps, setAiRecaps] = useState<AIRecap[]>([]);

  // Settings & Analysis
  const [dailyAnalysis, setDailyAnalysis] = useState<DailyAnalysis>({});
  const [dailyReviews, setDailyReviews] = useState<DailyReview>({});
  const [userSettings, setUserSettings] = useState<CheckInSettings>({
    requirePreTrade: true,
    checkInAfterLoss: true,
    checkInStreak: 2,
    dailyReflectionTime: '17:00',
    marketReviewEnabled: false,
    marketReviewTimes: ['16:00']
  });

  const [journalFilters, setJournalFilters] = useState<{
    symbol?: string;
    setup?: string;
    playbookId?: string;
    emotion?: string;
    mistake?: string;
  } | undefined>(undefined);

  // --- FETCH DATA FROM LOCAL DB ---
  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Load Accounts
        const accRes = await fetch(`${API_URL}/accounts`);
        if (accRes.ok) {
            const accData = await accRes.json();
            if (accData.length > 0) {
                setAccounts(accData);
                if (!accData.find((a: Account) => a.id === activeAccountId)) {
                    setActiveAccountId(accData[0].id);
                }
            }
        }

        // 2. Load Trades
        const tradeRes = await fetch(`${API_URL}/trades`);
        if (tradeRes.ok) {
            const tradeData = await tradeRes.json();
            setTrades(tradeData);
        }

        // 3. Load Notes
        const noteRes = await fetch(`${API_URL}/notes`);
        if (noteRes.ok) {
            const noteData = await noteRes.json();
            setNotes(noteData);
        }

        // 4. Load Playbooks
        const pbRes = await fetch(`${API_URL}/playbooks`);
        if (pbRes.ok) {
            const pbData = await pbRes.json();
            if (pbData.length > 0) setPlaybooks(pbData);
        }

        // 5. Load Daily Analysis (Pre-Market)
        const analysisRes = await fetch(`${API_URL}/daily_analysis`);
        if (analysisRes.ok) {
            const analysisData = await analysisRes.json();
            const analysisMap = analysisData.reduce((acc: any, item: any) => ({ ...acc, [item.id]: item.content }), {});
            setDailyAnalysis(analysisMap);
        }

        // 6. Load Daily Reviews (End of Day)
        const reviewsRes = await fetch(`${API_URL}/daily_reviews`);
        if (reviewsRes.ok) {
            const reviewsData = await reviewsRes.json();
            const reviewsMap = reviewsData.reduce((acc: any, item: any) => ({ ...acc, [item.id]: item.content }), {});
            setDailyReviews(reviewsMap);
        }

        // 7. Load Rules
        const rulesRes = await fetch(`${API_URL}/rules`);
        if (rulesRes.ok) setRules(await rulesRes.json());

        // 8. Load Rule Checks
        const checksRes = await fetch(`${API_URL}/rule_checks`);
        if (checksRes.ok) setRuleChecks(await checksRes.json());

        // 9. Load Rule Settings
        const ruleSettingsRes = await fetch(`${API_URL}/rule_settings`);
        if (ruleSettingsRes.ok) setRuleSettings(await ruleSettingsRes.json());

        // 10. Load AI Recaps
        const recapsRes = await fetch(`${API_URL}/ai_recaps`);
        if (recapsRes.ok) setAiRecaps(await recapsRes.json());

      } catch (error) {
        console.error("Could not load data.", error);
        addToast("Error: Is the API server running? Run: node server.cjs", "error");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // --- HANDLERS ---

  const handleAddTrade = async (newTrade: Trade) => {
    const tradeWithAccount = { ...newTrade, accountId: activeAccountId };
    try {
      const res = await fetch(`${API_URL}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeWithAccount)
      });
      const savedTrade = await res.json();
      setTrades(prev => [savedTrade, ...prev]);
      addToast(`Trade saved.`);
    } catch (err) { addToast('Failed to save trade.', 'error'); }
  };

  const handleUpdateTrade = async (updatedTrade: Trade) => {
    const originalTrade = trades.find(t => t.id === updatedTrade.id);
    const finalTrade = { 
        ...updatedTrade, 
        accountId: originalTrade?.accountId || activeAccountId 
    };

    try {
      await fetch(`${API_URL}/trades/${updatedTrade.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalTrade)
      });
      
      setTrades(prev => prev.map(t => t.id === updatedTrade.id ? finalTrade : t));
      addToast('Trade updated.');
    } catch (err) { 
      addToast('Failed to update trade.', 'error'); 
    }
  };

  const handleDeleteTrade = async (tradeId: string) => {
    if (!window.confirm('Delete this trade?')) return;
    try {
      await fetch(`${API_URL}/trades/${tradeId}`, { method: 'DELETE' });
      setTrades(prev => prev.filter(t => t.id !== tradeId));
      addToast('Trade deleted.', 'info');
    } catch (err) { addToast('Failed to delete trade.', 'error'); }
  };

  // --- ANALYSIS & REVIEW HANDLERS ---

  const handleSaveDailyAnalysis = async (date: string, text: string) => {
    try {
      const entry = { id: date, content: text };
      const exists = dailyAnalysis[date]; 
      const method = exists ? 'PUT' : 'POST';
      const url = exists ? `${API_URL}/daily_analysis/${date}` : `${API_URL}/daily_analysis`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      
      if (res.ok) {
        setDailyAnalysis(prev => ({ ...prev, [date]: text }));
        addToast("Pre-market analysis saved.");
      }
    } catch (err) { 
      console.error(err);
      addToast("Failed to save analysis.", "error"); 
    }
  };

  const handleSaveDailyReview = async (date: string, text: string) => {
    try {
      const entry = { id: date, content: text };
      const exists = dailyReviews[date];
      const method = exists ? 'PUT' : 'POST';
      const url = exists ? `${API_URL}/daily_reviews/${date}` : `${API_URL}/daily_reviews`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });

      if (res.ok) {
        setDailyReviews(prev => ({ ...prev, [date]: text }));
        addToast("Daily review saved.");
      }
    } catch (err) { 
      console.error(err);
      addToast("Failed to save review.", "error"); 
    }
  };

  // --- PLAYBOOK HANDLER ---
  const handleUpdatePlaybooks = async (newPlaybooks: Playbook[]) => {
      setPlaybooks(newPlaybooks);
      try {
          const added = newPlaybooks.filter(np => !playbooks.find(op => op.id === np.id));
          for (const p of added) {
              await fetch(`${API_URL}/playbooks`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(p)
              });
          }

          const deleted = playbooks.filter(op => !newPlaybooks.find(np => np.id === op.id));
          for (const p of deleted) {
              await fetch(`${API_URL}/playbooks/${p.id}`, { method: 'DELETE' });
          }

          const edited = newPlaybooks.filter(np => {
              const old = playbooks.find(op => op.id === np.id);
              return old && (old.name !== np.name || old.description !== np.description);
          });
          for (const p of edited) {
              await fetch(`${API_URL}/playbooks/${p.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(p)
              });
          }
          addToast("Playbooks synced to DB.");
      } catch (err) {
          addToast("Error saving playbooks.", "error");
      }
  };

  // --- IMPORT TRADES ---
  const handleImportTrades = async (importedTrades: Trade[]) => {
    if (importedTrades.length === 0) return;
    
    addToast(`Starting import of ${importedTrades.length} trades...`, 'info');
    let count = 0;

    for (const trade of importedTrades) {
      try {
        const tradeToSave = { 
            ...trade, 
            id: Date.now().toString() + Math.random().toString().slice(2, 5), 
            accountId: activeAccountId 
        };

        await fetch(`${API_URL}/trades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeToSave)
        });
        count++;
      } catch (err) {
        console.error("Failed to import specific trade:", trade);
      }
    }

    const res = await fetch(`${API_URL}/trades`);
    const data = await res.json();
    setTrades(data);
    addToast(`Successfully imported ${count} trades!`);
  };

  // --- ACCOUNT HANDLERS ---
  const handleSaveNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim()) return;
    const newAccount = { id: Date.now().toString(), name: newAccountName.trim() };
    try {
        const res = await fetch(`${API_URL}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newAccount)
        });
        const savedAccount = await res.json();
        setAccounts(prev => [...prev, savedAccount]);
        setActiveAccountId(savedAccount.id);
        setNewAccountName('');
        setIsAddingAccount(false);
        setIsAccountMenuOpen(false);
        addToast(`Account created.`);
    } catch (err) { addToast('Failed to create account.', 'error'); }
  };

  const handleDeleteAccount = async (accountId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (accounts.length <= 1) return alert("You cannot delete the only account.");
    if (!window.confirm("Are you sure? This will hide trades associated with this account.")) return;

    try {
        await fetch(`${API_URL}/accounts/${accountId}`, { method: 'DELETE' });
        setAccounts(prev => prev.filter(a => a.id !== accountId));
        if (activeAccountId === accountId) {
             const nextAccount = accounts.find(a => a.id !== accountId);
             if (nextAccount) setActiveAccountId(nextAccount.id);
        }
        addToast("Account deleted", 'info');
    } catch (err) { addToast("Failed to delete account", 'error'); }
  };

  // --- NOTE HANDLERS ---
  const handleSaveNote = async (note: Note) => {
    const exists = notes.find(n => n.id === note.id);
    const method = exists ? 'PUT' : 'POST';
    const url = exists ? `${API_URL}/notes/${note.id}` : `${API_URL}/notes`;
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(note)
        });
        const savedNote = await res.json();
        setNotes(prev => {
            if (exists) return prev.map(n => n.id === note.id ? savedNote : n);
            return [savedNote, ...prev];
        });
    } catch (err) { addToast('Failed to save note.', 'error'); }
  };

  const handleDeleteNote = async (id: string) => {
      try {
          await fetch(`${API_URL}/notes/${id}`, { method: 'DELETE' });
          setNotes(prev => prev.filter(n => n.id !== id));
          addToast("Note deleted", 'info');
      } catch(err) { addToast('Error deleting note', 'error'); }
  };

  // --- RULE HANDLERS ---
  const handleAddRule = async (rule: Rule) => {
    try {
      await fetch(`${API_URL}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      setRules(prev => [...prev, rule]);
      addToast('Rule added.');
    } catch { addToast('Failed to add rule.', 'error'); }
  };

  const handleUpdateRule = async (rule: Rule) => {
    try {
      await fetch(`${API_URL}/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      setRules(prev => prev.map(r => r.id === rule.id ? rule : r));
    } catch { addToast('Failed to update rule.', 'error'); }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Delete this rule and all its history?')) return;
    try {
      await fetch(`${API_URL}/rules/${id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== id));
      setRuleChecks(prev => prev.filter(c => c.rule_id !== id));
      addToast('Rule deleted.', 'info');
    } catch { addToast('Failed to delete rule.', 'error'); }
  };

  const handleUpdateSettings = async (newSettings: RuleSettings) => {
    try {
      await fetch(`${API_URL}/rule_settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      setRuleSettings(newSettings);
      addToast('Settings saved.');
    } catch { addToast('Failed to save settings.', 'error'); }
  };

  const handleResetProgress = async () => {
    if (!window.confirm('Reset all rule check history? This cannot be undone.')) return;
    try {
      await fetch(`${API_URL}/rule_checks`, { method: 'DELETE' });
      setRuleChecks([]);
      addToast('Progress reset.', 'info');
    } catch { addToast('Failed to reset progress.', 'error'); }
  };

  const handleGenerateRecap = async (periodType: RecapPeriodType, start: string, end: string) => {
    try {
      const res = await fetch(`${API_URL}/ai_recaps/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_type: periodType, period_start: start, period_end: end }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }
      const saved: AIRecap = await res.json();
      setAiRecaps(prev => {
        const filtered = prev.filter(r => r.id !== saved.id);
        return [saved, ...filtered];
      });
      addToast('Recap generated!');
    } catch (err: any) {
      addToast(err.message || 'Failed to generate recap.', 'error');
    }
  };

  const handleDeleteRecap = async (id: string) => {
    try {
      await fetch(`${API_URL}/ai_recaps/${id}`, { method: 'DELETE' });
      setAiRecaps(prev => prev.filter(r => r.id !== id));
      addToast('Recap deleted.', 'info');
    } catch { addToast('Failed to delete recap.', 'error'); }
  };

  const handleToggleCheck = async (check: RuleCheck) => {
    try {
      await fetch(`${API_URL}/rule_checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(check),
      });
      setRuleChecks(prev => {
        const exists = prev.find(c => c.date === check.date && c.rule_id === check.rule_id);
        if (exists) return prev.map(c => (c.date === check.date && c.rule_id === check.rule_id) ? check : c);
        return [...prev, check];
      });
    } catch { addToast('Failed to save check.', 'error'); }
  };

  // --- NAVIGATION HANDLERS ---
  const handleFilterTrades = (type: 'symbol' | 'setup' | 'playbook' | 'emotion' | 'mistake', value: string) => {
      const filters: any = {};
      if (type === 'symbol') filters.symbol = value;
      if (type === 'setup') filters.setup = value;
      if (type === 'playbook') filters.playbookId = value;
      if (type === 'emotion') filters.emotion = value;
      if (type === 'mistake') filters.mistake = value;
      
      setJournalFilters(filters);
      setView('journal');
  };

  // --- BOILERPLATE ---
  const addToast = (message: string, type: ToastType = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));
  const activeTrades = useMemo(() => trades.filter(t => t.accountId === activeAccountId), [trades, activeAccountId]);
  const activeAccountName = accounts.find(a => a.id === activeAccountId)?.name || 'Loading...';

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  // --- LOADING SCREEN ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-textMuted text-sm">Connecting to local database...</p>
          <p className="text-textMuted text-xs mt-2 opacity-60">Make sure <code>node server.cjs</code> is running</p>
        </div>
      </div>
    );
  }

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-background flex transition-colors duration-300 relative">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-surface border-r border-surfaceHighlight flex flex-col transition-transform duration-300 ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:static'}`}>
        <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-lg">M</div>
            <span className="font-bold text-xl text-text">Mindful</span>
        </div>

        {/* Account Switcher */}
        <div className="px-4 mb-6 relative">
          <button onClick={() => { setIsAccountMenuOpen(!isAccountMenuOpen); setIsAddingAccount(false); }} className="w-full bg-surfaceHighlight/50 hover:bg-surfaceHighlight border border-surfaceHighlight rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <CreditCard size={16} className="text-textMuted shrink-0" />
              <span className="text-sm font-medium text-text truncate">{activeAccountName}</span>
            </div>
            <ChevronDown size={14} className="text-textMuted shrink-0" />
          </button>
          
          {isAccountMenuOpen && (
            <div className="absolute top-full left-4 right-4 mt-2 bg-surface border border-surfaceHighlight rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="max-h-[200px] overflow-y-auto">
                {accounts.map(acc => (
                  <div key={acc.id} className="flex items-center group pr-2 hover:bg-surfaceHighlight transition-colors">
                    <button onClick={() => { setActiveAccountId(acc.id); setIsAccountMenuOpen(false); }} className={`flex-1 text-left px-4 py-2 text-sm ${activeAccountId === acc.id ? 'text-primary font-medium' : 'text-text'}`}>
                      {acc.name}
                    </button>
                    <button onClick={(e) => handleDeleteAccount(acc.id, e)} className="p-1.5 text-textMuted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity rounded">
                        <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="h-px bg-surfaceHighlight my-1"></div>
              {isAddingAccount ? (
                <form onSubmit={handleSaveNewAccount} className="p-2 bg-surfaceHighlight/30">
                   <input autoFocus type="text" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} placeholder="Name" className="w-full bg-background border border-surfaceHighlight rounded px-2 py-1.5 text-xs text-text mb-2" />
                   <button type="submit" className="w-full bg-primary text-white text-xs py-1.5 rounded">Save</button>
                </form>
              ) : (
                <button onClick={() => setIsAddingAccount(true)} className="w-full text-left px-4 py-2 text-xs text-textMuted hover:text-text hover:bg-surfaceHighlight flex items-center gap-2">
                  <Plus size={12} /> Add Account
                </button>
              )}
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 space-y-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'journal', icon: BookOpen, label: 'Trades' },
            { id: 'daily_journal', icon: Calendar, label: 'Daily Journal' },
            { id: 'notebook', icon: NotebookIcon, label: 'Notebook' },
            { id: 'analytics', icon: BarChart2, label: 'Analytics' },
            { id: 'calendar', icon: Calendar, label: 'P&L Calendar' },
            { id: 'rules', icon: ShieldCheck, label: 'Rule Tracker' },
            { id: 'recaps', icon: Sparkles, label: 'AI Recaps' },
            { id: 'mindfulness', icon: BrainCircuit, label: 'Mindfulness' },
            { id: 'settings', icon: SettingsIcon, label: 'Settings' },
          ].map(item => (
             <button key={item.id} onClick={() => { setView(item.id as any); setIsMobileSidebarOpen(false); if(item.id === 'journal') setJournalFilters(undefined); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${view === item.id ? 'bg-primary/10 text-primary' : 'text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}>
                <item.icon size={22} />
                <span className="font-medium">{item.label}</span>
             </button>
          ))}
        </nav>

        {/* User Profile & Theme Toggle */}
        <div className="p-6 border-t border-surfaceHighlight mt-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surfaceHighlight border border-surfaceHighlight flex items-center justify-center text-xs text-textMuted">JD</div>
              <div>
                <p className="text-sm text-text font-medium">John Doe</p>
                <p className="text-xs text-textMuted">Pro Plan</p>
              </div>
            </div>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className="p-2 rounded-full text-textMuted hover:bg-surfaceHighlight hover:text-primary transition-all"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main View */}
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto h-screen">
         <header className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-text capitalize">{view.replace('_', ' ')}</h1>
         </header>

         {view === 'dashboard' && <Dashboard trades={activeTrades} playbooks={playbooks} onNavigateToJournal={(d) => { setJournalDate(d); setView('daily_journal'); }} onFilterTrades={handleFilterTrades} />}
         
         {view === 'analytics' && <Analytics trades={activeTrades} onFilterTrades={handleFilterTrades} />}
         
         {view === 'daily_journal' && (
           <DailyJournal 
              trades={activeTrades} 
              dailyAnalysis={dailyAnalysis} 
              dailyReviews={dailyReviews} 
              onSaveReview={handleSaveDailyReview}
              initialDate={journalDate} 
              onNavigateToTrade={(id) => { setFocusedTradeId(id); setView('journal'); }} 
            />
         )}

         {view === 'notebook' && <Notebook trades={activeTrades} dailyAnalysis={dailyAnalysis} dailyReviews={dailyReviews} notes={notes} onSaveDailyReview={() => {}} onSaveNote={handleSaveNote} onDeleteNote={handleDeleteNote} initialDate={journalDate} onNavigateToTrade={() => {}} />}
         
         {view === 'journal' && <Journal trades={activeTrades} playbooks={playbooks} dailyAnalysis={dailyAnalysis} onAddTrade={handleAddTrade} onUpdateTrade={handleUpdateTrade} onDeleteTrade={handleDeleteTrade} onUpdatePlaybooks={handleUpdatePlaybooks} focusedTradeId={focusedTradeId} onClearFocus={() => setFocusedTradeId(null)} initialFilters={journalFilters} />}
         
         {view === 'calendar' && (
           <PnLCalendar
             trades={activeTrades}
             onNavigateToDay={(date) => { setJournalDate(date); setView('daily_journal'); }}
           />
         )}

         {view === 'rules' && (
           <RuleTracker
             rules={rules}
             ruleChecks={ruleChecks}
             ruleSettings={ruleSettings}
             trades={activeTrades}
             onAddRule={handleAddRule}
             onUpdateRule={handleUpdateRule}
             onDeleteRule={handleDeleteRule}
             onToggleCheck={handleToggleCheck}
             onUpdateSettings={handleUpdateSettings}
             onResetProgress={handleResetProgress}
           />
         )}

         {view === 'recaps' && (
           <AIRecaps
             recaps={aiRecaps}
             trades={activeTrades}
             onGenerate={handleGenerateRecap}
             onDelete={handleDeleteRecap}
           />
         )}

         {view === 'mindfulness' && (
           <Mindfulness
             trades={activeTrades}
             dailyAnalysis={dailyAnalysis}
             onSaveAnalysis={handleSaveDailyAnalysis}
            />
          )}
         
         {view === 'settings' && <Settings trades={activeTrades} playbooks={playbooks} onUpdatePlaybooks={handleUpdatePlaybooks} onImportTrades={handleImportTrades} initialSettings={userSettings} onUpdateSettings={setUserSettings} />}
      </main>
    </div>
  );
};

export default App;