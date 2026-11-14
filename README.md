# Token Radar — a pre-token launch radar (make.fun token-radar-01)

Ranks every genuine pre-token protocol in the sealed DefiLlama snapshot by an implied
token value, and gives each one a concrete farm plan.

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

Static page, no network: sortable/filterable board, per-protocol detail with the model's
own breakdown and a 7-step farm plan (each step with cost and time), a "Set aside" view,
and a model sandbox that re-ranks the board live from different constants.

## Run

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22+, standard library only. Deterministic: two runs write the same bytes.
