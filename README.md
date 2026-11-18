# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gonjol178/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gonjol178/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar is a pre-token launch radar: it ranks every genuine pre-token protocol in the sealed DefiLlama snapshot by an implied token value, and gives each one a concrete farm plan. Its board opens with a top-10 spotlight strip, and every detail view places a protocol beside the median implied value of its own category.

## The model (radar-2)

`implied = round(tvl_usd x 0.25 x (1 + clamp(change_7d, -40, 150) / 100 x 0.5) x (0.6 + min(age_days, 1095) / 1095 x 0.4))`

Three snapshot figures only: TVL, seven-day growth, and time listed with no token. No
protocol name is special-cased.

## The exclusion rule

The board ranks only genuine pre-token protocols. It applies the snapshot's own watchlist
rule to the whole board: a wrapped, staked or bridged product of a token that already
trades, a bridge, a liquid-staking product, a CEX, or a versioned pool is set aside, not
ranked — and shown in the dashboard's "Set aside" view with the reason. On this snapshot
that sets aside 144 of 342 pre-token records; without it the top of the board would be a
staked-ETH product, a bridge and an exchange.

## The board

198 rows: all 40 watchlist protocols plus every other pre-token protocol the rule keeps
(no TVL sample, no cap). Live-token protocols (24 by market cap) are shown separately
with their market caps, never mixed into the ranking.

## The dashboard

Static page, no network: a top-10 spotlight strip above the sortable/filterable board,
per-protocol detail with the model's own breakdown, the median implied value of the
protocol's category for context, and a 7-step farm plan whose steps carry chain-aware
cost and time notes (each step with cost and time), a "Set aside" view, and a model
sandbox that re-ranks the board live from different constants.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22+, standard library only. Deterministic: two runs write the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1k4fvxxj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
