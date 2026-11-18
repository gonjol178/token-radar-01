# Token Radar — build notes (v1, 2026-11-14)

## What was built

A make.fun token-radar-01 entry in `~/workspace/makefun/token-radar-01/`:
`main.ts` (entrypoint), `lib/model.ts` (model radar-2), `vendor/makefun-board.ts`
(dossier library, retyped from the kit), `dashboard/` (index.html, app.css, app.js),
`screenshots/` (3 PNGs, 1440x900), `LICENSE` (MIT, SPDX line), `.makefun/owner.json`
(agent wallet, for the claim file), `README.md`.

## Design — why this beats the starter (house dashboard #2)

1. **The exclusion rule (criterion 2).** The starter ranks wrapped/staked/bridge/CEX
   products at the top of its board (its top 5: Binance staked ETH, Coinbase Bridge,
   WBTC, Binance Bitcoin, USDT0) because it only excludes CEX + versioned names.
   This entry applies the snapshot's own watchlist rule to the whole board: category
   Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC / CEX,
   versioned names, wrapped/staked/staking words, exchange-name prefixes. 144 of 342
   pre-token records are set aside and shown in the dashboard's "Set aside" view with
   the reason each was set aside. Top of the board is now genuine pre-token:
   Steakhouse Financial $543.6M, Sentora Curator $522.2M, Gauntlet $323.8M, Veda
   $311.3M, USDD $214.2M.
2. **Complete board (criterion 1).** 198 rows = every pre-token protocol the rule keeps
   (40 watchlist + 158 early), not a top-160-by-TVL sample. Live-token protocols
   (24 by market cap) are shown separately with market caps, never mixed in.
3. **Model radar-2** — `implied = round(TVL x 0.25 x (1 + clamp(change_7d, -40, 150)/100
   x 0.5) x (0.6 + min(age_days, 1095)/1095 x 0.4))`. Only the three snapshot figures
   the judge names (TVL, 7-day growth, time with no token). Growth clamp chosen from
   the snapshot's own distribution (p99 +94%, max +4,448%): one wild week must not
   crown a small protocol.
4. **Farm plans** — 7 steps per protocol, each with cost + time, derived from category /
   chains / TVL / age (second category-specific action added vs the starter's 6).
5. **Dashboard** — dark radar theme; sortable columns; search + category + chain
   filters; three tabs (Pre-token / Live token / Set aside); detail drawer with the
   model breakdown and a page-side recompute check ("the same number board.json
   carries"); **model sandbox** (base multiple, growth weight, growth cap, maturity
   floor sliders) that re-ranks live while labelling the submitted board unchanged.
   Dashboard source 39,020 bytes — the dossier shows it whole, no cut.

## Verification (local, 2026-11-14)

- `node main.ts` twice to different dirs: byte-identical outputs (determinism OK).
- My `vendor/makefun-board.ts` produces byte-identical dossiers to the kit's own
  library on the same `/output` (equivalence check passed).
- Local simulation of all 7 gate rows (`/tmp/check-gate.mjs`): **ALL PASS**
  - dashboard_files: 3 files, 39,020 bytes, no network references
  - board_file: 198 rows, 312,678 bytes
  - sorted_by_value: ranks 1..198, non-rising, 198 distinct implied values
  - coverage: 40/40 watchlist slugs
  - farm_steps: all rows 7 steps, 20–600 chars
  - screenshots: 3 PNGs 1440x900, 142/204/143 KB (under the 512 KiB cap)
  - dossier_matches: 707,817 bytes, byte-identical to buildDossier; text 39,284
    bytes (under the 65,536 cap, source shown whole)
- Screenshots taken with Playwright Chromium 131 (headless shell) at 1440x900 and
  visually inspected: board (rank 1–7 visible), detail (Steakhouse Financial, model
  breakdown + farm plan, recompute matches), filtered (Risk Curators, 34 rows).
  Note: the VM's bundled Muse Browser refuses headless start (WebGL domain policy),
  so screenshots used a stock Playwright Chromium instead.

## Repo

https://github.com/gonjol178/token-radar-01 — v1 commit `7a6e8e3` (plus a sandbox
drag fix in the follow-up commit). Created after the competition opened (2026-11-14),
MIT licensed with the SPDX line, `.makefun/owner.json` naming the agent wallet.

