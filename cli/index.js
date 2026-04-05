/**
 * CLI argument parsing using yargs.
 */

const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const { validateQuery, validateLimit, validateOutput, validateAndReadParams, hasPlaceholder } = require('../utils/validators');

/**
 * Parse and validate CLI arguments.
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: node scraper.js <query> [options]')
    .command('$0 <query>', 'Scrape Google Maps for business data', (yargs) => {
      yargs.positional('query', {
        describe: 'Search query (e.g., "restaurants in Delhi" or "gym in [city]")',
        type: 'string',
      });
    })
    .option('limit', {
      alias: 'l',
      type: 'number',
      default: 10,
      describe: 'Maximum number of results to scrape per query',
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      default: 'results.xlsx',
      describe: 'Output Excel file path',
    })
    .option('headful', {
      type: 'boolean',
      default: false,
      describe: 'Run browser in headful mode (visible window)',
    })
    .option('params', {
      alias: 'p',
      type: 'string',
      describe: 'Path to a text file with city names (one per line). Use with [city] placeholder in query.',
    })
    .option('concurrency', {
      alias: 'c',
      type: 'number',
      default: 1,
      describe: 'Number of cities to scrape in parallel (batch mode only). Recommended: 3-5.',
    })
    .option('fast', {
      type: 'boolean',
      default: false,
      describe: 'Fast mode: reduce delays by 75% for faster scraping (higher detection risk).',
    })
    .option('skip-emails', {
      type: 'boolean',
      default: false,
      describe: 'Skip visiting business websites for email extraction (much faster).',
    })
    .example('node scraper.js "restaurants in Delhi" --limit=10 --output=results.xlsx')
    .example('node scraper.js "coffee shops in NYC" -l 5 -o cafes.xlsx --headful')
    .example('')
    .example('--- Batch Mode (multi-city) ---')
    .example('node scraper.js "gym in [city]" --params=cities.txt --limit=10 -o gyms.xlsx')
    .example('')
    .example('--- Fast Parallel Mode ---')
    .example('node scraper.js "gym in [city]" -p cities.txt -l 20 -c 5 --fast --skip-emails -o gyms.xlsx')
    .help('h')
    .alias('h', 'help')
    .strict()
    .parse();

  // Validate all inputs
  const query = validateQuery(argv.query);
  const limit = validateLimit(argv.limit);
  const output = validateOutput(argv.output);
  const headful = argv.headful;
  const fast = argv.fast;
  const skipEmails = argv.skipEmails;

  // Validate concurrency
  let concurrency = parseInt(argv.concurrency, 10) || 1;
  if (concurrency < 1) concurrency = 1;
  if (concurrency > 10) {
    console.log('⚠  Concurrency capped at 10 to avoid excessive resource usage.');
    concurrency = 10;
  }

  // Handle batch mode (--params)
  let batchMode = false;
  let cities = [];

  if (argv.params) {
    cities = validateAndReadParams(argv.params);

    if (!hasPlaceholder(query)) {
      throw new Error(
        'When using --params, the query must contain [city] placeholder.\n' +
        'Example: node scraper.js "gym in [city]" --params=cities.txt'
      );
    }

    batchMode = true;
  }

  return { query, limit, output, headful, batchMode, cities, concurrency, fast, skipEmails };
}

module.exports = { parseArgs };
