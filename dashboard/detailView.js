// detailView.js: one protocol. How its implied value is built, factor by factor, from the snapshot's
// figures; the trading peers the multiple was measured on; and its farm plan with each step's cost and time.

/** The five lines of the valuation: each factor, where it came from, and the running value after it. */
function valuationSteps(r, market) {
  const peerNote = r.peer.n
    ? `${r.peer.n} ${r.category} peer${r.peer.n === 1 ? '' : 's'}, median ${r.peer.categoryMedian.toFixed(2)}x, pulled ${Math.round(100 * (1 - r.peer.weight))}% toward the market's ${market.allMedian.toFixed(2)}x`
    : `no ${r.category || 'category'} peer, so the median of all ${market.peers} peers`;
  const steps = [
    ['TVL', 'tvl_usd', 'as the snapshot gives it', null],
    ['Peer multiple', 'shrinkPeerMultiple', peerNote, r.peer.multiple],
    ['Size factor', 'sizeFactor', `${(r.tvl_usd / market.refTvl).toFixed(1)}x the median peer's ${money(market.refTvl)} TVL; fitted beta ${market.sizeBeta}`, r.size],
    ['Growth factor', 'growthFactor', `7-day TVL change ${percent(r.change_7d)}, at half weight`, r.growth],
    ['Tenure factor', 'tenureFactor', r.days == null ? `no start date, so the median run of ${market.medianTenure} days` : `${r.days} days with no token on record; full at ${MODEL.tenureFullDays}`, r.tenure],
  ];
  let running = r.tvl_usd;
  return steps.map(([label, fn, from, factor]) => {
    if (factor != null) running *= factor;
    return { label, fn, from, factor, running };
  });
}

function valuationTable(r, market) {
  return '<table class="build"><thead><tr><th>Factor</th><th>From the snapshot</th><th class="num">Multiply by</th><th class="num">Running value</th></tr></thead><tbody>' +
    valuationSteps(r, market).map((s) =>
      `<tr><td><b>${s.label}</b><code>${s.fn}</code></td><td>${escapeHtml(s.from)}</td><td class="num">${s.factor == null ? '' : '&times; ' + s.factor}</td>` +
      `<td class="num"><b>${money(s.running)}</b><span class="bar"><i style="width:${Math.max(1, Math.round((100 * s.running) / r.tvl_usd))}%"></i></span></td></tr>`).join('') +
    `</tbody><tfoot><tr><td colspan="3">Implied value${r.status === 'pre' ? '' : ' the model would give'}</td><td class="num">${money(r.value)}</td></tr></tfoot></table>`;
}

/** The honest width of the estimate, from how the model does on protocols whose market cap is known. */
function rangeNote(r, radar) {
  const { low, high } = radar.check;
  return `<p class="note"><b>Likely range ${money(r.value * low)} to ${money(r.value * high)}.</b> Valued by the model fitted without them, ` +
    `half of the ${radar.market.peers} trading peers have a real market cap between ${low.toFixed(2)}x and ${high.toFixed(2)}x of the model's value` +
    (r.mcap_usd ? `; this one's is ${(r.mcap_usd / r.value).toFixed(2)}x.` : '.') + '</p>';
}

/** The category's protocols whose token already trades: the evidence behind the peer multiple. */
function peerTable(r, market) {
  const peers = [...(market.peersByCategory[r.category] || [])].sort((a, b) => b.tvl_usd - a.tvl_usd);
  if (!peers.length) return `<p class="note">No ${escapeHtml(r.category || 'uncategorised')} protocol in the snapshot has a market cap on record, so the multiple is the median of all ${market.peers} trading peers: ${market.allMedian.toFixed(2)}x.</p>`;
  return '<table class="peers"><thead><tr><th>Token already trades</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th></tr></thead><tbody>' +
    peers.slice(0, 3).map((p) => `<tr><td>${escapeHtml(p.name)} <small>${escapeHtml(p.symbol || '')}</small></td><td class="num">${money(p.tvl_usd)}</td><td class="num">${money(p.mcap_usd)}</td><td class="num">${(p.mcap_usd / p.tvl_usd).toFixed(2)}x</td></tr>`).join('') +
    `</tbody></table><p class="note">${peers.length > 3 ? `Largest 3 of ${peers.length} peers. ` : ''}Category median ${r.peer.categoryMedian.toFixed(2)}x counts ${r.peer.n}/(${r.peer.n}+${market.shrink}) = ${Math.round(100 * r.peer.weight)}% (${market.shrink} is chooseShrinkage's pick), the market's ${market.allMedian.toFixed(2)}x the rest: ${r.peer.multiple.toFixed(2)}x.</p>`;
}

