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
    const e21 = ema(closes, 21);
    const macdResult = macd(closes);
    const atrVal = atr(closes);
    const bb = bollingerBands(closes);
    const m1 = mom(closes, 21), m3 = mom(closes, 63), m6 = mom(closes, 126);
    const stoch = stochastic(closes);
    const volTrend = volumeTrend(volumes);

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

    const idx = downIdx(closes.length);
    const ma50full = smaSeries(closes, 50);
    const ma200full = smaSeries(closes, 200);
    const series = idx.map((i) => closes[i]);
    const ma50 = idx.map((i) => ma50full[i]);
    const ma200 = idx.map((i) => ma200full[i]);

    return Response.json({
      name: meta.longName || meta.shortName || sym,
      ticker: sym,
      sector: meta.fullExchangeName || meta.exchangeName || "NSE/BSE",
      asOf: `live · ${new Date().toISOString().slice(0, 10)}`,
      price: fmt(price),
      dayChangePct,
      week52: `${fmt(low52)} – ${fmt(high52)}`,
      sma50: fmt(s50), sma200: fmt(s200), ema21: fmt(e21), rsi: r14,
      macd: macdResult,
      atr: atrVal,
      bollingerUpper: bb ? fmt(bb.upper) : null,
      bollingerMiddle: bb ? fmt(bb.middle) : null,
      bollingerLower: bb ? fmt(bb.lower) : null,
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
      volumes: idx.map((i) => volumes[i] ?? null),
    });
  } catch (e) {
    return Response.json({ error: "Something went wrong fetching the data.", detail: String(e) }, { status: 500 });
  }
}
