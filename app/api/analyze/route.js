export const runtime = "nodejs";
export const maxDuration = 30;

const sma = (a, n) => (a.length < n ? null : a.slice(-n).reduce((x, y) => x + y, 0) / n);

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  const ag = g / period, al = l / period;
  if (al === 0) return 100;
  return Math.round(100 - 100 / (1 + ag / al));
}

function ema(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let val = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) val = prices[i] * k + val * (1 - k);
  return Number(val.toFixed(2));
}

function macd(prices) {
  if (prices.length < 35) return null;
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  if (ema12 == null || ema26 == null) return null;
  const macdLine = ema12 - ema26;
  const history = [];
  for (let i = 26; i <= prices.length; i++) {
    const e12 = ema(prices.slice(0, i), 12);
    const e26 = ema(prices.slice(0, i), 26);
    if (e12 != null && e26 != null) history.push(e12 - e26);
  }
  const signal = ema(history, 9);
  if (signal == null) return null;
  return {
    macd: Number(macdLine.toFixed(4)),
    signal: Number(signal.toFixed(4)),
    histogram: Number((macdLine - signal).toFixed(4)),
    bullish: macdLine > signal,
  };
}

function atr(prices, period = 14) {
  if (prices.length < period + 1) return null;
  const recent = prices.slice(-(period + 1));
  const sumTR = recent.slice(1).reduce((sum, p, i) => sum + Math.abs(p - recent[i]), 0);
  return Number((sumTR / period).toFixed(4));
}

const mom = (c, days) => {
  if (c.length <= days) return null;
  return Number((((c[c.length - 1] - c[c.length - 1 - days]) / c[c.length - 1 - days]) * 100).toFixed(1));
};

function smaSeries(c, n) {
  return c.map((_, i) => (i + 1 < n ? null : sma(c.slice(0, i + 1), n)));
}

function bollingerBands(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return {
    upper: Number((mean + 2 * std).toFixed(2)),
    middle: Number(mean.toFixed(2)),
    lower: Number((mean - 2 * std).toFixed(2)),
    bandwidth: mean > 0 ? Number(((4 * std) / mean * 100).toFixed(4)) : 0,
  };
}

