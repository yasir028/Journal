// reportService.ts — Browser-side .docx report generator for MindfulTrader
// Install: npm install docx file-saver
// Install types: npm install -D @types/file-saver

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, TabStopType, TabStopPosition,
} from 'docx';
import { saveAs } from 'file-saver';
import { Trade, DailyAnalysis, DailyReview, TradeStatus, TradeType } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface ReportConfig {
  period: ReportPeriod;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  trades: Trade[];
  dailyAnalysis: DailyAnalysis;
  dailyReviews: DailyReview;
}

interface DayData {
  date: string;
  trades: Trade[];
  preMarket: string | null;
  postReview: string | null;
  stats: {
    totalTrades: number;
    winners: number;
    losers: number;
    netPnl: number;
    winRate: number;
    totalFees: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strip HTML tags from TipTap rich text, keeping readable plain text */
function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  • ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getPeriodLabel(config: ReportConfig): string {
  if (config.period === 'daily') return formatDate(config.startDate);
  return `${formatDateShort(config.startDate)} – ${formatDateShort(config.endDate)}`;
}

// ── Styling Constants ──────────────────────────────────────────────────────────

const COLORS = {
  primary: '1E3A5F',
  primaryLight: 'E8EFF7',
  success: '16A34A',
  successBg: 'DCFCE7',
  danger: 'DC2626',
  dangerBg: 'FEE2E2',
  headerBg: '1E3A5F',
  headerText: 'FFFFFF',
  rowAlt: 'F8FAFC',
  border: 'D1D5DB',
  textMuted: '6B7280',
  text: '1F2937',
};

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: COLORS.border };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const CELL_MARGINS = { top: 60, bottom: 60, left: 100, right: 100 };

// Full page content width: US Letter (8.5") - 1" margins each side = 6.5" = 9360 DXA
const CONTENT_WIDTH = 9360;

// ── Day Data Aggregation ───────────────────────────────────────────────────────

function buildDayData(config: ReportConfig): DayData[] {
  const { trades, dailyAnalysis, dailyReviews, startDate, endDate } = config;

  // Collect all unique dates in range
  const allDates = new Set<string>();
  trades.forEach(t => {
    if (t.date >= startDate && t.date <= endDate) allDates.add(t.date);
  });
  Object.keys(dailyAnalysis).forEach(d => {
    if (d >= startDate && d <= endDate) allDates.add(d);
  });
  Object.keys(dailyReviews).forEach(d => {
    if (d >= startDate && d <= endDate) allDates.add(d);
  });

  const sortedDates = Array.from(allDates).sort();

  return sortedDates.map(date => {
    const dayTrades = trades
      .filter(t => t.date === date && t.status === TradeStatus.CLOSED)
      .sort((a, b) => (a.entryTime || '').localeCompare(b.entryTime || ''));
    const winners = dayTrades.filter(t => (t.pnl || 0) > 0).length;
    const losers = dayTrades.filter(t => (t.pnl || 0) <= 0).length;
    const netPnl = dayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const totalFees = dayTrades.reduce((s, t) => s + (t.fees || 0), 0);

    return {
      date,
      trades: dayTrades,
      preMarket: dailyAnalysis[date] ? stripHtml(dailyAnalysis[date]) : null,
      postReview: dailyReviews[date] ? stripHtml(dailyReviews[date]) : null,
      stats: {
        totalTrades: dayTrades.length,
        winners,
        losers,
        netPnl,
        winRate: dayTrades.length > 0 ? (winners / dayTrades.length) * 100 : 0,
        totalFees,
      },
    };
  });
}

// ── Document Builders ──────────────────────────────────────────────────────────

function buildSummarySection(days: DayData[], config: ReportConfig): Paragraph[] {
  const allTrades = days.flatMap(d => d.trades);
  const totalPnl = allTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const totalFees = allTrades.reduce((s, t) => s + (t.fees || 0), 0);
  const winners = allTrades.filter(t => (t.pnl || 0) > 0).length;
  const totalTrades = allTrades.length;
  const winRate = totalTrades > 0 ? ((winners / totalTrades) * 100).toFixed(1) : '0';
  const tradingDays = days.filter(d => d.trades.length > 0).length;
  const greenDays = days.filter(d => d.stats.netPnl > 0).length;
  const redDays = days.filter(d => d.stats.netPnl < 0 && d.trades.length > 0).length;

  // Emotion breakdown
  const emotionCounts: Record<string, number> = {};
  allTrades.forEach(t => {
    if (t.emotionPre) emotionCounts[t.emotionPre] = (emotionCounts[t.emotionPre] || 0) + 1;
  });
  const topEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0];

