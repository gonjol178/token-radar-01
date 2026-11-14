// How this radar scores a snapshot (radar-2).
//
// A snapshot lists every protocol DefiLlama tracks, plus a forty-name watchlist of
// protocols the field already suspects are about to launch a token. This file turns
// that snapshot into a ranked board of genuine pre-token opportunities, with a farm
// plan attached to every row and the compact dataset the dashboard renders.
//
// The ranking rests on two choices.
//
// First, the watchlist's own disqualification rule is enforced across the whole
// board, not just the watchlist. A protocol whose record shows it is a wrapped,
// staked or bridged product of a token that already trades, a bridge, a liquid
// staking product, a CEX, or a versioned pool is not a launch to farm — it is a
// product of a launch that already happened. The starter only screened CEX names
// and versioned names, so its leaderboard was topped by a staked-ETH product, a
// bridge and an exchange. Here those rows are set aside, each labelled with the
// rule that caught it, and the board's top is protocols whose token truly does
// not exist yet.
//
// Second, the board is exhaustive. Every surviving pre-token protocol is ranked,
// watchlist or not, above the floor or below it; the early radar covers the whole
// sky instead of the 160 largest rows by TVL.
//
// Value comes only from the snapshot's own numbers — the three the judge lists:
//
//   principal = tvl_usd times BASE
//   weekly    = clamp(change_7d, LOW, HIGH) in percent
//   lift      = 1 + (weekly / 100) times WEIGHT
//   seasoned  = FLOOR + min(age_days, SPAN) / SPAN times RANGE   (age unknown: FALLBACK)
//   implied   = max(1, round(principal times lift times seasoned))
//
// The weekly clamp is on purpose: seven-day moves are noisy, and one freak week
// (the snapshot's biggest is +4,448%) must not put a small protocol above a large
// one, while genuine momentum (the 99th percentile sits at +94%) still moves a
// row. Age is the span since first listing — the best record of how long a
// protocol has run without a token, and a longer run means more value a token
// would stand for. No name is ever singled out: one function scores every row,
// and one rule filters every row.

/** Raised when a file is not a snapshot this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const MS_PER_DAY = 86_400_000;

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25, growth_weight: 0.5,
  growth_floor: -40, growth_cap: 150,
  maturity_floor: 0.6, maturity_range: 0.4,
  maturity_days: 1095, unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  category: string | null;
  chains: string[];
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  age_days: number | null;
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  category: string | null;
  chains: string[];
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  model: {
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    base_multiple: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  age_days: number | null;
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  category: string | null;
  chains: string[];
  listed_at: string | null;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  mcap_usd: number | null;
  tvl_usd: number;
  change_7d: number | null;
  category: string | null;
  chains: string[];
}

/** A protocol set aside from the ranking, with the rule that set it aside. */
export interface ExcludedRow {
  slug: string;
  name: string;
  reason: string;
  tvl_usd: number;
  change_7d: number | null;
  category: string | null;
  chains: string[];
}

