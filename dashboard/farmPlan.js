// farmPlan.js: how to farm one protocol, as concrete steps that each say what they cost and how long
// they take. A plan is built from the protocol's own record (category, chains, TVL, seven-day change,
// days with no token), never from a list of names. main.ts writes these same steps into board.json.

const FMT = typeof module === 'object' ? require('./format.js') : self;

// Typical cost of one transaction in USD, the token that pays it, and the asset a farmer deposits.
const CHAIN_GAS = {
  Ethereum: [4, 'ETH'], Bitcoin: [2, 'BTC', 'BTC'], Tron: [1.5, 'TRX', 'USDT'], Cardano: [0.2, 'ADA'], Binance: [0.1, 'BNB'],
  Avalanche: [0.1, 'AVAX'], Arbitrum: [0.05, 'ETH'], Base: [0.03, 'ETH'], Optimism: [0.03, 'ETH'], Polygon: [0.02, 'POL'],
  Monad: [0.02, 'MON'], 'Hyperliquid L1': [0.02, 'HYPE'], Solana: [0.01, 'SOL'], Sui: [0.01, 'SUI'], Ripple: [0.01, 'XRP'],
  Stellar: [0.01, 'XLM'], Algorand: [0.01, 'ALGO'],
};
const OTHER_CHAIN = [0.1];

/** Where to farm: the cheapest to transact on of the protocol's four largest chains. */
function farmChain(p) {
  const options = p.chains.slice(0, 4).map((name) => ({ name, spec: CHAIN_GAS[name] || OTHER_CHAIN }));
  const best = options.reduce((a, b) => (b.spec[0] < a.spec[0] ? b : a), options[0] || { name: 'its main chain', spec: OTHER_CHAIN });
  return { chain: best.name, gas: best.spec[0], token: best.spec[1] || `${best.name}'s native token`, asset: best.spec[2] || 'USDC' };
}

/** How much to put in: scaled to TVL, halved when the protocol is very young or its TVL is falling fast. */
function positionSize(p) {
  const base = p.tvl_usd >= 250e6 ? 1000 : p.tvl_usd >= 50e6 ? 500 : p.tvl_usd >= 15e6 ? 250 : 100;
  const caution = p.change_7d <= -15 ? `its TVL fell ${Math.abs(p.change_7d).toFixed(0)}% this week` : p.days != null && p.days < 120 ? `it is only ${p.days} days old` : '';
  return { size: caution ? base / 2 : base, why: `sized for its ${FMT.money(p.tvl_usd)} TVL` + (caution ? `, halved because ${caution}` : '') };
}

/** How long to stay in: longest for a young protocol, shortest for one that has run years with no token. */
function holdDays(days) {
  return days == null ? 45 : days < 180 ? 90 : days < 365 ? 60 : days <= 730 ? 45 : 30;
}

/** One step: what to do, hands-on minutes, what it costs in USD and what that cost is made of. */
const act = (text, minutes, fee = 0, note = '', more = {}) => ({ text, minutes, fee, note, ...more });

