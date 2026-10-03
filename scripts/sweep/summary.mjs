// node scripts/sweep/summary.mjs [results.jsonl]: markdown tables for a sweep's results.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_OUT } from '../lib/sweepOptions.mjs';
import { summarize } from '../lib/sweepSummary.mjs';

const arg = process.argv[2];
const file = arg ? resolve(arg) : DEFAULT_OUT;
if (!file.endsWith('.jsonl') || !existsSync(file)) {
  console.error('usage: npm run sweep:summary -- [results.jsonl]');
  process.exit(2);
}
const records = [];
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try {
    records.push(JSON.parse(line));
  } catch {
    console.error('skipped an unreadable line');
  }
}
try {
  process.stdout.write(summarize(records));
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
