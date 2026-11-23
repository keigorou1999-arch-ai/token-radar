// Token launch radar (make.fun token-radar-01). Node 22, standard library only, no network.
//
// Reads the sealed snapshot, ranks every pre-token protocol by implied value and writes:
//   /output/board.json   the ranked board, one row per pre-token protocol, each with its farm steps
//   /output/data.js      the snapshot for the page, plus the board's values so the page can check itself
//   /output/dashboard/   the page (copied from dashboard/)   /output/screenshots/   three views of it
//   /output/dossier.json what the judge reads, written by the vendored make.fun library
//
// The model and the farm plans live in dashboard/valueModel.js and dashboard/farmPlan.js: this program
// and the page run the same functions, so the board and the screen always agree.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);
const { buildRadar } = require('./dashboard/valueModel.js');
const { farmPlan, stepText } = require('./dashboard/farmPlan.js');

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : fallback;
}

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory>`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));
const radar = buildRadar(snapshot);

interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  farm_steps: string[];
  [extra: string]: unknown;
}

const board: BoardRow[] = radar.ranked.map((r: any) => ({
  rank: r.rank,
  slug: r.slug,
  name: r.name,
  implied_value_usd: r.value,
  on_watchlist: r.watch,
  category: r.category,
  chains: r.chains,
  tvl_usd: r.tvl_usd,
  change_7d: r.change_7d,
  days_without_token: r.days,
  model: { peer_multiple: r.peer.multiple, peers: r.peer.n, size_factor: r.size, growth_factor: r.growth, tenure_factor: r.tenure },
  farm_steps: farmPlan(r).steps.map(stepText),
}));

/** The gate's own conditions, checked before anything is written. */
function boardIssue(rows: BoardRow[]): string | null {
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows, outside 100..4000`;
  const slugs = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s: string) => !slugs.has(s));
  if (missing.length > 0) return `watchlist slugs missing: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.rank !== i + 1) return `rank ${i + 1} is ${r.rank}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug}: implied value ${r.implied_value_usd}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `${r.slug} outranks the row above it`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug}: a farm step of ${s.trim().length} characters`;
  }
  if (rows[0]!.implied_value_usd === rows[rows.length - 1]!.implied_value_usd) return 'every row has the same implied value';
  return null;
}

const issue = boardIssue(board);
if (issue !== null) fail(`the board would fail the gate: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ as_of: snapshot.as_of, model: 'implied value = TVL x peer multiple x size factor x growth factor x tenure factor', rows: board }, null, 1)}\n`);

// The page gets the raw snapshot and recomputes everything; BOARD_VALUES lets it prove it matches board.json.
const boardValues = Object.fromEntries(board.map((r) => [r.slug, r.implied_value_usd]));
writeFileSync(join(out, 'data.js'), `window.SNAPSHOT=${JSON.stringify(snapshot)};\nwindow.BOARD_VALUES=${JSON.stringify(boardValues)};\n`);

function copyFiles(from: string, to: string): string[] {
  mkdirSync(to, { recursive: true });
  const names = existsSync(from) ? readdirSync(from).filter((n) => !n.startsWith('.') && statSync(join(from, n)).isFile()).sort() : [];
  for (const name of names) copyFileSync(join(from, name), join(to, name));
  return names;
}

const pageFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} images: the board, a detail view and a filtered view are needed`);

// Written last: the scorer rebuilds the dossier from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols read, ${board.length} pre-token rows ranked, ${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist covered\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${pageFiles.length} files), screenshots/ (${shots.length}) and dossier.json to ${out}\n`,
);