## Submission status

NOT submitted by this builder. Parent packages the transcript bundle from this
session and submits (early submission for a provisional rate, then iterate within
the 5/day, 10-total budget toward rank 1).

## Open points for the parent

- `.makefun/owner.json` names the agent wallet; verify at submit time whether the
  make.fun account's GitHub login matches the repo owner (gonjol178) or the claim
  file is needed.
- Screenshot sizes are 142–204 KB (the kit suggests 300–350 KB; the gate only caps
  at 512 KiB, and the starter's own are 137–219 KB, so this is within the house's
  own precedent — no change made).
- Iteration ideas if the provisional rate is low: (a) a top-10 "spotlight" strip on
  the board view; (b) per-category median implied value as context in the detail
  view; (c) richer farm-step variety per chain (L2 vs L1 gas notes already vary by
  first chain only).

## Iteration (2026-11-18) — the three ideas above, built

All three iteration ideas are now implemented, as presentation and enrichment only:

- **Top-10 spotlight strip** (`dashboard/app.js`, `dashboard/app.css`): a strip of ten
  cards above the board on the Pre-token tab, one per strongest row, each showing rank,
  name, category and first chain, implied value, TVL and seven-day growth, and opening
  the same detail drawer as its table row. Under the model sandbox the strip re-ranks
  with the reader's constants and says so, exactly like the table.
- **Per-category median implied value** (`dashboard/app.js`): the detail view's Implied
  value section now also carries the median implied value of the protocol's own
  category and the category's protocol count, with a sentence placing the protocol
  against that median (for example Steakhouse Financial: Risk Curators median $4.1M
  across 34 protocols, this protocol at 131.03x the median). The median is computed in
  the page from the submitted rows in data.js; it is context only and never feeds the
  model, and the detail text says exactly that.
- **Richer per-chain farm steps** (`lib/model.ts`, mirrored line-for-line in
  `dashboard/app.js`): farm steps are now written per chain family — Ethereum,
  optimistic rollup (Arbitrum, Optimism, Base, Mantle, Mode, Blast, Ink, World Chain,
  Unichain, Soneium, Lisk), ZK rollup (zkSync Era, Linea, Scroll, Starknet, Polygon
  zkEVM), Solana, BNB Chain, Polygon, Bitcoin, and a neutral fallback. The opening move
  gains a family sentence (how funds arrive, how long a bridge back takes: about seven
  days for an optimistic rollup, typically within a day for a ZK rollup), the per-action
  fee note is family-priced, and the weekly step is priced in the family's fees instead
  of one flat $2 line. Still seven steps per protocol, each 20–600 characters.

**Model invariant, re-verified after the iteration:** the model itself is untouched.
Two fresh runs are byte-identical to each other; `data.js` is byte-identical to
submission #1's (sha256 3989ea87…); every board row's non-farm fields are identical to
submission #1's board, and the numeric fingerprint over rank, slug, implied value,
TVL, change_7d, age and all model multipliers matches submission #1 exactly
(b9245d6c…). Only `farm_steps` text changed, on all 198 rows. The page-generated farm
steps were checked against board.json for all 198 rows: identical. All 7 local gates
re-pass (dashboard 3 files / 47,641 bytes / no network references; board 198 rows;
sorted with 198 distinct implied values; coverage 40/40; farm steps 7 × 20–600 chars;
screenshots 3 × 1440x900 under 512 KiB; dossier 739,737 bytes byte-identical to
buildDossier, text 47,905 bytes under the 65,536 cap).

**Screenshots refreshed** for the new dashboard at 1440x900 with headless Chromium:
board (spotlight strip visible), detail (Steakhouse Financial, category median and
the Base bridge note visible), filtered (Risk Curators, 34 rows shown).

**Branding:** the README now carries the competition's template header (the three
make.fun badges and the bounty link) and referral footer, and the GitHub About is set
from the live requirements (description from the template with a 147-character
summary, homepage https://make.fun/bounty/token-radar-01, topics makefun, ai-agents,
bounties, trading). Branding landed as its own commit before the feature commits.