  // Mistake breakdown
  const mistakeCounts: Record<string, number> = {};
  allTrades.forEach(t => {
    t.mistakes?.forEach(m => { mistakeCounts[m] = (mistakeCounts[m] || 0) + 1; });
  });
  const topMistake = Object.entries(mistakeCounts).sort((a, b) => b[1] - a[1])[0];

  const paragraphs: Paragraph[] = [];

  // Summary stats as a mini table
  const statPairs: [string, string][] = [
    ['Total Trades', `${totalTrades}`],
    ['Win Rate', `${winRate}%`],
    ['Net P&L', `$${totalPnl.toFixed(2)}`],
    ['Total Fees', `$${totalFees.toFixed(2)}`],
    ['Trading Days', `${tradingDays} (${greenDays} green / ${redDays} red)`],
    ['Most Common Emotion', topEmotion ? `${topEmotion[0]} (${topEmotion[1]}x)` : 'N/A'],
    ['Most Common Mistake', topMistake ? `${topMistake[0]} (${topMistake[1]}x)` : 'None'],
  ];

  const colWidths = [3800, 5560]; // sum = 9360

  paragraphs.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Summary', color: COLORS.primary })],
    })
  );

  paragraphs.push(
    new Paragraph({ children: [] }) // spacer
  );

  // Build summary table
  const summaryRows = statPairs.map(([label, value], i) =>
    new TableRow({
      children: [
        new TableCell({
          borders: BORDERS,
          width: { size: colWidths[0], type: WidthType.DXA },
          margins: CELL_MARGINS,
          shading: { fill: i % 2 === 0 ? COLORS.primaryLight : 'FFFFFF', type: ShadingType.CLEAR },
          children: [new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 20, font: 'Arial', color: COLORS.text })],
          })],
        }),
        new TableCell({
          borders: BORDERS,
          width: { size: colWidths[1], type: WidthType.DXA },
          margins: CELL_MARGINS,
          shading: { fill: i % 2 === 0 ? COLORS.primaryLight : 'FFFFFF', type: ShadingType.CLEAR },
          children: [new Paragraph({
            children: [new TextRun({
              text: value,
              size: 20,
              font: 'Arial',
              color: label === 'Net P&L' ? (totalPnl >= 0 ? COLORS.success : COLORS.danger) : COLORS.text,
              bold: label === 'Net P&L',
            })],
          })],
        }),
      ],
    })
  );

  paragraphs.push(
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: colWidths,
      rows: summaryRows,
    }) as unknown as Paragraph // docx type workaround — Table is a valid section child
  );

  paragraphs.push(new Paragraph({ children: [] })); // spacer

  return paragraphs;
}


