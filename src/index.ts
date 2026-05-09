#!/usr/bin/env node

/**
 * GeoLeads — Google Maps Business Leads Scraper
 *
 * Entry point: orchestrates CLI parsing, scraping, and Excel export.
 *
 * Usage (single query):
 *   geoleads "restaurants in Delhi" --limit=10 --output=results.xlsx
 *
 * Usage (batch mode — multi-city, sequential):
 *   geoleads "gym in [city]" --params=cities.txt --limit=10 -o gyms.xlsx
 *
 * Usage (fast parallel mode):
 *   geoleads "gym in [city]" -p cities.txt -l 20 -c 5 --fast --skip-emails -o gyms.xlsx
 *
 * Usage (multi-keyword × multi-city — bulk lead generation):
 *   geoleads "[keyword] [city]" -k keywords.txt -p cities.txt -c 5 --fast --skip-emails -o leads.xlsx
 *
 * Algorithm for multi-keyword mode:
 *   For each keyword K in keywords.txt:
 *     Scrape K across ALL cities in parallel (concurrency-limited worker pool)
 *     Export keyword results immediately → frees memory
 *   Time:  O(K * ceil(C / concurrency) * T_scrape)
 *   Space: O(C * N)  — only one keyword's city data in memory at a time
 */

import { parseArgs } from './cli/index';
import { scrapeGoogleMaps } from './scraper/mapsScraper';
import { deduplicateBusinesses } from './parser/extractData';
import { exportToExcel, exportBatchToExcel, exportMultiKeywordBatchToExcel } from './exporter/excelExport';
import logger from './utils/logger';
import { setSpeed } from './utils/delay';
import ora from 'ora';
import type { Business } from './types';

async function main(): Promise<void> {
  logger.banner();

  let args;
  try {
    args = parseArgs();
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }

  const { query, limit, output, headful, batchMode, cities, keywords, multiKeywordMode, concurrency, fast, skipEmails } = args;

  // Apply fast mode
  if (fast) {
    setSpeed(0.25); // 4x faster delays
    logger.warn('Fast mode enabled — delays reduced by 75%. Higher detection risk.');
  }

  if (multiKeywordMode) {
    // Multi-keyword × multi-city mode
    await runMultiKeywordMode(query, limit, output, headful, keywords, cities, concurrency, skipEmails);
  } else if (batchMode) {
    await runBatchMode(query, limit, output, headful, cities, concurrency, skipEmails);
  } else {
    await runSingleMode(query, limit, output, headful, skipEmails);
  }
}

/**
 * Single query mode (original behavior).
 */
