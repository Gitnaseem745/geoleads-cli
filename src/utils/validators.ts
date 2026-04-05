/**
 * Input validation helpers for CLI arguments.
 */

import path from 'path';
import fs from 'fs';

/**
 * Social media and non-business domains to skip.
 */
export const SOCIAL_MEDIA_DOMAINS: string[] = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'pinterest.com',
  'snapchat.com',
  'reddit.com',
  'tumblr.com',
  'whatsapp.com',
  'telegram.org',
  't.me',
  'discord.com',
  'discord.gg',
  'threads.net',
  'yelp.com',
  'tripadvisor.com',
  'tripadvisor.in',
  'zomato.com',
  'swiggy.com',
  'justdial.com',
  'indiamart.com',
  'google.com',
  'maps.google.com',
  'play.google.com',
  'apps.apple.com',
  'apple.com',
  'wikipedia.org',
  'booking.com',
  'makemytrip.com',
  'goibibo.com',
];

/**
 * Check if a URL belongs to a social media or non-business domain.
 */
export function isSocialMediaUrl(url: string): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return SOCIAL_MEDIA_DOMAINS.some((domain) => {
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  } catch {
    return false;
  }
}

/**
 * Validate the search query.
 */
export function validateQuery(query: unknown): string {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Search query is required and must be a non-empty string.');
  }
  return query.trim();
}

/**
 * Validate the result limit.
 */
export function validateLimit(limit: unknown): number {
  const num = parseInt(String(limit), 10);
  if (isNaN(num) || num < 1) {
    throw new Error('Limit must be a positive integer.');
  }
  if (num > 100) {
    throw new Error('Limit cannot exceed 100 to avoid detection.');
  }
  return num;
}

/**
 * Validate the output file path.
 */
export function validateOutput(output: unknown): string {
  if (!output || typeof output !== 'string') {
    throw new Error('Output file path must be a non-empty string.');
  }
  const ext = path.extname(output).toLowerCase();
  if (ext !== '.xlsx') {
    throw new Error('Output file must have .xlsx extension.');
  }
  return output;
}

/**
 * Validate and read the params file (list of cities, one per line).
 */
export function validateAndReadParams(filePath: string): string[] {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Params file path must be a non-empty string.');
  }

  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Params file not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) {
    throw new Error('Params file is empty. Add one city per line.');
  }

  return lines;
}

/**
 * Validate that query contains [city] placeholder when params mode is used.
 */
export function hasPlaceholder(query: string): boolean {
  return query.includes('[city]');
}
