/**
 * Shared type definitions for GeoLeads.
 */

/** Represents a scraped business entry. */
export interface Business {
  name: string;
  website: string;
  phone: string;
  email: string;
  address: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
}

/** Parsed CLI arguments. */
export interface ParsedArgs {
  query: string;
  limit: number;
  output: string;
  headful: boolean;
  batchMode: boolean;
  cities: string[];
  keywords: string[];
  multiKeywordMode: boolean;
  concurrency: number;
  fast: boolean;
  skipEmails: boolean;
}

/** Options passed to the scraper. */
export interface ScrapeOptions {
  headful?: boolean;
  skipEmails?: boolean;
  onProgress?: ((current: number, total: number) => void) | null;
  logPrefix?: string;
}

/** Stats passed to the summary panel. */
export interface SummaryStats {
  total: number;
  succeeded: number;
  failed?: number;
  duplicatesRemoved?: number;
  elapsedMs: number;
  outputPath?: string;
  outputSheets?: number;
  errors?: string[];
}

/** Logger interface for typed usage. */
export interface Logger {
  info: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug: (msg: string) => void;
  dim: (msg: string) => void;
  banner: () => void;
  section: (title: string) => void;
  printConfig: (config: Record<string, string>) => void;
  progress: (current: number, total: number, label: string) => void;
  table: (data: Business[]) => void;
  printSummary: (stats: SummaryStats) => void;
  status: (msg: string) => void;
  statusDone: (msg: string) => void;
  statusFail: (msg: string) => void;
  keywordHeader: (index: number, total: number, keyword: string) => void;
  cityHeader: (index: number, total: number, city: string) => void;
  bulkModeHeader: () => void;
  bulkSummary: (stats: { grandTotal: number; keywords: number; cities: number; totalQueries: number; elapsedMs: number; files: string[] }) => void;
  formatMs: (ms: number) => string;
  formatBytes: (bytes: number) => string;
  hrLine: (char?: string, len?: number) => string;
  C: Record<string, string>;
}
