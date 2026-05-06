/**
 * ollamaService.ts
 * ─────────────────────────────────────────────────────────────
 * Client for the local AI routes added to server.cjs.
 * Replaces geminiService.ts — drop-in compatible function names.
 *
 * All AI calls go through the Express backend (/api/ai/*)
 * which proxies to Ollama and builds context from SQLite directly.
 * No API keys. No rate limits. Fully local.
 *
 * Model: gemma4:26b (MoE — fast inference, 48GB RAM recommended)
 * ─────────────────────────────────────────────────────────────
 */

const AI_BASE = '/api/ai';

// ── Types ────────────────────────────────────────────────────────

export interface OllamaStatus {
  online:     boolean;
  models:     string[];
  hasGemma4:  boolean;
  recommended: string;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

// ── analyzePsychology ────────────────────────────────────────────
// Deep cross-referenced psychology analysis.
// The backend fetches all 4 data sources from SQLite and builds
// a date-aligned context: pre-market plan + trades + post-market
// review for each session, cross-referenced against notebook rules.
//
// @param timeframeDays  How many days back to analyze (default 90)
//
export const analyzePsychology = async (timeframeDays: number = 90): Promise<string> => {
  try {
    const res = await fetch(`${AI_BASE}/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ timeframe: timeframeDays }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.hint || err.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.hint || data.error);
    return data.analysis || 'No analysis returned.';
  } catch (error: any) {
    console.error('[ollamaService] analyzePsychology error:', error);
    return [
      '⚠️ Analysis unavailable.',
      '',
      error.message || 'Unknown error.',
      '',
      'To enable local AI:',
      '  1. Install Ollama → https://ollama.com',
      '  2. Run: ollama pull gemma4:e4b',
      '  3. Run: ollama serve',
    ].join('\n');
  }
};

// ── getCoachResponse ─────────────────────────────────────────────
// Real-time coaching chat. The backend loads the last 30 days of
// journal data from SQLite and injects it as context so the coach
// can reference your actual trades, emotions, and patterns.
//
// @param userMessage  The trader's message
// @param history      Full chat history for multi-turn context
//
export const getCoachResponse = async (
  userMessage: string,
  history: ChatMessage[] = []
): Promise<string> => {
  try {
    const res = await fetch(`${AI_BASE}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: userMessage, history }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.hint || err.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    console.log('[ollamaService] /ai/chat raw response:', data);
    if (data.error) throw new Error(data.hint || data.error);
    return data.reply || 'No response.';
  } catch (error: any) {
    console.error('[ollamaService] getCoachResponse error:', error);
    return `Coach offline: ${error.message || 'Is Ollama running? (ollama serve)'}`;
  }
};

// ── generateDailyAffirmation ─────────────────────────────────────
// Generates a fresh stoic affirmation each session.
//
export const generateDailyAffirmation = async (): Promise<string> => {
  try {
    const res = await fetch(`${AI_BASE}/affirmation`);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    return data.affirmation || 'Control your process. The outcome follows.';
  } catch {
    return 'Control your process. The outcome follows.';
  }
};

// ── generatePsychProfile ────────────────────────────────────────
// Generates a deep psychological profile for a given period.
// The backend builds full context and uses a detailed psych prompt.
//
// @param periodType  'daily' | 'weekly' | 'monthly' | 'yearly'
// @param start       Start date YYYY-MM-DD
// @param end         End date YYYY-MM-DD
//
export const generatePsychProfile = async (
  periodType: string,
  start: string,
  end: string
): Promise<any> => {
  const res = await fetch('/psych_profiles/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ period_type: periodType, period_start: start, period_end: end }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }

  return await res.json();
};

// ── fetchPsychProfiles ──────────────────────────────────────────
export const fetchPsychProfiles = async (): Promise<any[]> => {
  const res = await fetch('/psych_profiles');
  if (!res.ok) return [];
  return await res.json();
};

// ── deletePsychProfile ──────────────────────────────────────────
export const deletePsychProfile = async (id: string): Promise<void> => {
  await fetch(`/psych_profiles/${id}`, { method: 'DELETE' });
};

// ── checkOllamaStatus ────────────────────────────────────────────
// Returns whether Ollama is running and which models are available.
// Use this to show a setup prompt if Ollama is not detected.
//
export const checkOllamaStatus = async (): Promise<OllamaStatus> => {
  try {
    const res = await fetch(`${AI_BASE}/status`);
    if (!res.ok) throw new Error('status check failed');
    return await res.json();
  } catch {
    return { online: false, models: [], hasGemma4: false, recommended: 'gemma4:e4b' };
  }
};