function planSection(r) {
  const plan = planOf(r);
  return `<div class="planhead"><h3>Farm plan <small>${plan.label}, ${plan.steps.length} steps</small></h3><dl class="budget"><div><dt>Put in</dt><dd>${dollars(plan.size)}</dd></div><div><dt>Fees and gas</dt><dd>~${dollars(plan.fees)}</dd></div>` +
    `<div><dt>Hands-on</dt><dd>${(plan.minutes / 60).toFixed(1)} h</dd></div><div><dt>Hold</dt><dd>${plan.hold} days</dd></div></dl></div>` +
    '<ol class="steps">' + plan.steps.map((s) => `<li><p>${escapeHtml(s.text)}</p><p class="ct"><span><b>Cost</b> ${escapeHtml(s.cost)}</span><span><b>Time</b> ${escapeHtml(s.time)}</span></p></li>`).join('') + '</ol>';
}

function statusLine(r, radar) {
  if (r.status === 'pre') return `Rank ${r.rank} of ${radar.ranked.length} pre-token protocols` + (r.watch ? '<span class="tag watch">watchlist</span>' : '<span class="tag">beyond the watchlist</span>');
  if (r.status === 'trading') return `Token already trades${r.symbol ? ' as ' + escapeHtml(r.symbol) : ''}: not ranked` + (r.mcap_usd ? `, market cap ${money(r.mcap_usd)}` : '');
  return `Set aside, not ranked: records no token, but is a ${asideReason(r)} of a token that already trades`;
}

function renderDetail(r, radar) {
  const near = r.rank ? [radar.ranked[r.rank - 2], radar.ranked[r.rank]] : [];
  const link = (row, text) => (row ? `<a href="#${hashWith({ p: row.slug })}">${text} ${escapeHtml(row.name)}</a>` : '');
  document.getElementById('detail').innerHTML =
    `<nav class="crumbs"><a href="#${hashWith({ p: '' })}">&larr; Back to the board</a><span>${link(near[0], '&uarr; Rank ' + (r.rank - 1))}${link(near[1], '&darr; Rank ' + (r.rank + 1))}</span></nav>` +
    `<div class="dhead"><div><p class="kicker">${statusLine(r, radar)}</p><h2>${escapeHtml(r.name)}</h2>` +
    `<p class="sub">${escapeHtml(r.category || 'No category')} on ${escapeHtml(r.chains.slice(0, 6).join(', '))}${r.chains.length > 6 ? ` and ${r.chains.length - 6} more chains` : ''}</p></div>` +
    `<dl class="kpis"><div class="main"><dt>Implied value</dt><dd>${money(r.value)}</dd></div><div><dt>TVL</dt><dd>${money(r.tvl_usd)}</dd></div>` +
    `<div><dt>7-day TVL</dt><dd>${signed(r.change_7d)}</dd></div><div><dt>No token for</dt><dd>${tenure(r.days)}</dd></div></dl></div>` +
    `<div class="cols"><section class="card"><h3>How the implied value is built <small>valueModel.js</small></h3>${valuationTable(r, radar.market)}${rangeNote(r, radar)}` +
    `<h3>Where the peer multiple comes from</h3>${peerTable(r, radar.market)}</section>` +
    `<section class="card">${planSection(r)}</section></div>`;
}
