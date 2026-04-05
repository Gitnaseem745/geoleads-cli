/**
 * Google Search → Places scraper using Puppeteer with stealth.
 *
 * Flow:
 *   1. Go to google.com, search, navigate to Places/Local tab
 *   2. Click each listing to open its detail panel
 *   3. Extract: name, website, phone, address from the detail panel
 *   4. Optionally visit business website to scrape emails
 *
 * Supports:
 *   - skipEmails: skip visiting websites for email extraction (much faster)
 *   - logPrefix: prefix all log messages (used for parallel city scraping)
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { extractEmails } = require('../parser/extractData');
const { isSocialMediaUrl } = require('../utils/validators');
const { randomDelay, shortDelay, mediumDelay } = require('../utils/delay');
const logger = require('../utils/logger');

puppeteer.use(StealthPlugin());

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Main scraping function.
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @param {Object} opts - Options { headful, skipEmails, onProgress, logPrefix }
 */
async function scrapeGoogleMaps(query, limit, opts = {}) {
  const { headful = false, skipEmails = false, onProgress = null, logPrefix = '' } = opts;
  const businesses = [];
  let browser;

  // Prefixed logger for clean parallel output
  const log = {
    info: (msg) => logger.info(`${logPrefix}${msg}`),
    dim: (msg) => logger.dim(`${logPrefix}${msg}`),
    warn: (msg) => logger.warn(`${logPrefix}${msg}`),
    error: (msg) => logger.error(`${logPrefix}${msg}`),
  };

  try {
    const vpW = 1280 + Math.floor(Math.random() * 200);
    const vpH = 800 + Math.floor(Math.random() * 100);

    log.info(`Launching browser (${headful ? 'headful' : 'headless'} mode)...`);

    browser = await puppeteer.launch({
      headless: headful ? false : 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        `--window-size=${vpW},${vpH}`,
      ],
      defaultViewport: { width: vpW, height: vpH },
    });

    const page = await browser.newPage();
    await page.setUserAgent(getRandomUA());
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    // ── Step 1: Go to Google and search ─────────────────────────────
    log.info('Navigating to Google...');
    await page.goto('https://www.google.com', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await mediumDelay();

    // Handle cookie consent
    try {
      const consentBtn = await page.$('button[id="L2AGLb"], button[aria-label*="Accept"]');
      if (consentBtn) { await consentBtn.click(); await shortDelay(); }
    } catch (e) {}

    // Type query in search box
    log.info(`Searching for: "${query}"`);

    let searchBox = await page.$('textarea[name="q"]');
    if (!searchBox) searchBox = await page.$('input[name="q"]');
    if (!searchBox) {
      await page.click('.a4bIc, .RNNXgb, .SDkEP');
      await shortDelay();
      searchBox = await page.$('textarea[name="q"]') || await page.$('input[name="q"]');
    }

    if (!searchBox) {
      throw new Error('Could not find Google search box');
    }

    await searchBox.click();
    await shortDelay();
    await searchBox.type(query, { delay: 40 + Math.random() * 60 });
    await shortDelay();
    await page.keyboard.press('Enter');

    log.info('Waiting for search results...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await mediumDelay();

    // ── Step 2: Navigate to Places/Local tab ────────────────────────
    let onPlacesPage = false;
    log.info('Looking for "More places" link...');

    const morePlacesClicked = await page.evaluate(() => {
      const allEls = document.querySelectorAll('a, span, div');
      for (const el of allEls) {
        const text = el.textContent.trim().toLowerCase();
        if (text === 'more places' || text === 'more places ›' || text === 'more places >') {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (morePlacesClicked) {
      log.info('Clicked "More places"');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      await mediumDelay();
      onPlacesPage = true;
    }

    if (!onPlacesPage) {
      log.info('Trying "Places" tab...');
      const placesClicked = await page.evaluate(() => {
        const navLinks = document.querySelectorAll('a');
        for (const link of navLinks) {
          if (link.textContent.trim() === 'Places') { link.click(); return true; }
        }
        return false;
      });
      if (placesClicked) {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        await mediumDelay();
        onPlacesPage = true;
      }
    }

    if (!onPlacesPage) {
      log.info('Navigating directly to local search results...');
      const encodedQuery = encodeURIComponent(query);
      await page.goto(`https://www.google.com/search?q=${encodedQuery}&tbm=lcl`, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      });
      await mediumDelay();
    }

    // ── Step 3: Verify we have listings ─────────────────────────────
    log.info('Looking for business listings...');

    await page.waitForFunction(() => {
      return document.querySelectorAll('.rllt__link, .cXedhc a, [data-rc]').length > 0;
    }, { timeout: 15000 }).catch(() => {
      log.warn('No listing selectors found, trying broader search...');
    });

    await shortDelay();

    let listingCount = await page.$$eval('.rllt__link', (els) => els.length).catch(() => 0);
    if (listingCount === 0) {
      listingCount = await page.$$eval('[data-rc]', (els) => els.length).catch(() => 0);
    }
    if (listingCount === 0) {
      listingCount = await page.evaluate(() => {
        return document.querySelectorAll('.VkpGBb, .rllt__link, .cXedhc a').length;
      });
    }

    const targetCount = Math.min(listingCount, limit);
    log.info(`Found ${listingCount} listings, will process ${targetCount}`);

    if (targetCount === 0) {
      log.warn('No business listings found.');
      const debugInfo = await page.evaluate(() => ({
        title: document.title, url: window.location.href,
      }));
      log.dim(`Page: ${debugInfo.title}`);
      log.dim(`URL: ${debugInfo.url}`);
      return [];
    }

    // ── Step 4: Process each listing ────────────────────────────────
    for (let i = 0; i < targetCount; i++) {
      try {
        if (onProgress) onProgress(i + 1, targetCount);

        const listings = await page.$$('.rllt__link');
        if (i >= listings.length) {
          log.warn(`Listing ${i + 1} index out of range, skipping.`);
          continue;
        }

        await listings[i].click();
        await mediumDelay();

        await page.waitForSelector('.xpdopen, .kp-blk, .o5v3Gd, .SPZz6b', { timeout: 8000 }).catch(() => {});
        await shortDelay();

        // Scroll detail panel
        await page.evaluate(() => {
          const panels = document.querySelectorAll('.xpdopen, .kp-blk, .o5v3Gd');
          for (const p of panels) {
            if (p.scrollHeight > p.clientHeight) p.scrollTop = p.scrollHeight;
          }
        });
        await shortDelay();

        const info = await extractFromDetailPanel(page);

        if (!info.name) {
          const fallbackName = await page.evaluate((idx) => {
            const items = document.querySelectorAll('.dbg0pd, .OSrXXb');
            if (items[idx]) return items[idx].textContent.trim();
            return '';
          }, i);
          info.name = fallbackName;
        }

        if (!info.name) {
          log.warn(`Listing ${i + 1}: Could not extract name, skipping.`);
          continue;
        }

        log.dim(`${i + 1}/${targetCount}: ${info.name}`);

        // Filter out social media websites
        let website = info.website || '';
        if (website && isSocialMediaUrl(website)) {
          log.dim(`  ↳ Skipping social media URL: ${website}`);
          website = '';
        }

        // Extract email from business website (skip if --skip-emails or social media)
        let email = '';
        if (website && !skipEmails) {
          email = await scrapeEmailFromWebsite(browser, website);
        }

        businesses.push({
          name: info.name,
          website: website,
          phone: info.phone || '',
          email: email || '',
          address: info.address || '',
        });

        await randomDelay(1500, 3000);
      } catch (err) {
        log.warn(`Error processing listing ${i + 1}: ${err.message}`);
        continue;
      }
    }
  } catch (err) {
    log.error(`Scraper error: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close();
      log.info('Browser closed.');
    }
  }

  return businesses;
}

/**
 * Extract business info from the Google Places detail panel.
 */
async function extractFromDetailPanel(page) {
  return page.evaluate(() => {
    const result = { name: '', website: '', phone: '', address: '' };

    // ── Business Name ──
    const nameEl =
      document.querySelector('h2[data-attrid="title"]') ||
      document.querySelector('.xpdopen h2') ||
      document.querySelector('span[role="heading"]') ||
      document.querySelector('.kp-blk h2') ||
      document.querySelector('.SPZz6b span') ||
      document.querySelector('.qrShPb span');
    if (nameEl) result.name = nameEl.textContent.trim();

    // ── Website ──
    const actionBtns = document.querySelectorAll('a.n1obkb, a.ab_button');
    for (const a of actionBtns) {
      const text = a.textContent.trim().toLowerCase();
      if (text === 'website' || text.includes('website')) {
        result.website = a.href || '';
        break;
      }
    }
    if (!result.website) {
      const wEl = document.querySelector('a[data-attrid*="website"]');
      if (wEl) result.website = wEl.href || '';
    }
    if (!result.website) {
      const wLink = document.querySelector('a[aria-label*="Website"], a[aria-label*="website"]');
      if (wLink) result.website = wLink.href || '';
    }

    // ── Phone Number ──
    for (const a of actionBtns) {
      const text = a.textContent.trim().toLowerCase();
      const href = a.href || '';
      if (text === 'call' || text.includes('call')) {
        if (href.startsWith('tel:')) {
          result.phone = decodeURIComponent(href.replace('tel:', '')).trim();
        }
        break;
      }
    }
    if (!result.phone) {
      const telLink = document.querySelector('a[href^="tel:"]');
      if (telLink) result.phone = decodeURIComponent(telLink.href.replace('tel:', '')).trim();
    }
    if (!result.phone) {
      const phoneEl = document.querySelector('[data-attrid*="phone"] .LrzXr');
      if (phoneEl) result.phone = phoneEl.textContent.trim();
    }
    if (!result.phone) {
      const callEl = document.querySelector('a[aria-label*="Call"], button[aria-label*="Call"]');
      if (callEl) {
        const label = callEl.getAttribute('aria-label') || '';
        const match = label.match(/[\d\s\-\+\(\)]{7,}/);
        if (match) result.phone = match[0].trim();
      }
    }

    // ── Address ──
    const addrEl = document.querySelector('[data-attrid*="address"] .LrzXr');
    if (addrEl) result.address = addrEl.textContent.trim();
    if (!result.address) {
      const locEl = document.querySelector('[data-attrid*="kc:/location"] .LrzXr');
      if (locEl) result.address = locEl.textContent.trim();
    }
    if (!result.address) {
      const allSpans = document.querySelectorAll('.LrzXr');
      for (const span of allSpans) {
        const text = span.textContent.trim();
        if (text.includes(',') && text.length > 15 && !text.match(/^\d{1,2}:\d{2}/) && !text.match(/^\d{1,2}\s*(am|pm)/i)) {
          result.address = text;
          break;
        }
      }
    }

    return result;
  });
}

/**
 * Visit a business website and try to extract email addresses.
 */
async function scrapeEmailFromWebsite(browser, url) {
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(getRandomUA());
    await page.setRequestInterception(true);

    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await shortDelay();

    const html = await page.content();
    const emails = extractEmails(html);
    if (emails.length > 0) return emails[0];

    const contactPaths = ['/contact', '/contact-us', '/about', '/about-us'];
    for (const cp of contactPaths) {
      try {
        await page.goto(new URL(cp, url).href, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await shortDelay();
        const cHtml = await page.content();
        const cEmails = extractEmails(cHtml);
        if (cEmails.length > 0) return cEmails[0];
      } catch {}
    }

    return '';
  } catch {
    return '';
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

module.exports = { scrapeGoogleMaps };
