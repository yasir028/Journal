import { Trade, TradeType, TradeStatus, Instrument, Emotion, FUTURES_CONTRACTS } from '../types';

export type BrokerFormat = 'tradovate' | 'interactivebrokers' | 'questrade' | 'internal' | 'unknown';

export interface ParseResult {
  format: BrokerFormat;
  formatLabel: string;
  trades: Trade[];
  warnings: string[];
}

// ── Shared Utilities ────────────────────────────────────────────

export function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (char === ',' && !inQuote) {
      result.push(current); current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseDollarPnl(s: string): number {
  if (!s) return 0;
  const neg = s.includes('(');
  const clean = s.replace(/[$(),\s]/g, '');
  return neg ? -parseFloat(clean) : parseFloat(clean);
}

function parseTradovateTimestamp(ts: string): { date: string; time: string } {
  const [datePart = '', timePart = ''] = ts.trim().split(' ');
  const [mm = '01', dd = '01', yyyy = '2000'] = datePart.split('/');
  return {
    date: `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
    time: timePart,
  };
}

function generateTradeId(prefix: string, ...parts: (string | number)[]): string {
  const raw = parts.join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`;
}

function cleanFuturesSymbol(symbol: string): string {
  return symbol.replace(/[A-Z]\d+$/i, '').toUpperCase();
}

function lookupFuturesMultiplier(symbol: string): number | null {
  const contract = FUTURES_CONTRACTS.find(f => f.symbol === symbol);
  return contract ? contract.multiplier : null;
}

function makeGetVal(headers: string[], row: string[]) {
  return (keys: string[]): string | undefined => {
    const idx = headers.findIndex(h => keys.includes(h));
    return idx !== -1 ? row[idx]?.trim() : undefined;
  };
}

// ── Format Detection ────────────────────────────────────────────

interface DetectionResult {
  format: BrokerFormat;
  headerLineIndex: number;
}

function detectFormat(text: string): DetectionResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { format: 'unknown', headerLineIndex: 0 };

  // Check for IB multi-section format: look for a line starting with "Trades,Header,"
  for (let i = 0; i < Math.min(lines.length, 200); i++) {
    if (lines[i].startsWith('Trades,Header,') || lines[i].startsWith('"Trades","Header",')) {
      return { format: 'interactivebrokers', headerLineIndex: i };
    }
  }

  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());

  // Tradovate
  if (headers.includes('boughttimestamp') || headers.includes('buyprice')) {
    return { format: 'tradovate', headerLineIndex: 0 };
  }

  // IB simple TWS format
  if (headers.includes('t. price') || (headers.includes('realized p&l') && headers.includes('comm/fee'))) {
    return { format: 'interactivebrokers', headerLineIndex: 0 };
  }

  // Questrade — two known formats:
  // 1. Activity export: has "transaction date", "action", "activity type"
  // 2. eConfirmation export: has "trade date", "trade #", "description", "action"
  if (
    (headers.includes('transaction date') || headers.includes('trade date')) &&
    headers.includes('action') &&
    (headers.includes('activity type') || headers.includes('trade #'))
  ) {
    return { format: 'questrade', headerLineIndex: 0 };
  }

  // Internal format
  if (headers.includes('entryprice') || (headers.includes('symbol') && headers.includes('date') && (headers.includes('type') || headers.includes('side')))) {
    return { format: 'internal', headerLineIndex: 0 };
  }

  return { format: 'unknown', headerLineIndex: 0 };
}

// ── Tradovate Parser ────────────────────────────────────────────