// One playbook per kind of protocol. Each does different things, so each has its own steps; c carries the
// plan's figures (size, hold, rounds, gas(tx) in USD). ownTest marks a playbook that proves the exit itself.
const PLAYBOOKS = [
  { match: /Lending|CDP|Collateral/, label: 'Supply and borrow', steps: (c) => [
    act(`Supply ${c.$size} of ${c.asset} to ${c.name} on ${c.chain}. ${c.why}.`, 15, c.gas(2), 'of gas (approve, supply)', { keep: c.size }),
    act(`Borrow ${c.$(c.size / 4)} of a different asset against it: a 25% loan-to-value, which holds the health factor near 3. If it falls under 2, repay part of the loan the same day.`,
      10, c.gas(1) + (c.size / 4) * 0.08 * (c.hold / 365), `gas plus ${c.hold} days of interest at about 8% a year`),
    act(`Every ${c.every}, repay the loan and draw it again, so both sides of the market show use: ${c.rounds} rounds.`, 10 * c.rounds, c.rounds * c.gas(2), `of gas (${c.rounds} x ${c.$(c.gas(2))})`, { each: '10 min a round' }),
  ] },
  { match: /Dexs|Liquidity Manager/, label: 'LP and swaps', steps: (c) => [
    act(`Add ${c.$(c.size / 2)} to the deepest stablecoin or blue-chip pool on ${c.name} (${c.chain}) across a wide price range, and keep ${c.$(c.size / 2)} in the wallet for swaps. ${c.why}.`, 15, c.gas(3), 'of gas (2 approvals, add)', { keep: c.size }),
    act(`Every ${c.every}, swap $100 through ${c.name} and straight back: ${c.rounds} round trips, ${c.$(200 * c.rounds)} of volume.`, 10 * c.rounds, c.rounds * (c.gas(2) + 0.6), `in all (${c.rounds} x ${c.$(c.gas(2) + 0.6)}: gas plus a 0.3% pool fee each way)`, { each: '10 min a round' }),
    act(`At each swap, check the pool position is still in range and compare it with simply holding the two tokens. If it has sat out of range for a week, pull it and add it again around the new price.`, 5 * c.rounds, c.gas(2), 'of gas for one re-centring', { each: '5 min a round' }),
  ] },
  { match: /Prediction/, label: 'Small trades', steps: (c) => [
    act(`Deposit ${c.$size} of ${c.asset} on ${c.name} (${c.chain}). ${c.why}.`, 10, c.gas(2), 'of gas (approve, deposit)', { keep: c.size }),
    act(`Every ${c.every}, buy ${c.$(c.size / 10)} of one side in a market priced between 40 and 60 cents that settles within a month: ${c.rounds} trades, never more than a tenth of the deposit in one market.`,
      10 * c.rounds, c.rounds * (c.gas(1) + c.size * 0.002), `in all (${c.rounds} x ${c.$(c.gas(1) + c.size * 0.002)}: gas plus about 2% of spread and fee)`, { each: '10 min a trade' }),
    act(`Sell when the price has moved 10 cents your way, or let the market settle, then redeem the proceeds to ${c.asset}.`, 5 * c.rounds, c.rounds * c.gas(1), `of gas (${c.rounds} redemptions)`, { each: '5 min a trade' }),
  ] },
  { match: /Derivatives|Options|Synthetics|OTC/, label: 'Perp volume', steps: (c) => [
    act(`Deposit ${c.$size} of ${c.asset} as margin on ${c.name} (${c.chain}). ${c.why}.`, 10, c.gas(2), 'of gas (approve, deposit)', { keep: c.size }),
    act(`Every ${c.every}, open a ${c.$size} position at 1x in its most liquid market, set a stop-loss 5% away, and close it the same day: ${c.rounds} round trips, ${c.$(2 * c.size * c.rounds)} of volume.`,
      15 * c.rounds, c.rounds * (c.gas(2) + c.size * 0.001), `in all (${c.rounds} x ${c.$(c.gas(2) + c.size * 0.001)}: gas plus a 0.05% taker fee per side)`, { each: '15 min a round' }),
    act(`Never raise leverage to reach volume faster. At 1x with a 5% stop a trade cannot be liquidated and loses ${c.$(c.size * 0.05)} at most; stop for the week after two losing trades.`, 5, 0, '', { cost: `no fee; up to ${c.$(c.size * 0.05)} of loss per stopped trade` }),
  ] },
  { match: /RWA/, label: 'Mint and redeem', ownTest: true, steps: (c) => [
    act(`Complete onboarding with ${c.name}: tokenised assets usually ask for identity and eligibility checks. Have ID and proof of address ready; approval commonly takes 1 to 3 days.`, 30, 0, '', { time: '30 min, then 1 to 3 days of waiting' }),
    act(`Mint or buy ${c.$size} of its yield token on ${c.chain} and hold it in this wallet. ${c.why}.`, 15, c.gas(2) + c.size * 0.001, 'gas plus a mint fee near 0.1%', { keep: c.size }),
    act(`In week 2, redeem $20. Write down the notice period and how many days the cash takes to arrive (often 1 to 5 business days): the full exit will take that long.`, 10, c.gas(1), 'of gas (1 transaction)'),
  ] },
  { match: /Stable|BTC$|Reserve/, label: 'Mint and save', steps: (c) => [
    act(`Mint or swap into ${c.$size} of the ${c.name} asset on ${c.chain}. ${c.why}.`, 10, c.gas(2) + c.size * 0.001, 'gas plus about 0.1% of slippage', { keep: c.size }),
    act(`Place it in the protocol's own savings or staking module, not a third-party pool.`, 10, c.gas(2), 'of gas (approve, deposit)'),
    act(`Every ${c.every}, check the peg. If it trades more than 0.5% under its target, stop and redeem; otherwise claim the yield and add it back: ${c.rounds} checks.`, 5 * c.rounds, c.rounds * c.gas(1), `of gas (${c.rounds} x ${c.$(c.gas(1))})`, { each: '5 min a check' }),
  ] },
  { match: /Staking|Restaking/, label: 'Stake and restake', steps: (c) => [
    act(`Stake ${c.$size} of ${c.token} through ${c.name} on ${c.chain}. Before confirming, read the unbonding period: that is how long the exit takes. ${c.why}.`, 15, c.gas(2), 'of gas (approve, stake)', { keep: c.size }),
    act(`Every ${c.every}, claim the rewards and stake them again: ${c.rounds} rounds.`, 5 * c.rounds, c.rounds * c.gas(2), `of gas (${c.rounds} x ${c.$(c.gas(2))})`, { each: '5 min a round' }),
  ] },
  { match: /Bridge/, label: 'Round trips', steps: (c) => [
    act(`Once, move the full ${c.$size} of ${c.asset} through ${c.name} to another chain it serves and back, to put one larger transfer on record. ${c.why}.`, 20, c.gas(2) + c.size * 0.004, 'gas plus a bridge fee near 0.2% each way', { keep: c.size }),
    act(`Every ${c.every}, send $50 across ${c.name} and bring it back on a different day, in a different amount each time: ${c.rounds} round trips.`, 10 * c.rounds, c.rounds * (c.gas(2) + 0.2), `in all (${c.rounds} x ${c.$(c.gas(2) + 0.2)}: gas plus the 0.2% fee each way)`, { each: '10 min a round' }),
  ] },
  { match: /^Chain$/, label: 'On-chain activity', steps: (c) => [
    act(`Put ${c.$size} to work in the largest app that ${c.name} itself lists on ${c.chain}: a lending or liquidity deposit you can leave alone. ${c.why}.`, 15, c.gas(2), 'of gas (approve, deposit)', { keep: c.size }),
    act(`Every ${c.every}, make 3 transactions in 2 different apps on ${c.chain} (a swap, a deposit, a transfer): ${c.rounds} rounds, ${3 * c.rounds} transactions.`, 10 * c.rounds, c.rounds * c.gas(3), `of gas (${3 * c.rounds} transactions)`, { each: '10 min a round' }),
  ] },
  { match: /Payments|Card/, label: 'Payments', steps: (c) => [
    act(`Fund ${c.name} on ${c.chain} with ${c.$size} of ${c.asset}. ${c.why}.`, 10, c.gas(2), 'of gas (2 transactions)', { keep: c.size }),
    act(`Every ${c.every}, make one real payment of $10 to $20 through it: ${c.rounds} payments.`, 5 * c.rounds, c.rounds * c.gas(1), `of gas (${c.rounds} x ${c.$(c.gas(1))})`, { each: '5 min a payment' }),
  ] },
  { match: /./, label: 'Vault deposit', ownTest: true, steps: (c) => [
    act(`Deposit ${c.$size} of ${c.asset} into the largest ${c.name} vault on ${c.chain} and keep the vault's share token in this wallet, so the balance stays attributable to you. ${c.why}.`, 15, c.gas(2), 'of gas (approve, deposit)', { keep: c.size }),
    act(`On day 7, ask to withdraw $20. Write down whether it pays at once, joins a queue or starts a cooldown, and how many days that takes: the full exit will take that long.`, 10, c.gas(1), 'of gas (1 transaction)'),
    ...(c.rounds * c.gas(1) > c.size / 50 ? [] : [act(`Every ${c.every}, add $25 so the wallet shows repeated deposits: ${c.rounds} top-ups.`, 5 * c.rounds, c.rounds * c.gas(1), `of gas (${c.rounds} x ${c.$(c.gas(1))})`, { each: '5 min a top-up' })]),
  ] },
];

