/**
 * Data extraction and parsing utilities.
 */

const cheerio = require('cheerio');

/**
 * Extract business info from a Google Maps listing detail panel.
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @returns {Promise<Object>} Business data { name, website, phone }
 */
async function extractBusinessInfo(page) {
  return page.evaluate(() => {
    const result = { name: '', website: '', phone: '' };

    // Business name — usually in h1 or the main heading element
    const nameEl =
      document.querySelector('h1.DUwDvf') ||
      document.querySelector('h1[data-attrid]') ||
      document.querySelector('h1');
    if (nameEl) {
      result.name = nameEl.textContent.trim();
    }

    // Website — look for the website button/link in the details panel
    const allLinks = document.querySelectorAll('a[data-item-id="authority"]');
    if (allLinks.length > 0) {
      result.website = allLinks[0].href || '';
    } else {
      // Fallback: look for links with "website" aria-label
      const websiteLink = document.querySelector('a[aria-label*="Website"], a[aria-label*="website"]');
      if (websiteLink) {
        result.website = websiteLink.href || '';
      }
    }

    // Phone number — look for the phone button/element
    const phoneEl = document.querySelector('button[data-item-id^="phone:"]');
    if (phoneEl) {
      // The data-item-id contains "phone:tel:+91XXXXXXXXXX" format
      const phoneData = phoneEl.getAttribute('data-item-id');
      if (phoneData) {
        result.phone = phoneData.replace('phone:tel:', '').replace('phone:', '');
      }
    } else {
      // Fallback: look for aria-label containing phone
      const phoneLink = document.querySelector('[aria-label*="Phone"], [aria-label*="phone"]');
      if (phoneLink) {
        const label = phoneLink.getAttribute('aria-label') || '';
        const phoneMatch = label.match(/[\+]?[\d\s\-\(\)]{7,}/);
        if (phoneMatch) {
          result.phone = phoneMatch[0].trim();
        }
      }
    }

    return result;
  });
}

/**
 * Extract email addresses from HTML content using regex.
 * @param {string} html - Raw HTML string
 * @returns {string[]} Array of unique email addresses found
 */
function extractEmails(html) {
  if (!html) return [];

  const $ = cheerio.load(html);
  // Remove script and style tags to reduce false positives
  $('script, style, noscript').remove();
  const text = $.text();

  // Email regex pattern
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];

  // Also check href="mailto:" links
  const mailtoEmails = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace('mailto:', '').split('?')[0].trim();
    if (email) mailtoEmails.push(email);
  });

  // Combine and deduplicate
  const allEmails = [...new Set([...matches, ...mailtoEmails])];

  // Filter out common false positives
  const filtered = allEmails.filter((email) => {
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
 * @param {Object[]} businesses - Array of business objects
 * @returns {Object[]} Deduplicated array
 */
function deduplicateBusinesses(businesses) {
  const seen = new Map();
  const result = [];

  for (const biz of businesses) {
    const key = (biz.name || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.set(key, true);
    result.push(biz);
  }

  return result;
}

module.exports = { extractBusinessInfo, extractEmails, deduplicateBusinesses };
