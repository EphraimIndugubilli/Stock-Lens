📈 Stock Lens

Live price and technical indicators for any NSE / BSE stock — no API key, no account, no quotas. Type a ticker, get an instant technical read, then place your own trade in Groww.


Educational research aid. Not investment advice.




✨ Features


Live price and today's change for any NSE/BSE stock
1-year price chart with the 50-day moving average overlaid (hand-drawn SVG, no chart library)
52-week range and where the price currently sits in it
Moving averages — 50-day and 200-day
RSI (14) with overbought / oversold flags
Momentum over 1, 3, and 6 months
Rule-based read — Uptrend / Range-bound / Downtrend, with computed strengths and watch-outs
Runs 100% free — all indicators are computed in code from public price data


🛠️ Tech stack


Next.js (App Router)
React (no external chart library — the chart is plain SVG)
lucide-react for icons
Public price data from Yahoo Finance's open endpoint (keyless)


🚀 Getting started

You need Node.js 18.18 or higher (node -v to check).

bash# 1. install dependencies
npm install

# 2. start the dev server
npm run dev

# 3. open the app
# http://localhost:3000

Type a ticker — e.g. RELIANCE, TCS, INFY — and press Analyze stock.

There are no environment variables to set. It just runs.

🌐 Deploy

Deploys to Vercel with zero configuration:


Push this repo to GitHub.
On Vercel: Add New → Project → import the repo.
Deploy. Nothing to configure — no keys, no secrets.


🧠 How it works

The browser sends a ticker to a serverless route, which fetches one year of daily
prices from Yahoo's public endpoint and computes every indicator on the server. No
third-party AI service and no credentials are involved.

Browser  ->  /api/analyze  ->  Yahoo public price data  ->  indicators computed in code  ->  UI

📁 Project structure

.
├── app/
│   ├── page.jsx              # UI: search, chart, indicator cards
│   ├── layout.jsx            # root layout + fonts
│   ├── globals.css           # base styles
│   └── api/
│       └── analyze/
│           └── route.js      # fetches prices, computes indicators
├── package.json
└── next.config.js

⚠️ Disclaimer

Stock Lens shows factual technical indicators, not investment advice, and is not a
registered investment adviser. Technical indicators describe past price behaviour and
do not predict future returns. Prices come from an unofficial public endpoint and may
be delayed. Always verify figures in your broker app and make your own decisions. The tool
never places trades on your behalf.

📄 License

Released under the MIT License. See LICENSE for details.
