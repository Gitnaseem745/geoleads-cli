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

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page, HTTPRequest } from 'puppeteer';
import { extractEmails, extractSocialLinks } from '../parser/extractData';
import { isSocialMediaUrl } from '../utils/validators';
import { randomDelay, shortDelay, mediumDelay } from '../utils/delay';
import logger from '../utils/logger';
import type { Business, ScrapeOptions } from '../types';

puppeteer.use(StealthPlugin());

const USER_AGENTS: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Main scraping function.
 */
export async function scrapeGoogleMaps(query: string, limit: number, opts: ScrapeOptions = {}): Promise<Business[]> {
  const { headful = false, skipEmails = false, onProgress = null, logPrefix = '' } = opts;
  const businesses: Business[] = [];
  let browser: Browser | undefined;

  // Prefixed logger for clean parallel output
  const log = {
    info: (msg: string) => logger.info(`${logPrefix}${msg}`),
    dim: (msg: string) => logger.dim(`${logPrefix}${msg}`),
    warn: (msg: string) => logger.warn(`${logPrefix}${msg}`),
    error: (msg: string) => logger.error(`${logPrefix}${msg}`),
  };

  try {
    const vpW = 1280 + Math.floor(Math.random() * 200);
    const vpH = 800 + Math.floor(Math.random() * 100);

    log.info(`Launching browser (${headful ? 'headful' : 'headless'} mode)...`);

    browser = await puppeteer.launch({
      headless: (headful ? false : 'new') as any,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        `--window-size=${vpW},${vpH}`,
      ],
      defaultViewport: { width: vpW, height: vpH },
    }) as unknown as Browser;

    const page: Page = await browser.newPage() as unknown as Page;
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
    } catch (e) { /* ignore */ }

    // Type query in search box
    log.info(`Searching for: "${query}"`);

    let searchBox: any = await page.$('textarea[name="q"]');
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
        const text = (el as HTMLElement).textContent?.trim().toLowerCase() || '';
        if (text === 'more places' || text === 'more places ›' || text === 'more places >') {
          (el as HTMLElement).click();
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
          if (link.textContent?.trim() === 'Places') { link.click(); return true; }
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
      await page.goto(`https://www.google.com/search?q=${encodedQuery}&udm=1`, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      });
      await mediumDelay();
    }

    // ── Step 3 & 4: Pagination Loop & Extraction ─────────────────────
    let pageNum = 1;
    let totalProcessed = 0;

    while (businesses.length < limit) {
      log.info(`--- Scanning Page ${pageNum} ---`);
      log.info('Looking for business listings...');

      await page.waitForFunction(() => {
        return document.querySelectorAll('.VkpGBb, .rllt__link, .cXedhc, [data-rc]').length > 0;
      }, { timeout: 15000 }).catch(() => {
        log.warn('No listing selectors found on this page...');
      });

      await shortDelay();

      // Try listing selectors in order of reliability for current Google Places UI
      let listingSelector = '.VkpGBb';
      let listingCount = await page.$$eval(listingSelector, (els: Element[]) => els.length).catch(() => 0);
      if (listingCount === 0) {
        listingSelector = '.rllt__link';
        listingCount = await page.$$eval(listingSelector, (els: Element[]) => els.length).catch(() => 0);
      }
      if (listingCount === 0) {
        listingSelector = '.cXedhc';
        listingCount = await page.$$eval(listingSelector, (els: Element[]) => els.length).catch(() => 0);
      }
      if (listingCount === 0) {
        listingSelector = '[data-rc]';
        listingCount = await page.$$eval(listingSelector, (els: Element[]) => els.length).catch(() => 0);
      }

      if (listingCount === 0) {
        log.warn('No business listings found on this page. Stopping.');
        if (pageNum === 1) {
          const debugInfo = await page.evaluate(() => ({
            title: document.title, url: window.location.href,
          }));
          log.dim(`Page: ${debugInfo.title}`);
          log.dim(`URL: ${debugInfo.url}`);
        }
        break; // Exit loop if no listings found
      }

      const remainingLimit = limit - businesses.length;
      const targetCount = Math.min(listingCount, remainingLimit);
      log.info(`Found ${listingCount} listings on page ${pageNum}, extracting ${targetCount}`);

      for (let i = 0; i < targetCount; i++) {
        try {
          totalProcessed++;
          if (onProgress) onProgress(totalProcessed, limit);

        const listings = await page.$$(listingSelector);
        if (i >= listings.length) {
          log.warn(`Listing ${i + 1} index out of range, skipping.`);
          continue;
        }

        // Extract name from the listing card BEFORE clicking (by index)
        const listingName = await page.evaluate((idx: number, sel: string) => {
          const items = document.querySelectorAll(sel);
          if (!items[idx]) return '';
          // Name is in .dbg0pd .OSrXXb or .OSrXXb within the listing
          const nameEl = items[idx].querySelector('.OSrXXb') || 
                         items[idx].querySelector('.dbg0pd') ||
                         items[idx].querySelector('[role="heading"]');
          if (nameEl) return (nameEl as HTMLElement).textContent?.trim() || '';
          // Fallback: try the rllt__details inside the listing
          const detEl = items[idx].querySelector('.rllt__details .dbg0pd');
          if (detEl) return (detEl as HTMLElement).textContent?.trim() || '';
          return '';
        }, i, listingSelector);

        // Click the listing to open detail panel
        await listings[i].click();
        await mediumDelay();

        // Wait for detail panel to load (action buttons / info sections)
        await page.waitForSelector('.bkaPDb, .OYzgjc, .zhZ3gf, [data-phone-number], .C9waJd', { timeout: 8000 }).catch(() => {});
        await shortDelay();

        // Scroll detail panel to ensure all info is rendered
        await page.evaluate(() => {
          const panels = document.querySelectorAll('.OYzgjc, .zhZ3gf, .xpdopen, .kp-blk, .o5v3Gd');
          for (const p of panels) {
            if (p.scrollHeight > p.clientHeight) p.scrollTop = p.scrollHeight;
          }
        });
        await shortDelay();

        // Extract phone, website, address from the detail panel
        const info = await extractFromDetailPanel(page);

        // Use the name from the listing card (reliable), not from detail panel
        info.name = listingName || info.name;

        if (!info.name) {
          // Final fallback: try by index from .dbg0pd or .OSrXXb
          const fallbackName = await page.evaluate((idx: number) => {
            const items = document.querySelectorAll('.dbg0pd .OSrXXb, .OSrXXb');
            if (items[idx]) return (items[idx] as HTMLElement).textContent?.trim() || '';
            return '';
          }, i);
          info.name = fallbackName;
        }

        if (!info.name) {
          log.warn(`Listing ${i + 1}: Could not extract name, skipping.`);
          continue;
        }

        log.dim(`${businesses.length + 1}/${limit}: ${info.name}`);
        if (info.phone) log.dim(`  📞 ${info.phone}`);
        if (info.address) log.dim(`  📍 ${info.address}`);

        // Filter out social media websites
        let website = info.website || '';
        if (website && isSocialMediaUrl(website)) {
          log.dim(`  ↳ Skipping social media URL: ${website}`);
          website = '';
        }

        // Extract email and social links from business website (skip if --skip-emails or social media)
        let email = '';
        let extractedSocials: Partial<Business> = {};
        if (website && !skipEmails) {
          const webData = await scrapeDataFromWebsite(browser, website);
          email = webData.email || '';
          extractedSocials = webData;
        }

        businesses.push({
          name: info.name,
          website: website,
          phone: info.phone || '',
          email: email || '',
          address: info.address || '',
          facebook: extractedSocials.facebook || '',
          instagram: extractedSocials.instagram || '',
          twitter: extractedSocials.twitter || '',
          linkedin: extractedSocials.linkedin || '',
        });

        await randomDelay(1500, 3000);
      } catch (err) {
        log.warn(`Error processing listing ${i + 1}: ${(err as Error).message}`);
        continue;
      }
    }

    if (businesses.length >= limit) {
      log.info(`Reached target limit of ${limit}. Stopping.`);
      break;
    }

    log.info('Checking for next page...');
    const nextBtn = await page.$('#pnnext, a[aria-label="Next page"], a[aria-label="Next"], button[aria-label="Next page"], button[aria-label="Next"]');
    if (!nextBtn) {
      log.info('No more pages found. Reached end of results.');
      break;
    }

    log.info(`Navigating to Page ${pageNum + 1}...`);
    const navPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await nextBtn.click().catch(() => page.evaluate((el: any) => el.click(), nextBtn));
    await navPromise;
    await mediumDelay();
    pageNum++;
  }
  } catch (err) {
    log.error(`Scraper error: ${(err as Error).message}`);
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
 * 
 * Selectors verified against live Google Places HTML (udm=1 local results):
 *   - Name:    .dbg0pd[role="heading"] > span.OSrXXb
 *   - Website: a.n1obkb with span.aSAiSd "Website"
 *   - Phone:   [data-phone-number] attr on call button, or div.C9waJd text
 *   - Address: div.C9waJd.y7xX3d > div > span
 */
async function extractFromDetailPanel(page: Page): Promise<{ name: string; website: string; phone: string; address: string }> {
  return page.evaluate(() => {
    const result = { name: '', website: '', phone: '', address: '' };

    // ── Business Name ──
    // Primary: The expanded detail panel header (used by Google Places udm=1)
    // The detail panel shows a heading in .SPZz6b or as part of the expanded card
    // But the name is also always in the listing card: .dbg0pd > .OSrXXb
    // Try multiple approaches:
    
    // 1. Try the detail panel heading area
    const detailHeadings = document.querySelectorAll('.SPZz6b span, h2[data-attrid="title"], .qrShPb span');
    for (const h of detailHeadings) {
      const rect = (h as HTMLElement).getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        result.name = (h as HTMLElement).textContent?.trim() || '';
        if (result.name) break;
      }
    }

    // 2. Fallback: Get name from the active/highlighted listing card
    if (!result.name) {
      const activeListings = document.querySelectorAll('.dbg0pd .OSrXXb');
      for (const el of activeListings) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          result.name = (el as HTMLElement).textContent?.trim() || '';
          if (result.name) break;
        }
      }
    }

    // ── Website ──
    // Google Places uses action buttons: a.n1obkb with inner span.aSAiSd
    // The "Website" button has href pointing to the business site
    const allActionBtns = document.querySelectorAll('a.n1obkb, a.ab_button');
    for (const btn of allActionBtns) {
      const labelSpan = btn.querySelector('.aSAiSd');
      const btnText = (labelSpan || btn as HTMLElement).textContent?.trim().toLowerCase() || '';
      if (btnText === 'website' || btnText === 'site') {
        const href = (btn as HTMLAnchorElement).href || '';
        if (href && href.startsWith('http')) {
          result.website = href;
          break;
        }
      }
    }
    if (!result.website) {
      const wEl = document.querySelector('a[data-attrid*="website"]');
      if (wEl) result.website = (wEl as HTMLAnchorElement).href || '';
    }
    if (!result.website) {
      const wLink = document.querySelector('a[aria-label*="Website"], a[aria-label*="website"]');
      if (wLink) result.website = (wLink as HTMLAnchorElement).href || '';
    }

    // ── Phone Number ──
    // PRIMARY: data-phone-number attribute on the call button
    // This is the most reliable source - Google puts the raw number here
    // Pattern: <a class="Od1FEc n1obkb" data-phone-number="09176707070" aria-label="Call">
    const phoneBtn = document.querySelector('[data-phone-number]');
    if (phoneBtn) {
      result.phone = phoneBtn.getAttribute('data-phone-number') || '';
    }

    // Fallback 1: tel: link
    if (!result.phone) {
      const telLink = document.querySelector('a[href^="tel:"]');
      if (telLink) {
        result.phone = decodeURIComponent((telLink as HTMLAnchorElement).href.replace('tel:', '')).trim();
      }
    }

    // Fallback 2: aria-label on Call button often contains the number
    if (!result.phone) {
      const callBtn = document.querySelector('[aria-label*="Call"]');
      if (callBtn) {
        if (callBtn.hasAttribute('data-phone-number')) {
          result.phone = callBtn.getAttribute('data-phone-number') || '';
        } else {
          const label = callBtn.getAttribute('aria-label') || '';
          const match = label.match(/[\d\s\-\+\(\)]{7,}/);
          if (match) result.phone = match[0].trim();
        }
      }
    }

    // Fallback 3: Phone shown in detail panel as div.C9waJd text (without .y7xX3d class)
    // Pattern: <div class="C9waJd ">091767 07070</div>
    if (!result.phone) {
      const c9divs = document.querySelectorAll('.C9waJd');
      for (const div of c9divs) {
        // Skip address divs (they have y7xX3d class)
        if ((div as HTMLElement).classList.contains('y7xX3d')) continue;
        const txt = (div as HTMLElement).textContent?.trim() || '';
        // Match phone number patterns
        if (/^[\d\s\-\+\(\)]{7,20}$/.test(txt)) {
          result.phone = txt;
          break;
        }
      }
    }

    // Fallback 4: Phone shown inline in the listing card text
    // Pattern: <div>Open 24 hours</span> · 091767 07070</div>
    if (!result.phone) {
      const allDivs = document.querySelectorAll('.rllt__details div, .OYzgjc div');
      for (const div of allDivs) {
        const txt = (div as HTMLElement).textContent?.trim() || '';
        // Look for phone at end of text after · separator  
        const phoneMatch = txt.match(/·\s*([\d\s\-\+\(\)]{7,20})$/);
        if (phoneMatch) {
          result.phone = phoneMatch[1].trim();
          break;
        }
        // Or standalone phone
        if (/^[\d\s\-\+\(\)]{7,20}$/.test(txt) && txt.length >= 7 && txt.length <= 20) {
          result.phone = txt;
          break;
        }
      }
    }

    // ── Address ──
    // PRIMARY: div.C9waJd.y7xX3d contains the full address
    // Pattern: <div class="C9waJd y7xX3d"><div><span>FULL ADDRESS</span></div></div>
    const addrDiv = document.querySelector('.C9waJd.y7xX3d');
    if (addrDiv) {
      result.address = (addrDiv as HTMLElement).textContent?.trim() || '';
    }

    // Fallback 1: eSHGZ div with location icon nearby (pin icon SVG path)
    if (!result.address) {
      const eshgzDivs = document.querySelectorAll('[jsname="eSHGZ"]');
      for (const div of eshgzDivs) {
        const txt = (div as HTMLElement).textContent?.trim() || '';
        // Address heuristics: contains comma, reasonably long, not a phone
        if (txt.includes(',') && txt.length > 10 && txt.length < 200
          && !(/^[\d\s\-\+\(\)]{7,20}$/.test(txt))
          && !txt.match(/^\d{1,2}:\d{2}/)
          && !txt.match(/^\d{1,2}\s*(am|pm)/i)
          && !txt.match(/^Open|^Closed/i)) {
          result.address = txt;
          break;
        }
      }
    }

    // Fallback 2: Location data from listing card (city/state)
    if (!result.address) {
      const locSpans = document.querySelectorAll('.nICndb, .cyspcb');
      for (const span of locSpans) {
        const txt = (span as HTMLElement).textContent?.trim().replace(/[⁦⁩]/g, '') || '';
        if (txt.includes(',') && txt.length > 5 && !txt.match(/^Open|^Closed/i)) {
          result.address = txt;
          break;
        }
      }
    }

    // Fallback 3: data-attrid based (legacy Google layout)
    if (!result.address) {
      const attrAddr = document.querySelector('[data-attrid*="address"] .LrzXr, [data-attrid*="location"] .LrzXr');
      if (attrAddr) result.address = (attrAddr as HTMLElement).textContent?.trim() || '';
    }

    // ── Clean up ──
    if (result.phone) {
      // Format phone: keep only digits, spaces, +, (, ), -
      result.phone = result.phone.replace(/[^\d+()\s-]/g, '').trim();
      // If phone starts with 0 and is Indian format, add spacing
    }
    if (result.address) {
      result.address = result.address.replace(/^Address:\s*/i, '').trim();
      // Remove unicode directional marks
      result.address = result.address.replace(/[⁦⁩]/g, '').trim();
    }

    return result;
  });
}

