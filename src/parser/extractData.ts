/**
 * Data extraction and parsing utilities.
 */

import * as cheerio from 'cheerio';
import type { Business } from '../types';

/**
 * Extract email addresses from HTML content using regex.
 */
export function extractEmails(html: string): string[] {
  if (!html) return [];

  const $ = cheerio.load(html);
  // Remove script and style tags to reduce false positives
  $('script, style, noscript').remove();
  const text = $.text();

  // Email regex pattern
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];

  // Also check href="mailto:" links
  const mailtoEmails: string[] = [];
  $('a[href^="mailto:"]').each((_: number, el: any) => {
    const href = $(el).attr('href') || '';
    const email = href.replace('mailto:', '').split('?')[0].trim();
    if (email) mailtoEmails.push(email);
  });

  // Combine and deduplicate
  const allEmails = [...new Set([...matches, ...mailtoEmails])];

  // Filter out common false positives
  const filtered = allEmails.filter((email: string) => {
    const lower = email.toLowerCase();
    // Skip image files, common non-email patterns
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif')) return false;
    if (lower.endsWith('.svg') || lower.endsWith('.webp') || lower.endsWith('.jpeg')) return false;
    if (lower.includes('example.com') || lower.includes('sentry.io')) return false;
    if (lower.includes('wixpress.com') || lower.includes('schema.org')) return false;
    return true;
  });

  return filtered;
}

/**
 * Deduplicate business entries by name.
 */
export function deduplicateBusinesses(businesses: Business[]): Business[] {
  const seen = new Map<string, boolean>();
  const result: Business[] = [];

  for (const biz of businesses) {
    const key = (biz.name || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.set(key, true);
    result.push(biz);
  }

  return result;
}