/** What the protocol's TVL did this week and how long it has run with no token, as the watch step says it. */
function recordNote(p, hold) {
  const tvl = FMT.money(p.tvl_usd);
  const moved = p.change_7d == null ? `has no 7-day figure and stands at ${tvl}` : Math.abs(p.change_7d) < 1 ? `was flat over the last 7 days (${FMT.percent(p.change_7d)}) at ${tvl}` : `${p.change_7d > 0 ? 'grew' : 'fell'} ${Math.abs(p.change_7d).toFixed(1)}% over the last 7 days to ${tvl}`;
  const exitLine = p.change_7d <= -25 ? 'That fall is already past the exit line, so do not enter until a week closes without one.' : 'Leave at once if it drops more than 25% in a week or withdrawals are paused.';
  const stage = p.days == null ? `DefiLlama gives no start date for it, so the standard ${hold}-day hold applies.`
    : `It has run ${FMT.tenure(p.days)} with no token on record` + (p.days < 180 ? ', which is early: the full hold counts.' : p.days > 730 ? ': a launch is not implied by that, so the hold is kept short.' : '.');
  return `it ${moved}. ${exitLine} ${stage}`;
}

/**
 * The plan for one scored protocol. The playbook's own steps sit between the shared safety steps: reach
 * it by the official link with a fresh wallet, fund it, test small, watch its TVL, and leave with every
 * approval revoked. How many steps there are, what they cost and how long they run all follow from the record.
 */