// ADX (Average Directional Index) — 2026 best practice: gate all oscillator signals
// through ADX so they are only acted on when a real trend exists. ADX > 25 confirms
// a directional trend; ADX < 15 means the market is ranging and RSI/MACD crossovers
// are noise. Uses Wilder's smoothing (same as original Welles Wilder formulation).
function adx(prices, period = 14) {
  if (prices.length < period * 2 + 1) return null;
  const trArr = [], plusDmArr = [], minusDmArr = [];
  for (let i = 1; i < prices.length; i++) {
    trArr.push(Math.abs(prices[i] - prices[i - 1]));
    const upMove   = prices[i] - prices[i - 1];
    const downMove = prices[i - 1] - prices[i];
    plusDmArr.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDmArr.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  // Wilder's smoothing: first value = sum over period; then ATR-style rolling
  const wilderSmooth = (arr, p) => {
    let s = arr.slice(0, p).reduce((a, b) => a + b, 0);
    const result = [s];
    for (let i = p; i < arr.length; i++) {
      s = s - s / p + arr[i];
      result.push(s);
    }
    return result;
  };
  const atrS     = wilderSmooth(trArr,    period);
  const plusDmS  = wilderSmooth(plusDmArr, period);
  const minusDmS = wilderSmooth(minusDmArr, period);
  const dxArr = [];
  for (let i = 0; i < atrS.length; i++) {
    if (atrS[i] === 0) continue;
    const pdi = plusDmS[i]  / atrS[i] * 100;
    const mdi = minusDmS[i] / atrS[i] * 100;
    if (pdi + mdi === 0) continue;
    dxArr.push(Math.abs(pdi - mdi) / (pdi + mdi) * 100);
  }
  if (dxArr.length < period) return null;
  const adxVal = dxArr.slice(-period).reduce((a, b) => a + b, 0) / period;
  const lastAtr = atrS[atrS.length - 1];
  if (lastAtr === 0) return null;
  const plusDI  = Number((plusDmS[plusDmS.length   - 1] / lastAtr * 100).toFixed(1));
  const minusDI = Number((minusDmS[minusDmS.length - 1] / lastAtr * 100).toFixed(1));
  return {
    adx:      Number(adxVal.toFixed(1)),
    plusDI,
    minusDI,
    trend:    adxVal > 25 ? 'strong' : adxVal < 15 ? 'weak' : 'moderate',
    bullish:  plusDI > minusDI,
  };
}

// Bollinger Band Squeeze — the hottest breakout signal in 2026 quant circles.
// Bands narrow (low bandwidth) before explosive moves, since volatility cycles
// from contraction to expansion. Squeeze = current bandwidth below its own
// rolling average, signalling that a big move is coiling.
function bollingerSqueeze(closes, period = 20, lookback = 40) {
  if (closes.length < period + lookback) return null;
  const bwHistory = [];
  for (let i = period; i <= closes.length; i++) {
    const sl = closes.slice(i - period, i);
    const m  = sl.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    if (m > 0) bwHistory.push((4 * sd) / m * 100);
  }
  if (bwHistory.length < lookback) return null;
  const recent   = bwHistory.slice(-lookback);
  const avgBw    = recent.reduce((a, b) => a + b, 0) / recent.length;
  const currentBw = recent[recent.length - 1];
  const minBw    = Math.min(...recent);
  const squeeze  = currentBw < avgBw * 0.85;
  const intensity = squeeze ? Math.round((1 - currentBw / avgBw) * 100) : 0;
  return {
    squeeze,
    intensity,
    currentBandwidth: Number(currentBw.toFixed(4)),
    avgBandwidth:     Number(avgBw.toFixed(4)),
    minBandwidth:     Number(minBw.toFixed(4)),
  };
}

function stochastic(closes, period = 14) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const lowest = Math.min(...slice);
  const highest = Math.max(...slice);
  if (highest === lowest) return { k: 50, d: 50 };
  const k = Number((((closes[closes.length - 1] - lowest) / (highest - lowest)) * 100).toFixed(1));
  // %D is simple 3-period avg of %K (approximate — using last 3 windows)
  const ks = [];
  for (let i = 0; i < 3; i++) {
    const sl = closes.slice(-(period + i), closes.length - i || undefined);
    if (sl.length < period) break;
    const lo = Math.min(...sl), hi = Math.max(...sl);
    if (hi === lo) ks.push(50);
    else ks.push(((sl[sl.length - 1] - lo) / (hi - lo)) * 100);
  }
  const d = Number((ks.reduce((a, b) => a + b, 0) / ks.length).toFixed(1));
  return { k, d, overbought: k > 80, oversold: k < 20 };
}

function volumeTrend(volumes) {
  if (!volumes || volumes.length < 20) return null;
  const valid = volumes.filter(v => v != null && v > 0);
  if (valid.length < 20) return null;
  const avgVol = valid.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = valid[valid.length - 1];
  return {
    current: lastVol,
    avg20: Math.round(avgVol),
    ratio: Number((lastVol / avgVol).toFixed(2)),
    aboveAvg: lastVol > avgVol,
  };
}

function onBalanceVolume(closes, volumes) {
  if (!volumes || volumes.length < 2 || closes.length < 2) return null;
  const len = Math.min(closes.length, volumes.length);
  const series = [volumes[0] ?? 0];
  for (let i = 1; i < len; i++) {
    const prev = series[series.length - 1];
    const vol = volumes[i] ?? 0;
    if (closes[i] > closes[i - 1]) series.push(prev + vol);
    else if (closes[i] < closes[i - 1]) series.push(prev - vol);
    else series.push(prev);
  }
  const current = series[series.length - 1];
  const ema10 = ema(series, 10);
  const ema20 = ema(series, 20);
  let trend = 'neutral';
  if (ema10 != null && ema20 != null) {
    trend = ema10 > ema20 * 1.002 ? 'rising' : ema10 < ema20 * 0.998 ? 'falling' : 'neutral';
  }
  const abs = Math.abs(current);
  const sign = current < 0 ? '-' : '+';
  const fmt =
    abs >= 1e9 ? sign + (abs / 1e9).toFixed(2) + 'B' :
    abs >= 1e6 ? sign + (abs / 1e6).toFixed(2) + 'M' :
    abs >= 1e3 ? sign + (abs / 1e3).toFixed(1) + 'K' :
    String(Math.round(current));
  return { current, formatted: fmt, trend };
}

