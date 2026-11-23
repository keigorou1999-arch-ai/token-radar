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
  return days == null ? 60 : days < 180 ? 90 : days <= 730 ? 60 : 45;
}

// One playbook per kind of protocol: the entry, the repeated action, their transaction counts and fees.
const PLAYBOOKS = [
  { match: /Lending|CDP|Collateral/, enterTx: 3, repeatTx: 2,
    enter: (c) => `Supply ${c.$size} of ${c.asset} to ${c.name} on ${c.chain}, then borrow ${c.$quarter} of another asset against it. The health factor stays above 3 and both a supply and a borrow are on record.`,
    repeat: (c) => `repay the ${c.$quarter} borrow and open it again`,
    fee: (c) => [c.size * 0.25 * 0.08 * c.hold / 365 / c.rounds, 'borrow interest at about 8% a year'] },
  { match: /Dexs|Liquidity Manager/, enterTx: 3, repeatTx: 2,
    enter: (c) => `Add ${c.$half} to the deepest stablecoin or blue-chip pool on ${c.name} (${c.chain}) with a wide range, and keep ${c.$half} in the wallet for swaps.`,
    repeat: (c) => `swap $100 through ${c.name} and back again`,
    fee: () => [0.6, 'a 0.3% swap fee each way'] },
  { match: /Derivatives|Options|Synthetics|Prediction|OTC/, enterTx: 2, repeatTx: 2,
    enter: (c) => `Deposit ${c.$size} of ${c.asset} as margin on ${c.name} (${c.chain}) and open a position of ${c.$size} notional, 1x and no more, in its most liquid market with a stop 10% away.`,
    repeat: (c) => `close the position and reopen it on the other side (${FMT.dollars(c.size * 2)} of volume)`,
    fee: (c) => [c.size * 0.001, 'a 0.05% taker fee'] },
  { match: /RWA/, enterTx: 2, repeatTx: 1,
    enter: (c) => `Complete onboarding with ${c.name} first (tokenised assets usually ask for identity and eligibility checks; allow 1 to 3 days), then mint or buy ${c.$size} of its yield token on ${c.chain} and hold it in this wallet.`,
    repeat: () => `add $25 to the holding and read the latest reserve report` },
  { match: /Stable|BTC$|Reserve/, enterTx: 3, repeatTx: 1,
    enter: (c) => `Mint or swap into ${c.$size} of the ${c.name} asset on ${c.chain} and place it in the protocol's own savings or staking module, not a third-party pool.`,
    repeat: () => `check the peg (pause if it trades more than 0.5% off) and add $25` },
  { match: /Staking|Restaking/, enterTx: 2, repeatTx: 2,
    enter: (c) => `Stake ${c.$size} of ${c.token} through ${c.name} on ${c.chain}. Read the unbonding period before you commit: that is how long an exit takes.`,
    repeat: () => `claim the rewards and stake them again` },
  { match: /Bridge/, enterTx: 2, repeatTx: 2,
    enter: (c) => `Move ${c.$size} of ${c.asset} to ${c.chain} through ${c.name} and keep it in this wallet on the far side.`,
    repeat: (c) => `send $50 across ${c.name} and back, on a different day and in a different amount each time`,
    fee: () => [0.2, 'a bridge fee near 0.2%'] },
  { match: /^Chain$/, enterTx: 3, repeatTx: 3,
    enter: (c) => `Bridge ${c.$size} onto ${c.chain} through the bridge ${c.name} itself links to, and put it to work in the largest app there.`,
    repeat: (c) => `make 3 transactions in 2 different apps on ${c.chain}` },
  { match: /Payments|Card/, enterTx: 2, repeatTx: 1,
    enter: (c) => `Fund ${c.name} on ${c.chain} with ${c.$size} of ${c.asset} and complete one real payment with it.`,
    repeat: () => `make one more payment of $10 to $20` },
  { match: /./, enterTx: 2, repeatTx: 1,
    enter: (c) => `Deposit ${c.$size} of ${c.asset} into the largest ${c.name} vault on ${c.chain} and keep the vault's share token in this wallet, so the balance stays attributable to you.`,
    repeat: () => `add a $25 deposit and re-read the vault's withdrawal terms (queue or cooldown)` },
];

