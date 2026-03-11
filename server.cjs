/**
 * server.cjs
 * ─────────────────────────────────────────────────────────────
 * Local Express + SQLite API server for Mindful Trader.
 * Uses better-sqlite3 (synchronous, no config needed).
 *
 * Runs on port 3001.
 * Vite dev server runs separately on port 5173.
 *
 * Start with:  node server.cjs
 * ─────────────────────────────────────────────────────────────
 */

const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const Database   = require('better-sqlite3');
const path       = require('path');
const fs         = require('fs');

// ── CONFIG ────────────────────────────────────────────────────
const PORT    = 3001;
const DB_PATH = path.join(__dirname, 'trader.db');

// ── DATABASE SETUP ────────────────────────────────────────────
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── CREATE TABLES ─────────────────────────────────────────────
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
    id           TEXT PRIMARY KEY,
    accountId    TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    symbol       TEXT NOT NULL,
    instrument   TEXT,
    type         TEXT NOT NULL,
    entryPrice   REAL,
    exitPrice    REAL,
    stopLoss     REAL,
    quantity     INTEGER DEFAULT 0,
    status       TEXT DEFAULT 'OPEN',
    pnl          REAL,
    fees         REAL DEFAULT 0,
    r            REAL,
    date         TEXT NOT NULL,
    entryTime    TEXT,
    exitTime     TEXT,
    setup        TEXT DEFAULT '',
    playbookId   TEXT REFERENCES playbooks(id) ON DELETE SET NULL,
    notes        TEXT DEFAULT '',
    emotionPre   TEXT DEFAULT '',
    emotionPost  TEXT,
    mistakes     TEXT DEFAULT '[]',
    imageUrl     TEXT,
    imageUrls    TEXT DEFAULT '[]',
    audioUrl     TEXT,
    tags         TEXT DEFAULT '[]',
    exits        TEXT DEFAULT '[]',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
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
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    content    TEXT DEFAULT '',
    category   TEXT DEFAULT 'general',
    tags       TEXT DEFAULT '[]',
    createdAt  TEXT DEFAULT (datetime('now')),
    updatedAt  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_trades_date      ON trades (date DESC);
  CREATE INDEX IF NOT EXISTS idx_trades_accountId ON trades (accountId, date DESC);
  CREATE INDEX IF NOT EXISTS idx_trades_symbol    ON trades (symbol);
  CREATE INDEX IF NOT EXISTS idx_daily_journal    ON daily_journal (date DESC);