// Rolling 20-period VWAP (Volume-Weighted Average Price).
// Uses close as the typical price — a standard daily approximation.
// Price above VWAP = institutional demand; below = distribution pressure.
function rollingVwap(closes, volumes, period = 20) {
  const len = Math.min(closes.length, volumes.length);
  if (len < period) return null;
  let sumCV = 0, sumVol = 0;
  for (let i = len - period; i < len; i++) {
    const vol = volumes[i] ?? 0;
    sumCV += closes[i] * vol;
    sumVol += vol;
  }
  if (sumVol === 0) return null;
  return Number((sumCV / sumVol).toFixed(2));
}

// MACD full time series — returns hist, macdLine, and signalLine arrays, all
// parallel to `closes` with null before enough history exists. Splitting into
// three separate series lets the chart overlay MACD and signal lines on top of
// the histogram bars without a second data-fetch round-trip.
function macdFullSeries(closes) {
  const n = closes.length;
  const empty = () => new Array(n).fill(null);
  if (n < 35) return { hist: empty(), macdLine: empty(), signalLine: empty() };
  const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;

  let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  for (let i = 12; i < 26; i++) e12 = closes[i] * k12 + e12 * (1 - k12);
  let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

  const macdArr = [];
  for (let i = 26; i < n; i++) {
    e12 = closes[i] * k12 + e12 * (1 - k12);
    e26 = closes[i] * k26 + e26 * (1 - k26);
    macdArr.push(e12 - e26);
  }

  if (macdArr.length < 9) return { hist: empty(), macdLine: empty(), signalLine: empty() };

  let sig = macdArr.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  const hist = empty(), macdLine = empty(), signalLine = empty();
  for (let i = 9; i < macdArr.length; i++) {
    sig = macdArr[i] * k9 + sig * (1 - k9);
    const idx = 26 + i;
    hist[idx]       = Number((macdArr[i] - sig).toFixed(4));
    macdLine[idx]   = Number(macdArr[i].toFixed(4));
    signalLine[idx] = Number(sig.toFixed(4));
  }
  return { hist, macdLine, signalLine };
}

function macdHistogramSeries(closes) {
  return macdFullSeries(closes).hist;
}

// 2026 quant best practice: don't trust any single oscillator — only flag a
// strong signal when a majority of independent indicators agree on direction.
// Checks RSI, MACD, Stochastic, OBV and VWAP and counts how many vote bullish
// vs bearish.
function confluenceScore({ rsi, macd, stoch, obv, price, vwap }) {
  const votes = [];
  // RSI > 50: recent gains > losses = bullish momentum; < 50 = bearish momentum.
  if (rsi != null) votes.push(rsi > 50 ? "bull" : rsi < 50 ? "bear" : null);
  if (macd) votes.push(macd.bullish ? "bull" : "bear");
  // Stochastic K > 50: price in upper half of recent range = bullish; < 50 = bearish.
  if (stoch) votes.push(stoch.k > 50 ? "bull" : stoch.k < 50 ? "bear" : null);
  if (obv) votes.push(obv.trend === "rising" ? "bull" : obv.trend === "falling" ? "bear" : null);
  if (vwap != null) votes.push(price > vwap ? "bull" : "bear");

  const cast = votes.filter(Boolean);
  const bullCount = cast.filter((v) => v === "bull").length;
  const bearCount = cast.filter((v) => v === "bear").length;
  const total = cast.length;
  const direction = bullCount > bearCount ? "bullish" : bearCount > bullCount ? "bearish" : "mixed";
  const score = Math.max(bullCount, bearCount);

  return { score, total, direction, bullCount, bearCount, aligned: total > 0 && score / total >= 0.6 };
}

