// boardTable.js: the board. One row per protocol, columns chosen by the view, any column sortable.
// Pre-token rows show the model's rank and implied value and carry their farm plan; rows whose token
// already trades show the market's own value beside what the model would have said.

function planOf(r) {
  return r.plan || (r.plan = farmPlan(r));
}

const signed = (x) => `<span class="${x > 0 ? 'up' : x < 0 ? 'down' : ''}">${percent(x)}</span>`;

/** A bar whose length is the square root of the value's share of the largest ranked value. */
function valueBar(value, largest) {
  return `<span class="bar"><i style="width:${Math.round(100 * clamp(Math.sqrt(value / largest), 0.03, 1))}%"></i></span>`;
}

const COLUMNS = {
  rank: { label: '#', sort: (r) => r.rank, cell: (r) => r.rank, cls: 'num rank' },
  name: { label: 'Protocol', sort: (r) => r.name.toLowerCase(), cls: 'who',
    cell: (r) => `<a class="name" href="#p=${r.slug}">${escapeHtml(r.name)}</a>${r.watch ? '<span class="tag watch">watchlist</span>' : ''}<small>${escapeHtml(r.category || 'No category')}</small>` },
  chains: { label: 'Chains', sort: (r) => r.chains.length, cls: 'who',
    cell: (r) => escapeHtml(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ` <small class="more">+${r.chains.length - 2}</small>` : '') },
  tvl: { label: 'TVL', sort: (r) => r.tvl_usd, cell: (r) => money(r.tvl_usd), cls: 'num', desc: true },
  change: { label: '7d TVL', sort: (r) => r.change_7d ?? -Infinity, cell: (r) => signed(r.change_7d), cls: 'num', desc: true },
  days: { label: 'No token for', sort: (r) => r.days ?? -1, cell: (r) => tenure(r.days), cls: 'num', desc: true },
  multiple: { label: 'Peer multiple', sort: (r) => r.peer.multiple, cls: 'num', desc: true,
    cell: (r) => `${r.peer.multiple.toFixed(2)}x <small>${r.peer.n} peer${r.peer.n === 1 ? '' : 's'}</small>` },
  value: { label: 'Implied value', sort: (r) => r.value, cls: 'num value', desc: true,
    cell: (r, largest) => `${valueBar(r.value, largest)}<b>${money(r.value)}</b>` },
  farm: { label: 'Farm plan', sort: (r) => planOf(r).fees,
    cell: (r) => { const f = planOf(r); return `${dollars(f.size)} on ${escapeHtml(f.chain)} <small>${f.steps.length} steps, ~${dollars(f.fees)} fees, ${f.hold} days</small>`; }, cls: 'farm' },
  symbol: { label: 'Token', sort: (r) => r.symbol || '', cell: (r) => escapeHtml(r.symbol || 'on record') },
  mcap: { label: 'Market cap', sort: (r) => r.mcap_usd ?? -1, cell: (r) => (r.mcap_usd ? `<b>${money(r.mcap_usd)}</b>` : '<small>not reported</small>'), cls: 'num', desc: true },
  ratio: { label: 'Market cap / TVL', sort: (r) => (r.mcap_usd ? r.mcap_usd / r.tvl_usd : -1), cell: (r) => (r.mcap_usd ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : ''), cls: 'num', desc: true },
  peer: { label: 'Sets the peer multiple?', sort: (r) => (isPeer(r) ? 0 : 1),
    cell: (r) => (isPeer(r) ? `<b class="up">Yes</b> <small>1 of ${r.peer.n} ${escapeHtml(r.category)} peers</small>` : `No <small>${r.mcap_usd ? asideReason(r) : 'no market cap on record'}</small>`) },
  reason: { label: 'Why it is not ranked', sort: (r) => r.category || '', cell: (r) => `Records no token, but is a ${asideReason(r)} of a token that already trades` },
};

const VIEW_COLUMNS = {
  pre: ['rank', 'name', 'chains', 'tvl', 'change', 'days', 'multiple', 'value', 'farm'],
  trading: ['name', 'chains', 'tvl', 'change', 'symbol', 'mcap', 'ratio', 'peer'],
  aside: ['name', 'chains', 'tvl', 'change', 'reason'],
};
VIEW_COLUMNS.watch = VIEW_COLUMNS.pre;
const DEFAULT_SORT = { pre: 'rank', watch: 'rank', trading: 'mcap', aside: 'tvl' };

/** Why the watchlist's rule keeps a protocol out of the ranking and out of the peer set. */
function asideReason(r) {
  return DERIVATIVE_CATEGORIES.includes(r.category) ? `${escapeHtml(r.category)} product`
    : EXCHANGE_NAME.test(r.name) ? 'exchange product' : 'versioned, wrapped or staked product';
}

/** The rows in the order the header asks for; ties fall back to implied value. */
function sortRows(rows, key, desc) {
  const by = COLUMNS[key].sort, dir = desc ? -1 : 1;
  return [...rows].sort((a, b) => { const x = by(a), y = by(b); return x < y ? -dir : x > y ? dir : b.value - a.value; });
}

function renderBoard(radar) {
  const view = currentView().id, keys = VIEW_COLUMNS[view];
  const key = keys.includes(filterState.sort) ? filterState.sort : DEFAULT_SORT[view];
  const desc = filterState.sort ? filterState.desc === '1' : !!COLUMNS[key].desc;
  const rows = sortRows(applyFilters(radar.rows), key, desc);
  const largest = radar.ranked[0].value;
  renderFilters(radar.rows, rows);
  document.getElementById('board-head').innerHTML = keys.map((k) => {
    const c = COLUMNS[k], on = k === key;
    return `<th class="${c.cls || ''}${on ? ' sorted' : ''}" data-sort="${k}" data-desc="${on ? (desc ? '' : '1') : c.desc ? '1' : ''}" title="Sort by ${c.label}">${c.label}${on ? (desc ? ' &#9660;' : ' &#9650;') : ''}</th>`;
  }).join('');
  document.getElementById('board-rows').innerHTML = rows.map((r) =>
    `<tr data-slug="${r.slug}">${keys.map((k) => `<td class="${COLUMNS[k].cls || ''}">${COLUMNS[k].cell(r, largest)}</td>`).join('')}</tr>`).join('') ||
    `<tr><td class="empty" colspan="${keys.length}">No protocol matches these filters.</td></tr>`;
}

function wireBoard() {
  document.getElementById('board-head').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (th) writeHash({ sort: th.dataset.sort, desc: th.dataset.desc });
  });
  document.getElementById('board-rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    e.preventDefault();
    writeHash({ p: tr.dataset.slug });
  });
}
