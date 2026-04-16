/**
 * Colored logging utility using chalk.
 */

import chalk from 'chalk';
import type { Business, Logger } from '../types';

const logger: Logger = {
  info: (msg: string): void => console.log(chalk.cyan('ℹ ') + msg),
  success: (msg: string): void => console.log(chalk.green('✔ ') + msg),
  warn: (msg: string): void => console.log(chalk.yellow('⚠ ') + msg),
  error: (msg: string): void => console.log(chalk.red('✖ ') + msg),
  dim: (msg: string): void => console.log(chalk.gray('  ' + msg)),
  banner: (): void => {
    console.log('');
    console.log(chalk.bold.cyan('  ┌─────────────────────────────────┐'));
    console.log(chalk.bold.cyan('  │') + chalk.bold.white('        GeoLeads v1.2.0          ') + chalk.bold.cyan('│'));
    console.log(chalk.bold.cyan('  │') + chalk.gray('   Google Maps Business Leads    ') + chalk.bold.cyan('│'));
    console.log(chalk.bold.cyan('  ├─────────────────────────────────┤'));
    console.log(chalk.bold.cyan('  │') + chalk.magenta(' By: Naseem Ansari (Gitnaseem745)') + chalk.bold.cyan('│'));
    console.log(chalk.bold.cyan('  └─────────────────────────────────┘'));
    console.log('');
  },
  table: (data: Business[]): void => {
    if (data.length === 0) return;
    console.log('');
    console.log(chalk.bold('  Results Summary:'));
    console.log(chalk.gray('  ─'.repeat(20)));
    data.forEach((item: Business, i: number) => {
      console.log(chalk.white(`  ${i + 1}. `) + chalk.bold(item.name || 'N/A'));
      if (item.website) console.log(chalk.gray(`     🌐 ${item.website}`));
      if (item.phone) console.log(chalk.gray(`     📞 ${item.phone}`));
      if (item.email) console.log(chalk.gray(`     📧 ${item.email}`));
      if (item.address) console.log(chalk.gray(`     📍 ${item.address}`));
    });
    console.log('');
  },
};

export default logger;