// Full RSI time-series for charting — O(n²) over a 252-bar daily series is fast enough.
function rsiSeriesFull(closes, period = 14) {
  const arr = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    arr[i] = rsi(closes.slice(0, i + 1), period);
  }
  return arr;
}


// Fibonacci retracement levels from the 52-week range.
// The golden ratio (61.8%) and key levels (38.2%, 50%) are widely watched
// by Indian retail traders on Zerodha, Groww, and TradingView as
// support/resistance zones for swing trades.
function fibRetracement(low, high, price) {
  if (high <= low) return null;
  const range = high - low;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels = ratios.map((r) => ({
    ratio: r,
    label: `${(r * 100).toFixed(1)}%`,
    value: Number((low + r * range).toFixed(2)),
  }));

  // Nearest support (below price) and resistance (above price)
  let support = null, resistance = null;
  for (const lvl of levels) {
    if (lvl.value <= price) support = lvl;
    else if (resistance == null) resistance = lvl;
  }

  // Zone the price is currently in
  const below = levels.filter((l) => l.value <= price);
  const above = levels.filter((l) => l.value > price);
  const zone =
    below.length && above.length
      ? `${below[below.length - 1].label}–${above[0].label}`
      : below.length ? 'above all levels' : 'below all levels';

  // Whether price is within 1.5% of a key Fibonacci level
  const nearKey = levels
    .filter((l) => [0.382, 0.5, 0.618, 0.786].includes(l.ratio))
    .find((l) => Math.abs((price - l.value) / l.value) <= 0.015) ?? null;

  return { levels, zone, support, resistance, nearKey };
}

// SuperTrend — 2026 quant research highlights "SuperTrend or EMA" as the
// primary trend-direction filter in the winning Triple Threat setup. It uses
// ATR to compute a dynamic support/resistance band that flips side when price
// crosses it, giving a single clean BUY/SELL signal that adapts to volatility.
// multiplier=3, period=10 are the widely-used defaults for daily data.
function superTrend(closes, period = 10, multiplier = 3) {
  if (closes.length < period + 1) return null;

  // Rolling ATR (average of |close[i] - close[i-1]| over `period` bars)
  const trArr = closes.slice(1).map((c, i) => Math.abs(c - closes[i]));
  const atrSeries = [];
  for (let i = 0; i < trArr.length; i++) {
    if (i < period - 1) { atrSeries.push(null); continue; }
    const slice = trArr.slice(i - period + 1, i + 1);
    atrSeries.push(slice.reduce((a, b) => a + b, 0) / period);
  }

  // Compute final upper/lower bands with the "lock-in" rule.
  // Using close as the midpoint (HL/2 proxy — standard for daily close-only data).
  const upperBands = new Array(closes.length).fill(null);
  const lowerBands = new Array(closes.length).fill(null);
  const superTrendLine = new Array(closes.length).fill(null);
  const direction = new Array(closes.length).fill(null); // 1=bullish, -1=bearish

  for (let i = period; i < closes.length; i++) {
    const atrVal = atrSeries[i - 1];
    if (atrVal == null) continue;

    const basicUpper = closes[i] + multiplier * atrVal;
    const basicLower = closes[i] - multiplier * atrVal;

    const prevUpper = upperBands[i - 1];
    const prevLower = lowerBands[i - 1];

    upperBands[i] = (prevUpper == null || basicUpper < prevUpper || closes[i - 1] > prevUpper)
      ? basicUpper : prevUpper;
    lowerBands[i] = (prevLower == null || basicLower > prevLower || closes[i - 1] < prevLower)
      ? basicLower : prevLower;

    const prevDir = direction[i - 1] ?? 1;
    if (prevDir === -1 && closes[i] > upperBands[i]) {
      direction[i] = 1;
    } else if (prevDir === 1 && closes[i] < lowerBands[i]) {
      direction[i] = -1;
    } else {
      direction[i] = prevDir;
    }
    superTrendLine[i] = direction[i] === 1 ? lowerBands[i] : upperBands[i];
  }

  const last = closes.length - 1;
  if (direction[last] == null) return null;

  const currentLine = superTrendLine[last];
  const currentPrice = closes[last];
  const isBullish = direction[last] === 1;
  const distPct = currentLine != null
    ? Number((((currentPrice - currentLine) / currentLine) * 100).toFixed(2))
    : null;

  // Detect a flip in the last bar (trend changed this period)
  const justFlipped = last > 0 && direction[last] !== direction[last - 1];

  return {
    value:      currentLine != null ? Number(currentLine.toFixed(2)) : null,
    direction:  isBullish ? 'bullish' : 'bearish',
    distPct,
    justFlipped,
    period,
    multiplier,
    series:     superTrendLine, // full series for charting
  };
}

