"use client";

import { useState } from "react";
import {
  Search, TrendingUp, TrendingDown, Minus, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Loader2, Building2,
  ShieldQuestion, Target, ScrollText, ExternalLink, Gauge,
} from "lucide-react";

const T = {
  ink: "#14201C", surface: "#FFFFFF", bg: "#EAEEEC", line: "#D6DEDA",
  accent: "#0F6E56", accentSoft: "#E1F0EA", pos: "#1D9E75", neg: "#D8453F",
  warn: "#BA7517", muted: "#5F6B66",
  disp: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif", mono: "'IBM Plex Mono', monospace",
};

// trend label -> colour + icon (replaces the old AI "signal")
const TREND = {
  Uptrend: { key: "pos", Icon: TrendingUp },
  "Above 50-day avg": { key: "pos", Icon: TrendingUp },
  "Range-bound": { key: "warn", Icon: Minus },
  Downtrend: { key: "neg", Icon: TrendingDown },
  "Below 50-day avg": { key: "neg", Icon: TrendingDown },
};
const COL = { pos: T.pos, neg: T.neg, warn: T.warn };

function buildSvgPath(series, x, y) {
  let d = "", pen = false;
  series.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  return d;
}

function PriceChart({ series, ma50, ma200 }) {
  const W = 700, H = 230, pad = 10, n = series.length;
  if (n < 2) return null;
  const allVals = [...series, ...ma50.filter(Boolean), ...(ma200 || []).filter(Boolean)];
  const min = Math.min(...allVals), max = Math.max(...allVals), span = max - min || 1;
  const x = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const linePath = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(n - 1).toFixed(1)} ${H - pad} L${x(0).toFixed(1)} ${H - pad} Z`;
  const ma50Path = buildSvgPath(ma50, x, y);
  const ma200Path = ma200 ? buildSvgPath(ma200, x, y) : "";
  const up = series[n - 1] >= series[0], stroke = up ? T.pos : T.neg;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
      <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={stroke} stopOpacity="0.18" /><stop offset="100%" stopColor={stroke} stopOpacity="0" />
      </linearGradient></defs>
      <path d={areaPath} fill="url(#f)" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      {ma50Path && <path d={ma50Path} fill="none" stroke={T.warn} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.85" />}
      {ma200Path && <path d={ma200Path} fill="none" stroke="#9B59B6" strokeWidth="1.4" strokeDasharray="6 3" opacity="0.75" />}
    </svg>
  );
}

export default function StockAdvisor() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sl_history") || "[]"); } catch { return []; }
  });

  async function analyze(sym) {
    const q = (sym || symbol).trim();
    if (!q) { setError("Enter a stock name or NSE ticker to begin."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: q }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "failed");
      setResult(data);
      setHistory(prev => {
        const next = [q.toUpperCase(), ...prev.filter(x => x !== q.toUpperCase())].slice(0, 5);
        try { localStorage.setItem("sl_history", JSON.stringify(next)); } catch {}
        return next;
      });
    } catch (e) {
      setError(e.message && e.message !== "failed" ? e.message : "Couldn't load the data. Try again.");
    } finally { setLoading(false); }
  }

  const trend = result ? (TREND[result.signal] || TREND["Range-bound"]) : null;
  const tColor = result ? (COL[result.signalColor] || T.warn) : T.warn;
  const dayUp = result && Number(result.dayChangePct) >= 0;
  const momCell = (label, v) => (
    <div key={label} style={{ background: T.bg, borderRadius: 9, padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: T.muted }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: 14, marginTop: 3, color: v == null ? T.muted : v >= 0 ? T.pos : T.neg }}>
        {v == null ? "N/A" : `${v >= 0 ? "+" : ""}${v}%`}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: T.body, background: T.bg, color: T.ink, minHeight: "100vh", padding: "0 0 40px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 18px" }}>
        <header style={{ paddingTop: 28, paddingBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: T.accent, display: "grid", placeItems: "center" }}>
              <TrendingUp size={19} color="#fff" strokeWidth={2.4} />
            </div>
            <h1 style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 23, margin: 0, letterSpacing: "-0.02em" }}>Stock Lens</h1>
          </div>
          <p style={{ color: T.muted, fontSize: 13.5, margin: "10px 0 0", lineHeight: 1.5 }}>
            Live price and technical indicators for any NSE/BSE stock — free, no API key. Read it, then trade in Groww.
          </p>
        </header>

        <div className="sa-card" style={{ padding: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em" }}>Company or NSE ticker</label>
          <div style={{ position: "relative", marginTop: 8 }}>
            <Search size={17} color={T.muted} style={{ position: "absolute", left: 12, top: 13 }} />
            <input className="sa-in" value={symbol} onChange={(e) => setSymbol(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()} placeholder="e.g. RELIANCE, TCS, INFY"
              style={{ width: "100%", padding: "11px 12px 11px 36px", border: `1px solid ${T.line}`, borderRadius: 10, fontFamily: T.body, fontSize: 14.5, background: T.bg, color: T.ink }} />
          </div>
          <button className="sa-btn" onClick={() => analyze()} disabled={loading}
            style={{ width: "100%", marginTop: 14, padding: 12, border: "none", borderRadius: 10, background: T.accent, color: "#fff", fontFamily: T.body, fontWeight: 600, fontSize: 14.5, cursor: loading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? (<><Loader2 size={17} className="sa-spin" /> Loading prices…</>) : "Analyze stock"}
          </button>
          {history.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: T.muted }}>Recent:</span>
              {history.map(h => (
                <button key={h} onClick={() => { setSymbol(h); analyze(h); }}
                  style={{ fontSize: 11.5, fontFamily: T.mono, padding: "3px 9px", borderRadius: 6, border: `1px solid ${T.line}`, background: T.surface, color: T.accent, cursor: "pointer" }}>
                  {h}
                </button>
              ))}
            </div>
          )}
          {error && <p style={{ color: T.neg, fontSize: 13, margin: "12px 0 0", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={15} /> {error}</p>}
        </div>

        {result && (
          <div className="sa-fade" style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Snapshot + chart */}
            <div className="sa-card" style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <h2 style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 19, margin: 0, letterSpacing: "-0.01em" }}>{result.name}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, color: T.muted, fontSize: 12.5 }}>
                    <Building2 size={13} /> {result.sector}<span style={{ color: T.line }}>•</span><span style={{ fontFamily: T.mono }}>{result.ticker}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: T.mono, fontWeight: 500, fontSize: 21 }}>{result.price}</div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 3, color: dayUp ? T.pos : T.neg, fontSize: 13, fontFamily: T.mono }}>
                    {dayUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(Number(result.dayChangePct)).toFixed(2)}%
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 8px 6px", background: "#FCFDFC" }}>
                <PriceChart series={result.series} ma50={result.ma50} ma200={result.ma200} />
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 6px 0", fontSize: 10.5, color: T.muted }}>
                  <span>1 year</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, height: 2, background: T.accent, display: "inline-block" }} /> price</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, borderTop: `2px dashed ${T.warn}` }} /> 50d</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, borderTop: "2px dashed #9B59B6" }} /> 200d</span>
                  </span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
                {[["52-week range", result.week52], ["50-day avg", result.sma50], ["RSI (14)", result.rsi ?? "N/A"],
                  ["200-day avg", result.sma200 ?? "N/A"], ["EMA 21", result.ema21 ?? "N/A"],
                  ["BB upper/lower", result.bollingerUpper && result.bollingerLower ? `${result.bollingerUpper} / ${result.bollingerLower}` : "N/A"]
                ].map(([k, v]) => (
                  <div key={k} style={{ background: T.bg, borderRadius: 9, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: T.muted }}>{k}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 13.5, marginTop: 3 }}>{v}</div>
                  </div>
                ))}
              </div>
              {/* MACD row */}
              {result.macd && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div style={{ background: T.bg, borderRadius: 9, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: T.muted }}>MACD Line</div>
                    <div style={{ fontFamily: T.mono, fontSize: 13.5, marginTop: 3, color: result.macd.bullish ? T.pos : T.neg }}>
                      {result.macd.macd}
                    </div>
                    <div style={{ fontSize: 10.5, color: result.macd.bullish ? T.pos : T.neg, marginTop: 2 }}>
                      {result.macd.bullish ? "Bullish" : "Bearish"}
                    </div>
                  </div>
                  <div style={{ background: T.bg, borderRadius: 9, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: T.muted }}>Signal Line</div>
                    <div style={{ fontFamily: T.mono, fontSize: 13.5, marginTop: 3 }}>{result.macd.signal}</div>
                  </div>
                  <div style={{ background: T.bg, borderRadius: 9, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: T.muted }}>MACD Histogram</div>
                    <div style={{ fontFamily: T.mono, fontSize: 13.5, marginTop: 3, color: result.macd.histogram >= 0 ? T.pos : T.neg }}>
                      {result.macd.histogram >= 0 ? "+" : ""}{result.macd.histogram}
                    </div>
                  </div>
                </div>
              )}
              {/* Stochastic + volume row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                {result.stochastic && (() => {
                  const s = result.stochastic;
                  const sColor = s.oversold ? T.pos : s.overbought ? T.neg : T.muted;
                  return (
                    <div style={{ background: T.bg, borderRadius: 9, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, color: T.muted }}>Stochastic %K / %D</div>
                      <div style={{ fontFamily: T.mono, fontSize: 13.5, marginTop: 3, color: sColor }}>
                        {s.k} / {s.d}
                      </div>
                      <div style={{ fontSize: 10.5, color: sColor, marginTop: 2 }}>
                        {s.oversold ? "Oversold" : s.overbought ? "Overbought" : "Neutral"}
                      </div>
                    </div>
                  );
                })()}
                {result.volumeTrend && (() => {
                  const vt = result.volumeTrend;
                  const vColor = vt.aboveAvg ? (dayUp ? T.pos : T.neg) : T.muted;
                  const fmtVol = (n) => n >= 1e7 ? (n / 1e7).toFixed(1) + "Cr" : n >= 1e5 ? (n / 1e5).toFixed(1) + "L" : n.toLocaleString();
                  return (
                    <div style={{ background: T.bg, borderRadius: 9, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, color: T.muted }}>Volume vs 20d avg</div>
                      <div style={{ fontFamily: T.mono, fontSize: 13.5, marginTop: 3, color: vColor }}>
                        {vt.ratio}x
                      </div>
                      <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>
                        Today: {fmtVol(vt.current)}
                      </div>
                    </div>
                  );
                })()}
                <div style={{ background: T.bg, borderRadius: 9, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: T.muted }}>ATR (14d)</div>
                  <div style={{ fontFamily: T.mono, fontSize: 13.5, marginTop: 3 }}>{result.atr ?? "N/A"}</div>
                  <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>avg daily range</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                {momCell("1-month", result.mom1m)}{momCell("3-month", result.mom3m)}{momCell("6-month", result.mom6m)}
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 12, fontStyle: "italic" }}>{result.asOf} · prices may be delayed</div>
            </div>

            {/* Trend read (was the AI signal card) */}
            {trend && (
              <div className="sa-card" style={{ padding: 18, borderLeft: `4px solid ${tColor}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: COL[result.signalColor] + "22", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <trend.Icon size={22} color={tColor} strokeWidth={2.2} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 20, color: tColor }}>{result.signal}</span>
                      <span style={{ fontSize: 12, color: T.muted }}>technical read · signal strength {result.strength}%</span>
                    </div>
                    <div style={{ height: 6, background: T.bg, borderRadius: 4, marginTop: 7, overflow: "hidden" }}>
                      <div style={{ width: `${result.strength}%`, height: "100%", background: tColor }} />
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.55, margin: "13px 0 0", color: T.ink }}>{result.rationale}</p>
              </div>
            )}

            {/* Strengths / Watch-outs (was bull/bear) */}
            <div className="sa-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="sa-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.pos, fontWeight: 600, fontSize: 13.5, marginBottom: 10 }}><TrendingUp size={16} /> Strengths</div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6 }}>{result.bull.map((b, i) => <li key={i} style={{ marginBottom: 6 }}>{b}</li>)}</ul>
              </div>
              <div className="sa-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.neg, fontWeight: 600, fontSize: 13.5, marginBottom: 10 }}><TrendingDown size={16} /> Watch-outs</div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6 }}>{result.bear.map((b, i) => <li key={i} style={{ marginBottom: 6 }}>{b}</li>)}</ul>
              </div>
            </div>

            {[["Technical read", result.technical, Target], ["Averages & data", result.fundamental, ScrollText]].map(([title, body, Icon]) => (
              <div key={title} className="sa-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}><Icon size={16} color={T.accent} /> {title}</div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{body}</p>
              </div>
            ))}

            <div className="sa-card" style={{ padding: 16, background: "#FBF6EC", borderColor: "#EAD9B5" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.warn, fontWeight: 600, fontSize: 13.5, marginBottom: 10 }}><ShieldQuestion size={16} /> Keep in mind</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6, color: "#6b4e12" }}>{result.risks.map((r, i) => <li key={i} style={{ marginBottom: 5 }}>{r}</li>)}</ul>
            </div>

            <div className="sa-card" style={{ padding: 16, background: T.accentSoft, borderColor: "#BBDACE", display: "flex", alignItems: "center", gap: 12 }}>
              <ExternalLink size={18} color={T.accent} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#0b4a3a" }}>
                Want to act? Open <strong>{result.ticker}</strong> in Groww to see the live order book and trade it yourself. This tool never trades for you.
              </p>
            </div>
          </div>
        )}

        <p style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, marginTop: 24, textAlign: "center" }}>
          Stock Lens shows factual technical indicators, not investment advice, and isn't a registered adviser.
          Indicators describe past price behaviour and don't predict the future. Verify in Groww and decide for yourself.
        </p>
      </div>
    </div>
  );
}
