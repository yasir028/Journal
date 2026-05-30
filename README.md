# Mindful Trader — AI-Powered Trading Journal

A fully local, privacy-first trading journal with AI coaching, psychology analysis, rule tracking, and performance analytics. All your data stays on your machine — no cloud required.

---

## Features

- **Trade Journal** — Log trades with entry/exit, P&L, stop loss, R-multiple, screenshots, notes, and tags
- **Daily Journal** — Pre-market plans and post-market reviews linked to each trading day
- **Dashboard** — Win rate, P&L curves, streak tracking, and performance KPIs
- **Analytics** — Breakdown by setup, emotion, day-of-week, symbol, and instrument
- **AI Chat** — Ask questions about your trading data in plain English ("What's my win rate on Fridays?")
- **AI Recaps** — Auto-generated weekly/monthly performance summaries
- **Psychology Profile** — AI-powered emotional pattern analysis
- **Rule Tracker** — Define and track your trading rules daily
- **Playbooks** — Document and tag your setups
- **P&L Calendar** — Visual monthly calendar of daily P&L
- **Notebook** — Goals, rules, plans, and general notes with rich text
- **Broker Import** — Paste CSV exports from Questrade and other brokers
- **Report Export** — Generate DOCX or Obsidian-compatible reports
- **Multiple Accounts & Profiles** — Separate tracking per account

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Backend | Express 5, Node.js |
| Database | SQLite (via better-sqlite3) — runs locally |
| AI | Ollama (local LLM — no API key needed) |
| Charts | Recharts |
| Rich Text | Tiptap |
| Icons | Lucide React |

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or later
- [Ollama](https://ollama.com/) *(optional — only needed for AI features)*

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/your-username/mindful-trader.git
cd mindful-trader
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the app

```bash
npm start
```

This runs both the backend API (port 3001) and the Vite frontend (port 5173) together.

Open **http://localhost:5173** in your browser.

> The SQLite database (`trader.db`) is created automatically on first run — no setup needed.

---

## AI Features (Optional)

The AI chat, recaps, and psychology analysis all run **100% locally** using [Ollama](https://ollama.com/). No API key or internet connection required.

### Setup

**1. Install Ollama**

Download from [ollama.com](https://ollama.com/) and install it.

**2. Pull the model**

```bash
ollama pull gemma4:e4b
```

This downloads the ~9 GB Gemma 4 8B model (Q4 quantized). A one-time download.

> **Requirements:** ~10 GB disk space. 8 GB RAM minimum; 16 GB recommended for smooth performance.

**3. Start Ollama**

```bash
ollama serve
```

Ollama needs to be running in the background whenever you use AI features. The green dot in the AI chat panel confirms it's connected.

### What works without Ollama

Everything except the AI chat panel, AI recaps, and psychology profile. All trade logging, journal, analytics, and rule tracking work with no AI setup.

---

## Running Frontend and Backend Separately

If you prefer two terminals instead of one:

**Terminal 1 — Backend**
```bash
npm run server
```

**Terminal 2 — Frontend**
```bash
npm run dev
```

---

## Project Structure

```
├── server.cjs          # Express API + SQLite backend
├── App.tsx             # Root React component + routing
├── types.ts            # Shared TypeScript types
├── components/         # All React UI components
│   ├── Dashboard.tsx
│   ├── Journal.tsx
│   ├── DailyJournal.tsx
│   ├── Analytics.tsx
│   ├── Settings.tsx
│   └── ...
└── services/
    ├── ollamaService.ts    # Ollama AI client
    ├── brokerParsers.ts    # CSV import parsers
    └── reportService.ts    # DOCX/Obsidian export
```

---

## Data & Privacy

- All trade data is stored in `trader.db` (SQLite) on your local machine
- The database file is excluded from git and never leaves your computer
- No accounts, no telemetry, no external services required
- AI features run on your own hardware via Ollama

---

## Supported Broker Imports

CSV paste import is available for:
- **Questrade** — Activity CSV export
- More parsers can be added in `services/brokerParsers.ts`

---

## Futures Contracts

Built-in multipliers for common futures:

| Symbol | Name | Multiplier |
|--------|------|-----------|
| MES | Micro E-mini S&P 500 | 5 |
| ES | E-mini S&P 500 | 50 |
| MNQ | Micro E-mini Nasdaq | 2 |
| NQ | E-mini Nasdaq | 20 |
| CL | Crude Oil | 1,000 |
| GC | Gold | 100 |
| … | and more | |

---

## License

MIT — free to use, modify, and share.