function downIdx(len, target = 150) {
  if (len <= target) return [...Array(len).keys()];
  const stride = len / target, out = [];
  for (let i = 0; i < target; i++) out.push(Math.floor(i * stride));
  out.push(len - 1);
  return out;
}

export async function POST(req) {
  try {
    const { symbol } = await req.json();
    if (!symbol || !String(symbol).trim())
      return Response.json({ error: "Enter a stock name or NSE ticker." }, { status: 400 });
    const sym = String(symbol).trim().toUpperCase().replace(/\s+/g, "");

    let meta = null, closes = [], volumes = [];
    for (const v of [`${sym}.NS`, `${sym}.BO`, sym]) {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(v)}?range=1y&interval=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );
        if (!r.ok) continue;
        const j = await r.json();
        const res = j?.chart?.result?.[0];
        const quote = res?.indicators?.quote?.[0];
        const c = quote?.close;
        if (res?.meta?.regularMarketPrice && Array.isArray(c)) {
          meta = res.meta;
          closes = c.filter((x) => x != null);
          volumes = (quote?.volume || []).filter((x) => x != null);
          break;
        }
      } catch {}
    }
    if (!meta || closes.length < 20)
      return Response.json({ error: `Couldn't find price history for "${sym}". Try the exact NSE ticker, e.g. RELIANCE, INFY, TCS.` }, { status: 404 });

    const cur = meta.currency === "INR" ? "₹" : (meta.currency ? meta.currency + " " : "");
    const fmt = (n) => (n == null ? "N/A" : cur + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2];
    const dayChangePct = prev ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0;
    const low52 = Math.min(...closes), high52 = Math.max(...closes);
    const posInRange = high52 > low52 ? Math.round(((price - low52) / (high52 - low52)) * 100) : 50;

    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const r14 = rsi(closes);
    // RSI(9) — 2026 quant trend: shorter period reacts faster to volatility,
    // used as a momentum confirmation alongside the classic RSI(14).
    const r9 = rsi(closes, 9);
    const e21 = ema(closes, 21);
    const macdResult = macd(closes);
    const atrVal = atr(closes);
    const bb = bollingerBands(closes);
    const bbSqueeze = bollingerSqueeze(closes);
    const m1 = mom(closes, 21), m3 = mom(closes, 63), m6 = mom(closes, 126);
    const stoch = stochastic(closes);
    const volTrend = volumeTrend(volumes);
    const obvResult = onBalanceVolume(closes, volumes);
    const vwapRaw = rollingVwap(closes, volumes);
    const fib = fibRetracement(low52, high52, price);
    const stResult = superTrend(closes);
    const adxResult = adx(closes);

    // Trend determination
    let trend = "Range-bound", trendColor = "warn";
    if (s50 && s200) {
      if (price > s50 && s50 > s200) { trend = "Uptrend"; trendColor = "pos"; }
      else if (price < s50 && s50 < s200) { trend = "Downtrend"; trendColor = "neg"; }
    } else if (s50) {
      trend = price > s50 ? "Above 50-day avg" : "Below 50-day avg";
      trendColor = price > s50 ? "pos" : "neg";
    }

    const strengths = [], concerns = [];
    if (s200 && price > s200) strengths.push("Above the 200-day average — long-term trend intact.");
    if (s50 && price > s50) strengths.push("Above the 50-day average — near-term momentum positive.");
    if (m3 != null && m3 > 0) strengths.push(`Up ${m3}% over the last three months.`);
    if (r14 != null && r14 <= 30) strengths.push("RSI oversold (<30) — historically a rebound zone.");
    if (posInRange <= 25) strengths.push("Trading near the low of its 52-week range — potential value zone.");
    if (macdResult?.bullish) strengths.push("MACD above signal line — short-term momentum turning bullish.");
    if (bb && price < bb.lower) strengths.push("Price below lower Bollinger Band — mean reversion candidate.");
    if (bbSqueeze?.squeeze) strengths.push(`Bollinger Band Squeeze detected (bandwidth ${bbSqueeze.intensity}% below average) — low-volatility coiling often precedes a significant breakout.`);
    // RSI(9) fast confirmation signals
    if (r9 != null && r14 != null) {
      if (r14 < 35 && r9 < 35) strengths.push(`RSI(9) at ${r9} confirms RSI(14) at ${r14} — both oversold, stronger rebound signal.`);
      if (r14 > 65 && r9 > 65) concerns.push(`RSI(9) at ${r9} confirms RSI(14) at ${r14} — both overbought, higher reversal risk.`);
    }

    if (s200 && price < s200) concerns.push("Below the 200-day average — long-term trend weak.");
    if (s50 && price < s50) concerns.push("Below the 50-day average — near-term momentum negative.");
    if (m3 != null && m3 < 0) concerns.push(`Down ${Math.abs(m3)}% over the last three months.`);
    if (r14 != null && r14 >= 70) concerns.push("RSI overbought (>70) — price looks stretched.");
    if (posInRange >= 85) concerns.push("Trading near the top of its 52-week range.");
    if (macdResult && !macdResult.bullish) concerns.push("MACD below signal line — short-term momentum bearish.");
    if (bb && price > bb.upper) concerns.push("Price above upper Bollinger Band — potential pullback zone.");
    if (stoch?.oversold) strengths.push(`Stochastic %K at ${stoch.k} — oversold territory, potential bounce.`);
    if (stoch?.overbought) concerns.push(`Stochastic %K at ${stoch.k} — overbought, watch for reversal.`);
    if (volTrend?.aboveAvg && dayChangePct > 0) strengths.push(`Volume ${volTrend.ratio}x the 20-day average on an up day — institutional interest.`);
    if (volTrend?.aboveAvg && dayChangePct < 0) concerns.push(`Volume ${volTrend.ratio}x the 20-day average on a down day — heavy selling pressure.`);
    if (obvResult?.trend === 'rising') strengths.push('OBV (On-Balance Volume) trending up — cumulative buying pressure confirmed.');
    if (obvResult?.trend === 'falling') concerns.push('OBV (On-Balance Volume) trending down — cumulative selling pressure detected.');
    if (vwapRaw !== null && price > vwapRaw) strengths.push(`Price above 20-day VWAP (${fmt(vwapRaw)}) — volume-weighted consensus favours buyers.`);
    if (vwapRaw !== null && price <= vwapRaw) concerns.push(`Price below 20-day VWAP (${fmt(vwapRaw)}) — sellers dominate the volume-weighted average.`);

    // SuperTrend signals — 2026 research identifies SuperTrend as the top
    // adaptive trend filter: ATR-based bands that flip on crossover give a
    // single actionable read without the noise of raw price vs. moving average.
    if (stResult) {
      const stLine = stResult.value != null ? fmt(stResult.value) : null;
      if (stResult.direction === 'bullish') {
        const msg = stLine
          ? `SuperTrend bullish (support at ${stLine}${stResult.distPct != null ? `, price ${stResult.distPct > 0 ? '+' : ''}${stResult.distPct}% above line` : ''}) — trend-following signal is buy.`
          : 'SuperTrend is in bullish mode — trend-following signal is buy.';
        if (stResult.justFlipped) strengths.push('SuperTrend just flipped bullish — a fresh trend-reversal buy signal.');
        else strengths.push(msg);
      } else {
        const msg = stLine
          ? `SuperTrend bearish (resistance at ${stLine}${stResult.distPct != null ? `, price ${Math.abs(stResult.distPct)}% below line` : ''}) — trend-following signal is sell.`
          : 'SuperTrend is in bearish mode — trend-following signal is sell.';
        if (stResult.justFlipped) concerns.push('SuperTrend just flipped bearish — a fresh trend-reversal sell signal.');
        else concerns.push(msg);
      }
    }

    // ADX trend-strength gate — 2026 best practice: oscillator signals (RSI, MACD)
    // are unreliable in ranging markets. ADX < 15 = ranging noise; ADX > 25 =
    // directional trend confirmed. Surface this context so the user knows whether
    // to trust the momentum signals above.
    if (adxResult) {
      if (adxResult.trend === 'strong') {
        const dir = adxResult.bullish ? 'bullish (+DI > −DI)' : 'bearish (−DI > +DI)';
        strengths.push(`ADX ${adxResult.adx} — strong trend confirmed (${dir}); momentum indicators are more reliable.`);
      } else if (adxResult.trend === 'weak') {
        concerns.push(`ADX ${adxResult.adx} — weak/ranging market; RSI and MACD crossovers carry less weight until a trend re-establishes.`);
      }
    }

    // Fibonacci retracement signals
    if (fib) {
      if (fib.nearKey) {
        const pct = (((price - fib.nearKey.value) / fib.nearKey.value) * 100).toFixed(1);
        const direction = price >= fib.nearKey.value ? 'at/above' : 'approaching';
        if ([0.382, 0.618].includes(fib.nearKey.ratio)) {
          if (posInRange < 50)
            strengths.push(`Price ${direction} key Fibonacci ${fib.nearKey.label} support (${fmt(fib.nearKey.value)}) — golden ratio zone, historically strong rebound area.`);
          else
            concerns.push(`Price ${direction} Fibonacci ${fib.nearKey.label} resistance (${fmt(fib.nearKey.value)}) — golden ratio zone, historically a reversal point.`);
        } else {
          strengths.push(`Price near Fibonacci ${fib.nearKey.label} level (${fmt(fib.nearKey.value)}) — technically significant zone.`);
        }
      }
      if (fib.support && fib.resistance) {
        const distToResistancePct = ((fib.resistance.value - price) / price * 100).toFixed(1);
        const distToSupportPct = ((price - fib.support.value) / price * 100).toFixed(1);
        if (parseFloat(distToResistancePct) <= 2.0 && fib.resistance.ratio <= 0.618)
          concerns.push(`Only ${distToResistancePct}% from Fibonacci ${fib.resistance.label} resistance (${fmt(fib.resistance.value)}) — limited upside before key level.`);
      }
    }
    if (!strengths.length) strengths.push("No standout positive signals right now.");
    if (!concerns.length) concerns.push("No major technical red flags right now.");

    const strength = Math.round(
      (Math.max(strengths.length, concerns.length) / (strengths.length + concerns.length)) * 100
    );

    const rationale =
      trend === "Uptrend" ? "Price sits above both key averages with positive momentum — a constructive technical setup."
      : trend === "Downtrend" ? "Price sits below both key averages — the technical picture is currently weak."
      : "Mixed signals: the stock is consolidating without a clear directional edge.";

    const macdSummary = macdResult
      ? `MACD ${macdResult.macd > 0 ? "positive" : "negative"} (histogram ${macdResult.histogram > 0 ? "+" : ""}${macdResult.histogram}) — momentum ${macdResult.bullish ? "bullish" : "bearish"}. `
      : "";

    const technical = `${trend}. ${
      r14 != null ? `RSI ${r14} (${r14 >= 70 ? "overbought" : r14 <= 30 ? "oversold" : "neutral"}). ` : ""
    }${macdSummary}Sitting ${posInRange}% up its 52-week range.${
      atrVal != null ? ` ATR ${fmt(atrVal)} — ${atrVal > price * 0.03 ? "high" : "moderate"} daily volatility.` : ""
    }`;

    const fundamental = `50-day avg ${fmt(s50)}, 200-day avg ${fmt(s200)}, EMA-21 ${fmt(e21)}. Bollinger Bands: ${bb ? `${fmt(bb.lower)} – ${fmt(bb.upper)}` : "N/A"}. (This tool shows price data only — check Groww for earnings & fundamentals.)`;

    const confluence = confluenceScore({ rsi: r14, macd: macdResult, stoch, obv: obvResult, price, vwap: vwapRaw });

    const idx = downIdx(closes.length);
    const ma50full = smaSeries(closes, 50);
    const ma200full = smaSeries(closes, 200);
    const macdFull = macdFullSeries(closes);
    const rsiFullSeries = rsiSeriesFull(closes);
    const series = idx.map((i) => closes[i]);
    const ma50 = idx.map((i) => ma50full[i]);
    const ma200 = idx.map((i) => ma200full[i]);
    const macdHistSeries = idx.map((i) => macdFull.hist[i] ?? null);
    const macdLineSeries = idx.map((i) => macdFull.macdLine[i] ?? null);
    const macdSignalSeries = idx.map((i) => macdFull.signalLine[i] ?? null);
    const rsiSeriesData = idx.map((i) => rsiFullSeries[i] ?? null);

    return Response.json({
      name: meta.longName || meta.shortName || sym,
      ticker: sym,
      sector: meta.fullExchangeName || meta.exchangeName || "NSE/BSE",
      asOf: `live · ${new Date().toISOString().slice(0, 10)}`,
      price: fmt(price),
      dayChangePct,
      week52: `${fmt(low52)} – ${fmt(high52)}`,
      sma50: fmt(s50), sma200: fmt(s200), ema21: fmt(e21), rsi: r14, rsiFast: r9,
      macd: macdResult,
      atr: atrVal,
      bollingerUpper: bb ? fmt(bb.upper) : null,
      bollingerMiddle: bb ? fmt(bb.middle) : null,
      bollingerLower: bb ? fmt(bb.lower) : null,
      bbSqueeze,
      posInRange, mom1m: m1, mom3m: m3, mom6m: m6,
      signal: trend, signalColor: trendColor, strength, rationale,
      bull: strengths, bear: concerns, technical, fundamental,
      risks: [
        "Indicators reflect past prices and can reverse quickly.",
        "Single-stock exposure is riskier than a diversified basket.",
        "This tool shows NSE/BSE price data only — no earnings, no news.",
      ],
      series, ma50, ma200,
      stochastic: stoch,
      volumeTrend: volTrend,
      obv: obvResult,
      confluence,
      vwap: vwapRaw != null ? fmt(vwapRaw) : null,
      vwapAbove: vwapRaw != null ? price > vwapRaw : null,
      volumes: idx.map((i) => volumes[i] ?? null),
      macdHistSeries,
      macdLineSeries,
      macdSignalSeries,
      rsiSeries: rsiSeriesData,
      adx: adxResult ?? null,
      fibRetracement: fib,
      superTrend: stResult ? {
        value:      stResult.value,
        direction:  stResult.direction,
        distPct:    stResult.distPct,
        justFlipped: stResult.justFlipped,
        series:     stResult.series ? idx.map((i) => stResult.series[i] ?? null) : null,
      } : null,
    });
  } catch (e) {
    return Response.json({ error: "Something went wrong fetching the data.", detail: String(e) }, { status: 500 });
  }
}