/** The plan for one scored protocol: seven steps, the fees they add up to and the minutes they take. */
function farmPlan(p) {
  const $ = FMT.dollars, where = farmChain(p), { size, why } = positionSize(p), hold = holdDays(p.days);
  const everyDays = where.gas >= 1 ? 14 : 7, rounds = Math.floor(hold / everyDays), weeks = Math.ceil(hold / 7);
  const c = { ...where, name: p.name, size, hold, rounds, $size: $(size), $half: $(size / 2), $quarter: $(size / 4) };
  const book = PLAYBOOKS.find((b) => b.match.test(p.category || ''));
  const [feeEach, feeName] = book.fee ? book.fee(c) : [0, ''];
  const gas = (tx) => where.gas * tx;
  const roundCost = gas(book.repeatTx) + feeEach, testTx = book.enterTx + 1;
  const fees = 3 + gas(testTx + book.enterTx + 3) + rounds * roundCost;
  const reserve = Math.max(5, Math.ceil(fees * 1.5));
  const tvl = FMT.money(p.tvl_usd);
  const moved = p.change_7d == null ? `has no 7-day figure and stands at ${tvl}` : Math.abs(p.change_7d) < 1 ? `was flat over the last 7 days (${FMT.percent(p.change_7d)}) at ${tvl}` : `${p.change_7d > 0 ? 'grew' : 'fell'} ${Math.abs(p.change_7d).toFixed(1)}% over the last 7 days to ${tvl}`;
  const exitLine = p.change_7d <= -25 ? `That fall is already past the exit line, so do not enter until a week closes without one.` : `Leave at once if it drops more than 25% in a week or withdrawals are paused.`;
  const stage = p.days == null ? `DefiLlama gives no start date for it, so the standard ${hold}-day hold applies.`
    : `It has run ${FMT.tenure(p.days)} with no token on record.` + (p.days < 180 ? ' That is early, so the full hold counts.' : p.days > 730 ? ' A launch is not implied by that: decide again when the hold ends.' : '');
  const steps = [
    { text: `Open ${p.name} only from the link on its DefiLlama page (defillama.com/protocol/${p.slug}), bookmark it, and use a fresh wallet that holds nothing else. ` +
        (p.status === 'trading' ? `Its token${p.symbol ? ' ' + p.symbol : ''} already trades, so this farms rewards on top, not a first airdrop.` : `DefiLlama records no token for it, so any site selling one or offering a claim today is a scam.`),
      cost: 'nothing', minutes: 10 },
    { text: `Send ${$(size + reserve)} from an exchange straight to ${c.chain}: ${c.$size} to put to work and ${$(reserve)} of ${c.token} for gas. ` +
        (p.chains.length > 1 ? `${p.name} runs on ${p.chains.length} chains; ${c.chain} is the cheapest of its largest ${Math.min(4, p.chains.length)} at about ${$(where.gas)} a transaction.` : `${c.chain} is its only chain, at about ${$(where.gas)} a transaction.`),
      cost: 'about $3 of exchange withdrawal fee', minutes: 15 },
    { text: `Do step 4 with $20 first, watch the position appear in the ${p.name} app, then withdraw it. Go on only once that exit has worked.`,
      cost: `about ${$(gas(testTx))} of gas (${testTx} transactions)`, minutes: 10 },
    { text: `${book.enter(c)} ${c.$size} is ${why}.`,
      cost: `${c.$size} stays yours; about ${$(gas(book.enterTx))} of gas`, minutes: 15 },
    { text: `Every ${everyDays === 14 ? 'two weeks' : 'week'} for ${hold} days, ${book.repeat(c)}: ${rounds} rounds, so the wallet shows steady use rather than one deposit.`,
      cost: `about ${$(rounds * roundCost)} in all (${rounds} x ${$(roundCost)}${feeName ? ', gas plus ' + feeName : ' of gas'})`, minutes: rounds * 10, each: '10 min a round' },
    { text: `Each week, look up the TVL of ${p.name}: it ${moved}. ${exitLine} ${stage}`,
      cost: 'nothing', minutes: weeks * 5, each: '5 min a week' },
    { text: `After day ${hold}, withdraw everything from ${p.name}, revoke every approval this wallet granted (the chain explorer lists them), and write down dates, amounts and transaction hashes. If a claim ever opens, use only the bookmarked site and never pay to claim.`,
      cost: `about ${$(gas(3))} of gas (3 transactions)`, minutes: 20 },
  ];
  for (const s of steps) s.time = (s.each ? s.each + ', ' : '') + (s.minutes >= 60 ? (s.minutes / 60).toFixed(1) + ' h' : s.minutes + ' min') + (s.each ? ' in all' : '');
  return { ...where, size, hold, rounds, fees, minutes: steps.reduce((t, s) => t + s.minutes, 0), steps };
}

/** A step as board.json carries it: the action, then its cost and its time. */
function stepText(step) {
  return `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
}

if (typeof module === 'object') module.exports = { farmPlan, stepText };