function farmPlan(p) {
  const $ = FMT.dollars, where = farmChain(p), { size, why } = positionSize(p), hold = holdDays(p.days);
  const everyDays = where.gas >= 1 ? 14 : 7, rounds = Math.floor(hold / everyDays);
  const gas = (tx) => where.gas * tx;
  const book = PLAYBOOKS.find((b) => b.match.test(p.category || ''));
  const core = book.steps({ ...where, $, gas, name: p.name, size, $size: $(size), why: `${$(size)} is ${why}`, hold, rounds, every: everyDays === 14 ? 'two weeks' : 'week' });

  const access = `Open ${p.name} only from the link on its DefiLlama page (defillama.com/protocol/${p.slug}), bookmark it, and use a fresh wallet that holds nothing else. ` +
    (p.status === 'trading' ? `Its token${p.symbol ? ' ' + p.symbol : ''} already trades, so this farms rewards on top, not a first airdrop.` : 'DefiLlama records no token for it, so any site selling one or offering a claim today is a scam.');
  const exit = act(`After day ${hold}, withdraw everything from ${p.name}, revoke every approval this wallet granted (the chain explorer lists them), and write down dates, amounts and transaction hashes. If a claim ever opens, use only the bookmarked site and never pay to claim.`, 20, gas(3), 'of gas (3 transactions)');
  const weekly = hold >= 60;
  const watch = act(`${weekly ? 'Each week' : `On day ${Math.round(hold / 2)}`}, look up the TVL of ${p.name}: ${recordNote(p, hold)}`, weekly ? 5 * Math.ceil(hold / 7) : 5, 0, '', weekly ? { each: '5 min a week' } : {});
  // A position of $250 or more is tested with $20 first, unless the playbook already proves the exit.
  const test = book.ownTest || size < 250 ? [] : [act(`Before the full amount, do the next step with $20, watch it appear in the ${p.name} app, then take it out again. Go on only once that exit has worked.`, 10, gas(3), 'of gas (3 transactions)')];

  const reserve = Math.max(5, Math.ceil(1.5 * [...test, ...core, exit].reduce((sum, s) => sum + s.fee, 0)));
  const fund = `Send ${$(size + reserve)} from an exchange straight to ${where.chain}: ${$(size)} to put to work and ${$(reserve)} of ${where.token} for gas. `;
  // One chain: nothing to choose, so access and funding are one step. Several: choosing the chain is its own step.
  const start = p.chains.length === 1
    ? [act(`${access} ${fund}${where.chain} is its only chain, at about ${$(where.gas)} a transaction.`, 20, 3, 'of exchange withdrawal fee')]
    : [act(access, 10), act(`${fund}${p.name} runs on ${p.chains.length} chains; ${where.chain} is the cheapest of its largest ${Math.min(4, p.chains.length)} at about ${$(where.gas)} a transaction.`, 15, 3, 'of exchange withdrawal fee')];

  const steps = [...start, ...test, ...core, watch, exit];
  for (const s of steps) {
    const span = s.minutes >= 60 ? (s.minutes / 60).toFixed(1) + ' h' : s.minutes + ' min';
    s.time = s.time || (s.each ? `${s.each}, ${span} in all` : span);
    const made = /^(of|in) /.test(s.note) ? s.note : `(${s.note})`;
    s.cost = s.cost || (s.keep ? `${$(s.keep)} stays yours; ` : '') + (s.fee ? `about ${$(s.fee)} ${made}` : s.keep ? 'no fee' : 'nothing');
  }
  return { ...where, label: book.label, size, hold, rounds, fees: steps.reduce((t, s) => t + s.fee, 0), minutes: steps.reduce((t, s) => t + s.minutes, 0), steps };
}

/** A step as board.json carries it: the action, then its cost and its time. */
function stepText(step) {
  return `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
}

if (typeof module === 'object') module.exports = { farmPlan, stepText };