function parseTradovate(lines: string[]): ParseResult {
  const warnings: string[] = [];
  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const trades: Trade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    const getVal = makeGetVal(headers, row);

    const symbol = getVal(['symbol']);
    if (!symbol) continue;

    const boughtTs = getVal(['boughttimestamp']) || '';
    const soldTs = getVal(['soldtimestamp']) || '';
    const bought = parseTradovateTimestamp(boughtTs);
    const sold = parseTradovateTimestamp(soldTs);

    const boughtMs = new Date(`${bought.date}T${bought.time}`).getTime();
    const soldMs = new Date(`${sold.date}T${sold.time}`).getTime();
    const isLong = boughtMs <= soldMs;

    const buyPrice = parseFloat(getVal(['buyprice']) || '0');
    const sellPrice = parseFloat(getVal(['sellprice']) || '0');
    const entryPrice = isLong ? buyPrice : sellPrice;
    const exitPrice = isLong ? sellPrice : buyPrice;
    const entryTime = isLong ? bought.time : sold.time;
    const exitTime = isLong ? sold.time : bought.time;
    const date = isLong ? bought.date : sold.date;
    const pnlRaw = parseDollarPnl(getVal(['pnl']) || '');
    const qty = parseFloat(getVal(['qty', 'quantity']) || '0');
    const fees = parseDollarPnl(getVal(['fees', 'commission', 'commissions']) || '');

    const cleanSymbol = cleanFuturesSymbol(symbol);
    const multiplier = lookupFuturesMultiplier(cleanSymbol);

    const tradeId = generateTradeId('tv', date, cleanSymbol, entryTime, entryPrice, exitPrice);

    let pnl: number;
    if (multiplier) {
      const diff = isLong
        ? (exitPrice - entryPrice)
        : (entryPrice - exitPrice);
      pnl = parseFloat((diff * multiplier * qty).toFixed(2));
    } else {
      pnl = pnlRaw;
    }

    trades.push({
      id: tradeId,
      date,
      symbol: cleanSymbol,
      instrument: Instrument.FUTURE,
      type: isLong ? TradeType.LONG : TradeType.SHORT,
      status: TradeStatus.CLOSED,
      entryPrice,
      exitPrice,
      quantity: qty,
      pnl,
      fees: Math.abs(fees),
      entryTime,
      exitTime,
      emotionPre: Emotion.NEUTRAL,
      notes: '',
      setup: '',
      tags: ['tradovate'],
    });
  }

  return { format: 'tradovate', formatLabel: 'Tradovate', trades, warnings };
}

// ── Interactive Brokers Parser ──────────────────────────────────

function parseIBMultiSection(text: string, headerLineIndex: number): ParseResult {
  const warnings: string[] = [];
  const allLines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const trades: Trade[] = [];

  // Parse header row
  const headerCells = parseLine(allLines[headerLineIndex]);
  // Skip the first two cells ("Trades", "Header") to get actual column names
  const headers = headerCells.slice(2).map(h => h.trim().toLowerCase());

  // Collect data rows
  const dataRows: string[][] = [];
  for (let i = headerLineIndex + 1; i < allLines.length; i++) {
    const line = allLines[i];
    if (line.startsWith('Trades,Data,') || line.startsWith('"Trades","Data",')) {
      const cells = parseLine(line);
      dataRows.push(cells.slice(2)); // skip "Trades" and "Data"
    } else if (!line.startsWith('Trades,')) {
      break; // end of Trades section
    }
  }

  if (dataRows.length === 0) {
    warnings.push('No trade data rows found in the Trades section.');
    return { format: 'interactivebrokers', formatLabel: 'Interactive Brokers', trades, warnings };
  }

  const getIdx = (keys: string[]) => headers.findIndex(h => keys.includes(h));
  const discriminatorIdx = getIdx(['datadiscriminator']);
  const symbolIdx = getIdx(['symbol']);
  const dateTimeIdx = getIdx(['date/time']);
  const qtyIdx = getIdx(['quantity']);
  const priceIdx = getIdx(['t. price']);
  const commIdx = getIdx(['comm/fee']);
  const realizedPnlIdx = getIdx(['realized p&l']);
  const assetCatIdx = getIdx(['asset category']);
  const codeIdx = getIdx(['code']);

  // Check if we have round-trip Trade/ClosedLot rows or just Order rows
  const hasRoundTrips = dataRows.some(r => {
    const disc = discriminatorIdx >= 0 ? r[discriminatorIdx]?.trim().toLowerCase() : '';
    return disc === 'trade' || disc === 'closedlot';
  });

  if (hasRoundTrips) {
    // Each Trade/ClosedLot row is a complete round-trip
    for (const row of dataRows) {
      const disc = discriminatorIdx >= 0 ? row[discriminatorIdx]?.trim().toLowerCase() : '';
      if (disc !== 'trade' && disc !== 'closedlot') continue;

      const symbol = symbolIdx >= 0 ? row[symbolIdx]?.trim() : '';
      if (!symbol) continue;

      const dateTimeRaw = dateTimeIdx >= 0 ? row[dateTimeIdx]?.trim() : '';
      const { date, time } = parseIBDateTime(dateTimeRaw);

      const qty = qtyIdx >= 0 ? parseFloat(row[qtyIdx]?.trim() || '0') : 0;
      const price = priceIdx >= 0 ? parseFloat(row[priceIdx]?.trim() || '0') : 0;
      const comm = commIdx >= 0 ? parseFloat(row[commIdx]?.trim() || '0') : 0;
      const realizedPnl = realizedPnlIdx >= 0 ? parseFloat(row[realizedPnlIdx]?.trim() || '0') : 0;
      const assetCat = assetCatIdx >= 0 ? row[assetCatIdx]?.trim().toLowerCase() : '';

      // qty > 0 means closing a short (bought to close), qty < 0 means closing a long (sold to close)
      // But for Trade rows, qty sign indicates the trade direction
      const isLong = qty > 0;
      const instrument = mapIBAssetCategory(assetCat);
      const cleanSymbol = instrument === Instrument.FUTURE ? cleanFuturesSymbol(symbol) : symbol.toUpperCase();

      let pnl = realizedPnl;
      if (instrument === Instrument.FUTURE) {
        const multiplier = lookupFuturesMultiplier(cleanSymbol);
        if (multiplier && pnl === 0) {
          pnl = 0; // will be recalculated if we had entry/exit prices
        }
      }

      trades.push({
        id: generateTradeId('ib', date, cleanSymbol, time, price, qty),
        date,
        symbol: cleanSymbol,
        instrument,
        type: isLong ? TradeType.LONG : TradeType.SHORT,
        status: TradeStatus.CLOSED,
        entryPrice: price,
        exitPrice: price,
        quantity: Math.abs(qty),
        pnl,
        fees: Math.abs(comm),
        entryTime: time || undefined,
        exitTime: time || undefined,
        emotionPre: Emotion.NEUTRAL,
        notes: '',
        setup: '',
        tags: ['interactive-brokers'],
      });
    }
  } else {
    // Order rows — FIFO pair by symbol
    interface IBOrder {
      symbol: string;
      date: string;
      time: string;
      qty: number; // positive=buy, negative=sell
      price: number;
      comm: number;
      assetCat: string;
    }

    const orders: IBOrder[] = [];
    for (const row of dataRows) {
      const symbol = symbolIdx >= 0 ? row[symbolIdx]?.trim() : '';
      if (!symbol) continue;

      const dateTimeRaw = dateTimeIdx >= 0 ? row[dateTimeIdx]?.trim() : '';
      const { date, time } = parseIBDateTime(dateTimeRaw);
      const qty = qtyIdx >= 0 ? parseFloat(row[qtyIdx]?.trim() || '0') : 0;
      const price = priceIdx >= 0 ? parseFloat(row[priceIdx]?.trim() || '0') : 0;
      const comm = commIdx >= 0 ? parseFloat(row[commIdx]?.trim() || '0') : 0;
      const assetCat = assetCatIdx >= 0 ? row[assetCatIdx]?.trim().toLowerCase() : '';

      orders.push({ symbol, date, time, qty, price, comm, assetCat });
    }

    const paired = fifoMatchOrders(
      orders.map(o => ({
        symbol: o.symbol,
        date: o.date,
        time: o.time,
        qty: Math.abs(o.qty),
        price: o.price,
        comm: Math.abs(o.comm),
        isBuy: o.qty > 0,
        assetCat: o.assetCat,
      })),
      'ib',
      warnings
    );
    trades.push(...paired);
  }

  return { format: 'interactivebrokers', formatLabel: 'Interactive Brokers', trades, warnings };
}

