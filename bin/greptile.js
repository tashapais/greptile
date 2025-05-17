#!/usr/bin/env node

import { Command } from 'commander';
import { generateChangelog } from '../src/cli/generate.js';
import { startServer } from '../src/web/server.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get package version
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
);

const program = new Command();

program
  .name('greptile')
  .description('AI-powered changelog generator')
  .version(packageJson.version);

program
  .command('generate')
  .description('Generate a changelog from git commits')
  .option('-s, --since <date>', 'Start date for commits (e.g., "1 week ago", "2023-01-01")', '1 week ago')
  .option('-u, --until <date>', 'End date for commits', 'now')
  .option('-o, --output <path>', 'Output file (default: changelog JSON in data directory)')
  .option('-t, --title <title>', 'Changelog title (default: generates based on date range)')
  .action(generateChangelog);

program
  .command('serve')
  .description('Start the changelog web server')
  .option('-p, --port <number>', 'Port to listen on', process.env.PORT || 3000)
  .action(startServer);

program.parse(); 