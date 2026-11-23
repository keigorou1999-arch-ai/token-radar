// format.js: how numbers and text are written on the page and in the farm steps.

/** $2.75B, $499M, $71.3M, $640K */
function money(n) {
  if (n == null) return 'n/a';
  const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, unit] of units) {
    if (n >= size) return '$' + (n / size).toFixed(n / size >= 100 ? 0 : n / size >= 10 ? 1 : 2) + unit;
  }
  return '$' + Math.round(n);
}

/** Small dollar amounts in a plan: $0.40, $6, $250 */
function dollars(n) {
  return '$' + (n < 10 && n % 1 ? n.toFixed(2) : Math.round(n).toLocaleString('en-US'));
}

/** +5.6%, -12.0% */
function percent(x) {
  return x == null ? 'n/a' : (x > 0 ? '+' : '') + (Math.abs(x) >= 1000 ? Math.round(x) : x.toFixed(1)) + '%';
}

/** 56 days, 1.5 years */
function tenure(days) {
  return days == null ? 'unknown' : days < 365 ? days + ' days' : (days / 365).toFixed(1) + ' years';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

if (typeof module === 'object') module.exports = { money, dollars, percent, tenure };
