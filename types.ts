

export enum TradeType {
  LONG = 'LONG',
  SHORT = 'SHORT'
}

export enum TradeStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  BE = 'BE' // Break Even
}

export enum Instrument {
  STOCK = 'Stock',
  OPTION = 'Option',
  FUTURE = 'Future',
  CRYPTO = 'Crypto'
}

export enum Emotion {
  CONFIDENT = 'Confident',
  ANXIOUS = 'Anxious',
  FRUSTRATED = 'Frustrated',
  EUPHORIC = 'Euphoric',
  NEUTRAL = 'Neutral',
  REVENGE = 'Revenge'
}

export interface Account {
  id: string;
  name: string;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
}

export type DailyAnalysis = Record<string, string>; // Key: YYYY-MM-DD, Value: Pre-Market Plan
export type DailyReview = Record<string, string>;   // Key: YYYY-MM-DD, Value: End-of-Day Review

export interface TradeHistoryItem extends Omit<Trade, 'history'> {
  archivedAt: string;
}

export interface TradeExit {
  id: string;
  price: number;
  quantity: number;
  date?: string;
  notes?: string;
}

export interface Trade {
  id: string;
  accountId?: string; // Links trade to a specific account
  symbol: string;
  instrument?: Instrument;
  type: TradeType;
  entryPrice: number;
  exitPrice?: number;
  stopLoss?: number;
  quantity: number;
  status: TradeStatus;
  pnl?: number;
  fees?: number; // Commissions/Fees
  r?: number; // Risk Multiple
  date: string; // YYYY-MM-DD
  entryTime?: string; // HH:MM
  exitTime?: string; // HH:MM
  setup: string;
  playbookId?: string; // Link to a playbook strategy
  notes: string;
  emotionPre: string; // Changed from Emotion enum to string to allow custom inputs
  emotionPost?: string;
  mistakes?: string[];
  imageUrl?: string;
  history?: TradeHistoryItem[];
  exits?: TradeExit[];
}

export interface Trade {
  // ... existing fields ...
  
  // NEW fields to add:
  tags?: string[];
  imageUrls?: string[];
  audioUrl?: string;
}

// New Types for Notebook
export type NoteCategory = 'daily' | 'plan' | 'goal' | 'rule' | 'general';

