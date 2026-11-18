// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, and a model sandbox that re-ranks the board live. No
// network: every byte it shows is in data.js.
//
// The sandbox changes only what this page shows: the board's ranks and implied values in
// board.json stay the submitted model's. A note says so whenever the sandbox is on.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var sandbox = { active: false, base: DATA.model.base_multiple, weight: DATA.model.growth_weight, cap: DATA.model.growth_cap, floor: DATA.model.maturity_floor };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The sandbox feeds it different constants; the submitted model is DATA.model.
  function impliedOf(row, model) {
    var growth = Math.min(model.cap, Math.max(model.floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.weight;
    var age = row.age_days === null || row.age_days === undefined ? DATA.model.unknown_age_days : row.age_days;
    var maturity = model.floorM + (Math.min(Math.max(age, 0), DATA.model.maturity_days) / DATA.model.maturity_days) * DATA.model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base * growthMult * maturity));
  }
  function submittedModel() {
    var m = DATA.model;
    return { base: m.base_multiple, weight: m.growth_weight, cap: m.growth_cap, floor: m.growth_floor, floorM: m.maturity_floor };
  }
  function sandboxModel() {
    return { base: sandbox.base, weight: sandbox.weight, cap: sandbox.cap, floor: DATA.model.growth_floor, floorM: sandbox.floor };
  }
  function shownImplied(row) {
    return sandbox.active ? impliedOf(row, sandboxModel()) : row.implied_value_usd;
  }

  // Category context for the detail view: the median implied value of every board row that
  // shares this row's category, from the submitted values in data.js. It is context beside
  // the model's own number, never an input to it: the model scores each protocol alone,
  // and this median is computed in the page from the same rows the board shows.
  function categoryPeers(row) {
    return DATA.rows.filter(function (r) { return r.category === row.category; });
  }
  function categoryMedian(row) {
    var values = categoryPeers(row).map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    if (values.length === 0) return null;
    var mid = Math.floor(values.length / 2);
    return values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  }
  function categoryLabel(row) {
    return row.category || 'Uncategorised';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  // The chain family decides the farm plan's fee wording and its bridge note, exactly as in
  // lib/model.ts: Ethereum mainnet, an optimistic rollup, a ZK rollup, Solana, BNB Chain,
  // Polygon and Bitcoin each move funds and charge fees differently, and a chain no family
  // claims keeps the neutral wording.
  function chainFamily(p) {
    var chain = chainOf(p).toLowerCase();
    if (chain === 'ethereum') return 'ethereum';
    if (chain.indexOf('solana') >= 0) return 'solana';
    if (chain.indexOf('binance') >= 0 || chain === 'bsc' || chain.indexOf('op_bnb') >= 0 || chain.indexOf('opbnb') >= 0) return 'bnb';
    if (chain === 'polygon') return 'polygon';
    if (chain === 'bitcoin') return 'bitcoin';
    var optimistic = ['arbitrum', 'optimism', 'base', 'mantle', 'mode', 'blast', 'ink', 'world chain', 'unichain', 'soneium', 'lisk'];
    for (var i = 0; i < optimistic.length; i++) if (chain.indexOf(optimistic[i]) >= 0) return 'optimistic';
    var zk = ['zksync', 'linea', 'scroll', 'starknet', 'polygon zkevm'];
    for (var j = 0; j < zk.length; j++) if (chain.indexOf(zk[j]) >= 0) return 'zk';
    return 'other';
  }
  function gasNote(p) {
    var family = chainFamily(p);
    if (family === 'ethereum') return 'about $3 to $8 of gas a transaction on Ethereum';
    if (family === 'solana') return 'under $0.10 of gas a transaction on Solana';
    if (family === 'bnb') return 'about $0.10 to $0.50 of gas a transaction on BNB Chain';
    if (family === 'polygon') return 'about $0.05 to $0.30 of gas a transaction on Polygon';
    if (family === 'optimistic' || family === 'zk') return 'about $0.05 to $0.50 of gas a transaction on this layer 2';
    if (family === 'bitcoin') return 'a network fee that moves with mempool congestion on Bitcoin';
    return 'about $0.50 to $2 of gas a transaction on this chain';
  }
  function weeklyGasNote(p) {
    var family = chainFamily(p);
    if (family === 'ethereum') return 'about $3 to $8 of gas a week';
    if (family === 'solana') return 'under $0.10 of gas a week';
    if (family === 'bnb') return 'about $0.10 to $0.50 of gas a week';
    if (family === 'polygon') return 'about $0.05 to $0.30 of gas a week';
    if (family === 'optimistic' || family === 'zk') return 'about $0.05 to $0.50 of gas a week';
    if (family === 'bitcoin') return 'one network fee a week, set by mempool congestion';
    return 'about $2 of gas a week';
  }
  function chainMoveNote(p) {
    var chain = chainOf(p);
    var family = chainFamily(p);
    if (family === 'ethereum') return 'Funds settle directly on Ethereum, so batch the setup into as few transactions as the app allows.';
    if (family === 'optimistic') return 'Bridge the funds in from Ethereum first (about ten minutes); a bridge back takes about seven days, so plan to leave the position on the rollup until the holding window ends.';
    if (family === 'zk') return 'Bridge the funds in from Ethereum first (about ten minutes); a bridge back settles once the validity proof posts, typically within a day.';
    if (family === 'solana') return 'No bridge is needed once the wallet is funded on Solana: transfers settle in seconds, so the position can open in one session.';
    if (family === 'bnb') return 'Move the funds onto BNB Chain once at the start; transfers then settle in a few seconds, so later actions never wait on a bridge.';
    if (family === 'polygon') return 'Bridge the funds in from Ethereum first (about ten minutes through the Polygon bridge); transfers then settle in seconds for a few cents.';
    if (family === 'bitcoin') return 'Send the funds in one transaction and wait for at least one confirmation (about ten minutes a block) before the first action.';
    return 'Move the funds onto ' + chain + ' once at the start, and check the bridge or transfer time before the first action so the position opens in one session.';
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('chain') >= 0) return 'Use $' + capital + ' across ' + name + ' on ' + chain + ' and keep the position active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the deposit on ' + name + ' and repay it within the week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Swap a small amount in " + name + "'s main pool on " + chain + ' so the wallet shows trading activity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge on ' + name + ' and open a fresh one, so the wallet shows repeated use.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market on ' + name + ' and place a second, smaller position.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Move a small amount between two ' + name + ' vaults on ' + chain + ' so the wallet shows allocation activity.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim the staking rewards on ' + name + ' once, then restake them.';
    if (c.indexOf('stable') >= 0) return 'Redeem a small part of the stable position through ' + name + ' and deposit it again.';
    if (c.indexOf('rwa') >= 0) return 'Claim the yield the ' + name + ' position earned and add it back to the position.';
    if (c.indexOf('governance') >= 0) return "Vote once in " + name + "'s governance with the position held.";
    return 'Make a second, different action on ' + name + ' on ' + chain + ', such as a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasNote(p);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain) + ' ' + chainMoveNote(p), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: secondActionFor(p, chain), cost: gas, time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: weeklyGasNote(p), time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = shownImplied(a); bv = shownImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { html: 'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record</b>. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, and ' + DATA.excluded_size + ' products of tokens that already trade are set aside, not ranked. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Products set aside' }), el('b', { text: String(DATA.excluded_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  // The spotlight strip: the board's ten strongest rows as cards above the table, so a
  // reader who only has a minute sees where the model puts the value before scrolling.
  // The cards follow the table's own numbers — under the sandbox they re-rank with the
  // reader's constants, and the strip says so — and each card opens the same detail
  // drawer as its table row.
  function spotlightStrip() {
    var top = DATA.rows.slice().sort(function (a, b) {
      var diff = shownImplied(b) - shownImplied(a);
      return diff !== 0 ? diff : (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
    }).slice(0, 10);
    var cards = top.map(function (r, i) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'spot-rank', text: '#' + (i + 1) }),
        el('b', { class: 'spot-name', text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains[0] : 'an unnamed chain') }),
        el('span', { class: 'spot-value num', text: fmtUsd(shownImplied(r)) }),
        el('span', { class: 'sub', text: 'TVL ' + fmtUsd(r.tvl_usd) + ' · 7d ' }),
        el('span', { class: 'sub num ' + growthClass, text: fmtPct(r.change_7d) })
      );
    });
    return el('section', { class: 'panel spotlight', 'aria-label': 'Top ten spotlight' },
      el('div', { class: 'spot-head' },
        el('h2', { text: 'Top 10 spotlight' }),
        el('span', { class: 'sub', text: sandbox.active ? 'Ranked by your sandbox constants, not the submitted board.' : 'The ten strongest implied values on the submitted board. Select a card for its model and farm plan.' })
      ),
      el('div', { class: 'spot-grid' }, cards)
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    function tabButton(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var countText = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.excluded.length + ' products set aside';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, tabButton('pre-token', 'Pre-token'), tabButton('live', 'Live token'), tabButton('excluded', 'Set aside'))),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return shownImplied(r); })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownImplied(r)) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' + (sandbox.active ? ' Sandbox on: values are your constants, not the submitted board.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function excludedTable() {
    var tbody = el('tbody');
    DATA.excluded.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', null, el('span', { class: 'reason', text: r.reason }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Set aside, not ranked: these protocols record no token, but each is a product of a token that already trades. A board that ranked them would crown a staked-ETH product, a bridge or an exchange, not a protocol still to launch.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Why it is set aside' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Seven-day moves are clamped because one wild week must not crown a small protocol, and the growth cap is the 99th percentile of the snapshot, not a guess. The early radar is every pre-token protocol below the watchlist floor, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  function sandboxPanel() {
    function slider(id, label, min, max, step, value, oninput) {
      var out = el('b', { text: String(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      // 'input' moves the label live; 'change' (on release) re-ranks, so dragging never
      // rebuilds the slider under the pointer.
      input.addEventListener('input', function () { oninput(parseFloat(input.value)); out.textContent = input.value; });
      input.addEventListener('change', function () { setActive(); });
      return el('div', { class: 'slider' }, el('label', { for: id }, el('span', { text: label }), out), input);
    }
    function setActive() {
      sandbox.active = sandbox.base !== DATA.model.base_multiple || sandbox.weight !== DATA.model.growth_weight || sandbox.cap !== DATA.model.growth_cap || sandbox.floor !== DATA.model.maturity_floor;
      render();
    }
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to the submitted model', onclick: function () {
      sandbox.base = DATA.model.base_multiple; sandbox.weight = DATA.model.growth_weight; sandbox.cap = DATA.model.growth_cap; sandbox.floor = DATA.model.maturity_floor; setActive();
    } });
    return el('section', { class: 'panel sandbox' },
      el('h2', { text: 'Model sandbox: change the constants, watch the board re-rank' }),
      el('p', { class: 'sub', text: 'The same function, your constants. The sandbox changes only this page: the submitted board keeps the model above.' }),
      el('div', { class: 'sliders' },
        slider('sb-base', 'Base multiple (TVL share)', 0.1, 0.5, 0.05, sandbox.base, function (v) { sandbox.base = v; }),
        slider('sb-weight', 'Growth weight', 0, 1, 0.1, sandbox.weight, function (v) { sandbox.weight = v; }),
        slider('sb-cap', 'Growth cap (%)', 50, 300, 25, sandbox.cap, function (v) { sandbox.cap = v; }),
        slider('sb-floor', 'Maturity floor', 0.4, 0.8, 0.05, sandbox.floor, function (v) { sandbox.floor = v; })
      ),
      el('div', null, reset),
      sandbox.active ? el('p', { class: 'sandbox-note', text: 'Sandbox on: the Implied value column shows your constants. Reset to see the submitted board again.' }) : null
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, submittedModel());
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var peers = categoryPeers(row);
    var median = categoryMedian(row);
    var medianRatio = median !== null && median > 0 ? row.implied_value_usd / median : null;
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: categoryLabel(row) + ' median implied' }), el('b', { class: 'num', text: median === null ? 'n/a' : fmtUsd(median) })),
        el('div', null, el('span', { text: 'Protocols in this category' }), el('b', { class: 'num', text: String(peers.length) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
      el('p', { class: 'sub', text: peers.length <= 1
        ? 'Category context: this is the only ' + categoryLabel(row) + ' protocol on the board, so the category median is its own implied value.'
        : 'Category context: across the ' + peers.length + ' ' + categoryLabel(row) + ' protocols on the board, the median implied value is ' + fmtUsd(median) + (medianRatio === null ? '.' : ', so this protocol sits at ' + medianRatio.toFixed(2) + 'x the median of its category.') + ' The median is context only: it never feeds the model, which scores this protocol on its own figures alone.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(spotlightStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : state.tab === 'live' ? liveTable() : excludedTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(sandboxPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
