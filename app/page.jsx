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

function PriceChart({ series, ma50 }) {
  const W = 700, H = 230, pad = 10, n = series.length;
  if (n < 2) return null;
  const all = series.concat(ma50.filter((v) => v != null));
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const x = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const line = series.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${H - pad} L${x(0).toFixed(1)} ${H - pad} Z`;
  let ma = "", pen = false;
  ma50.forEach((v, i) => { if (v == null) { pen = false; return; } ma += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; });
  const up = series[n - 1] >= series[0], stroke = up ? T.pos : T.neg;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
      <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={stroke} stopOpacity="0.18" /><stop offset="100%" stopColor={stroke} stopOpacity="0" />
      </linearGradient></defs>
      <path d={area} fill="url(#f)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      {ma && <path d={ma} fill="none" stroke={T.warn} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.85" />}
    </svg>
  );
}

export default function StockAdvisor() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function analyze() {
    const q = symbol.trim();
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
          <button className="sa-btn" onClick={analyze} disabled={loading}
            style={{ width: "100%", marginTop: 14, padding: 12, border: "none", borderRadius: 10, background: T.accent, color: "#fff", fontFamily: T.body, fontWeight: 600, fontSize: 14.5, cursor: loading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? (<><Loader2 size={17} className="sa-spin" /> Loading prices…</>) : "Analyze stock"}
          </button>
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
                <PriceChart series={result.series} ma50={result.ma50} />
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 6px 0", fontSize: 10.5, color: T.muted }}>
                  <span>1 year</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, height: 2, background: T.accent, display: "inline-block" }} /> price</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 14, borderTop: `2px dashed ${T.warn}` }} /> 50-day avg</span>
                  </span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
                {[["52-week range", result.week52], ["50-day avg", result.sma50], ["RSI (14)", result.rsi ?? "N/A"]].map(([k, v]) => (
                  <div key={k} style={{ background: T.bg, borderRadius: 9, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: T.muted }}>{k}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 13.5, marginTop: 3 }}>{v}</div>
                  </div>
                ))}
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
