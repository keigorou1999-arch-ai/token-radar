// filters.js: which protocols the board shows. The view (token status), the search, the category and
// chain filters and the sort order all live in the URL hash, so every filtered view has its own link.

const VIEWS = [
  { id: 'pre', label: 'Pre-token, ranked', test: (r) => r.status === 'pre' },
  { id: 'watch', label: 'Watchlist only', test: (r) => r.watch },
  { id: 'trading', label: 'Token already trades', test: (r) => r.status === 'trading' },
  { id: 'aside', label: 'Set aside', test: (r) => r.status === 'aside' },
];

const filterState = { view: 'pre', q: '', category: '', chain: '', sort: '', desc: '', p: '' };

/** "#view=watch&category=RWA&sort=change" into filterState. */
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  for (const key in filterState) filterState[key] = params.get(key) || (key === 'view' ? 'pre' : '');
}

/** The hash for the current state with some of it changed. */
function hashWith(change) {
  const next = { ...filterState, ...change }, params = new URLSearchParams();
  for (const key in next) if (next[key] && !(key === 'view' && next[key] === 'pre')) params.set(key, next[key]);
  return params.toString();
}

function writeHash(change) {
  location.hash = hashWith(change);
}

function currentView() {
  return VIEWS.find((v) => v.id === filterState.view) || VIEWS[0];
}

/** The rows of the current view that pass the search, category and chain filters. */
function applyFilters(rows) {
  const { q, category, chain } = filterState, needle = q.toLowerCase(), inView = currentView().test;
  return rows.filter((r) => inView(r) &&
    (!category || r.category === category) &&
    (!chain || r.chains.includes(chain)) &&
    (!needle || `${r.name} ${r.category} ${r.chains.join(' ')}`.toLowerCase().includes(needle)));
}

/** [value, count] pairs for a select, most common first. */
function countOptions(rows, valuesOf) {
  const counts = new Map();
  for (const r of rows) for (const v of valuesOf(r)) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

function fillSelect(id, all, options, selected) {
  document.getElementById(id).innerHTML = `<option value="">${all}</option>` +
    options.map(([v, n]) => `<option value="${escapeHtml(v)}"${v === selected ? ' selected' : ''}>${escapeHtml(v)} (${n})</option>`).join('');
}

/** Draw the view tabs, the two selects and the line that says what is shown. */
function renderFilters(allRows, shownRows) {
  const inView = allRows.filter(currentView().test);
  document.getElementById('views').innerHTML = VIEWS.map((v) =>
    `<a href="#view=${v.id}" class="${v.id === currentView().id ? 'on' : ''}">${v.label}<b>${allRows.filter(v.test).length}</b></a>`).join('');
  fillSelect('filter-category', 'All categories', countOptions(inView, (r) => [r.category]), filterState.category);
  fillSelect('filter-chain', 'All chains', countOptions(inView, (r) => r.chains), filterState.chain);
  const search = document.getElementById('filter-q');
  if (search.value !== filterState.q) search.value = filterState.q;
  const active = [filterState.category, filterState.chain && 'on ' + filterState.chain, filterState.q && `"${filterState.q}"`].filter(Boolean);
  document.getElementById('shown').innerHTML = `<b>${shownRows.length}</b> of ${inView.length} shown` +
    (active.length ? active.map((a) => `<span class="chip">${escapeHtml(a)}</span>`).join('') + '<a href="#view=' + currentView().id + '">Clear filters</a>' : '');
}

function wireFilters() {
  document.getElementById('filter-q').addEventListener('input', (e) => writeHash({ q: e.target.value }));
  document.getElementById('filter-category').addEventListener('change', (e) => writeHash({ category: e.target.value }));
  document.getElementById('filter-chain').addEventListener('change', (e) => writeHash({ chain: e.target.value }));
}
