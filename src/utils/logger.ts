/**
 * GeoLeads — Production-Grade CLI Logger
 *
 * Cybersec/ethical-hacking-tool-inspired output system.
 * Zero additional dependencies — uses raw ANSI escape codes.
 *
 * Features:
 *   • Large ASCII-art banner with session metadata
 *   • Timestamped log lines with colored severity badges
 *   • Inline progress bars (█░ blocks)
 *   • Structured config tables and section headers
 *   • Summary panels with stats
 *
 * @author  Naseem Ansari (Gitnaseem745)
 */

import path from 'path';
import type { Business } from '../types';

// ── ANSI Escape Codes ──────────────────────────────────────────────
const C = {
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',
  italic:    '\x1b[3m',
  under:     '\x1b[4m',
  // Foreground
  red:       '\x1b[31m',
  green:     '\x1b[32m',
  yellow:    '\x1b[33m',
  blue:      '\x1b[34m',
  magenta:   '\x1b[35m',
  cyan:      '\x1b[36m',
  white:     '\x1b[37m',
  gray:      '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightCyan:   '\x1b[96m',
  brightWhite:  '\x1b[97m',
  // Background
  bgRed:     '\x1b[41m',
  bgGreen:   '\x1b[42m',
  bgYellow:  '\x1b[43m',
  bgBlue:    '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan:    '\x1b[46m',
};

// ── Status tracking ───────────────────────────────────────────────
let _statusActive = false;

// ── Helpers ────────────────────────────────────────────────────────

/** ISO timestamp: YYYY-MM-DD HH:MM:SS */
function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** Right-pad a string */
function pad(str: string, len: number): string {
  return String(str).padEnd(len);
}

/** Horizontal rule */
function hrLine(char = '─', len = 62): string {
  return `${C.dim}${char.repeat(len)}${C.reset}`;
}

/** Format milliseconds to human-readable */
function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

/** Format bytes to human-readable */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Package version (read once at import time) ─────────────────────
let _cachedVersion = '1.3.1';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require(path.resolve(__dirname, '../../package.json'));
  if (pkg?.version) _cachedVersion = pkg.version;
} catch { /* fallback to hardcoded */ }

// ══════════════════════════════════════════════════════════════════
//  BANNER
// ══════════════════════════════════════════════════════════════════

/** Clear any active status spinner line before printing a normal log */
function clearStatus(): void {
  if (_statusActive) {
    process.stdout.write('\r\x1b[K');
    _statusActive = false;
  }
}

/** Small async delay for smooth CLI output */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function banner(): void {
  const v = _cachedVersion;
  const now = timestamp();
  const pid = process.pid;
  const platform = `${process.platform} (${process.arch})`;
  const nodeVer = process.version;

  const art = `
${C.cyan}${C.bold}  ╔═══════════════════════════════════════════════════════════════════════╗
  ║                                                                       ║
  ║   ██████╗ ███████╗ ██████╗ ██╗     ███████╗ █████╗ ██████╗ ███████╗   ║
  ║  ██╔════╝ ██╔════╝██╔═══██╗██║     ██╔════╝██╔══██╗██╔══██╗██╔════╝   ║
  ║  ██║  ███╗█████╗  ██║   ██║██║     █████╗  ███████║██║  ██║███████╗   ║
  ║  ██║   ██║██╔══╝  ██║   ██║██║     ██╔══╝  ██╔══██║██║  ██║╚════██║   ║
  ║  ╚██████╔╝███████╗╚██████╔╝███████╗███████╗██║  ██║██████╔╝███████║   ║
  ║   ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝   ║
  ║                                                                       ║
  ║${C.reset}${C.cyan}  Google Maps Business Intelligence Engine                             ${C.bold}║
  ╚═══════════════════════════════════════════════════════════════════════╝${C.reset}`;

  console.log(art);
  console.log();

  // ── Info box with dynamically computed column width ──
  const rows: [string, string][] = [
    ['Version',  `v${v}`],
    ['Author',   'Naseem Ansari (Gitnaseem745)'],
    ['License',  'MIT'],
    ['Engine',   'Puppeteer + Stealth Plugin'],
    ['Runtime',  `Node ${nodeVer}`],
    ['Platform', platform],
    ['PID',      String(pid)],
    ['Started',  now],
  ];

  const labelW = 10;   // fixed label column width
  const valW = Math.max(...rows.map(r => r[1].length)) + 2; // widest value + 2 padding
  const innerW = 2 + labelW + 3 + valW;  // "  Label     :  Value     "

  console.log(`  ${C.gray}┌${'─'.repeat(innerW)}┐${C.reset}`);
  for (const [label, val] of rows) {
    const valPad = ' '.repeat(valW - val.length);
    console.log(`  ${C.gray}│${C.reset}  ${C.dim}${label.padEnd(labelW)}${C.reset}${C.gray}:${C.reset}  ${C.white}${val}${C.reset}${valPad}${C.gray}│${C.reset}`);
  }
  console.log(`  ${C.gray}└${'─'.repeat(innerW)}┘${C.reset}`);
  console.log();
}

// ══════════════════════════════════════════════════════════════════
//  LOG LEVELS
// ══════════════════════════════════════════════════════════════════

function info(msg: string): void {
  clearStatus();
  console.log(`  ${C.blue}${C.bold}[INFO]${C.reset}  ${C.gray}${timestamp()}${C.reset}  ${msg}`);
}

function success(msg: string): void {
  clearStatus();
  console.log(`  ${C.green}${C.bold}[  OK]${C.reset}  ${C.gray}${timestamp()}${C.reset}  ${C.green}${msg}${C.reset}`);
}

function warn(msg: string): void {
  clearStatus();
  console.log(`  ${C.yellow}${C.bold}[WARN]${C.reset}  ${C.gray}${timestamp()}${C.reset}  ${C.yellow}${msg}${C.reset}`);
}

function error(msg: string): void {
  clearStatus();
  console.log(`  ${C.red}${C.bold}[FAIL]${C.reset}  ${C.gray}${timestamp()}${C.reset}  ${C.red}${msg}${C.reset}`);
}

function debug(msg: string): void {
  clearStatus();
  console.log(`  ${C.gray}[DBG ]  ${timestamp()}  ${msg}${C.reset}`);
}

function dim(msg: string): void {
  clearStatus();
  console.log(`  ${C.gray}        ${' '.repeat(19)}  ${msg}${C.reset}`);
}

// ══════════════════════════════════════════════════════════════════
//  SECTION HEADERS
// ══════════════════════════════════════════════════════════════════

function section(title: string): void {
  clearStatus();
  console.log();
  console.log(`  ${C.cyan}${C.bold}▶ ${title}${C.reset}`);
  console.log(`  ${hrLine('─', 58)}`);
}

// ══════════════════════════════════════════════════════════════════
//  CONFIG TABLE
// ══════════════════════════════════════════════════════════════════

function printConfig(config: Record<string, string>): void {
  section('Session Configuration');
  for (const [key, val] of Object.entries(config)) {
    console.log(`  ${C.gray}  ${pad(key, 14)}${C.reset}${C.dim}:${C.reset}  ${C.brightWhite}${val}${C.reset}`);
  }
  console.log();
}

// ══════════════════════════════════════════════════════════════════
//  PROGRESS BAR
// ══════════════════════════════════════════════════════════════════

function progress(current: number, total: number, label: string): void {
  clearStatus();
  const pct = Math.round((current / total) * 100);
  const barLen = 25;
  const filled = Math.round((current / total) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  const counter = `[${current}/${total}]`;

  console.log(
    `  ${C.magenta}${C.bold}[PROC]${C.reset}  ${C.gray}${timestamp()}${C.reset}  ` +
    `${C.cyan}${bar}${C.reset} ${C.bold}${pct}%${C.reset}  ${C.dim}${counter}${C.reset}  ${C.white}${label}${C.reset}`
  );
}

// ══════════════════════════════════════════════════════════════════
//  STATUS LINE (single-line overwrite for spinners)
// ══════════════════════════════════════════════════════════════════

function status(msg: string): void {
  _statusActive = true;
  // Write to stdout without newline, with carriage return for overwrite
  process.stdout.write(`\r\x1b[K  ${C.cyan}${C.bold}[ .. ]${C.reset}  ${C.gray}${timestamp()}${C.reset}  ${msg}${C.reset}`);
}

function statusDone(msg: string): void {
  _statusActive = true;  // ensure clearStatus fires
  success(msg);
}

function statusFail(msg: string): void {
  _statusActive = true;  // ensure clearStatus fires
  error(msg);
}

// ══════════════════════════════════════════════════════════════════
//  SUMMARY PANEL
// ══════════════════════════════════════════════════════════════════

interface SummaryStats {
  total: number;
  succeeded: number;
  failed?: number;
  duplicatesRemoved?: number;
  elapsedMs: number;
  outputPath?: string;
  outputSheets?: number;
  errors?: string[];
}

function printSummary(stats: SummaryStats): void {
  section('Summary');

  console.log(`  ${C.gray}  Total          ${C.reset}${C.dim}:${C.reset}  ${C.bold}${C.brightWhite}${stats.total}${C.reset} ${C.dim}business(es)${C.reset}`);
  console.log(`  ${C.green}  Succeeded      ${C.reset}${C.dim}:${C.reset}  ${C.bold}${C.green}${stats.succeeded}${C.reset}`);

  if (stats.failed && stats.failed > 0) {
    console.log(`  ${C.red}  Failed         ${C.reset}${C.dim}:${C.reset}  ${C.bold}${C.red}${stats.failed}${C.reset}`);
  }

  if (stats.duplicatesRemoved && stats.duplicatesRemoved > 0) {
    console.log(`  ${C.gray}  Dupes Removed  ${C.reset}${C.dim}:${C.reset}  ${C.bold}${stats.duplicatesRemoved}${C.reset}`);
  }

  console.log(`  ${C.gray}  Elapsed        ${C.reset}${C.dim}:${C.reset}  ${C.bold}${formatMs(stats.elapsedMs)}${C.reset}`);

  if (stats.outputPath) {
    console.log();
    console.log(`  ${C.green}${C.bold}  ✔ Output:${C.reset} ${C.white}${stats.outputPath}${C.reset}`);
    if (stats.outputSheets && stats.outputSheets > 1) {
      console.log(`  ${C.gray}    (${stats.outputSheets} sheets)${C.reset}`);
    }
  }

  if (stats.errors && stats.errors.length > 0) {
    console.log();
    console.log(`  ${C.red}${C.bold}  ✘ Errors:${C.reset}`);
    const shown = stats.errors.slice(0, 5);
    for (const e of shown) {
      console.log(`    ${C.red}→${C.reset} ${C.gray}${e}${C.reset}`);
    }
    if (stats.errors.length > 5) {
      console.log(`    ${C.gray}... and ${stats.errors.length - 5} more${C.reset}`);
    }
  }

  console.log();
  console.log(`  ${hrLine('═', 58)}`);
  console.log();
}

// ══════════════════════════════════════════════════════════════════
//  RESULTS TABLE
// ══════════════════════════════════════════════════════════════════

function table(data: Business[]): void {
  if (data.length === 0) return;

  section('Scraped Results');

  data.forEach((item: Business, i: number) => {
    const idx = String(i + 1).padStart(3, ' ');
    console.log(`  ${C.brightWhite}${C.bold}${idx}.${C.reset} ${C.bold}${item.name || 'N/A'}${C.reset}`);
    if (item.phone)     console.log(`  ${C.gray}      📞  ${item.phone}${C.reset}`);
    if (item.email)     console.log(`  ${C.gray}      📧  ${item.email}${C.reset}`);
    if (item.website)   console.log(`  ${C.gray}      🌐  ${item.website}${C.reset}`);
    if (item.address)   console.log(`  ${C.gray}      📍  ${item.address}${C.reset}`);
    if (item.facebook)  console.log(`  ${C.gray}      f   ${item.facebook}${C.reset}`);
    if (item.instagram) console.log(`  ${C.gray}      📷  ${item.instagram}${C.reset}`);
    if (item.twitter)   console.log(`  ${C.gray}      𝕏   ${item.twitter}${C.reset}`);
    if (item.linkedin)  console.log(`  ${C.gray}      in  ${item.linkedin}${C.reset}`);
  });
  console.log();
}

// ══════════════════════════════════════════════════════════════════
//  KEYWORD / BATCH SECTION HEADERS
// ══════════════════════════════════════════════════════════════════

function keywordHeader(index: number, total: number, keyword: string): void {
  console.log();
  console.log(`  ${C.cyan}${C.bold}${'━'.repeat(62)}${C.reset}`);
  console.log(`  ${C.cyan}${C.bold}  KEYWORD ${index}/${total}${C.reset}  ${C.brightWhite}${C.bold}${keyword}${C.reset}`);
  console.log(`  ${C.cyan}${C.bold}${'━'.repeat(62)}${C.reset}`);
}

function cityHeader(index: number, total: number, city: string): void {
  console.log();
  console.log(`  ${C.blue}${C.bold}━━━ City ${index}/${total}: ${city.toUpperCase()} ━━━${C.reset}`);
}

function bulkModeHeader(): void {
  console.log();
  console.log(`  ${C.cyan}${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`  ${C.cyan}${C.bold}║       MULTI-KEYWORD × MULTI-CITY BULK MODE              ║${C.reset}`);
  console.log(`  ${C.cyan}${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log();
}

function bulkSummary(stats: {
  grandTotal: number;
  keywords: number;
  cities: number;
  totalQueries: number;
  elapsedMs: number;
  files: string[];
}): void {
  console.log();
  console.log(`  ${C.cyan}${C.bold}${'═'.repeat(62)}${C.reset}`);
  success('BULK SCRAPE COMPLETE!');
  console.log(`  ${C.cyan}${C.bold}${'═'.repeat(62)}${C.reset}`);
  console.log();
  console.log(`  ${C.gray}  Total Leads   ${C.reset}${C.dim}:${C.reset}  ${C.bold}${C.brightWhite}${stats.grandTotal}${C.reset}`);
  console.log(`  ${C.gray}  Keywords      ${C.reset}${C.dim}:${C.reset}  ${C.bold}${stats.keywords}${C.reset}`);
  console.log(`  ${C.gray}  Cities        ${C.reset}${C.dim}:${C.reset}  ${C.bold}${stats.cities}${C.reset}`);
  console.log(`  ${C.gray}  Total Queries ${C.reset}${C.dim}:${C.reset}  ${C.bold}${stats.totalQueries}${C.reset}`);
  console.log(`  ${C.gray}  Elapsed       ${C.reset}${C.dim}:${C.reset}  ${C.bold}${formatMs(stats.elapsedMs)}${C.reset}`);
  console.log(`  ${C.gray}  Files Created ${C.reset}${C.dim}:${C.reset}  ${C.bold}${stats.files.length}${C.reset}`);

  if (stats.files.length > 0) {
    console.log();
    for (const f of stats.files) {
      console.log(`  ${C.green}  → ${C.reset}${C.dim}${f}${C.reset}`);
    }
  }
  console.log();
}

// ══════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════

const logger = {
  // Core log levels
  info,
  success,
  warn,
  error,
  debug,
  dim,

  // Structured output
  banner,
  section,
  printConfig,
  progress,
  table,
  printSummary,

  // Status line (inline overwrite)
  status,
  statusDone,
  statusFail,

  // Batch/keyword helpers
  keywordHeader,
  cityHeader,
  bulkModeHeader,
  bulkSummary,

  // Utilities (exported for external use)
  formatMs,
  formatBytes,
  hrLine,
  sleep,
  C,
};

export default logger;
