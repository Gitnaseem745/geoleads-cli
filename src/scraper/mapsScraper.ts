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

export async function scrapeGoogleMaps(query: string, limit: number, opts: ScrapeOptions = {}): Promise<Business[]> {
  const { headful = false, skipEmails = false, onProgress = null, logPrefix = '' } = opts;
  const businesses: Business[] = [];
  let browser: Browser | undefined;

  const log = {
    info: (msg: string) => logger.info(`${logPrefix}${msg}`),
    dim: (msg: string) => logger.dim(`${logPrefix}${msg}`),
    warn: (msg: string) => logger.warn(`${logPrefix}${msg}`),
    error: (msg: string) => logger.error(`${logPrefix}${msg}`),
    progress: (current: number, total: number, label: string) => logger.progress(current, total, `${logPrefix}${label}`),
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

    // ── Step 1: Navigate directly to Google Maps ──────────────────
    log.info(`Searching Maps for: "${query}"`);
    const encodedQuery = encodeURIComponent(query);
    await page.goto(`https://www.google.com/maps/search/${encodedQuery}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await mediumDelay();

    // Handle cookie consent if it appears
    try {
      const consentBtn = await page.$('button[aria-label*="Accept all"], button[aria-label*="Agree"]');
      if (consentBtn) { await consentBtn.click(); await shortDelay(); }
    } catch (e) { /* ignore */ }

    // ── Step 2: Scroll and collect listing URLs ──────────────────
    log.info('Looking for business listings...');
    const listingUrls = new Set<string>();

    let scrollAttempts = 0;
    let prevCount = 0;
    
    // Check if it's already a single result (direct place page)
    const isSingleResult = await page.evaluate(() => {
      return document.querySelector('h1.DUwDvf') !== null && document.querySelector('div[role="feed"]') === null;
    });

    if (isSingleResult) {
      log.info('Found direct single result page.');
      listingUrls.add(page.url());
    } else {
      while (listingUrls.size < limit && scrollAttempts < 20) {
        const urls = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map(a => (a as HTMLAnchorElement).href);
        });
        
        urls.forEach(u => listingUrls.add(u));
        if (listingUrls.size >= limit) break;
        
        if (urls.length === prevCount) {
          scrollAttempts++;
        } else {
          scrollAttempts = 0;
          prevCount = urls.length;
        }

        // Scroll the feed
        const scrolled = await page.evaluate(() => {
          const feed = document.querySelector('div[role="feed"]') || document.querySelectorAll('.m6QErb')[1];
          if (feed) {
            feed.scrollTop = feed.scrollHeight;
            return true;
          }
          return false;
        });
        
        if (!scrolled) break; // Couldn't find scrollable container
        await randomDelay(1000, 2000);
      }
    }

    const urlsToScrape = Array.from(listingUrls).slice(0, limit);
    if (urlsToScrape.length === 0) {
      log.warn('No business listings found on this page. Stopping.');
      return businesses;
    }

    log.info(`Found ${urlsToScrape.length} listings, starting extraction...`);

    // ── Step 3: Extract detail from each listing URL ──────────────
    let totalProcessed = 0;
    for (const url of urlsToScrape) {
      try {
        totalProcessed++;
        if (onProgress) onProgress(totalProcessed, limit);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});
        await shortDelay();

        const info = await extractFromMapsDetailPanel(page);

        if (!info.name) {
          log.warn(`Listing ${totalProcessed}: Could not extract name, skipping.`);
          continue;
        }

        // Progress bar (only business name as requested)
        log.progress(totalProcessed, urlsToScrape.length, info.name);

        let website = info.website || '';
        let extractedSocials: Partial<Business> = {};

        if (website && isSocialMediaUrl(website)) {
          log.warn(`Found social media URL instead of website: ${website}`);
          const lowerUrl = website.toLowerCase();
          if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.com')) extractedSocials.facebook = website;
          else if (lowerUrl.includes('instagram.com')) extractedSocials.instagram = website;
          else if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) extractedSocials.twitter = website;
          else if (lowerUrl.includes('linkedin.com')) extractedSocials.linkedin = website;
          
          website = '';
        }

        let email = '';
        if (website && !skipEmails) {
          const webData = await scrapeDataFromWebsite(browser, website);
          email = webData.email || '';
          extractedSocials = { ...extractedSocials, ...webData };
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

        if (businesses.length >= limit) break;
        await randomDelay(1000, 2000);
      } catch (err) {
        log.warn(`Error processing listing ${totalProcessed}: ${(err as Error).message}`);
      }
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

async function extractFromMapsDetailPanel(page: Page): Promise<{ name: string; website: string; phone: string; address: string }> {
  return page.evaluate(() => {
    const result = { name: '', website: '', phone: '', address: '' };

    result.name = document.querySelector('h1')?.textContent?.trim() || '';

    const websiteBtn = document.querySelector('a[data-item-id="authority"]');
    if (websiteBtn) result.website = websiteBtn.getAttribute('href') || '';

    const addressBtn = document.querySelector('button[data-item-id="address"]');
    if (addressBtn) {
      result.address = addressBtn.textContent?.trim() || '';
      // Remove Google Maps icon prefix characters
      result.address = result.address.replace(/^[\uE000-\uF8FF]\s*/, '').trim();
    }

    const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]');
    if (phoneBtn) {
      result.phone = phoneBtn.textContent?.trim() || '';
    }

    if (result.phone) {
      result.phone = result.phone.replace(/[^\d+()\s-]/g, '').trim();
    }
    if (result.address) {
      result.address = result.address.replace(/^Address:\s*/i, '').trim();
      result.address = result.address.replace(/[\u2066\u2069]/g, '').trim();
    }

    return result;
  });
}

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

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await shortDelay();

    let html = await page.content();
    result.email = extractEmails(html)[0] || '';
    const socials = extractSocialLinks(html);
    Object.assign(result, socials);

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
