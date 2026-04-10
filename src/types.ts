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

/** Logger interface for prefixed logging. */
export interface Logger {
  info: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  dim: (msg: string) => void;
  banner: () => void;
  table: (data: Business[]) => void;
}