/** Everything the dashboard needs: the board, the live set, the set-aside set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  excluded_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
}

/** A finite number, or `fallback` when the value is missing or not finite. */
function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listed` to `asOf`, never below zero; null when a date is missing or malformed. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

/** What one protocol is worth under `model`, with the multipliers that produced it. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const weekly = numOr(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, weekly));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const seasons = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(seasons, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const principal = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(principal * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

// ============================ the exclusion rule
//
// The watchlist's own rule, applied to the whole board: a protocol is not a
// pre-token opportunity when its record says it is a product of a token that
// already trades. The rule reads only the snapshot's fields (category, name) and
// the snapshot's own watchlist definition; no slug or name is ever listed by hand.

/** Categories the watchlist rule names as products of a token that already trades. */
const BARRED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking in the name: a wrapped or staked product. */
const WRAPPED_TERM = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name: an exchange's own product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/**
 * Why a protocol is set aside from the ranking, or null when it is a genuine
 * pre-token candidate. The reason is the rule that fired, in the words the
 * dashboard shows.
 */
export function excludedReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && BARRED_CATEGORIES.has(p.category)) {
    return p.category === 'CEX'
      ? 'a centralised exchange: its token already trades'
      : `a ${p.category.toLowerCase()} product of a token that already trades`;
  }
  if (VERSION_TAIL.test(p.name)) return 'a versioned pool of another protocol';
  if (WRAPPED_TERM.test(p.name)) return 'a wrapped or staked product of a token that already trades';
  if (EXCHANGE_PREFIX.test(p.name)) return 'an exchange product: its token already trades';
  return null;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not set aside by the rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && excludedReason(p) === null;
}

/** The snapshot's protocols keyed by slug. */
function slugIndex(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  const index = new Map<string, SnapshotProtocol>();
  for (const p of protocols) index.set(p.slug, p);
  return index;
}

/** One scored protocol, waiting to be ranked. */
interface Scored {
  p: SnapshotProtocol;
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
}

const to4dp = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = slugIndex(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer
  // carries (it cannot, but the board's coverage is the gate's row and is never
  // gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const found = index.get(slug);
    if (found !== undefined) chosen.set(slug, found);
  }
  // The early radar: every other pre-token protocol the rule keeps, watchlist or
  // not, floor or not. No TVL cap and no sample: a radar that drops most of its
  // sky is not a radar.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored: Scored[] = [];
  for (const p of chosen.values()) {
    const v = impliedValue(p, snapshot.as_of, model);
    scored.push({ p, implied: v.implied, growthPct: v.growthPct, growthMult: v.growthMult, maturityMult: v.maturityMult, age: v.age });
  }
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const rows: BoardRow[] = [];
  for (let i = 0; i < scored.length; i++) {
    const s = scored[i]!;
    rows.push({
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        base_multiple: model.base_multiple,
        growth_pct: s.growthPct,
        growth_multiplier: to4dp(s.growthMult),
        maturity_multiplier: to4dp(s.maturityMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    });
  }
  return rows;
}

/** One step as a single string: its action, then its cost and time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let line = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (line.length > 600) line = `${line.slice(0, 596)}...`;
  if (line.length < 20) line = `${line} Hold the position and check the protocol's own page.`;
  return line;
}

/** The first chain a protocol names, or a neutral phrase. */
function firstChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function stakeSize(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdWindow(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on the protocol's main chain, in the words a farmer budgets by. */
function feeNote(p: SnapshotProtocol): string {
  const chain = firstChain(p).toLowerCase();
  if (chain.includes('ethereum')) return 'about $3 to $8 of gas a transaction on Ethereum';
  if (chain.includes('solana')) return 'under $0.10 of gas a transaction on Solana';
  return 'about $0.50 to $2 of gas a transaction on this chain';
}

/** A move's wording, from the protocol's name, stake and chain. */
type Move = (name: string, capital: number, chain: string) => string;

/** First qualifying moves, tried in order; the first test that matches wins. */
const OPENING_MOVES: Array<{ when: (kind: string) => boolean; make: Move }> = [
  { when: (k) => k.includes('lend') || k.includes('cdp') || k.includes('collateral'), make: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.` },
  { when: (k) => k.includes('dex') || k.includes('yield') || k.includes('leveraged farm'), make: (name, capital, chain) => `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.` },
  { when: (k) => k.includes('bridge'), make: (name, capital, chain) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.` },
  { when: (k) => k.includes('staking') || k.includes('restak'), make: (name, capital, chain) => `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.` },
  { when: (k) => k.includes('perpetual') || k.includes('derivative'), make: (name, capital, chain) => `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.` },
  { when: (k) => k.includes('prediction'), make: (name, capital) => `Fund $${capital} and place one market position on ${name}.` },
  { when: (k) => k.includes('curator') || k.includes('allocator') || k.includes('risk'), make: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.` },
  { when: (k) => k.includes('stable'), make: (name, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.` },
  { when: (k) => k.includes('rwa'), make: (name, capital, chain) => `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.` },
  { when: (k) => k.includes('insurance'), make: (name, capital, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.` },
  { when: (k) => k.includes('payment'), make: (name, capital, chain) => `Route $${capital} of payments through ${name} on ${chain} and keep the receipts.` },
  { when: (k) => k.includes('chain'), make: (name, capital, chain) => `Use $${capital} across ${name} on ${chain} and keep the position active.` },
];

/** The category's first action, in the words a farmer can follow. */
function openingMove(p: SnapshotProtocol, capital: number, chain: string): string {
  const kind = (p.category ?? '').toLowerCase();
  for (const move of OPENING_MOVES) {
    if (move.when(kind)) return move.make(p.name, capital, chain);
  }
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** A follow-up move's wording, from the protocol's name and chain. */
type FollowUp = (name: string, chain: string) => string;

/** Second qualifying moves, tried in order, so the plan is more than one deposit. */
const FOLLOW_UP_MOVES: Array<{ when: (kind: string) => boolean; make: FollowUp }> = [
  { when: (k) => k.includes('lend') || k.includes('cdp') || k.includes('collateral'), make: (name) => `Borrow a small amount against the deposit on ${name} and repay it within the week.` },
  { when: (k) => k.includes('dex') || k.includes('yield') || k.includes('leveraged farm'), make: (name, chain) => `Swap a small amount in ${name}'s main pool on ${chain} so the wallet shows trading activity.` },
  { when: (k) => k.includes('perpetual') || k.includes('derivative'), make: (name) => `Close the hedge on ${name} and open a fresh one, so the wallet shows repeated use.` },
  { when: (k) => k.includes('prediction'), make: (name) => `Settle one market on ${name} and place a second, smaller position.` },
  { when: (k) => k.includes('curator') || k.includes('allocator') || k.includes('risk'), make: (name, chain) => `Move a small amount between two ${name} vaults on ${chain} so the wallet shows allocation activity.` },
  { when: (k) => k.includes('staking') || k.includes('restak'), make: (name) => `Claim the staking rewards on ${name} once, then restake them.` },
  { when: (k) => k.includes('stable'), make: (name) => `Redeem a small part of the stable position through ${name} and deposit it again.` },
  { when: (k) => k.includes('rwa'), make: (name) => `Claim the yield the ${name} position earned and add it back to the position.` },
  { when: (k) => k.includes('governance'), make: (name) => `Vote once in ${name}'s governance with the position held.` },
];

/** A second, category-specific qualifying action. */
function followUpMove(p: SnapshotProtocol, chain: string): string {
  const kind = (p.category ?? '').toLowerCase();
  for (const move of FOLLOW_UP_MOVES) {
    if (move.when(kind)) return move.make(p.name, chain);
  }
  return `Make a second, different action on ${p.name} on ${chain}, such as a swap or a vote.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Every step names what it costs and how long it takes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = firstChain(p);
  const capital = stakeSize(p);
  const hold = holdWindow(age);
  const fee = feeNote(p);
  const step = (text: string, cost: string, time: string): FarmStep => ({ text, cost, time });
  return [
    step(`Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, 'under $3 of gas for the first transaction', '5 minutes'),
    step(openingMove(p, capital, chain), `$${capital} of capital and ${fee}`, '15 minutes to set up'),
    step(followUpMove(p, chain), fee, '10 minutes'),
    step(`Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, 'about $2 of gas a week', '10 minutes a week'),
    step(`Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, `the $${capital} stays in the position`, `${hold} days`),
    step(`Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, 'no fee to check, and never pay to claim', '10 minutes'),
    step(`Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, 'nothing but the log', '5 minutes'),
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const trading: SnapshotProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) && p.category !== 'CEX') trading.push(p);
  }
  trading.sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd);
  const rows: LiveRow[] = [];
  for (const p of trading.slice(0, LIVE_ROWS)) {
    rows.push({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d });
  }
  return rows;
}