function parseIBSimple(lines: string[]): ParseResult {
  const warnings: string[] = [];
  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const trades: Trade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    const getVal = makeGetVal(headers, row);

    const symbol = getVal(['symbol']);
    if (!symbol) continue;

    const dateTimeRaw = getVal(['date/time']) || '';
    const { date, time } = parseIBDateTime(dateTimeRaw);

    const qty = parseFloat(getVal(['quantity']) || '0');
    const price = parseFloat(getVal(['price', 't. price']) || '0');
    const realizedPnl = parseFloat(getVal(['realized p&l', 'realized pnl']) || '0');
    const comm = parseFloat(getVal(['commission', 'comm/fee']) || '0');

    const isLong = qty > 0;
    const cleanSymbol = symbol.toUpperCase();

    trades.push({
      id: generateTradeId('ib', date, cleanSymbol, time, price, qty),
      date,
      symbol: cleanSymbol,
      instrument: Instrument.STOCK,
      type: isLong ? TradeType.LONG : TradeType.SHORT,
      status: TradeStatus.CLOSED,
      entryPrice: price,
      exitPrice: price,
      quantity: Math.abs(qty),
      pnl: realizedPnl,
      fees: Math.abs(comm),
      entryTime: time || undefined,
      exitTime: time || undefined,
      emotionPre: Emotion.NEUTRAL,
      notes: '',
      setup: '',
      tags: ['interactive-brokers'],
    });
  }

  return { format: 'interactivebrokers', formatLabel: 'Interactive Brokers', trades, warnings };
}

