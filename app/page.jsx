"use client";

import { useState, useEffect, useRef } from "react";
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

function VolumeChart({ volumes, series }) {
  const W = 700, H = 52, pad = 10, n = volumes.length;
  if (n < 2) return null;
  const valid = volumes.filter(Boolean);
  if (!valid.length) return null;
  const maxVol = Math.max(...valid);
  const barW = (W - 2 * pad) / n;
  const up = series[n - 1] >= series[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} preserveAspectRatio="none">
      {volumes.map((v, i) => {
        if (v == null || v === 0) return null;
        const bH = Math.max(1, (v / maxVol) * (H - pad));
        const bX = pad + i * barW;
        const bY = H - bH;
        const isUp = series[i] != null && i > 0 && series[i] >= (series[i - 1] ?? series[i]);
        return (
          <rect key={i} x={bX} y={bY} width={Math.max(1, barW - 0.5)} height={bH}
            fill={isUp ? T.pos : T.neg} opacity="0.55" />
        );
      })}
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
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function analyze(sym) {
    const q = (sym || symbol).trim();
    if (!q) { setError("Enter a stock name or NSE ticker to begin."); return; }

    // Cancel any in-flight search so a slow earlier request can't
    // clobber the result of a newer one (e.g. searching RELIANCE then
    // quickly searching TCS before the first response arrives).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: q }), signal: controller.signal,
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
      if (e.name === "AbortError") return; // superseded by a newer search — ignore
      setError(e.message && e.message !== "failed" ? e.message : "Couldn't load the data. Try again.");
    } finally {
      if (abortRef.current === controller) { setLoading(false); abortRef.current = null; }
    }
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em" }}>Company or NSE ticker</label>
            <kbd style={{ fontSize: 11, color: T.muted, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 4, padding: "1px 5px", fontFamily: T.mono }}>press / to search</kbd>
          </div>
          <div style={{ position: "relative", marginTop: 8 }}>
            <Search size={17} color={T.muted} style={{ position: "absolute", left: 12, top: 13 }} />
            <input ref={inputRef} className="sa-in" value={symbol} onChange={(e) => setSymbol(e.target.value)}
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
              <div style={{ marginTop: 16, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 8px 4px", background: "#FCFDFC" }}>
                <PriceChart series={result.series} ma50={result.ma50} ma200={result.ma200} />
                {result.volumes && result.volumes.some(Boolean) && (
                  <>
                    <div style={{ borderTop: `1px solid ${T.line}`, margin: "4px 0 2px", opacity: 0.5 }} />
                    <VolumeChart volumes={result.volumes} series={result.series} />
                  </>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 6px 2px", fontSize: 10.5, color: T.muted }}>
                  <span>1 year{result.volumes && result.volumes.some(Boolean) ? " · incl. volume" : ""}</span>
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
                {result.vwap && (
                  <div style={{ background: T.bg, borderRadius: 9, padding: "10px 12px", gridColumn: "1 / -1" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: T.muted }}>VWAP (20d) — Volume-Weighted Avg Price</div>
                        <div style={{ fontFamily: T.mono, fontSize: 15, marginTop: 3, color: result.vwapAbove ? T.pos : T.neg }}>
                          {result.vwap}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, background: (result.vwapAbove ? T.pos : T.neg) + "18", borderRadius: 7, padding: "5px 10px" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: result.vwapAbove ? T.pos : T.neg }}>
                          {result.vwapAbove ? "Price above VWAP ↑" : "Price below VWAP ↓"}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                      VWAP weights each day&apos;s price by volume — the true average cost. Price above = institutional demand confirmed; below = distribution.
                    </div>
                  </div>
                )}
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
              {result.obv && (() => {
                const obvColor = result.obv.trend === 'rising' ? T.pos : result.obv.trend === 'falling' ? T.neg : T.muted;
                const trendLabel = result.obv.trend === 'rising' ? 'Accumulation ↑' : result.obv.trend === 'falling' ? 'Distribution ↓' : 'Neutral →';
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                    <div style={{ background: T.bg, borderRadius: 9, padding: "10px 12px", gridColumn: "1 / -1" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: T.muted }}>OBV — On-Balance Volume</div>
                          <div style={{ fontFamily: T.mono, fontSize: 15, marginTop: 3, color: obvColor }}>{result.obv.formatted}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, background: obvColor + "18", borderRadius: 7, padding: "5px 10px" }}>
                          <Gauge size={13} color={obvColor} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: obvColor }}>{trendLabel}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                        Cumulative volume flow — rising OBV confirms buying pressure; falling signals distribution.
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div style={{ fontSize: 11, color: T.muted, marginTop: 12, fontStyle: "italic" }}>{result.asOf} · prices may be delayed</div>
            </div>

            {/* Confluence score — how many indicators (RSI, MACD, Stochastic, OBV, VWAP) agree */}
            {result.confluence && (() => {
              const c = result.confluence;
              const cColor = c.direction === "bullish" ? T.pos : c.direction === "bearish" ? T.neg : T.warn;
              return (
                <div className="sa-card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: 13.5 }}>
                      <Gauge size={16} color={T.accent} /> Indicator confluence
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: cColor + "18", borderRadius: 7, padding: "5px 10px" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: cColor }}>
                        {c.score}/{c.total} aligned {c.direction}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: T.bg, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${c.total ? (c.bullCount / c.total) * 100 : 0}%`, height: "100%", background: T.pos }} />
                    <div style={{ width: `${c.total ? (c.bearCount / c.total) * 100 : 0}%`, height: "100%", background: T.neg }} />
                  </div>
                  <p style={{ fontSize: 11, color: T.muted, marginTop: 8, marginBottom: 0 }}>
                    {c.aligned
                      ? `RSI, MACD, Stochastic, OBV and VWAP mostly agree — a stronger ${c.direction} read.`
                      : "Indicators are split — no strong directional consensus right now."}
                  </p>
                </div>
              );
            })()}

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