export interface Note {
  id: string;
  title: string;
  content: string;
  category: NoteCategory;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface CheckInSettings {
  requirePreTrade: boolean;
  checkInAfterLoss: boolean;
  checkInStreak: number; // e.g., check in after 3 losses
  dailyReflectionTime: string; // HH:MM (Existing field, can be used or we add specific one)
  marketReviewEnabled: boolean; // New toggle
  marketReviewTimes: string[]; // Array of times for market review
}

export interface UserStats {
  winRate: number;
  totalPnl: number;
  totalTrades: number;
  avgWinner: number;
  avgLoser: number;
  currentStreak: number; // Positive for win streak, negative for loss streak
}

export const DEFAULT_MISTAKES = [
  'FOMO', 'Revenge Trading', 'Oversizing', 'No Stop Loss', 'Chasing', 'Early Exit', 'Late Entry', 'Impulse', 'Broken Rules'
];

export const DEFAULT_PLAYBOOKS: Playbook[] = [
  { id: 'pb_1', name: 'Gap & Go', description: 'Momentum play on opening gaps' },
  { id: 'pb_2', name: 'Reversal', description: 'Fade moves at key resistance/support' },
  { id: 'pb_3', name: 'Breakout', description: 'Consolidation break with volume' }
];

export const FUTURES_CONTRACTS = [
  // Indices
  { symbol: 'ES', name: 'E-mini S&P 500', multiplier: 50 },
  { symbol: 'MES', name: 'Micro E-mini S&P 500', multiplier: 5 },
  { symbol: 'NQ', name: 'E-mini Nasdaq 100', multiplier: 20 },
  { symbol: 'MNQ', name: 'Micro E-mini Nasdaq 100', multiplier: 2 },
  { symbol: 'RTY', name: 'E-mini Russell 2000', multiplier: 50 },
  { symbol: 'M2K', name: 'Micro E-mini Russell 2000', multiplier: 5 },
  { symbol: 'YM', name: 'E-mini Dow Jones', multiplier: 5 },
  { symbol: 'MYM', name: 'Micro E-mini Dow Jones', multiplier: 0.5 },
  // Energies
  { symbol: 'CL', name: 'Crude Oil', multiplier: 1000 },
  { symbol: 'MCL', name: 'Micro Crude Oil', multiplier: 100 },
  { symbol: 'NG', name: 'Natural Gas', multiplier: 10000 },
  // Metals
  { symbol: 'GC', name: 'Gold', multiplier: 100 },
  { symbol: 'MGC', name: 'Micro Gold', multiplier: 10 },
  { symbol: 'SI', name: 'Silver', multiplier: 5000 },
  { symbol: 'SIL', name: 'Micro Silver', multiplier: 1000 },
  { symbol: 'HG', name: 'Copper', multiplier: 25000 },
  // Currencies
  { symbol: '6E', name: 'Euro FX', multiplier: 125000 },
  { symbol: 'M6E', name: 'Micro Euro FX', multiplier: 12500 },
  { symbol: '6B', name: 'British Pound', multiplier: 62500 },
  { symbol: '6J', name: 'Japanese Yen', multiplier: 125000 },
  { symbol: '6A', name: 'Australian Dollar', multiplier: 100000 },
  // Treasuries
  { symbol: 'ZB', name: '30-Year Bond', multiplier: 1000 },
  { symbol: 'ZN', name: '10-Year Note', multiplier: 1000 },
  { symbol: 'ZF', name: '5-Year Note', multiplier: 1000 },
];

export const MOCK_TRADES: Trade[] = [
  { id: '1', accountId: 'default', symbol: 'AAPL', instrument: Instrument.STOCK, type: TradeType.LONG, entryPrice: 150, exitPrice: 155, stopLoss: 148, quantity: 10, status: TradeStatus.CLOSED, pnl: 50, fees: 2.0, r: 2.5, date: '2023-10-25', entryTime: '09:45', exitTime: '10:30', setup: 'Breakout', playbookId: 'pb_3', notes: 'Good clean move.', emotionPre: Emotion.CONFIDENT, emotionPost: Emotion.NEUTRAL },
  { id: '2', accountId: 'default', symbol: 'TSLA', instrument: Instrument.STOCK, type: TradeType.SHORT, entryPrice: 220, exitPrice: 225, stopLoss: 222, quantity: 10, status: TradeStatus.CLOSED, pnl: -50, fees: 2.0, r: -2.5, date: '2023-10-26', entryTime: '11:00', exitTime: '11:15', setup: 'Reversal', playbookId: 'pb_2', notes: 'Forced the trade.', emotionPre: Emotion.ANXIOUS, emotionPost: Emotion.FRUSTRATED, mistakes: ['FOMO', 'Chasing'] },
  { id: '3', accountId: 'default', symbol: 'NVDA', instrument: Instrument.STOCK, type: TradeType.LONG, entryPrice: 400, exitPrice: 410, stopLoss: 395, quantity: 5, status: TradeStatus.CLOSED, pnl: 50, fees: 1.5, r: 2.0, date: '2023-10-27', entryTime: '14:00', exitTime: '15:45', setup: 'Pullback', playbookId: 'pb_2', notes: 'Followed plan.', emotionPre: Emotion.NEUTRAL, emotionPost: Emotion.CONFIDENT },
  { id: '4', accountId: 'default', symbol: 'SPY', instrument: Instrument.OPTION, type: TradeType.SHORT, entryPrice: 450, exitPrice: 448, stopLoss: 451, quantity: 20, status: TradeStatus.CLOSED, pnl: 40, fees: 3.0, r: 2.0, date: '2023-10-27', entryTime: '09:35', exitTime: '09:50', setup: 'Breakdown', playbookId: 'pb_1', notes: '', emotionPre: Emotion.CONFIDENT, emotionPost: Emotion.CONFIDENT },
  { id: '5', accountId: 'default', symbol: 'AMD', instrument: Instrument.STOCK, type: TradeType.LONG, entryPrice: 100, exitPrice: 98, stopLoss: 99, quantity: 20, status: TradeStatus.CLOSED, pnl: -40, fees: 2.5, r: -2.0, date: '2023-10-28', entryTime: '10:00', exitTime: '10:05', setup: 'Breakout', playbookId: 'pb_3', notes: 'Stop hunt.', emotionPre: Emotion.EUPHORIC, emotionPost: Emotion.FRUSTRATED, mistakes: ['No Stop Loss'] },
];

export const MOCK_NOTES: Note[] = [
  { id: 'n1', title: 'Q4 Trading Rules', content: '1. No trading first 5 mins.\n2. Max 3 trades per day.\n3. Stop trading after 2 losses.', category: 'rule', createdAt: '2023-10-01', updatedAt: '2023-10-01' },
  { id: 'n2', title: 'Yearly Goals 2024', content: '- Reach $50k account size\n- Master the gap and go strategy', category: 'goal', createdAt: '2023-11-15', updatedAt: '2023-11-15' },
  { id: 'n3', title: 'Gap Strategy Plan', content: 'Scan for gaps > 2% with volume > 100k pre-market...', category: 'plan', createdAt: '2023-09-10', updatedAt: '2023-09-20' },
];