function parseIBDateTime(raw: string): { date: string; time: string } {
  if (!raw) return { date: '', time: '' };
  // IB format: "YYYY-MM-DD, HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
  const cleaned = raw.replace(/"/g, '').trim();
  const parts = cleaned.split(/[,\s]+/).filter(Boolean);
  const date = parts[0] || '';
  const timeFull = parts[1] || '';
  const time = timeFull.substring(0, 5); // HH:MM
  return { date, time };
}

function mapIBAssetCategory(cat: string): Instrument {
  if (cat.includes('stock')) return Instrument.STOCK;
  if (cat.includes('future')) return Instrument.FUTURE;
  if (cat.includes('option')) return Instrument.OPTION;
  if (cat.includes('crypto')) return Instrument.CRYPTO;
  return Instrument.STOCK;
}

// ── Questrade Parser ────────────────────────────────────────────

// Parse Questrade date formats:
//  "DD-MM-YY"  e.g. "15-12-25" → "2025-12-15"
//  "YYYY-MM-DD" already correct
function parseQuestradeDate(s: string): string {
  const trimmed = s.trim();
  // DD-MM-YY format (eConfirmation export)
  const ddmmyy = trimmed.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (ddmmyy) {
    const [, dd, mm, yy] = ddmmyy;
    const yyyy = parseInt(yy) < 50 ? `20${yy}` : `19${yy}`;
    return `${yyyy}-${mm}-${dd}`;
  }
  // YYYY-MM-DD already fine
  return trimmed;
}

interface QTOptionInfo {
  underlying: string;     // e.g. "BTCC"
  optionType: 'CALL' | 'PUT';
  expiry: string;         // YYYY-MM-DD
  strike: number;
  contractKey: string;    // for FIFO grouping
}

// Format an ISO expiry date into a compact readable label e.g. "2026-01-16" → "Jan16'26"
export function formatOptionExpiry(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [yyyy, mm, dd] = parts;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthName = months[parseInt(mm, 10) - 1] ?? mm;
  return `${monthName}${parseInt(dd, 10)}'${yyyy.slice(2)}`;
}

// Build the display symbol for an option: e.g. "BTCC CALL 19.5 Jan16'26"
function formatOptionSymbol(info: QTOptionInfo): string {
  const strikeStr = info.strike % 1 === 0 ? info.strike.toString() : info.strike.toFixed(2).replace(/\.?0+$/, '');
  return `${info.underlying} ${info.optionType} ${strikeStr} ${formatOptionExpiry(info.expiry)}`;
}

// Parse option description: "CALL .BTCC 01/02/26 19.50, PURPOSE..." or "CALL NVDA 06/18/26 230, NVIDIA..."
function parseQTOptionDescription(description: string): QTOptionInfo | null {
  const firstPart = description.split(',')[0].trim();
  const tokens = firstPart.split(/\s+/);
  if (tokens.length < 4) return null;

  const optionType = tokens[0].toUpperCase();
  if (optionType !== 'CALL' && optionType !== 'PUT') return null;

  const underlying = tokens[1].replace(/^\./, '').toUpperCase(); // strip leading dot e.g. ".BTCC" → "BTCC"
  const expiryRaw = tokens[2]; // MM/DD/YY
  const strikeStr = tokens[3];
  const strike = parseFloat(strikeStr);
  if (isNaN(strike)) return null;

  // Parse MM/DD/YY expiry
  const exParts = expiryRaw.split('/');
  if (exParts.length !== 3) return null;
  const [exMm, exDd, exYy] = exParts;
  const exYear = parseInt(exYy) < 50 ? `20${exYy}` : `19${exYy}`;
  const expiry = `${exYear}-${exMm.padStart(2, '0')}-${exDd.padStart(2, '0')}`;

  return {
    underlying,
    optionType: optionType as 'CALL' | 'PUT',
    expiry,
    strike,
    contractKey: `${underlying}_${optionType}_${expiry}_${strike}`,
  };
}

function parseQuestrade(lines: string[]): ParseResult {
  const warnings: string[] = [];
  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const trades: Trade[] = [];

  interface QTOrderRow {
    contractKey: string;    // unique per option contract, or symbol for stocks
    displaySymbol: string;  // human-readable symbol shown in journal
    date: string;           // YYYY-MM-DD
    isBuy: boolean;
    qty: number;
    price: number;
    comm: number;
    netAmount: number;      // actual money flow (negative = paid, positive = received)
    isOption: boolean;
    description: string;
    optionInfo?: QTOptionInfo;
    tradeNum: string;       // Trade # from CSV, used to detect roll pairs
  }

  const rows: QTOrderRow[] = [];
  let skippedNonTrade = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    if (row.every(c => c.trim() === '')) continue;
    const getVal = makeGetVal(headers, row);

    // eConfirmation format has no "activity type" — all rows are trades
    const activityType = getVal(['activity type']) || '';
    if (activityType && activityType.toLowerCase() !== 'trades') {
      skippedNonTrade++;
      continue;
    }

    const action = (getVal(['action']) || '').trim().toLowerCase();
    if (!action || (action !== 'buy' && action !== 'sell')) continue;

    const dateRaw = getVal(['trade date', 'transaction date']) || '';
    const date = parseQuestradeDate(dateRaw);

    const qtyRaw = parseFloat(getVal(['quantity']) || '0');
    const price = parseFloat(getVal(['price']) || '0');
    const commRaw = parseDollarPnl(getVal(['comm', 'commission']) || '');
    const netAmountRaw = parseDollarPnl(getVal(['net amount', 'net amount (account currency)']) || '');

    // Symbol: may be empty for options — use Description to extract
    const symbolCol = (getVal(['symbol']) || '').trim().toUpperCase();
    const description = getVal(['description']) || '';

    const optionInfo = parseQTOptionDescription(description);

    let contractKey: string;
    let displaySymbol: string;
    let isOption = false;

    if (optionInfo) {
      contractKey = optionInfo.contractKey;
      displaySymbol = formatOptionSymbol(optionInfo); // e.g. "BTCC CALL 19.5 Jan16'26"
      isOption = true;
    } else if (symbolCol) {
      contractKey = symbolCol;
      displaySymbol = symbolCol;
    } else {
      // Can't identify — skip
      warnings.push(`Row ${i + 1} skipped: could not determine symbol from "${description}"`);
      continue;
    }

    const tradeNum = (getVal(['trade #', 'trade#', 'trade number']) || '').trim();

    rows.push({
      contractKey,
      displaySymbol,
      date,
      isBuy: action === 'buy',
      qty: Math.abs(qtyRaw),
      price,
      comm: Math.abs(commRaw),
      netAmount: netAmountRaw,
      isOption,
      description,
      optionInfo,
      tradeNum,
    });
  }

  if (skippedNonTrade > 0) {
    warnings.push(`${skippedNonTrade} non-trade rows skipped (dividends, deposits, etc.)`);
  }

  // FIFO pair by contractKey
  const byContract = new Map<string, QTOrderRow[]>();
  for (const r of rows) {
    const group = byContract.get(r.contractKey) || [];
    group.push(r);
    byContract.set(r.contractKey, group);
  }

  for (const [contractKey, orders] of byContract) {
    // Sort by date
    orders.sort((a, b) => a.date.localeCompare(b.date));

    const openQueue: QTOrderRow[] = [];

    for (const order of orders) {
      if (openQueue.length === 0 || openQueue[0].isBuy === order.isBuy) {
        openQueue.push(order);
        continue;
      }

      // Opposite side — FIFO match
      const opener = openQueue.shift()!;
      const isLong = opener.isBuy;
      const qty = Math.min(opener.qty, order.qty);
      const totalFees = opener.comm + order.comm;

      // PnL from net amounts — most accurate as it accounts for option multiplier
      // opener.netAmount is negative (paid), order.netAmount is positive (received) for a short
      // For a long: opener is negative, order is positive
      const pnl = parseFloat((opener.netAmount + order.netAmount).toFixed(2));

      const instrument = opener.isOption ? Instrument.OPTION : Instrument.STOCK;
      const optType = opener.isOption ? opener.optionInfo?.optionType : undefined;

      trades.push({
        id: generateTradeId('qt', opener.date, contractKey, opener.price, order.price),
        date: opener.date,
        symbol: opener.displaySymbol,
        instrument,
        optionType: optType,
        type: isLong ? TradeType.LONG : TradeType.SHORT,
        status: TradeStatus.CLOSED,
        entryPrice: opener.price,
        exitPrice: order.price,
        quantity: qty,
        pnl,
        fees: totalFees,
        entryTime: undefined,
        exitTime: undefined,
        emotionPre: Emotion.NEUTRAL,
        notes: '',
        setup: '',
        tags: ['questrade'],
      });

      // Handle partial fills
      const remainOpener = opener.qty - qty;
      const remainCloser = order.qty - qty;
      if (remainOpener > 0) {
        openQueue.unshift({ ...opener, qty: remainOpener, comm: 0, netAmount: 0 });
      }
      if (remainCloser > 0) {
        openQueue.push({ ...order, qty: remainCloser, comm: 0, netAmount: 0 });
      }
    }

    // Unmatched rows → OPEN trades
    for (const orphan of openQueue) {
      const instrument = orphan.isOption ? Instrument.OPTION : Instrument.STOCK;
      const optType = orphan.isOption ? orphan.optionInfo?.optionType : undefined;

      trades.push({
        id: generateTradeId('qt', orphan.date, contractKey, orphan.price, 'open'),
        date: orphan.date,
        symbol: orphan.displaySymbol,
        instrument,
        optionType: optType,
        type: orphan.isBuy ? TradeType.LONG : TradeType.SHORT,
        status: TradeStatus.OPEN,
        entryPrice: orphan.price,
        quantity: orphan.qty,
        fees: orphan.comm,
        emotionPre: Emotion.NEUTRAL,
        notes: '',
        setup: '',
        tags: ['questrade'],
      });
      warnings.push(`${orphan.displaySymbol}: unmatched ${orphan.isBuy ? 'buy' : 'sell'} (${orphan.qty} on ${orphan.date}) — imported as OPEN`);
    }
  }

  // ── Roll Detection Pass ──────────────────────────────────────────
  // Two option rows with the same Trade # + same underlying + same optionType + different expiry = a roll.
  const byTradeNum = new Map<string, QTOrderRow[]>();
  for (const r of rows) {
    if (!r.tradeNum || !r.isOption) continue;
    const g = byTradeNum.get(r.tradeNum) ?? [];
    g.push(r);
    byTradeNum.set(r.tradeNum, g);
  }

  for (const [tradeNum, group] of byTradeNum) {
    if (group.length !== 2) continue;
    const buyer  = group.find(r =>  r.isBuy);
    const seller = group.find(r => !r.isBuy);
    if (!buyer || !seller) continue;
    const bi = buyer.optionInfo;
    const si = seller.optionInfo;
    if (!bi || !si) continue;
    if (bi.underlying !== si.underlying || bi.optionType !== si.optionType) continue;
    if (bi.expiry === si.expiry) continue; // same expiry = not a roll

    // Find the matched trades in the output array
    const closerTrade = trades.find(t => t.symbol === buyer.displaySymbol && t.date === buyer.date);
    const openerTrade = trades.find(t => t.symbol === seller.displaySymbol && t.date === seller.date
      && t.status === TradeStatus.OPEN);
    if (!closerTrade || !openerTrade) continue;

    const seriesId   = `series-qt-${tradeNum}`;
    const rollCredit = parseFloat((buyer.netAmount + seller.netAmount).toFixed(2));
    const creditStr  = `${rollCredit >= 0 ? '+' : ''}$${Math.abs(rollCredit).toFixed(2)}`;

    (closerTrade as any).status       = TradeStatus.ROLLED;
    (closerTrade as any).rollCredit   = rollCredit;
    (closerTrade as any).rollSeriesId = seriesId;
    (closerTrade as any).rollNextId   = openerTrade.id;
    (openerTrade as any).rollSeriesId = seriesId;
    (openerTrade as any).rollPrevId   = closerTrade.id;

    warnings.push(
      `Roll detected (Trade #${tradeNum}): ${buyer.displaySymbol} → ${seller.displaySymbol}, credit: ${creditStr}`
    );
  }

  return { format: 'questrade', formatLabel: 'Questrade', trades, warnings };
}

