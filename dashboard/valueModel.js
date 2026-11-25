// valueModel.js: what a token would be worth if the protocol's record stayed as it is.
// Every number comes from the snapshot; no protocol name is special-cased. main.ts runs these same
// functions to write board.json, so the page and the board cannot disagree.
//
//   implied value = TVL x peer multiple x size factor x growth factor x tenure factor
//
//   peer multiple   median market cap / TVL of the category's protocols whose token already trades
//                   (exchanges, bridges, staked and versioned products left out: see isPeer),
//                   shrunk toward the all-market median: n peers count n / (n + k), and k is the
//                   strength that predicts best when each peer is valued without itself
//   size factor     (TVL / median peer TVL) ^ beta, beta fitted by least squares on those same peers:
//                   the market pays less per dollar of TVL as TVL grows
//   growth factor   1 + 0.5 x seven-day TVL change, the change clamped to -40%..+80%
//   tenure factor   0.75 after day 0, rising to 1.00 at two years run with no token on record

const MODEL = {
  shrinkChoices: [1, 2, 3, 4, 6, 8, 12], // candidate k; chooseShrinkage picks one from the snapshot
  growthWeight: 0.5, growthMin: -40, growthMax: 80,
  tenureFloor: 0.75, tenureFullDays: 730,
  sizeMin: 0.05, sizeMax: 2.5,
};

// The watchlist's own rule, applied to every protocol: these are products of a token that already trades.
const DERIVATIVE_CATEGORIES = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;

const round4 = (x) => Math.round(x * 1e4) / 1e4;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function median(values) {
  const v = [...values].sort((a, b) => a - b), mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Days from the day DefiLlama began tracking the protocol to the snapshot: its run with no token. */
function daysWithoutToken(p, asOf) {
  return p.listed_at ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(p.listed_at)) / 864e5)) : null;
}

