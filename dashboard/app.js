// app.js: wiring. Score the snapshot once, fill the header, then show the board or one protocol's
// detail view, whichever the URL hash names.

const radar = buildRadar(window.SNAPSHOT);
const rowBySlug = new Map(radar.rows.map((r) => [r.slug, r]));

/** How many of the page's ranked values equal what main.ts wrote to board.json. */
function boardAgreement() {
  const board = window.BOARD_VALUES || {};
  return radar.ranked.filter((r) => board[r.slug] === r.value).length;
}

function renderHeader() {
  const m = radar.market, ranked = radar.ranked.length, watch = radar.ranked.filter((r) => r.watch).length;
  const count = (status) => radar.rows.filter((r) => r.status === status).length;
  document.getElementById('snapshot-meta').textContent = `DefiLlama snapshot of ${radar.asOf}, ${radar.rows.length} protocols`;
  document.getElementById('headline').textContent = `${ranked} protocols that record no token, ranked by implied value`;
  document.getElementById('model-note').textContent =
    `The ${m.peers} comparable protocols whose token already trades are worth a median ${m.allMedian.toFixed(2)}x TVL, and ${Math.round(100 * (1 - 2 ** m.sizeBeta))}% less per dollar each time TVL doubles. ` +
    `A category's own median counts n/(n+${m.shrink}) for its n peers, the weight that predicts best when each peer is valued without itself: ${Math.round(100 * radar.check.within3x)}% then land within 3x of their real market cap. ` +
    `Growth (-20% to +40%) and tenure (-25% to 0) are stated assumptions.`;
  const stats = [
    ['Watchlist covered', `${watch} / ${window.SNAPSHOT.watchlist.length}`, 'every slug is ranked'],
    ['Pre-token, ranked', `${ranked}`, `${ranked - watch} beyond the watchlist`],
    ['Kept apart', `${count('trading') + count('aside')}`, `${count('trading')} trade a token, ${count('aside')} set aside`],
    ['Matches board.json', `${boardAgreement()} / ${ranked}`, 'values recomputed in the page'],
  ];
  document.getElementById('stats').innerHTML = stats.map(([k, v, note]) => `<div><dt>${k}</dt><dd>${v}</dd>${note ? `<small>${note}</small>` : ''}</div>`).join('');
}

function route() {
  readHash();
  const row = rowBySlug.get(filterState.p);
  document.body.classList.toggle('detail', !!row);
  document.getElementById('board').hidden = !!row;
  document.getElementById('detail').hidden = !row;
  if (row) renderDetail(row, radar); else renderBoard(radar);
  if (row) scrollTo(0, 0);
}

renderHeader();
wireFilters();
wireBoard();
addEventListener('hashchange', route);
route();