// ── FIFO Order Matching (shared by IB orders & Questrade) ───────

interface MatchableOrder {
  symbol: string;
  date: string;
  time: string;
  qty: number;
  price: number;
  comm: number;
  isBuy: boolean;
  assetCat: string;
}

function fifoMatchOrders(orders: MatchableOrder[], idPrefix: string, warnings: string[]): Trade[] {
  const trades: Trade[] = [];

  // Group by symbol
  const bySymbol = new Map<string, MatchableOrder[]>();
  for (const order of orders) {
    const group = bySymbol.get(order.symbol) || [];
    group.push(order);
    bySymbol.set(order.symbol, group);
  }

  for (const [symbol, symbolOrders] of bySymbol) {
    // Sort by date then time
    symbolOrders.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.time.localeCompare(b.time);
    });

    const openQueue: MatchableOrder[] = [];

    for (const order of symbolOrders) {
      // If openQueue is empty or same side as first in queue, push to queue
      if (openQueue.length === 0 || openQueue[0].isBuy === order.isBuy) {
        openQueue.push(order);
        continue;
      }

      // Opposite side — match FIFO
      const opener = openQueue.shift()!;
      const isLong = opener.isBuy;

      const entryPrice = opener.price;
      const exitPrice = order.price;
      const qty = Math.min(opener.qty, order.qty);
      const totalFees = opener.comm + order.comm;

      const instrument = mapAssetCatString(opener.assetCat);
      const cleanSymbol = instrument === Instrument.FUTURE ? cleanFuturesSymbol(symbol) : symbol;

      let pnl: number;
      if (instrument === Instrument.FUTURE) {
        const multiplier = lookupFuturesMultiplier(cleanSymbol);
        if (multiplier) {
          const diff = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
          pnl = parseFloat((diff * multiplier * qty).toFixed(2));
        } else {
          const diff = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
          pnl = parseFloat((diff * qty).toFixed(2));
        }
      } else {
        const diff = isLong ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
        pnl = parseFloat((diff * qty).toFixed(2));
      }

      trades.push({
        id: generateTradeId(idPrefix, opener.date, cleanSymbol, opener.time, entryPrice, exitPrice),
        date: opener.date,
        symbol: cleanSymbol,
        instrument,
        type: isLong ? TradeType.LONG : TradeType.SHORT,
        status: TradeStatus.CLOSED,
        entryPrice,
        exitPrice,
        quantity: qty,
        pnl,
        fees: totalFees,
        entryTime: opener.time || undefined,
        exitTime: order.time || undefined,
        emotionPre: Emotion.NEUTRAL,
        notes: '',
        setup: '',
        tags: [idPrefix === 'ib' ? 'interactive-brokers' : 'questrade'],
      });

      // Handle partial fills — put remainder back
      const remainOpener = opener.qty - qty;
      const remainCloser = order.qty - qty;
      if (remainOpener > 0) {
        openQueue.unshift({ ...opener, qty: remainOpener, comm: 0 });
      }
      if (remainCloser > 0) {
        // Treat the remainder as a new order to match next
        openQueue.push({ ...order, qty: remainCloser, comm: 0, isBuy: order.isBuy });
      }
    }

    // Unmatched orders become OPEN trades
    for (const orphan of openQueue) {
      const instrument = mapAssetCatString(orphan.assetCat);
      const cleanSymbol = instrument === Instrument.FUTURE ? cleanFuturesSymbol(symbol) : symbol;

      trades.push({
        id: generateTradeId(idPrefix, orphan.date, cleanSymbol, orphan.time, orphan.price, 'open'),
        date: orphan.date,
        symbol: cleanSymbol,
        instrument,
        type: orphan.isBuy ? TradeType.LONG : TradeType.SHORT,
        status: TradeStatus.OPEN,
        entryPrice: orphan.price,
        quantity: orphan.qty,
        fees: orphan.comm,
        emotionPre: Emotion.NEUTRAL,
        notes: '',
        setup: '',
        tags: [idPrefix === 'ib' ? 'interactive-brokers' : 'questrade'],
      });
      warnings.push(`${symbol}: unmatched ${orphan.isBuy ? 'buy' : 'sell'} order (${orphan.qty} shares on ${orphan.date}) imported as OPEN`);
    }
  }

  return trades;
}

