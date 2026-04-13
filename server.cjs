/**
 * server.cjs
 * ─────────────────────────────────────────────────────────────
 * Local Express + SQLite API server for Mindful Trader.
 * Uses better-sqlite3 (synchronous, no config needed).
 *
 * Runs on port 3001.
 * Vite dev server runs separately on port 5173.
 *
 * Start with: node server.cjs
 * ─────────────────────────────────────────────────────────────
 */

const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const Database   = require('better-sqlite3');
const path       = require('path');

// ── CONFIG ──────────────────────────────────────────────────────
const PORT       = 3001;
const DB_PATH    = path.join(__dirname, 'trader.db');
const OLLAMA_URL = 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = 'gemma4:e4b';

// ── DATABASE SETUP ──────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── CREATE TABLES ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playbooks (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trades (
    id          TEXT PRIMARY KEY,
    accountId   TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    symbol      TEXT NOT NULL,
    instrument  TEXT,
    type        TEXT NOT NULL,
    entryPrice  REAL,
    exitPrice   REAL,
    stopLoss    REAL,
    quantity    INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'OPEN',
    pnl         REAL,
    fees        REAL DEFAULT 0,
    r           REAL,
    date        TEXT NOT NULL,
    entryTime   TEXT,
    exitTime    TEXT,
    setup       TEXT DEFAULT '',
    playbookId  TEXT REFERENCES playbooks(id) ON DELETE SET NULL,
    notes       TEXT DEFAULT '',
    emotionPre  TEXT DEFAULT '',
    emotionPost TEXT,
    mistakes    TEXT DEFAULT '[]',
    imageUrl    TEXT,
    imageUrls   TEXT DEFAULT '[]',
    audioUrl    TEXT,
    tags        TEXT DEFAULT '[]',
    exits       TEXT DEFAULT '[]',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_journal (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL UNIQUE,
    pre_market  TEXT,
    post_market TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id        TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    content   TEXT DEFAULT '',
    category  TEXT DEFAULT 'general',
    tags      TEXT DEFAULT '[]',
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rules (
    id              TEXT PRIMARY KEY,
    text            TEXT NOT NULL,
    active          INTEGER DEFAULT 0,
    rule_type       TEXT DEFAULT 'manual',
    condition_type  TEXT,
    condition_value TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rule_checks (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL,
    rule_id    TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
    followed   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(date, rule_id)
  );

  CREATE TABLE IF NOT EXISTS rule_settings (
    id            INTEGER PRIMARY KEY DEFAULT 1,
    trading_days  TEXT DEFAULT '["Mon","Tue","Wed","Thu","Fri"]'
  );

  CREATE TABLE IF NOT EXISTS ai_recaps (
    id           TEXT PRIMARY KEY,
    period_type  TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end   TEXT NOT NULL,
    content      TEXT NOT NULL,
    generated_at TEXT DEFAULT (datetime('now')),
    trade_count  INTEGER DEFAULT 0,
    net_pnl      REAL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_trades_date      ON trades (date DESC);
  CREATE INDEX IF NOT EXISTS idx_trades_accountId ON trades (accountId, date DESC);
  CREATE INDEX IF NOT EXISTS idx_trades_symbol    ON trades (symbol);
  CREATE INDEX IF NOT EXISTS idx_daily_journal    ON daily_journal (date DESC);
  CREATE INDEX IF NOT EXISTS idx_rule_checks_date ON rule_checks (date DESC);
`);

// ── MIGRATIONS: add new columns to rules if they don't exist ───
['rule_type TEXT DEFAULT \'manual\'', 'condition_type TEXT', 'condition_value TEXT'].forEach(col => {
  try { db.exec(`ALTER TABLE rules ADD COLUMN ${col}`); } catch {}
});

// Seed default account if empty
const accountCount = db.prepare('SELECT COUNT(*) as c FROM accounts').get();
if (accountCount.c === 0) {
  db.prepare("INSERT INTO accounts (id, name) VALUES ('default', 'Main Account')").run();
}

// Seed rule_settings singleton if empty
const settingsCount = db.prepare('SELECT COUNT(*) as c FROM rule_settings').get();
if (settingsCount.c === 0) {
  db.prepare("INSERT INTO rule_settings (id, trading_days) VALUES (1, '[\"Mon\",\"Tue\",\"Wed\",\"Thu\",\"Fri\"]')").run();
}

// Seed default system rules if none exist
const rulesCount = db.prepare("SELECT COUNT(*) as c FROM rules WHERE rule_type = 'system'").get();
if (rulesCount.c === 0) {
  const sysRules = [
    { id: 'sys_start_day',       text: 'Start my day by',              condition_type: 'time',    condition_value: '09:30' },
    { id: 'sys_playbook',        text: 'Link trades to playbook',       condition_type: 'boolean', condition_value: '100'   },
    { id: 'sys_stoploss',        text: 'Input Stop loss to all trades', condition_type: 'boolean', condition_value: '100'   },
    { id: 'sys_maxloss_trade',   text: 'Net max loss /trade',           condition_type: 'dollar',  condition_value: '100'   },
    { id: 'sys_maxloss_day',     text: 'Net max loss /day',             condition_type: 'dollar',  condition_value: '100'   },
  ];
  const ins = db.prepare("INSERT OR IGNORE INTO rules (id, text, active, rule_type, condition_type, condition_value) VALUES (?, ?, 0, 'system', ?, ?)");
  sysRules.forEach(r => ins.run(r.id, r.text, r.condition_type, r.condition_value));
}

// ── JSON HELPERS ────────────────────────────────────────────────
const parseJSON   = (val) => { try { return JSON.parse(val || '[]'); } catch { return []; } };
const stringifyJ  = (val) => Array.isArray(val) ? JSON.stringify(val) : (val ?? '[]');
const stripHtml   = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function rowToTrade(row) {
  if (!row) return null;
  return {
    ...row,
    mistakes:  parseJSON(row.mistakes),
    imageUrls: parseJSON(row.imageUrls),
    tags:      parseJSON(row.tags),
    exits:     parseJSON(row.exits),
  };
}

function tradeToRow(t) {
  return {
    id:         t.id,
    accountId:  t.accountId   ?? null,
    symbol:     t.symbol      ?? '',
    instrument: t.instrument  ?? null,
    type:       t.type        ?? 'LONG',
    entryPrice: t.entryPrice  ?? null,
    exitPrice:  t.exitPrice   ?? null,
    stopLoss:   t.stopLoss    ?? null,
    quantity:   t.quantity    ?? 0,
    status:     t.status      ?? 'OPEN',
    pnl:        t.pnl         ?? null,
    fees:       t.fees        ?? 0,
    r:          t.r           ?? null,
    date:       t.date        ?? '',
    entryTime:  t.entryTime   ?? null,
    exitTime:   t.exitTime    ?? null,
    setup:      t.setup       ?? '',
    playbookId: t.playbookId  ?? null,
    notes:      t.notes       ?? '',
    emotionPre: t.emotionPre  ?? '',
    emotionPost:t.emotionPost ?? null,
    imageUrl:   t.imageUrl    ?? null,
    audioUrl:   t.audioUrl    ?? null,
    mistakes:   stringifyJ(t.mistakes),
    imageUrls:  stringifyJ(t.imageUrls),
    tags:       stringifyJ(t.tags),
    exits:      stringifyJ(t.exits),
    updated_at: new Date().toISOString(),
  };
}

// ── EXPRESS APP ─────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// ── ACCOUNTS ────────────────────────────────────────────────────
app.get('/accounts', (req, res) => {
  res.json(db.prepare('SELECT * FROM accounts ORDER BY created_at').all());
});
app.post('/accounts', (req, res) => {
  const { id, name } = req.body;
  db.prepare('INSERT INTO accounts (id, name) VALUES (?, ?)').run(id, name);
  res.json({ id, name });
});
app.delete('/accounts/:id', (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── PLAYBOOKS ───────────────────────────────────────────────────
app.get('/playbooks', (req, res) => {
  res.json(db.prepare('SELECT * FROM playbooks ORDER BY created_at').all());
});
app.post('/playbooks', (req, res) => {
  const { id, name, description } = req.body;
  db.prepare('INSERT OR REPLACE INTO playbooks (id, name, description) VALUES (?, ?, ?)').run(id, name, description || '');
  res.json({ id, name, description });
});
app.put('/playbooks/:id', (req, res) => {
  const { name, description } = req.body;
  db.prepare('UPDATE playbooks SET name = ?, description = ? WHERE id = ?').run(name, description || '', req.params.id);
  res.json({ id: req.params.id, name, description });
});
app.delete('/playbooks/:id', (req, res) => {
  db.prepare('DELETE FROM playbooks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── TRADES ──────────────────────────────────────────────────────
app.get('/trades', (req, res) => {
  const rows = db.prepare('SELECT * FROM trades ORDER BY date DESC, created_at DESC').all();
  res.json(rows.map(rowToTrade));
});
app.post('/trades', (req, res) => {
  const t = tradeToRow(req.body);
  db.prepare(`
    INSERT INTO trades (
      id, accountId, symbol, instrument, type, entryPrice, exitPrice,
      stopLoss, quantity, status, pnl, fees, r, date, entryTime, exitTime,
      setup, playbookId, notes, emotionPre, emotionPost, mistakes,
      imageUrl, imageUrls, audioUrl, tags, exits
    ) VALUES (
      @id, @accountId, @symbol, @instrument, @type, @entryPrice, @exitPrice,
      @stopLoss, @quantity, @status, @pnl, @fees, @r, @date, @entryTime, @exitTime,
      @setup, @playbookId, @notes, @emotionPre, @emotionPost, @mistakes,
      @imageUrl, @imageUrls, @audioUrl, @tags, @exits
    )
  `).run(t);
  res.json(rowToTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(t.id)));
});
app.put('/trades/:id', (req, res) => {
  const t = tradeToRow(req.body);
  db.prepare(`
    UPDATE trades SET
      accountId = @accountId, symbol = @symbol, instrument = @instrument,
      type = @type, entryPrice = @entryPrice, exitPrice = @exitPrice,
      stopLoss = @stopLoss, quantity = @quantity, status = @status,
      pnl = @pnl, fees = @fees, r = @r, date = @date,
      entryTime = @entryTime, exitTime = @exitTime, setup = @setup,
      playbookId = @playbookId, notes = @notes, emotionPre = @emotionPre,
      emotionPost = @emotionPost, mistakes = @mistakes, imageUrl = @imageUrl,
      imageUrls = @imageUrls, audioUrl = @audioUrl, tags = @tags,
      exits = @exits, updated_at = @updated_at
    WHERE id = @id
  `).run({ ...t, id: req.params.id });
  res.json(rowToTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id)));
});
app.delete('/trades/:id', (req, res) => {
  db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── DAILY ANALYSIS (Pre-Market) ─────────────────────────────────
app.get('/daily_analysis', (req, res) => {
  const rows = db.prepare('SELECT date, pre_market FROM daily_journal WHERE pre_market IS NOT NULL').all();
  res.json(rows.map(r => ({ id: r.date, content: r.pre_market })));
});
app.post('/daily_analysis', (req, res) => {
  const { id: date, content } = req.body;
  db.prepare(`
    INSERT INTO daily_journal (date, pre_market) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET pre_market = excluded.pre_market, updated_at = datetime('now')
  `).run(date, content);
  res.json({ id: date, content });
});
app.put('/daily_analysis/:date', (req, res) => {
  const { content } = req.body;
  db.prepare(`
    INSERT INTO daily_journal (date, pre_market) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET pre_market = excluded.pre_market, updated_at = datetime('now')
  `).run(req.params.date, content);
  res.json({ id: req.params.date, content });
});

// ── DAILY REVIEWS (Post-Market) ─────────────────────────────────
app.get('/daily_reviews', (req, res) => {
  const rows = db.prepare('SELECT date, post_market FROM daily_journal WHERE post_market IS NOT NULL').all();
  res.json(rows.map(r => ({ id: r.date, content: r.post_market })));
});
app.post('/daily_reviews', (req, res) => {
  const { id: date, content } = req.body;
  db.prepare(`
    INSERT INTO daily_journal (date, post_market) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET post_market = excluded.post_market, updated_at = datetime('now')
  `).run(date, content);
  res.json({ id: date, content });
});
app.put('/daily_reviews/:date', (req, res) => {
  const { content } = req.body;
  db.prepare(`
    INSERT INTO daily_journal (date, post_market) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET post_market = excluded.post_market, updated_at = datetime('now')
  `).run(req.params.date, content);
  res.json({ id: req.params.date, content });
});

// ── NOTES ────────────────────────────────────────────────────────
app.get('/notes', (req, res) => {
  const rows = db.prepare('SELECT * FROM notes ORDER BY createdAt DESC').all();
  res.json(rows.map(r => ({ ...r, tags: parseJSON(r.tags) })));
});
app.post('/notes', (req, res) => {
  const n = req.body;
  db.prepare(`
    INSERT INTO notes (id, title, content, category, tags, createdAt, updatedAt)
    VALUES (@id, @title, @content, @category, @tags, @createdAt, @updatedAt)
  `).run({ ...n, tags: stringifyJ(n.tags) });
  const saved = db.prepare('SELECT * FROM notes WHERE id = ?').get(n.id);
  res.json({ ...saved, tags: parseJSON(saved.tags) });
});
app.put('/notes/:id', (req, res) => {
  const n = req.body;
  db.prepare(`
    UPDATE notes SET title = @title, content = @content, category = @category,
    tags = @tags, updatedAt = @updatedAt WHERE id = @id
  `).run({ ...n, id: req.params.id, tags: stringifyJ(n.tags) });
  const saved = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json({ ...saved, tags: parseJSON(saved.tags) });
});
app.delete('/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// ── AI / OLLAMA ROUTES ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// ── Helper: call Ollama chat endpoint ───────────────────────────
async function callOllama(messages, maxTokens = 2000) {
  console.log(`[ollama] → ${OLLAMA_MODEL} | messages: ${messages.length} | maxTokens: ${maxTokens}`);

  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature: 0.7,
        top_p: 0.9,
      },
      messages,
    }),
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  console.log('[ollama] ← raw response keys:', Object.keys(data));

  // Ollama returns {"error":"..."} with status 200 on model-level errors
  if (data.error) throw new Error(`Ollama error: ${data.error}`);

  const content = data.message?.content;
  console.log('[ollama] ← content length:', content?.length ?? 'undefined');

  return content || '';
}

// ── Helper: pull all 4 data sources from SQLite ─────────────────
function fetchFullContext(limitDays = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - limitDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const trades  = db.prepare('SELECT * FROM trades WHERE date >= ? ORDER BY date DESC').all(cutoffStr).map(rowToTrade);
  const journal = db.prepare('SELECT * FROM daily_journal WHERE date >= ? ORDER BY date DESC').all(cutoffStr);
  const notes   = db.prepare('SELECT * FROM notes ORDER BY createdAt DESC').all().map(r => ({ ...r, tags: parseJSON(r.tags) }));

  return { trades, journal, notes };
}

// ── Helper: build rich structured context string ─────────────────
function buildContextString({ trades, journal, notes }, maxDays = 45) {
  // Group trades by date
  const byDate = {};
  trades.forEach(t => {
    if (!byDate[t.date]) byDate[t.date] = [];
    byDate[t.date].push(t);
  });

  // Journal map
  const journalMap = {};
  journal.forEach(j => { journalMap[j.date] = j; });

  // All unique dates, capped
  const allDates = [
    ...new Set([...Object.keys(byDate), ...Object.keys(journalMap)])
  ].sort((a, b) => b.localeCompare(a)).slice(0, maxDays);

  let ctx = '';

  // Notebook rules (always include — these are the stated intentions)
  const rules = notes.filter(n => n.category === 'rule');
  const goals = notes.filter(n => n.category === 'goal');
  const plans = notes.filter(n => n.category === 'plan');

  if (rules.length > 0) {
    ctx += `\n=== TRADER'S STATED RULES ===\n`;
    rules.forEach(r => { ctx += `• [${r.title}]: ${stripHtml(r.content)}\n`; });
  }
  if (goals.length > 0) {
    ctx += `\n=== TRADER'S GOALS ===\n`;
    goals.forEach(g => { ctx += `• [${g.title}]: ${stripHtml(g.content)}\n`; });
  }
  if (plans.length > 0) {
    ctx += `\n=== TRADING PLANS/STRATEGIES ===\n`;
    plans.forEach(p => { ctx += `• [${p.title}]: ${stripHtml(p.content).substring(0, 200)}\n`; });
  }

  ctx += `\n=== DAILY TRADING HISTORY (${allDates.length} days) ===\n`;

  allDates.forEach(date => {
    const dayTrades  = byDate[date] || [];
    const dayJournal = journalMap[date];

    if (!dayTrades.length && !dayJournal) return;

    ctx += `\n--- ${date} ---\n`;

    if (dayJournal?.pre_market) {
      const plan = stripHtml(dayJournal.pre_market);
      if (plan) ctx += `PRE-MARKET PLAN: ${plan}\n`;
    }

    if (dayTrades.length > 0) {
      const closedTrades = dayTrades.filter(t => t.pnl != null);
      const dayPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const winners = closedTrades.filter(t => t.pnl > 0).length;

      ctx += `TRADES (${dayTrades.length} total, ${winners}W/${closedTrades.length - winners}L, P&L: ${dayPnl.toFixed(2)}):\n`;
      dayTrades.forEach(t => {
        ctx += `  • ${t.symbol} ${t.type} | Setup: ${t.setup || '?'} | `;
        ctx += `P&L: ${t.pnl != null ? t.pnl.toFixed(2) : 'open'} | R: ${t.r != null ? t.r.toFixed(2) : '-'}\n`;
        ctx += `    Emotion BEFORE: ${t.emotionPre || '?'} | AFTER: ${t.emotionPost || '?'}\n`;
        if (t.mistakes?.length > 0) ctx += `    Mistakes tagged: ${t.mistakes.join(', ')}\n`;
        const noteText = stripHtml(t.notes);
        if (noteText) ctx += `    Trade note: "${noteText}"\n`;
      });
    }

    if (dayJournal?.post_market) {
      const review = stripHtml(dayJournal.post_market);
      if (review) ctx += `POST-MARKET REVIEW: ${review}\n`;
    }
  });

  return ctx;
}

// ── GET /ai/status — Check Ollama is live ───────────────────────
app.get('/ai/status', async (req, res) => {
  try {
    const r    = await fetch('http://localhost:11434/api/tags');
    const data = await r.json();
    const models    = (data.models || []).map(m => m.name);
    const hasGemma4 = models.some(m => m.includes('gemma4'));
    res.json({ online: true, models, hasGemma4, recommended: OLLAMA_MODEL });
  } catch {
    res.json({ online: false, models: [], hasGemma4: false, recommended: OLLAMA_MODEL });
  }
});

// ── POST /ai/analyze — Deep cross-referenced psychology analysis ─
app.post('/ai/analyze', async (req, res) => {
  try {
    const timeframeDays = req.body.timeframe ?? 90;
    const { trades, journal, notes } = fetchFullContext(timeframeDays);

    if (trades.length === 0 && journal.length === 0) {
      return res.json({ analysis: 'Not enough data to analyze. Log some trades and write pre/post-market notes first.' });
    }

    const context = buildContextString({ trades, journal, notes });

    const systemPrompt = `You are an elite trading psychologist with 20 years experience coaching professional traders. You specialize in uncovering the gap between a trader's stated intentions and their actual execution — the patterns they cannot see because they are too close to their own behavior. You analyze journal data with surgical precision. You are direct, specific, and evidence-based. You never give generic advice.`;

    const userPrompt = `Analyze this trader's complete journal data. Surface the behavioral patterns and nuances they are NOT consciously aware of. Use specific dates and examples from the data as evidence.

Investigate the following:

1. INTENTION vs EXECUTION GAP
Compare their pre-market plans to what they actually traded. Did they follow their own plan? Identify specific dates where the stated thesis and actual trades diverged.

2. EMOTIONAL SEQUENCING
Map how emotions evolve across sessions. Look for dangerous sequences (e.g. Confident → trade losses → Frustrated → more trades). Which emotion states predict their worst outcomes?

3. RULE VIOLATIONS
Their stated rules are listed above. Cross-reference against actual behavior. Which rules do they break most? Under exactly what circumstances — after wins, after losses, at specific times?

4. SELF-AWARENESS IN REVIEWS
In their post-market reviews, are they diagnosing the real cause of losses (ownership language: "I ignored my plan") or rationalizing (victim language: "the market was choppy")? Give specific examples.

5. HIDDEN STATISTICAL TELLS
Look for patterns across the data: performance by setup type, emotion before trade vs outcome correlation, mistake frequency trends.

6. NUANCES THEY ARE MISSING
What is the ONE pattern running through all their bad trading days that they have not named explicitly in their own notes?

Output format: 6 numbered observations, each with a specific quote or data point from their journal as evidence. End with 2 concrete behavioral changes to implement this week.

JOURNAL DATA:
${context}`;

    const analysis = await callOllama(
      [
        { role: 'system',    content: systemPrompt },
        { role: 'user',      content: userPrompt   },
      ],
      2500
    );

    res.json({ analysis });
  } catch (err) {
    console.error('AI /ai/analyze error:', err.message);
    res.status(500).json({
      error: `AI analysis failed: ${err.message}`,
      hint: `Make sure Ollama is running (ollama serve) and ${OLLAMA_MODEL} is installed (ollama pull ${OLLAMA_MODEL})`,
    });
  }
});

// ── POST /ai/chat — Coach chat with full journal context ─────────
app.post('/ai/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    console.log(`[/ai/chat] message: "${message?.substring(0, 80)}" | history items: ${history.length}`);

    const { trades, journal, notes } = fetchFullContext(30);
    const context = buildContextString({ trades, journal, notes }, 14); // Last 14 days for chat
    console.log(`[/ai/chat] context chars: ${context.length}`);

    // Short system prompt — Gemma's chat template breaks with very long system prompts,
    // producing empty responses. Journal context goes into the user turn instead.
    const systemPrompt = `You are a direct trading psychology coach. Reference the trader's actual journal data when answering. Keep responses under 120 words. Be specific, not generic.`;

    // Inject context only into the first/current user turn
    const userContent = context.trim()
      ? `TRADER'S RECENT JOURNAL (last 14 days):\n${context.substring(0, 4000)}\n\nQuestion: ${message}`
      : message;

    // Build full message array with conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
        .slice(-8)
        .map(h => ({
          role:    h.role === 'ai' ? 'assistant' : 'user',
          content: h.text,
        })),
      { role: 'user', content: userContent },
    ];

    console.log(`[/ai/chat] sending ${messages.length} messages to Ollama`);
    const reply = await callOllama(messages, 500);
    console.log(`[/ai/chat] reply length: ${reply.length}`);

    if (!reply) {
      console.warn('[/ai/chat] Ollama returned empty content — check [ollama] logs above');
    }

    res.json({ reply });
  } catch (err) {
    console.error('[/ai/chat] error:', err.message);
    res.status(500).json({
      error: `Coach offline: ${err.message}`,
      hint: 'Make sure Ollama is running (ollama serve)',
    });
  }
});

