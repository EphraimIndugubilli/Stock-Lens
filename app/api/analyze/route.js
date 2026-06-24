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

const mom = (c, days) => {
  if (c.length <= days) return null;
  return Number((((c[c.length - 1] - c[c.length - 1 - days]) / c[c.length - 1 - days]) * 100).toFixed(1));
};

function smaSeries(c, n) {
  return c.map((_, i) => (i + 1 < n ? null : sma(c.slice(0, i + 1), n)));
}

function ema(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let val = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) val = prices[i] * k + val * (1 - k);
  return Number(val.toFixed(2));
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

    let meta = null, closes = [];
    for (const v of [`${sym}.NS`, `${sym}.BO`]) {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(v)}?range=1y&interval=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );
        if (!r.ok) continue;
        const j = await r.json();
        const res = j?.chart?.result?.[0];
        const c = res?.indicators?.quote?.[0]?.close;
        if (res?.meta?.regularMarketPrice && Array.isArray(c)) {
          meta = res.meta;
          closes = c.filter((x) => x != null);
          break;
        }
      } catch {}
    }
    if (!meta || closes.length < 20)
      return Response.json({ error: `Couldn't find price history for "${sym}". Try the NSE ticker, e.g. RELIANCE.` }, { status: 404 });

    const cur = meta.currency === "INR" ? "₹" : (meta.currency ? meta.currency + " " : "");
    const fmt = (n) => (n == null ? "N/A" : cur + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2];
    const dayChangePct = prev ? Number((((price - prev) / prev) * 100).toFixed(2)) : 0;
    const low52 = Math.min(...closes), high52 = Math.max(...closes);
    const posInRange = high52 > low52 ? Math.round(((price - low52) / (high52 - low52)) * 100) : 50;
    const s50 = sma(closes, 50), s200 = sma(closes, 200), r14 = rsi(closes);
    const e21 = ema(closes, 21);
    const bb = bollingerBands(closes);
    const m1 = mom(closes, 21), m3 = mom(closes, 63), m6 = mom(closes, 126);

    // descriptive trend
    let trend = "Range-bound", trendColor = "warn";
    if (s50 && s200) {
      if (price > s50 && s50 > s200) { trend = "Uptrend"; trendColor = "pos"; }
      else if (price < s50 && s50 < s200) { trend = "Downtrend"; trendColor = "neg"; }
    } else if (s50) {
      trend = price > s50 ? "Above 50-day avg" : "Below 50-day avg";
      trendColor = price > s50 ? "pos" : "neg";
    }

    // strengths / watch-outs from rules
    const strengths = [], concerns = [];
    if (s200 && price > s200) strengths.push("Above the 200-day average — long-term trend intact.");
    if (s50 && price > s50) strengths.push("Above the 50-day average — near-term momentum positive.");
    if (m3 != null && m3 > 0) strengths.push(`Up ${m3}% over the last three months.`);
    if (r14 != null && r14 <= 30) strengths.push("RSI oversold (<30) — historically a rebound zone.");
    if (posInRange <= 25) strengths.push("Trading near the low of its 52-week range.");
    if (s200 && price < s200) concerns.push("Below the 200-day average — long-term trend weak.");
    if (s50 && price < s50) concerns.push("Below the 50-day average.");
    if (m3 != null && m3 < 0) concerns.push(`Down ${Math.abs(m3)}% over the last three months.`);
    if (r14 != null && r14 >= 70) concerns.push("RSI overbought (>70) — price looks stretched.");
    if (posInRange >= 85) concerns.push("Trading near the top of its 52-week range.");
    if (!strengths.length) strengths.push("No standout positive signals right now.");
    if (!concerns.length) concerns.push("No major technical red flags right now.");

    // signal strength = how one-directional the indicators are (honest, not a probability)
    const strength = Math.round((Math.max(strengths.length, concerns.length) /
      (strengths.length + concerns.length)) * 100);

    const rationale =
      trend === "Uptrend" ? "Price sits above both key averages with positive momentum — a constructive technical setup."
      : trend === "Downtrend" ? "Price sits below both key averages — the technical picture is currently weak."
      : "Mixed signals: the stock is consolidating without a clear directional edge.";

    const technical = `${trend}. ${
      r14 != null ? `RSI ${r14} (${r14 >= 70 ? "overbought" : r14 <= 30 ? "oversold" : "neutral"}). ` : ""
    }Sitting ${posInRange}% up its 52-week range.`;
    const fundamental = `50-day average ${fmt(s50)}, 200-day average ${fmt(s200)}. (Computed from price history; this tool doesn't pull earnings data — check fundamentals in Groww.)`;

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
    });
  } catch (e) {
    return Response.json({ error: "Something went wrong fetching the data.", detail: String(e) }, { status: 500 });
  }
}