function buildTradeTable(trades: Trade[]): Table {
  // Columns: Symbol | Type | Entry | Exit | Qty | P&L | Setup | Emotion
  const colWidths = [1000, 700, 900, 900, 650, 1000, 1200, 1200]; // sum ≈ 7550
  // Adjusted to fit: let's use narrower
  const cols = [1050, 700, 1000, 1000, 700, 1100, 1800, 2010]; // sum = 9360

  const headerLabels = ['Symbol', 'Type', 'Entry', 'Exit', 'Qty', 'P&L', 'Setup', 'Emotion'];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerLabels.map((label, i) =>
      new TableCell({
        borders: BORDERS,
        width: { size: cols[i], type: WidthType.DXA },
        margins: CELL_MARGINS,
        shading: { fill: COLORS.headerBg, type: ShadingType.CLEAR },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: label, bold: true, size: 18, font: 'Arial', color: COLORS.headerText })],
        })],
      })
    ),
  });

  const dataRows = trades.map((t, idx) => {
    const pnl = t.pnl || 0;
    const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
    const rowFill = idx % 2 === 0 ? 'FFFFFF' : COLORS.rowAlt;

    const cellValues = [
      t.symbol,
      t.type,
      `$${t.entryPrice}`,
      t.exitPrice != null ? `$${t.exitPrice}` : '—',
      `${t.quantity}`,
      pnlStr,
      t.setup || '—',
      t.emotionPre || '—',
    ];

    return new TableRow({
      children: cellValues.map((val, i) =>
        new TableCell({
          borders: BORDERS,
          width: { size: cols[i], type: WidthType.DXA },
          margins: CELL_MARGINS,
          shading: { fill: rowFill, type: ShadingType.CLEAR },
          children: [new Paragraph({
            alignment: i >= 2 && i <= 5 ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({
              text: val,
              size: 18,
              font: 'Arial',
              color: i === 5 ? (pnl >= 0 ? COLORS.success : COLORS.danger) : COLORS.text,
              bold: i === 5,
            })],
          })],
        })
      ),
    });
  });

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: cols,
    rows: [headerRow, ...dataRows],
  });
}


function buildTradeNotes(trades: Trade[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const tradesWithNotes = trades.filter(t => t.notes?.trim() || (t.mistakes && t.mistakes.length > 0));

  if (tradesWithNotes.length === 0) return paragraphs;

  paragraphs.push(
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [new TextRun({ text: 'Trade Notes & Mistakes', bold: true, size: 20, font: 'Arial', color: COLORS.primary, italics: true })],
    })
  );

  tradesWithNotes.forEach(t => {
    const parts: TextRun[] = [
      new TextRun({ text: `${t.symbol} (${t.type})`, bold: true, size: 18, font: 'Arial', color: COLORS.text }),
    ];
    if (t.notes?.trim()) {
      parts.push(new TextRun({ text: ` — ${t.notes.trim()}`, size: 18, font: 'Arial', color: COLORS.text }));
    }
    if (t.mistakes && t.mistakes.length > 0) {
      parts.push(new TextRun({ text: `  [Mistakes: ${t.mistakes.join(', ')}]`, size: 18, font: 'Arial', color: COLORS.danger, italics: true }));
    }
    paragraphs.push(new Paragraph({ spacing: { after: 60 }, children: parts }));
  });

  return paragraphs;
}


function buildDaySection(day: DayData, isFirst: boolean): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Page break between days (not before the first one)
  if (!isFirst) {
    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Day heading with P&L
  const pnlStr = `${day.stats.netPnl >= 0 ? '+' : ''}$${day.stats.netPnl.toFixed(2)}`;
  paragraphs.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({ text: formatDate(day.date), color: COLORS.primary }),
      ],
    })
  );

  // Day stats line
  const statsLine = `${day.stats.totalTrades} trades  |  ${day.stats.winners}W / ${day.stats.losers}L  |  Win Rate: ${day.stats.winRate.toFixed(0)}%  |  Net P&L: ${pnlStr}`;
  paragraphs.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({
        text: statsLine,
        size: 20,
        font: 'Arial',
        color: COLORS.textMuted,
      })],
    })
  );

  // Pre-market analysis
  if (day.preMarket) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: 'Pre-Market Analysis', bold: true, size: 22, font: 'Arial', color: COLORS.primary })],
      })
    );
    // Split by newlines and create separate paragraphs
    day.preMarket.split('\n').filter(l => l.trim()).forEach(line => {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: line.trim(), size: 20, font: 'Arial', color: COLORS.text })],
        })
      );
    });
    paragraphs.push(new Paragraph({ children: [] })); // spacer
  }

  // Trade table
  if (day.trades.length > 0) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 120, after: 100 },
        children: [new TextRun({ text: 'Trades', bold: true, size: 22, font: 'Arial', color: COLORS.primary })],
      })
    );
    paragraphs.push(buildTradeTable(day.trades) as unknown as Paragraph);
    paragraphs.push(...buildTradeNotes(day.trades));
    paragraphs.push(new Paragraph({ children: [] })); // spacer
  } else {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 100, after: 100 },
        children: [new TextRun({ text: 'No trades recorded for this day.', size: 20, font: 'Arial', color: COLORS.textMuted, italics: true })],
      })
    );
  }

  // Post-market review
  if (day.postReview) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [new TextRun({ text: 'End-of-Day Review', bold: true, size: 22, font: 'Arial', color: COLORS.primary })],
      })
    );
    day.postReview.split('\n').filter(l => l.trim()).forEach(line => {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: line.trim(), size: 20, font: 'Arial', color: COLORS.text })],
        })
      );
    });
  }

  return paragraphs;
}