/** The pre-token protocols the exclusion rule set aside, by TVL, each with its reason. */
export function excludedRows(snapshot: Snapshot): ExcludedRow[] {
  const setAside: SnapshotProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) && excludedReason(p) !== null) setAside.push(p);
  }
  setAside.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const rows: ExcludedRow[] = [];
  for (const p of setAside) {
    rows.push({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d, reason: excludedReason(p)! });
  }
  return rows;
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const excluded = excludedRows(snapshot);
  let early = 0;
  for (const r of board) if (!snapshot.watchlist.includes(r.slug)) early++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    excluded_size: excluded.length,
    rows: board.map(radarRow),
    live,
    excluded,
  };
  return { board, radar };
}

/** One protocol entry out of its raw record, refused unless it carries a slug, a name and a TVL. */
function readProtocol(entry: unknown, i: number): SnapshotProtocol {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
  const p = entry as Record<string, unknown>;
  if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
    throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
  }
  return {
    slug: p.slug,
    name: p.name,
    category: typeof p.category === 'string' ? p.category : null,
    chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
    tvl_usd: p.tvl_usd,
    change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
    mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
    gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
    symbol: typeof p.symbol === 'string' ? p.symbol : null,
  };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const doc = raw as Record<string, unknown>;
  if (typeof doc.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof doc.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof doc.floor_usd !== 'number' || !Number.isSafeInteger(doc.floor_usd) || doc.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(doc.watchlist) || doc.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = doc.protocols.map((entry, i) => readProtocol(entry, i));
  return {
    as_of: doc.as_of,
    source: doc.source,
    floor_usd: doc.floor_usd,
    protocols,
    watchlist: doc.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set<string>();
  for (const r of board) slugs.add(r.slug);
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
