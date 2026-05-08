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
import MindfulLogo from './components/MindfulLogo';
import TradingIntelligence from './components/TradingIntelligence';
import { Trade, Account, DailyAnalysis, DailyReview, Playbook, DEFAULT_PLAYBOOKS, CheckInSettings, Note, Rule, RuleCheck, RuleSettings, AIRecap, RecapPeriodType, PsychProfile, PsychProfilePeriod, DeepAnalysis, DeepAnalysisPeriod } from './types';

// ─── API CONFIGURATION ────────────────────────────────────────
// Vite proxies /api → http://localhost:3001 (see vite.config.ts)
// So you never need to change this URL when deploying.
const API_URL = '/api';

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'daily_journal' | 'notebook' | 'journal' | 'mindfulness' | 'analytics' | 'rules' | 'recaps' | 'calendar' | 'settings'>('dashboard');
  
  // Navigation State
  const [journalDate, setJournalDate] = useState<string | undefined>(undefined);
  const [focusedTradeId, setFocusedTradeId] = useState<string | null>(null);
  const [triggerAddTrade, setTriggerAddTrade] = useState(false);
  
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

  // Deep Analyses
  const [deepAnalyses, setDeepAnalyses] = useState<DeepAnalysis[]>([]);

  // Psych Profiles
  const [psychProfiles, setPsychProfiles] = useState<PsychProfile[]>([]);

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

        // 11. Load Deep Analyses
        const deepRes = await fetch(`${API_URL}/deep_analyses`);
        if (deepRes.ok) setDeepAnalyses(await deepRes.json());

        // 12. Load Psych Profiles
        const psychRes = await fetch(`${API_URL}/psych_profiles`);
        if (psychRes.ok) setPsychProfiles(await psychRes.json());

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

  // --- BATCH IMPORT (Tradovate) ---
  const handleBatchImport = async (importedTrades: Trade[]): Promise<{ imported: number; skipped: number }> => {
    const res = await fetch(`${API_URL}/trades/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trades: importedTrades.map(t => ({ ...t, accountId: activeAccountId })) })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Batch import failed');
    setTrades(result.trades);
    addToast(`Imported ${result.imported} trade${result.imported !== 1 ? 's' : ''} from Tradovate${result.skipped > 0 ? ` (${result.skipped} duplicates skipped)` : ''}`);
    return { imported: result.imported, skipped: result.skipped };
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

  const handleGenerateDeepAnalysis = async (periodType: DeepAnalysisPeriod, start: string, end: string) => {
    try {
      const res = await fetch(`${API_URL}/deep_analyses/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_type: periodType, period_start: start, period_end: end }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }
      const saved: DeepAnalysis = await res.json();
      setDeepAnalyses(prev => {
        const filtered = prev.filter(a => a.id !== saved.id);
        return [saved, ...filtered];
      });
      addToast('Deep analysis generated!');
    } catch (err: any) {
      addToast(err.message || 'Failed to generate analysis.', 'error');
    }
  };

  const handleDeleteDeepAnalysis = async (id: string) => {
    try {
      await fetch(`${API_URL}/deep_analyses/${id}`, { method: 'DELETE' });
      setDeepAnalyses(prev => prev.filter(a => a.id !== id));
      addToast('Analysis deleted.', 'info');
    } catch { addToast('Failed to delete analysis.', 'error'); }
  };

  const handleGeneratePsychProfile = async (periodType: PsychProfilePeriod, start: string, end: string) => {
    try {
      const res = await fetch(`${API_URL}/psych_profiles/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_type: periodType, period_start: start, period_end: end }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }
      const saved: PsychProfile = await res.json();
      setPsychProfiles(prev => {
        const filtered = prev.filter(p => p.id !== saved.id);
        return [saved, ...filtered];
      });
      addToast('Psychological profile generated!');
    } catch (err: any) {
      addToast(err.message || 'Failed to generate profile.', 'error');
    }
  };

  const handleDeletePsychProfile = async (id: string) => {
    try {
      await fetch(`${API_URL}/psych_profiles/${id}`, { method: 'DELETE' });
      setPsychProfiles(prev => prev.filter(p => p.id !== id));
      addToast('Profile deleted.', 'info');
    } catch { addToast('Failed to delete profile.', 'error'); }
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

  useEffect(() => {
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 58"><defs><linearGradient id="fg" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#1d4ed8"/><stop offset="100%" stop-color="#60a5fa"/></linearGradient></defs><rect x="0" y="2" width="10" height="56" rx="2" fill="url(#fg)"/><polygon points="10,2 18,2 20,44 12,44" fill="url(#fg)"/><polygon points="42,2 50,2 48,44 40,44" fill="url(#fg)"/><rect x="50" y="2" width="10" height="56" rx="2" fill="url(#fg)"/><rect x="20" y="44" width="5.5" height="14" rx="1.5" fill="url(#fg)"/><rect x="27" y="34" width="5.5" height="24" rx="1.5" fill="url(#fg)"/><rect x="34" y="24" width="5.5" height="34" rx="1.5" fill="url(#fg)"/></svg>`;
    const dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.type = 'image/svg+xml';
    link.href = dataUri;
  }, []);

  useEffect(() => {
    const label = view === 'rules' ? 'Progress Tracker' : view.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    document.title = `${label} — Mindful`;
  }, [view]);

  // --- LOADING SCREEN ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center animate-fadeIn">
        <MindfulLogo size={64} />
        <h1 className="text-2xl font-bold text-text tracking-[0.25em] mt-5">MINDFUL</h1>
        <p className="text-[0.65rem] tracking-[0.2em] text-textMuted mt-1.5">TRACK. ANALYZE. MASTER.</p>
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mt-10" />
        <p className="text-textMuted text-xs mt-4 opacity-60">Connecting to local database...</p>
      </div>
    );
  }

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-background flex transition-colors duration-300 relative">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-sidebarBg border-r border-surfaceHighlight flex flex-col transition-transform duration-300 ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:static'}`}>
        <div className="p-6 flex items-center gap-3 group cursor-default">
            <div className="transition-transform duration-200 group-hover:scale-110">
              <MindfulLogo size={32} />
            </div>
            <span className="font-bold text-xl text-text tracking-[0.15em]">MINDFUL</span>
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

        {/* Add Trade Button */}
        <div className="px-3 mb-4">
          <button onClick={() => { setView('journal'); setTriggerAddTrade(true); setIsMobileSidebarOpen(false); }} className="w-full bg-primary hover:bg-primary/90 text-white rounded-lg py-2.5 px-4 flex items-center justify-center gap-2 font-medium text-sm transition-colors shadow-sm">
            <Plus size={18} /> Add Trade
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 space-y-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'journal', icon: BookOpen, label: 'Trades' },
            { id: 'daily_journal', icon: Calendar, label: 'Daily Journal' },
            { id: 'notebook', icon: NotebookIcon, label: 'Notebook' },
            { id: 'analytics', icon: BarChart2, label: 'Analytics' },
            { id: 'mindfulness', icon: BrainCircuit, label: 'Mindfulness' },
            { id: 'settings', icon: SettingsIcon, label: 'Settings' },
          ].map(item => (
             <button key={item.id} onClick={() => { setView(item.id as any); setIsMobileSidebarOpen(false); if(item.id === 'journal') setJournalFilters(undefined); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${view === item.id ? 'bg-primary/10 text-primary' : 'text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}>
                <item.icon size={22} />
                <span className="font-medium">{item.label}</span>
             </button>
          ))}
        </nav>

        {/* Theme Toggle */}
        <div className="p-4 border-t border-surfaceHighlight mt-auto flex items-center justify-center">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2.5 rounded-full text-textMuted hover:bg-surfaceHighlight hover:text-primary transition-all"
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </aside>

      {/* Main View */}
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto h-screen relative">
         <div className="fixed bottom-6 right-6 pointer-events-none opacity-[0.04] z-0">
           <MindfulLogo size={100} />
         </div>
         <header className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold text-text capitalize">{view === 'rules' ? 'Progress Tracker' : view.replace('_', ' ')}</h1>
         </header>

         {view === 'dashboard' && <Dashboard trades={activeTrades} playbooks={playbooks} ruleChecks={ruleChecks} rules={rules} ruleSettings={ruleSettings} onNavigateToJournal={(d) => { setJournalDate(d); setView('daily_journal'); }} onNavigateToRules={() => setView('analytics')} onFilterTrades={handleFilterTrades} />}
         
         {view === 'analytics' && (
           <Analytics
             trades={activeTrades}
             onFilterTrades={handleFilterTrades}
             onNavigateToDay={(date) => { setJournalDate(date); setView('daily_journal'); }}
             rules={rules}
             ruleChecks={ruleChecks}
             ruleSettings={ruleSettings}
             onAddRule={handleAddRule}
             onUpdateRule={handleUpdateRule}
             onDeleteRule={handleDeleteRule}
             onToggleCheck={handleToggleCheck}
             onUpdateSettings={handleUpdateSettings}
             onResetProgress={handleResetProgress}
             aiRecaps={aiRecaps}
             onGenerateRecap={handleGenerateRecap}
             onDeleteRecap={handleDeleteRecap}
             deepAnalyses={deepAnalyses}
             onGenerateDeepAnalysis={handleGenerateDeepAnalysis}
             onDeleteDeepAnalysis={handleDeleteDeepAnalysis}
             psychProfiles={psychProfiles}
             onGeneratePsychProfile={handleGeneratePsychProfile}
             onDeletePsychProfile={handleDeletePsychProfile}
           />
         )}
         
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

         {view === 'notebook' && <Notebook trades={activeTrades} dailyAnalysis={dailyAnalysis} dailyReviews={dailyReviews} notes={notes} onSaveDailyReview={handleSaveDailyReview} onSaveNote={handleSaveNote} onDeleteNote={handleDeleteNote} initialDate={journalDate} onNavigateToTrade={(id) => { setFocusedTradeId(id); setView('journal'); }} />}
         
         {view === 'journal' && <Journal trades={activeTrades} playbooks={playbooks} dailyAnalysis={dailyAnalysis} onAddTrade={handleAddTrade} onUpdateTrade={handleUpdateTrade} onDeleteTrade={handleDeleteTrade} onUpdatePlaybooks={handleUpdatePlaybooks} focusedTradeId={focusedTradeId} onClearFocus={() => setFocusedTradeId(null)} initialFilters={journalFilters} autoOpenAddTrade={triggerAddTrade} onAddTradeOpened={() => setTriggerAddTrade(false)} />}
         
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
         
         {view === 'settings' && <Settings trades={activeTrades} playbooks={playbooks} onUpdatePlaybooks={handleUpdatePlaybooks} onImportTrades={handleImportTrades} onBatchImport={handleBatchImport} initialSettings={userSettings} onUpdateSettings={setUserSettings} />}
      </main>
    </div>
  );
};

export default App;