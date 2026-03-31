#!/usr/bin/env node
/**
 * Replaces the placeholder LineFutures/PriceOracle import address in cadence/transactions/*.cdc
 * so open/batch/setup txs match your deployment.
 *
 * Usage (from repo root):
 *   LINE_FUTURES_ADDRESS=0x1234567890abcdef node scripts/sync-flow-cadence-address.mjs
 *
 * Address must be 16 hex chars (with or without 0x). Same account is used for both contracts
 * when you deploy PriceOracle + LineFutures to one Flow account.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = '0x0000000000000001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TX_DIR = join(ROOT, 'cadence', 'transactions');

function normalizeAddr(raw) {
  const s = String(raw || '').trim();
  if (!s) {
    console.error('Set LINE_FUTURES_ADDRESS to your deployed account (16 hex chars).');
    process.exit(1);
  }
  const hex = s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s;
  if (!/^[a-fA-F0-9]{16}$/.test(hex)) {
    console.error('LINE_FUTURES_ADDRESS must be exactly 16 hex characters (Flow address).');
    process.exit(1);
  }
  return `0x${hex.toLowerCase()}`;
}

async function main() {
  const addr = normalizeAddr(process.env.LINE_FUTURES_ADDRESS);
  const files = await readdir(TX_DIR);
  const cdc = files.filter((f) => f.endsWith('.cdc'));
  let touched = 0;
  for (const name of cdc) {
    const path = join(TX_DIR, name);
    let src = await readFile(path, 'utf8');
    if (!src.includes(PLACEHOLDER)) continue;
    const next = src.split(PLACEHOLDER).join(addr);
    if (next !== src) {
      await writeFile(path, next, 'utf8');
      touched += 1;
      console.log(`updated ${path}`);
    }
  }
  if (touched === 0) {
    console.log(`No files contained ${PLACEHOLDER}; nothing to do.`);
  } else {
    console.log(`\nSynced ${touched} file(s) to ${addr}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