function recordsNoToken(p) {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

function isDerivativeProduct(p) {
  return DERIVATIVE_CATEGORIES.includes(p.category) || VERSION_MARKER.test(p.name) || WRAPPED_WORD.test(p.name) || EXCHANGE_NAME.test(p.name);
}

/** 'pre' is ranked; 'trading' has a token on record; 'aside' is a wrapped, staked, bridged or exchange product. */
function tokenStatus(p, watchlist) {
  if (watchlist.has(p.slug)) return 'pre';
  if (!recordsNoToken(p)) return 'trading';
  return isDerivativeProduct(p) ? 'aside' : 'pre';
}

const mcapToTvl = (p) => p.mcap_usd / p.tvl_usd;

/** Blend a category's median with the market's, in logs. n peers count n / (n + k): one peer barely moves it. */
function shrinkPeerMultiple(categoryMedian, n, market) {
  const weight = n / (n + market.shrink);
  return { weight, multiple: round4(Math.exp(weight * Math.log(categoryMedian) + (1 - weight) * Math.log(market.allMedian))) };
}

/** The category's multiple: its trading peers' median mcap/TVL, shrunk toward the market's. */
function peerMultiple(category, market) {
  const peers = market.peersByCategory[category] || [];
  const n = peers.length, categoryMedian = n ? median(peers.map(mcapToTvl)) : market.allMedian;
  return { n, categoryMedian, ...shrinkPeerMultiple(categoryMedian, n, market) };
}

/** beta in mcap/TVL ~ (TVL / refTvl)^beta, least squares over the trading peers, net of their category multiple. */
function fitSizeElasticity(peers, market) {
  const xs = peers.map((p) => Math.log(p.tvl_usd / market.refTvl));
  const ys = peers.map((p) => Math.log(mcapToTvl(p) / peerMultiple(p.category, market).multiple));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  return Math.round((sxy / sxx) * 1e3) / 1e3;
}

function sizeFactor(tvl, market) {
  return round4(clamp((tvl / market.refTvl) ** market.sizeBeta, MODEL.sizeMin, MODEL.sizeMax));
}

function growthFactor(change7d) {
  return round4(1 + (MODEL.growthWeight * clamp(change7d ?? 0, MODEL.growthMin, MODEL.growthMax)) / 100);
}

/** Unknown start date: the median run of the dated pre-token protocols stands in. */
function tenureFactor(days, market) {
  const d = Math.min(days ?? market.medianTenure, MODEL.tenureFullDays);
  return round4(MODEL.tenureFloor + ((1 - MODEL.tenureFloor) * d) / MODEL.tenureFullDays);
}

/** A trading peer: a market cap on record, and not an exchange, bridge, staked or versioned product, whose token is priced on more than this TVL. */
function isPeer(p) {
  return p.mcap_usd > 0 && p.tvl_usd > 0 && !isDerivativeProduct(p);
}

/** What a set of trading peers pays per dollar of TVL, for one shrinkage strength k. */
function fitMarket(peers, shrink) {
  const market = { peers: peers.length, shrink, allMedian: median(peers.map(mcapToTvl)), refTvl: median(peers.map((p) => p.tvl_usd)), peersByCategory: {} };
  for (const p of peers) (market.peersByCategory[p.category] ||= []).push(p);
  market.sizeBeta = fitSizeElasticity(peers, market);
  return market;
}

/** Each peer's real market cap over what the model gives it when fitted on the other peers only. */
function leaveOneOutRatios(peers, shrink) {
  return peers.map((p) => {
    const others = fitMarket(peers.filter((q) => q !== p), shrink);
    return mcapToTvl(p) / (peerMultiple(p.category, others).multiple * sizeFactor(p.tvl_usd, others));
  });
}

/** The shrinkage strength k with the smallest mean leave-one-out error (in logs) on this snapshot's peers. */
function chooseShrinkage(peers) {
  let best = null;
  for (const shrink of MODEL.shrinkChoices) {
    const ratios = leaveOneOutRatios(peers, shrink);
    const error = ratios.reduce((sum, x) => sum + Math.abs(Math.log(x)), 0) / ratios.length;
    if (!best || error < best.error) best = { shrink, error, ratios };
  }
  return best;
}

/** How wrong the model is where it can be checked: the leave-one-out ratios' middle half and share within 3x. */
function modelCheck(looRatios) {
  const ratios = [...looRatios].sort((a, b) => a - b);
  const at = (q) => ratios[Math.round(q * (ratios.length - 1))];
  return { low: at(0.25), high: at(0.75), within3x: ratios.filter((x) => x > 1 / 3 && x < 3).length / ratios.length };
}

/** What the market is paying, measured once from the protocols whose token already trades. */
function measureMarket(snapshot, statusOf) {
  const peers = snapshot.protocols.filter(isPeer);
  const chosen = chooseShrinkage(peers);
  const market = fitMarket(peers, chosen.shrink);
  market.check = modelCheck(chosen.ratios);
  market.medianTenure = median(snapshot.protocols.filter((p) => statusOf(p) === 'pre' && p.listed_at).map((p) => daysWithoutToken(p, snapshot.as_of)));
  return market;
}

/** One protocol's implied value with every factor that produced it. */
function impliedValue(p, market, asOf) {
  const days = daysWithoutToken(p, asOf);
  const peer = peerMultiple(p.category, market);
  const size = sizeFactor(p.tvl_usd, market), growth = growthFactor(p.change_7d), tenure = tenureFactor(days, market);
  const value = Math.max(1, Math.round(p.tvl_usd * peer.multiple * size * growth * tenure));
  return { days, peer, size, growth, tenure, value };
}

/**
 * Why a row ranks where it does: against the typical ranked row, the factor that lifts it most and the
 * one that holds it back most. A factor moving the value less than 3% is not named.
 */
function rankDrivers(r, typical) {
  const effects = [
    ['Large TVL', 'Small TVL', Math.log((r.tvl_usd * r.size) / typical.scale)],
    ['High multiple', 'Low multiple', Math.log(r.peer.multiple / typical.multiple)],
    ['Growing', 'Shrinking', Math.log(r.growth / typical.growth)],
    ['Long run', 'New', Math.log(r.tenure / typical.tenure)],
  ];
  const lift = effects.reduce((a, b) => (b[2] > a[2] ? b : a)), drag = effects.reduce((a, b) => (b[2] < a[2] ? b : a));
  return { lift: lift[2] > 0.03 ? lift[0] : '', drag: drag[2] < -0.03 ? drag[1] : '' };
}

/** The whole radar: every protocol scored, pre-token ones ranked by implied value, the rest kept apart. */
function buildRadar(snapshot) {
  const watchlist = new Set(snapshot.watchlist);
  const statusOf = (p) => tokenStatus(p, watchlist);
  const market = measureMarket(snapshot, statusOf);
  const rows = snapshot.protocols.map((p) => ({ ...p, status: statusOf(p), watch: watchlist.has(p.slug), ...impliedValue(p, market, snapshot.as_of) }));
  const ranked = rows.filter((r) => r.status === 'pre').sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : 1));
  const typical = { scale: median(ranked.map((r) => r.tvl_usd * r.size)), multiple: median(ranked.map((r) => r.peer.multiple)), growth: median(ranked.map((r) => r.growth)), tenure: median(ranked.map((r) => r.tenure)) };
  ranked.forEach((r, i) => { r.rank = i + 1; r.why = rankDrivers(r, typical); });
  return { asOf: snapshot.as_of, market, rows, ranked, check: market.check };
}

if (typeof module === 'object') module.exports = { MODEL, buildRadar, impliedValue, measureMarket, peerMultiple, shrinkPeerMultiple, isPeer };