// ── GET /ai/affirmation — Daily stoic affirmation ────────────────
app.get('/ai/affirmation', async (req, res) => {
  try {
    const reply = await callOllama(
      [
        { role: 'system', content: 'You are a stoic philosopher. Respond with one sentence only. No preamble.' },
        { role: 'user',   content: 'Give me one powerful stoic affirmation for a disciplined day trader, focused on process over outcome. Max 18 words.' },
      ],
      60
    );
    const affirmation = reply.trim().replace(/^["'`]|["'`]$/g, '');
    res.json({ affirmation });
  } catch {
    res.json({ affirmation: 'Control your process. The outcome follows.' });
  }
});

// ── RULES ────────────────────────────────────────────────────────
app.get('/rules', (req, res) => {
  res.json(db.prepare('SELECT * FROM rules ORDER BY rule_type DESC, created_at').all());
});
app.post('/rules', (req, res) => {
  const { id, text, active, rule_type, condition_type, condition_value } = req.body;
  db.prepare('INSERT OR REPLACE INTO rules (id, text, active, rule_type, condition_type, condition_value) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, text, active ?? 0, rule_type ?? 'manual', condition_type ?? null, condition_value ?? null);
  res.json({ id, text, active: active ?? 0, rule_type: rule_type ?? 'manual', condition_type, condition_value });
});
app.put('/rules/:id', (req, res) => {
  const { text, active, condition_type, condition_value } = req.body;
  db.prepare('UPDATE rules SET text = ?, active = ?, condition_type = ?, condition_value = ? WHERE id = ?')
    .run(text, active ?? 0, condition_type ?? null, condition_value ?? null, req.params.id);
  res.json({ id: req.params.id, text, active, condition_type, condition_value });
});
app.delete('/rules/:id', (req, res) => {
  // Only allow deleting manual rules
  db.prepare("DELETE FROM rules WHERE id = ? AND rule_type = 'manual'").run(req.params.id);
  res.json({ success: true });
});

// ── RULE SETTINGS ────────────────────────────────────────────────
app.get('/rule_settings', (req, res) => {
  const row = db.prepare('SELECT * FROM rule_settings WHERE id = 1').get();
  if (!row) return res.json({ trading_days: ['Mon','Tue','Wed','Thu','Fri'] });
  res.json({ ...row, trading_days: JSON.parse(row.trading_days || '[]') });
});
app.put('/rule_settings', (req, res) => {
  const { trading_days } = req.body;
  db.prepare('INSERT OR REPLACE INTO rule_settings (id, trading_days) VALUES (1, ?)')
    .run(JSON.stringify(trading_days));
  res.json({ trading_days });
});

// ── RULE CHECKS ──────────────────────────────────────────────────
app.get('/rule_checks', (req, res) => {
  const { date } = req.query;
  if (date) {
    res.json(db.prepare('SELECT * FROM rule_checks WHERE date = ?').all(date));
  } else {
    res.json(db.prepare('SELECT * FROM rule_checks ORDER BY date DESC').all());
  }
});
app.post('/rule_checks', (req, res) => {
  const { id, date, rule_id, followed } = req.body;
  db.prepare(`
    INSERT INTO rule_checks (id, date, rule_id, followed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date, rule_id) DO UPDATE SET followed = excluded.followed
  `).run(id, date, rule_id, followed ? 1 : 0);
  res.json({ id, date, rule_id, followed });
});
// Reset all rule checks (progress reset)
app.delete('/rule_checks', (req, res) => {
  db.prepare('DELETE FROM rule_checks').run();
  res.json({ success: true });
});

// ── HEALTH CHECK ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', db: DB_PATH, time: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════
// ── AI RECAPS ROUTES ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// ── GET /ai_recaps — Return all saved recaps ─────────────────────
app.get('/ai_recaps', (req, res) => {
  const rows = db.prepare('SELECT * FROM ai_recaps ORDER BY period_start DESC').all();
  res.json(rows);
});

// ── DELETE /ai_recaps/:id — Delete a single recap ────────────────
app.delete('/ai_recaps/:id', (req, res) => {
  db.prepare('DELETE FROM ai_recaps WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── POST /ai_recaps/generate ─────────────────────────────────────
// Body: { period_type: 'weekly'|'monthly', period_start: 'YYYY-MM-DD', period_end: 'YYYY-MM-DD' }
app.post('/ai_recaps/generate', async (req, res) => {
  try {
    const { period_type, period_start, period_end } = req.body;
    if (!period_type || !period_start || !period_end) {
      return res.status(400).json({ error: 'period_type, period_start, period_end are required' });
    }

    // ── 1. Fetch raw data for the period ──
    const trades = db.prepare(
      'SELECT * FROM trades WHERE date >= ? AND date <= ? ORDER BY date ASC'
    ).all(period_start, period_end).map(rowToTrade);

    const journalRows = db.prepare(
      'SELECT * FROM daily_journal WHERE date >= ? AND date <= ? ORDER BY date ASC'
    ).all(period_start, period_end);

    const ruleChecks = db.prepare(
      'SELECT rc.*, r.text as rule_text FROM rule_checks rc LEFT JOIN rules r ON rc.rule_id = r.id WHERE rc.date >= ? AND rc.date <= ?'
    ).all(period_start, period_end);

    // ── 2. Aggregate stats ──
    const closedTrades = trades.filter(t => t.status === 'CLOSED' && t.pnl != null);
    const wins  = closedTrades.filter(t => (t.pnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnl || 0) < 0);
    const netPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const winRate = closedTrades.length > 0 ? ((wins.length / closedTrades.length) * 100).toFixed(1) : '0';
    const grossWin = wins.reduce((s, t) => s + (t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : wins.length > 0 ? '∞' : '0';
    const avgWin  = wins.length > 0  ? (grossWin / wins.length).toFixed(2) : '0';
    const avgLoss = losses.length > 0 ? (grossLoss / losses.length).toFixed(2) : '0';

    // Best / worst trade
    const sorted = [...closedTrades].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
    const bestTrade  = sorted[0];
    const worstTrade = sorted[sorted.length - 1];

    // Emotion breakdown
    const emotionMap = {};
    closedTrades.forEach(t => {
      if (t.emotionPre) emotionMap[t.emotionPre] = (emotionMap[t.emotionPre] || 0) + 1;
    });

    // Mistake breakdown
    const mistakeMap = {};
    closedTrades.forEach(t => {
      (t.mistakes || []).forEach(m => { mistakeMap[m] = (mistakeMap[m] || 0) + 1; });
    });

    // Day-of-week P&L
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dayPnl = {};
    closedTrades.forEach(t => {
      if (!t.date) return;
      const d = dayNames[new Date(t.date + 'T12:00:00').getDay()];
      dayPnl[d] = (dayPnl[d] || 0) + (t.pnl || 0);
    });

    // Rule compliance
    const totalChecks = ruleChecks.length;
    const followedChecks = ruleChecks.filter(c => c.followed === 1).length;
    const complianceScore = totalChecks > 0 ? Math.round((followedChecks / totalChecks) * 100) : null;

    // Most broken rule
    const brokenByRule = {};
    ruleChecks.filter(c => c.followed === 0).forEach(c => {
      brokenByRule[c.rule_text || c.rule_id] = (brokenByRule[c.rule_text || c.rule_id] || 0) + 1;
    });
    const mostBroken = Object.entries(brokenByRule).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Daily P&L array for trend
    const dailyPnlMap = {};
    closedTrades.forEach(t => {
      if (!t.date) return;
      dailyPnlMap[t.date] = (dailyPnlMap[t.date] || 0) + (t.pnl || 0);
    });
    const dailyPnlArr = Object.entries(dailyPnlMap).sort(([a],[b]) => a.localeCompare(b)).map(([date, pnl]) => ({ date, pnl: +pnl.toFixed(2) }));

    // ── 3. Build Gemma 4 prompt ──
    const isWeekly = period_type === 'weekly';
    const label = isWeekly
      ? `Week of ${period_start} to ${period_end}`
      : `Month of ${period_start.slice(0, 7)}`;

    const statsBlock = `
PERIOD: ${label}
TRADES: ${closedTrades.length} closed trades (${wins.length}W / ${losses.length}L)
NET P&L: $${netPnl.toFixed(2)}
WIN RATE: ${winRate}%
PROFIT FACTOR: ${profitFactor}
AVG WIN: $${avgWin} | AVG LOSS: $${avgLoss}
BEST TRADE: ${bestTrade ? `${bestTrade.symbol} +$${bestTrade.pnl?.toFixed(2)} (${bestTrade.setup || 'no setup'}, emotion: ${bestTrade.emotionPre || 'none'})` : 'none'}
WORST TRADE: ${worstTrade ? `${worstTrade.symbol} $${worstTrade.pnl?.toFixed(2)} (${worstTrade.setup || 'no setup'}, emotion: ${worstTrade.emotionPre || 'none'})` : 'none'}
EMOTION BREAKDOWN: ${Object.entries(emotionMap).map(([k,v]) => `${k}:${v}`).join(', ') || 'none recorded'}
MISTAKE BREAKDOWN: ${Object.entries(mistakeMap).map(([k,v]) => `${k}:${v}`).join(', ') || 'none recorded'}
DAY-OF-WEEK P&L: ${Object.entries(dayPnl).map(([d,p]) => `${d}:$${p.toFixed(0)}`).join(', ') || 'n/a'}
RULE COMPLIANCE: ${complianceScore !== null ? `${complianceScore}%` : 'not tracked'}
MOST BROKEN RULE: ${mostBroken || 'none'}
DAILY P&L SEQUENCE: ${dailyPnlArr.map(d => `${d.date}:${d.pnl > 0 ? '+' : ''}$${d.pnl}`).join(' | ') || 'none'}
`.trim();

    const journalSnippets = journalRows
      .filter(r => r.pre_market || r.post_market)
      .slice(-5)
      .map(r => `[${r.date}] PRE: ${(r.pre_market || '').substring(0, 120)} | POST: ${(r.post_market || '').substring(0, 120)}`)
      .join('\n');

    const systemPrompt = `You are a trading psychology coach for a MES/MNQ micro-futures day trader on Apex funded accounts. You write structured, direct, and honest performance recaps. Use the data provided — do not invent numbers. Keep language tight and actionable. Format your response in clean markdown with these exact sections: ## Summary, ## What Worked, ## What Didn't, ## Emotional Patterns, ## Rule Compliance, ## Key Focus for Next ${isWeekly ? 'Week' : 'Month'}. Each section should be 2-4 sentences max. End with one bold coaching note.`;

    const userPrompt = `Write a ${isWeekly ? 'weekly' : 'monthly'} trading recap for this trader.

TRADING DATA:
${statsBlock}

${journalSnippets ? `JOURNAL SNIPPETS (pre/post market notes):\n${journalSnippets}` : ''}

Write the recap now. Be specific to the numbers. If the period has no trades, say so and give a short forward-looking note instead.`;

    // ── 4. Call Gemma 4 ──
    const content = await callOllama(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      1200
    );

    if (!content) throw new Error('Gemma returned empty response');

    // ── 5. Save and return ──
    const recapId = `${period_type}-${period_start}`;
    db.prepare(`
      INSERT OR REPLACE INTO ai_recaps (id, period_type, period_start, period_end, content, generated_at, trade_count, net_pnl)
      VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)
    `).run(recapId, period_type, period_start, period_end, content, closedTrades.length, parseFloat(netPnl.toFixed(2)));

    const saved = db.prepare('SELECT * FROM ai_recaps WHERE id = ?').get(recapId);
    res.json(saved);

  } catch (err) {
    console.error('[/ai_recaps/generate] error:', err.message);
    res.status(500).json({
      error: `Recap generation failed: ${err.message}`,
      hint: `Make sure Ollama is running (ollama serve) and ${OLLAMA_MODEL} is installed`,
    });
  }
});

// ── START ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ✅  Mindful Trader API running');
  console.log(`  📦  Database  : ${DB_PATH}`);
  console.log(`  🌐  API       : http://localhost:${PORT}`);
  console.log(`  🤖  AI Model  : ${OLLAMA_MODEL} via Ollama`);
  console.log('');
  console.log('  To enable AI features:');
  console.log('    1. Install Ollama: https://ollama.com');
  console.log(`    2. Pull model:     ollama pull ${OLLAMA_MODEL}`);
  console.log('    3. Start Ollama:   ollama serve');
  console.log('');
});