/**
 * Visit a business website and try to extract email addresses and social links.
 */
async function scrapeDataFromWebsite(browser: Browser, url: string): Promise<Partial<Business>> {
  let page: Page | undefined;
  const result: Partial<Business> = { email: '' };
  try {
    page = await browser.newPage() as unknown as Page;
    await page.setUserAgent(getRandomUA());
    await page.setRequestInterception(true);

    page.on('request', (req: HTTPRequest) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await shortDelay();

    let html = await page.content();
    result.email = extractEmails(html)[0] || '';
    const socials = extractSocialLinks(html);
    Object.assign(result, socials);

    // If missing data, try common contact pages
    if (!result.email || !result.facebook || !result.instagram || !result.twitter || !result.linkedin) {
      const contactPaths = ['/contact', '/contact-us', '/about', '/about-us'];
      for (const cp of contactPaths) {
        try {
          await page.goto(new URL(cp, url).href, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await shortDelay();
          html = await page.content();
          
          const moreEmails = extractEmails(html);
          if (!result.email && moreEmails.length > 0) result.email = moreEmails[0];
          
          const moreSocials = extractSocialLinks(html);
          if (!result.facebook) result.facebook = moreSocials.facebook;
          if (!result.instagram) result.instagram = moreSocials.instagram;
          if (!result.twitter) result.twitter = moreSocials.twitter;
          if (!result.linkedin) result.linkedin = moreSocials.linkedin;

          if (result.email && result.facebook && result.instagram && result.twitter && result.linkedin) break;
        } catch { /* ignore */ }
      }
    }

    return result;
  } catch {
    return result;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}