async function runSingleMode(query: string, limit: number, output: string, headful: boolean, skipEmails: boolean): Promise<void> {
  logger.info(`Query:   "${query}"`);
  logger.info(`Limit:   ${limit}`);
  logger.info(`Output:  ${output}`);
  logger.info(`Mode:    ${headful ? 'Headful' : 'Headless'}`);
  if (skipEmails) logger.info('Emails:  Skipped (--skip-emails)');
  console.log('');

  const spinner = ora({ text: 'Starting scraper...', color: 'cyan' }).start();
  const startTime = Date.now();

  const rawResults = await scrapeGoogleMaps(query, limit, {
    headful,
    skipEmails,
    onProgress: (current: number, total: number) => {
      spinner.text = `Processing listing ${current}/${total}...`;
    },
  });

  spinner.stop();

  if (rawResults.length === 0) {
    logger.warn('No results were scraped. Possible reasons:');
    logger.dim('  • Google detected bot behavior');
    logger.dim('  • No results for this query');
    logger.dim('  • Network/timeout issues');
    logger.dim('');
    logger.dim('Try running with --headful to debug visually.');
    process.exit(0);
  }

  const results = deduplicateBusinesses(rawResults);
  const dupeCount = rawResults.length - results.length;
  if (dupeCount > 0) logger.info(`Removed ${dupeCount} duplicate entries.`);

  logger.table(results);

  const exportSpinner = ora({ text: 'Exporting to Excel...', color: 'green' }).start();
  try {
    await exportToExcel(results, output);
    exportSpinner.succeed('Excel export complete!');
  } catch (err) {
    exportSpinner.fail('Excel export failed.');
    logger.error((err as Error).message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  logger.success(`Done! Scraped ${results.length} businesses in ${elapsed}s`);
  logger.dim(`Output: ${output}`);
  console.log('');
}

/**
 * Batch mode — scrape multiple cities with optional parallel processing.
 */
async function runBatchMode(queryTemplate: string, limit: number, output: string, headful: boolean, cities: string[], concurrency: number, skipEmails: boolean): Promise<void> {
  logger.info(`Template:    "${queryTemplate}"`);
  logger.info(`Cities:      ${cities.length} (${cities.slice(0, 5).join(', ')}${cities.length > 5 ? '...' : ''})`);
  logger.info(`Limit:       ${limit} per city`);
  logger.info(`Concurrency: ${concurrency} browser${concurrency > 1 ? 's' : ''} in parallel`);
  logger.info(`Output:      ${output}`);
  logger.info(`Mode:        ${headful ? 'Headful' : 'Headless'}`);
  if (skipEmails) logger.info('Emails:      Skipped (--skip-emails)');
  console.log('');

  if (concurrency > 1) {
    logger.warn(`Running ${concurrency} browsers in parallel. RAM usage will be higher.`);
    console.log('');
  }

  const startTime = Date.now();

  let cityDataMap: Map<string, Business[]>;

  if (concurrency <= 1) {
    // Sequential mode (original behavior)
    cityDataMap = await runSequentialBatch(queryTemplate, limit, headful, cities, skipEmails);
  } else {
    // Parallel mode with worker pool
    cityDataMap = await runParallelBatch(queryTemplate, limit, headful, cities, concurrency, skipEmails);
  }

  // Count total
  let totalScraped = 0;
  for (const data of cityDataMap.values()) {
    totalScraped += data.length;
  }

  // Export
  console.log('');
  const exportSpinner = ora({ text: 'Exporting all cities to Excel...', color: 'green' }).start();

  try {
    await exportBatchToExcel(cityDataMap, output);
    exportSpinner.succeed('Batch Excel export complete!');
  } catch (err) {
    exportSpinner.fail('Batch Excel export failed.');
    logger.error((err as Error).message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  logger.success(`Batch complete! ${totalScraped} businesses across ${cities.length} cities in ${elapsed}s`);
  logger.dim(`Output: ${output} (${cityDataMap.size} sheets)`);
  console.log('');
}

/**
 * ═══════════════════════════════════════════════════════════════════
 * MULTI-KEYWORD × MULTI-CITY MODE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Algorithm:
 *   for each keyword (sequential — keeps memory bounded):
 *     scrape keyword × ALL cities (parallel worker pool, concurrency-limited)
 *     export that keyword's data to its own .xlsx file
 *     release memory for next keyword
 *
 * Time Complexity:
 *   O(K × ⌈C/P⌉ × T)  where K=keywords, C=cities, P=concurrency, T=scrape time per query
 *
 * Space Complexity:
 *   O(C × N)  where N=average leads per city — only one keyword's data in memory
 *
 * Output Structure:
 *   One .xlsx per keyword, each containing:
 *     - Summary sheet (overview of all cities for that keyword)
 *     - One sheet per city with leads + Remarks column
 */
async function runMultiKeywordMode(
  queryTemplate: string,
  limit: number,
  output: string,
  headful: boolean,
  keywords: string[],
  cities: string[],
  concurrency: number,
  skipEmails: boolean,
): Promise<void> {
  const totalQueries = keywords.length * cities.length;

  logger.info(`╔══════════════════════════════════════════════════════╗`);
  logger.info(`║       MULTI-KEYWORD × MULTI-CITY BULK MODE         ║`);
  logger.info(`╚══════════════════════════════════════════════════════╝`);
  console.log('');
  logger.info(`Template:    "${queryTemplate}"`);
  logger.info(`Keywords:    ${keywords.length} (${keywords.slice(0, 3).join(', ')}${keywords.length > 3 ? '...' : ''})`);
  logger.info(`Cities:      ${cities.length} (${cities.slice(0, 5).join(', ')}${cities.length > 5 ? '...' : ''})`);
  logger.info(`Total Runs:  ${totalQueries} queries (${keywords.length} keywords × ${cities.length} cities)`);
  logger.info(`Limit:       ${limit} per query`);
  logger.info(`Concurrency: ${concurrency} parallel browser${concurrency > 1 ? 's' : ''}`);
  logger.info(`Output:      ${output} (one file per keyword)`);
  if (skipEmails) logger.info('Emails:      Skipped (--skip-emails)');
  console.log('');

  if (concurrency > 1) {
    logger.warn(`Running ${concurrency} browsers in parallel. RAM usage will be higher.`);
    console.log('');
  }

  const startTime = Date.now();
  let grandTotal = 0;
  const allFiles: string[] = [];

  // Process one keyword at a time (sequential over keywords to keep memory low)
  for (let ki = 0; ki < keywords.length; ki++) {
    const keyword = keywords[ki];
    const keywordStartTime = Date.now();

    console.log('');
    logger.info(`${'━'.repeat(60)}`);
    logger.info(`KEYWORD ${ki + 1}/${keywords.length}: "${keyword}"`);
    logger.info(`${'━'.repeat(60)}`);

    // Build the query template for this keyword
    const keywordQuery = queryTemplate.replace(/\[keyword\]/gi, keyword);

    // Scrape all cities for this keyword using the parallel worker pool
    let cityDataMap: Map<string, Business[]>;
    if (concurrency <= 1) {
      cityDataMap = await runSequentialBatch(keywordQuery, limit, headful, cities, skipEmails);
    } else {
      cityDataMap = await runParallelBatch(keywordQuery, limit, headful, cities, concurrency, skipEmails);
    }

    // Count leads for this keyword
    let keywordTotal = 0;
    for (const data of cityDataMap.values()) {
      keywordTotal += data.length;
    }
    grandTotal += keywordTotal;

    // Export this keyword immediately (memory-efficient: release after export)
    const keywordMap = new Map<string, Map<string, Business[]>>();
    keywordMap.set(keyword, cityDataMap);

    try {
      const files = await exportMultiKeywordBatchToExcel(keywordMap, output);
      allFiles.push(...files);
    } catch (err) {
      logger.error(`Export failed for keyword "${keyword}": ${(err as Error).message}`);
    }

    const keywordElapsed = ((Date.now() - keywordStartTime) / 1000).toFixed(1);
    logger.success(`Keyword "${keyword}": ${keywordTotal} leads across ${cities.length} cities in ${keywordElapsed}s`);

    // Clear reference to allow GC
    cityDataMap.clear();
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  logger.info(`${'═'.repeat(60)}`);
  logger.success(`BULK SCRAPE COMPLETE!`);
  logger.info(`${'═'.repeat(60)}`);
  logger.info(`Total Leads:    ${grandTotal}`);
  logger.info(`Keywords:       ${keywords.length}`);
  logger.info(`Cities:         ${cities.length}`);
  logger.info(`Total Queries:  ${totalQueries}`);
  logger.info(`Time Elapsed:   ${totalElapsed}s`);
  logger.info(`Files Created:  ${allFiles.length}`);
  allFiles.forEach((f) => logger.dim(`  → ${f}`));
  console.log('');
}

/**
 * Run batch cities one at a time (original sequential behavior).
 */
async function runSequentialBatch(queryTemplate: string, limit: number, headful: boolean, cities: string[], skipEmails: boolean): Promise<Map<string, Business[]>> {
  const cityDataMap = new Map<string, Business[]>();

  for (let c = 0; c < cities.length; c++) {
    const city = cities[c];
    const actualQuery = queryTemplate.replace(/\[city\]/gi, city);

    console.log('');
    logger.info(`━━━ City ${c + 1}/${cities.length}: ${city.toUpperCase()} ━━━`);
    logger.info(`Query: "${actualQuery}"`);

    const spinner = ora({ text: `Scraping ${city}...`, color: 'cyan' }).start();

    const rawResults = await scrapeGoogleMaps(actualQuery, limit, {
      headful,
      skipEmails,
      onProgress: (current: number, total: number) => {
        spinner.text = `[${city}] Processing listing ${current}/${total}...`;
      },
    });

    spinner.stop();

    if (rawResults.length === 0) {
      logger.warn(`No results for "${city}". Skipping.`);
      cityDataMap.set(city, []);
      continue;
    }

    const results = deduplicateBusinesses(rawResults);
    const dupeCount = rawResults.length - results.length;
    if (dupeCount > 0) logger.info(`Removed ${dupeCount} duplicates for ${city}.`);

    logger.success(`${city}: ${results.length} businesses scraped`);
    cityDataMap.set(city, results);

    // Pause between cities
    if (c < cities.length - 1) {
      logger.dim('  Waiting before next city...');
      await new Promise<void>((r) => setTimeout(r, 3000 + Math.random() * 2000));
    }
  }

  return cityDataMap;
}

/**
 * Run batch cities in parallel using a worker pool.
 * At most `concurrency` cities are scraped simultaneously.
 */
async function runParallelBatch(queryTemplate: string, limit: number, headful: boolean, cities: string[], concurrency: number, skipEmails: boolean): Promise<Map<string, Business[]>> {
  const cityDataMap = new Map<string, Business[]>();
  const totalCities = cities.length;

  // Track progress
  let completed = 0;
  const activeWorkers = new Set<string>();

  // Create a queue of cities to process
  const queue = [...cities];

  /**
   * Process a single city — launched as a parallel worker.
   */
  async function processCity(city: string): Promise<void> {
    const actualQuery = queryTemplate.replace(/\[city\]/gi, city);
    const prefix = `[${city}] `;

    logger.info(`${prefix}Starting scrape → "${actualQuery}"`);

    try {
      const rawResults = await scrapeGoogleMaps(actualQuery, limit, {
        headful,
        skipEmails,
        logPrefix: prefix,
        onProgress: null, // Don't use spinners in parallel mode (they'd conflict)
      });

      if (rawResults.length === 0) {
        logger.warn(`${prefix}No results found.`);
        cityDataMap.set(city, []);
      } else {
        const results = deduplicateBusinesses(rawResults);
        const dupeCount = rawResults.length - results.length;
        cityDataMap.set(city, results);

        let msg = `${prefix}✔ ${results.length} businesses scraped`;
        if (dupeCount > 0) msg += ` (${dupeCount} dupes removed)`;
        logger.success(msg);
      }
    } catch (err) {
      logger.error(`${prefix}Failed: ${(err as Error).message}`);
      cityDataMap.set(city, []);
    }

    completed++;
    logger.info(`Progress: ${completed}/${totalCities} cities done`);
  }

  // Worker pool: process cities with limited concurrency
  const workers: Promise<void>[] = [];

  async function runWorker(): Promise<void> {
    while (queue.length > 0) {
      const city = queue.shift();
      if (!city) break;
      activeWorkers.add(city);
      await processCity(city);
      activeWorkers.delete(city);
    }
  }

  // Launch N workers
  const workerCount = Math.min(concurrency, cities.length);
  logger.info(`Launching ${workerCount} parallel workers...`);
  console.log('');

  for (let i = 0; i < workerCount; i++) {
    workers.push(runWorker());
  }

  // Wait for all workers to finish
  await Promise.all(workers);

  // Reorder results to match original city order
  const orderedMap = new Map<string, Business[]>();
  for (const city of cities) {
    if (cityDataMap.has(city)) {
      orderedMap.set(city, cityDataMap.get(city)!);
    }
  }

  return orderedMap;
}

main().catch((err: Error) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