function mapAssetCatString(cat: string): Instrument {
  if (cat.includes('future')) return Instrument.FUTURE;
  if (cat.includes('option')) return Instrument.OPTION;
  if (cat.includes('crypto')) return Instrument.CRYPTO;
  return Instrument.STOCK;
}

// ── Internal Format Parser ──────────────────────────────────────

function parseInternal(lines: string[]): ParseResult {
  const warnings: string[] = [];
  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const trades: Trade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    const getVal = makeGetVal(headers, row);

    const symbol = getVal(['symbol']);
    if (!symbol) continue;

    const date = getVal(['date']) || new Date().toISOString().slice(0, 10);
    const sideStr = getVal(['side', 'type'])?.toUpperCase();
    const type = sideStr === 'SHORT' ? TradeType.SHORT : TradeType.LONG;
    const quantity = parseFloat(getVal(['qty', 'quantity']) || '0');
    const entryPrice = parseFloat(getVal(['entry', 'entryprice']) || '0');
    const exitStr = getVal(['exit', 'exitprice']);
    const exitPrice = exitStr ? parseFloat(exitStr) : undefined;
    const stopStr = getVal(['stop', 'stoploss']);
    const stopLoss = stopStr ? parseFloat(stopStr) : undefined;
    const pnlStr = getVal(['pnl']);
    const pnl = pnlStr ? parseFloat(pnlStr) : undefined;
    const feesStr = getVal(['fees', 'commission', 'commissions']);
    const fees = feesStr ? parseFloat(feesStr) : undefined;
    const rStr = getVal(['r']);
    let r = rStr ? parseFloat(rStr) : undefined;
    const entryTime = getVal(['entrytime', 'time']);
    const exitTime = getVal(['exittime']);
    const setup = getVal(['setup']) || '';
    const emotionStr = getVal(['emotionpre', 'emotion']);
    const emotionPre = Object.values(Emotion).includes(emotionStr as Emotion)
      ? (emotionStr as Emotion) : Emotion.NEUTRAL;
    const rawNotes = getVal(['notes']) || '';
    const tagsStr = getVal(['tags']);
    const tags = tagsStr ? tagsStr.split(';').map(t => t.trim()).filter(Boolean) : undefined;
    const notes = rawNotes;
    const mistakesStr = getVal(['mistakes']);
    const mistakes = mistakesStr ? mistakesStr.split(';').map(m => m.trim()) : undefined;
    const playbookId = getVal(['playbookid', 'playbook']);
    const instrumentStr = getVal(['instrument']);
    const instrument = instrumentStr
      ? (Object.values(Instrument).find(v => v.toLowerCase() === instrumentStr.toLowerCase()) || undefined)
      : undefined;
    const accountId = getVal(['accountid']) || undefined;

    let status = TradeStatus.OPEN;
    const statusVal = getVal(['status'])?.toUpperCase();
    if (statusVal === 'CLOSED' || statusVal === 'OPEN' || statusVal === 'BE') {
      status = statusVal as TradeStatus;
    } else if (exitPrice !== undefined || pnl !== undefined) {
      status = TradeStatus.CLOSED;
    }

    if (r === undefined && entryPrice && stopLoss && exitPrice) {
      const risk = Math.abs(entryPrice - stopLoss);
      const reward = type === TradeType.LONG ? exitPrice - entryPrice : entryPrice - exitPrice;
      if (risk > 0) r = parseFloat((reward / risk).toFixed(2));
    }

    trades.push({
      id: getVal(['id']) || (Date.now() + i).toString(),
      accountId,
      date,
      symbol: symbol.toUpperCase(),
      instrument,
      type,
      status,
      entryPrice,
      exitPrice,
      stopLoss,
      quantity,
      pnl,
      fees,
      r,
      entryTime,
      exitTime,
      setup,
      playbookId,
      mistakes,
      emotionPre,
      notes,
      tags,
    });
  }

  return { format: 'internal', formatLabel: 'MindfulTrader', trades, warnings };
}

