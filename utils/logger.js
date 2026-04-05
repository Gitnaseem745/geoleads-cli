/**
 * Colored logging utility using chalk.
 */

const chalk = require('chalk');

const logger = {
  info: (msg) => console.log(chalk.cyan('ℹ ') + msg),
  success: (msg) => console.log(chalk.green('✔ ') + msg),
  warn: (msg) => console.log(chalk.yellow('⚠ ') + msg),
  error: (msg) => console.log(chalk.red('✖ ') + msg),
  dim: (msg) => console.log(chalk.gray('  ' + msg)),
  banner: () => {
    console.log('');
    console.log(chalk.bold.cyan('  ┌─────────────────────────────────┐'));
    console.log(chalk.bold.cyan('  │') + chalk.bold.white('        GeoLeads v1.0.0          ') + chalk.bold.cyan('│'));
    console.log(chalk.bold.cyan('  │') + chalk.gray('   Google Maps Business Leads    ') + chalk.bold.cyan('│'));
    console.log(chalk.bold.cyan('  └─────────────────────────────────┘'));
    console.log('');
  },
  table: (data) => {
    if (data.length === 0) return;
    console.log('');
    console.log(chalk.bold('  Results Summary:'));
    console.log(chalk.gray('  ─'.repeat(20)));
    data.forEach((item, i) => {
      console.log(chalk.white(`  ${i + 1}. `) + chalk.bold(item.name || 'N/A'));
      if (item.website) console.log(chalk.gray(`     🌐 ${item.website}`));
      if (item.phone) console.log(chalk.gray(`     📞 ${item.phone}`));
      if (item.email) console.log(chalk.gray(`     📧 ${item.email}`));
      if (item.address) console.log(chalk.gray(`     📍 ${item.address}`));
    });
    console.log('');
  },
};

module.exports = logger;
