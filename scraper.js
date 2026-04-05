#!/usr/bin/env node

/**
 * GeoLeads — Google Maps Business Leads Scraper
 *
 * Entry point: orchestrates CLI parsing, scraping, and Excel export.
 *
 * Usage (single query):
 *   node scraper.js "restaurants in Delhi" --limit=10 --output=results.xlsx
 *
 * Usage (batch mode — multi-city, sequential):
 *   node scraper.js "gym in [city]" --params=cities.txt --limit=10 -o gyms.xlsx
 *
 * Usage (fast parallel mode):
 *   node scraper.js "gym in [city]" -p cities.txt -l 20 -c 5 --fast --skip-emails -o gyms.xlsx
 */

const { parseArgs } = require('./cli/index');
const { scrapeGoogleMaps } = require('./scraper/mapsScraper');
const { deduplicateBusinesses } = require('./parser/extractData');
const { exportToExcel, exportBatchToExcel } = require('./exporter/excelExport');
const logger = require('./utils/logger');
const { setSpeed } = require('./utils/delay');
const ora = require('ora');

async function main() {
  logger.banner();

  let args;
  try {
    args = parseArgs();
  } catch (err) {
    logger.error(err.message);
    process.exit(1);
  }

  const { query, limit, output, headful, batchMode, cities, concurrency, fast, skipEmails } = args;

  // Apply fast mode
  if (fast) {
    setSpeed(0.25); // 4x faster delays
    logger.warn('Fast mode enabled — delays reduced by 75%. Higher detection risk.');
  }

  if (batchMode) {
    await runBatchMode(query, limit, output, headful, cities, concurrency, skipEmails);
  } else {
    await runSingleMode(query, limit, output, headful, skipEmails);
  }
}

/**
 * Single query mode (original behavior).
 */
async function runSingleMode(query, limit, output, headful, skipEmails) {
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
    onProgress: (current, total) => {
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
    logger.error(err.message);
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
async function runBatchMode(queryTemplate, limit, output, headful, cities, concurrency, skipEmails) {
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

  let cityDataMap;

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
    logger.error(err.message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  logger.success(`Batch complete! ${totalScraped} businesses across ${cities.length} cities in ${elapsed}s`);
  logger.dim(`Output: ${output} (${cityDataMap.size} sheets)`);
  console.log('');
}

/**
 * Run batch cities one at a time (original sequential behavior).
 */
async function runSequentialBatch(queryTemplate, limit, headful, cities, skipEmails) {
  const cityDataMap = new Map();

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
      onProgress: (current, total) => {
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
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
    }
  }

  return cityDataMap;
}

/**
 * Run batch cities in parallel using a worker pool.
 * At most `concurrency` cities are scraped simultaneously.
 */
async function runParallelBatch(queryTemplate, limit, headful, cities, concurrency, skipEmails) {
  const cityDataMap = new Map();
  const totalCities = cities.length;

  // Track progress
  let completed = 0;
  const activeWorkers = new Set();

  // Create a queue of cities to process
  const queue = [...cities];

  /**
   * Process a single city — launched as a parallel worker.
   */
  async function processCity(city) {
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
      logger.error(`${prefix}Failed: ${err.message}`);
      cityDataMap.set(city, []);
    }

    completed++;
    logger.info(`Progress: ${completed}/${totalCities} cities done`);
  }

  // Worker pool: process cities with limited concurrency
  const workers = [];

  async function runWorker() {
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
  const orderedMap = new Map();
  for (const city of cities) {
    if (cityDataMap.has(city)) {
      orderedMap.set(city, cityDataMap.get(city));
    }
  }

  return orderedMap;
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