`);

// Seed a default account if the table is empty
const accountCount = db.prepare('SELECT COUNT(*) as c FROM accounts').get();
if (accountCount.c === 0) {
  db.prepare("INSERT INTO accounts (id, name) VALUES ('default', 'Main Account')").run();
}

// ── JSON HELPERS ──────────────────────────────────────────────
// SQLite stores arrays as JSON strings. These helpers handle that.
const parseJSON   = (val) => { try { return JSON.parse(val || '[]'); } catch { return []; } };
const stringifyJ  = (val) => Array.isArray(val) ? JSON.stringify(val) : (val ?? '[]');

// Deserialize a trade row from SQLite → JS object
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

// Serialize a trade JS object → SQLite columns.
// Every field is explicitly mapped so optional fields missing from
// the JSON body are set to null rather than being absent from the
// bound object. better-sqlite3 throws "Missing named parameter @x"
// if a SQL named param is not a key in the bound object at all.
function tradeToRow(t) {
  return {
    id:          t.id,
    accountId:   t.accountId   ?? null,
    symbol:      t.symbol      ?? "",
    instrument:  t.instrument  ?? null,
    type:        t.type        ?? "LONG",
    entryPrice:  t.entryPrice  ?? null,
    exitPrice:   t.exitPrice   ?? null,
    stopLoss:    t.stopLoss    ?? null,
    quantity:    t.quantity    ?? 0,
    status:      t.status      ?? "OPEN",
    pnl:         t.pnl         ?? null,
    fees:        t.fees        ?? 0,
    r:           t.r           ?? null,
    date:        t.date        ?? "",
    entryTime:   t.entryTime   ?? null,
    exitTime:    t.exitTime    ?? null,
    setup:       t.setup       ?? "",
    playbookId:  t.playbookId  ?? null,
    notes:       t.notes       ?? "",
    emotionPre:  t.emotionPre  ?? "",
    emotionPost: t.emotionPost ?? null,
    imageUrl:    t.imageUrl    ?? null,
    audioUrl:    t.audioUrl    ?? null,
    mistakes:    stringifyJ(t.mistakes),
    imageUrls:   stringifyJ(t.imageUrls),
    tags:        stringifyJ(t.tags),
    exits:       stringifyJ(t.exits),
    updated_at:  new Date().toISOString(),
  };
}

// ── EXPRESS APP ───────────────────────────────────────────────
const app = express();

app.use(cors({ origin: '*' }));

// Raise body size limit to 50 MB to handle base64 screenshots
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// ── ACCOUNTS ──────────────────────────────────────────────────

app.get('/accounts', (req, res) => {
  const rows = db.prepare('SELECT * FROM accounts ORDER BY created_at').all();
  res.json(rows);
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

// ── PLAYBOOKS ─────────────────────────────────────────────────

app.get('/playbooks', (req, res) => {
  const rows = db.prepare('SELECT * FROM playbooks ORDER BY created_at').all();
  res.json(rows);
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

// ── TRADES ────────────────────────────────────────────────────

app.get('/trades', (req, res) => {
  const rows = db.prepare('SELECT * FROM trades ORDER BY date DESC, created_at DESC').all();
  res.json(rows.map(rowToTrade));
});

app.post('/trades', (req, res) => {
  const t = tradeToRow(req.body);
  db.prepare(`
    INSERT INTO trades (
      id, accountId, symbol, instrument, type,
      entryPrice, exitPrice, stopLoss, quantity, status,
      pnl, fees, r, date, entryTime, exitTime,
      setup, playbookId, notes, emotionPre, emotionPost,
      mistakes, imageUrl, imageUrls, audioUrl, tags, exits
    ) VALUES (
      @id, @accountId, @symbol, @instrument, @type,
      @entryPrice, @exitPrice, @stopLoss, @quantity, @status,
      @pnl, @fees, @r, @date, @entryTime, @exitTime,
      @setup, @playbookId, @notes, @emotionPre, @emotionPost,
      @mistakes, @imageUrl, @imageUrls, @audioUrl, @tags, @exits
    )
  `).run(t);
  const saved = db.prepare('SELECT * FROM trades WHERE id = ?').get(t.id);
  res.json(rowToTrade(saved));
});

app.put('/trades/:id', (req, res) => {
  const t = tradeToRow(req.body);
  db.prepare(`
    UPDATE trades SET
      accountId   = @accountId,
      symbol      = @symbol,
      instrument  = @instrument,
      type        = @type,
      entryPrice  = @entryPrice,
      exitPrice   = @exitPrice,
      stopLoss    = @stopLoss,
      quantity    = @quantity,
      status      = @status,
      pnl         = @pnl,
      fees        = @fees,
      r           = @r,
      date        = @date,
      entryTime   = @entryTime,
      exitTime    = @exitTime,
      setup       = @setup,
      playbookId  = @playbookId,
      notes       = @notes,
      emotionPre  = @emotionPre,
      emotionPost = @emotionPost,
      mistakes    = @mistakes,
      imageUrl    = @imageUrl,
      imageUrls   = @imageUrls,
      audioUrl    = @audioUrl,
      tags        = @tags,
      exits       = @exits,
      updated_at  = @updated_at
    WHERE id = @id
  `).run({ ...t, id: req.params.id });
  const saved = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  res.json(rowToTrade(saved));
});

app.delete('/trades/:id', (req, res) => {
  db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── DAILY ANALYSIS (Pre-Market) ───────────────────────────────
// Stored in daily_journal.pre_market, keyed by date.
// Returns array of { id: date, content: text } to match old API shape.

app.get('/daily_analysis', (req, res) => {
  const rows = db.prepare('SELECT date, pre_market FROM daily_journal WHERE pre_market IS NOT NULL').all();
  res.json(rows.map(r => ({ id: r.date, content: r.pre_market })));
});

app.post('/daily_analysis', (req, res) => {
  const { id: date, content } = req.body;
  db.prepare(`
    INSERT INTO daily_journal (date, pre_market)
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET pre_market = excluded.pre_market, updated_at = datetime('now')
  `).run(date, content);
  res.json({ id: date, content });
});

app.put('/daily_analysis/:date', (req, res) => {
  const { content } = req.body;
  db.prepare(`
    INSERT INTO daily_journal (date, pre_market)
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET pre_market = excluded.pre_market, updated_at = datetime('now')
  `).run(req.params.date, content);
  res.json({ id: req.params.date, content });
});

// ── DAILY REVIEWS (Post-Market) ───────────────────────────────

app.get('/daily_reviews', (req, res) => {
  const rows = db.prepare('SELECT date, post_market FROM daily_journal WHERE post_market IS NOT NULL').all();
  res.json(rows.map(r => ({ id: r.date, content: r.post_market })));
});

app.post('/daily_reviews', (req, res) => {
  const { id: date, content } = req.body;
  db.prepare(`
    INSERT INTO daily_journal (date, post_market)
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET post_market = excluded.post_market, updated_at = datetime('now')
  `).run(date, content);
  res.json({ id: date, content });
});

app.put('/daily_reviews/:date', (req, res) => {
  const { content } = req.body;
  db.prepare(`
    INSERT INTO daily_journal (date, post_market)
    VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET post_market = excluded.post_market, updated_at = datetime('now')
  `).run(req.params.date, content);
  res.json({ id: req.params.date, content });
});

// ── NOTES ─────────────────────────────────────────────────────

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
    UPDATE notes SET
      title     = @title,
      content   = @content,
      category  = @category,
      tags      = @tags,
      updatedAt = @updatedAt
    WHERE id = @id
  `).run({ ...n, id: req.params.id, tags: stringifyJ(n.tags) });
  const saved = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  res.json({ ...saved, tags: parseJSON(saved.tags) });
});

app.delete('/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', db: DB_PATH, time: new Date().toISOString() });
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ✅  Mindful Trader API running');
  console.log(`  📦  Database : ${DB_PATH}`);
  console.log(`  🌐  API      : http://localhost:${PORT}`);
  console.log('');
});