// ── Merge duplicate trades ───────────────────────────────────────
// If two parsed trades share the same symbol + date + entryTime + entryPrice + type
// they are treated as partial fills of one order and merged into a single trade.
// Quantities sum; PnL and fees sum; exitPrice is quantity-weighted average.

function mergeDuplicateTrades(trades: Trade[], warnings: string[]): Trade[] {
  const groups = new Map<string, Trade[]>();

  for (const t of trades) {
    // Normalise entryTime: strip seconds so "09:30:00" and "09:30" match
    const time = (t.entryTime ?? '').slice(0, 5);
    const key = [
      t.symbol?.toUpperCase() ?? '',
      t.date ?? '',
      time,
      String(t.entryPrice ?? ''),
      t.type ?? '',
    ].join('|');

    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
  }

  const merged: Trade[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // Base fields come from the first trade
    const base = { ...group[0] };
    let totalQty = 0;
    let totalPnl = 0;
    let totalFees = 0;
    let exitPriceWeightedSum = 0;
    let hasPnl = false;

    for (const t of group) {
      const qty = t.quantity ?? 0;
      totalQty += qty;
      if (t.pnl != null) { totalPnl += t.pnl; hasPnl = true; }
      if (t.fees != null) totalFees += t.fees;
      if (t.exitPrice != null) exitPriceWeightedSum += t.exitPrice * qty;
    }

    base.quantity = totalQty;
    base.fees = parseFloat(totalFees.toFixed(2));
    if (hasPnl) base.pnl = parseFloat(totalPnl.toFixed(2));
    if (totalQty > 0 && exitPriceWeightedSum > 0) {
      base.exitPrice = parseFloat((exitPriceWeightedSum / totalQty).toFixed(4));
    }

    warnings.push(
      `Merged ${group.length} fills into one trade: ${base.symbol} ${base.type} ` +
      `on ${base.date}${base.entryTime ? ' @' + base.entryTime : ''} ` +
      `(qty ${totalQty}${hasPnl ? `, P&L $${base.pnl}` : ''})`
    );

    merged.push(base);
  }

  return merged;
}

// ── Main Entry Point ────────────────────────────────────────────

export function parseCSV(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) {
    return { format: 'unknown', formatLabel: 'Unknown', trades: [], warnings: ['File is empty or has no data rows.'] };
  }

  const { format, headerLineIndex } = detectFormat(text);

  let result: ParseResult;
  switch (format) {
    case 'tradovate':
      result = parseTradovate(lines); break;
    case 'interactivebrokers':
      result = headerLineIndex > 0
        ? parseIBMultiSection(text, headerLineIndex)
        : parseIBSimple(lines);
      break;
    case 'questrade':
      result = parseQuestrade(lines); break;
    case 'internal':
      result = parseInternal(lines); break;
    default:
      return { format: 'unknown', formatLabel: 'Unknown', trades: [], warnings: [] };
  }

  // Merge partial fills that share the same symbol + date + time + price + direction
  result.trades = mergeDuplicateTrades(result.trades, result.warnings);
  return result;
}