// ── Main Generator ─────────────────────────────────────────────────────────────

export async function generateReport(config: ReportConfig): Promise<void> {
  const days = buildDayData(config);

  if (days.length === 0) {
    throw new Error('No data found for the selected period.');
  }

  const periodLabel = getPeriodLabel(config);
  const periodTypeLabel = config.period === 'daily' ? 'Daily' : config.period === 'weekly' ? 'Weekly' : config.period === 'monthly' ? 'Monthly' : 'Custom';
  const fileName = `MindfulTrader_${periodTypeLabel}_Report_${config.startDate}${config.period !== 'daily' ? `_to_${config.endDate}` : ''}.docx`;

  // Build all day sections
  const daySections = days.flatMap((day, i) => buildDaySection(day, i === 0));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 36, bold: true, font: 'Arial', color: COLORS.primary },
          paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, font: 'Arial', color: COLORS.primary },
          paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.primary, space: 4 } },
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                children: [
                  new TextRun({ text: 'MindfulTrader', bold: true, size: 18, font: 'Arial', color: COLORS.primary }),
                  new TextRun({ text: `\t${periodTypeLabel} Report`, size: 18, font: 'Arial', color: COLORS.textMuted }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border, space: 4 } },
                tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
                children: [
                  new TextRun({ text: `Generated ${new Date().toLocaleDateString()}`, size: 16, font: 'Arial', color: COLORS.textMuted }),
                  new TextRun({ text: '\tPage ', size: 16, font: 'Arial', color: COLORS.textMuted }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: COLORS.textMuted }),
                ],
              }),
            ],
          }),
        },
        children: [
          // Title
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: `${periodTypeLabel} Trading Report` })],
          }),
          // Period subtitle
          new Paragraph({
            spacing: { after: 300 },
            children: [new TextRun({ text: periodLabel, size: 24, font: 'Arial', color: COLORS.textMuted })],
          }),

          // Summary
          ...buildSummarySection(days, config),

          // Horizontal rule before day details
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.primary, space: 4 } },
            spacing: { after: 200 },
            children: [],
          }),

          // Day-by-day breakdown heading
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Day-by-Day Breakdown', color: COLORS.primary })],
          }),
          new Paragraph({ children: [] }),

          // All days
          ...daySections,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
}


// ── Period Helpers (used by UI component) ──────────────────────────────────────

export function getDateRange(period: ReportPeriod, referenceDate: string = new Date().toISOString().split('T')[0]): { startDate: string; endDate: string } {
  const ref = new Date(referenceDate + 'T12:00:00');

  switch (period) {
    case 'daily':
      return { startDate: referenceDate, endDate: referenceDate };

    case 'weekly': {
      const start = new Date(ref);
      start.setDate(ref.getDate() - 6);
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: referenceDate,
      };
    }

    case 'monthly': {
      const start = new Date(ref);
      start.setDate(1); // first of current month
      return {
        startDate: start.toISOString().split('T')[0],
        endDate: referenceDate,
      };
    }

    case 'custom':
    default:
      return { startDate: referenceDate, endDate: referenceDate };
  }
}
