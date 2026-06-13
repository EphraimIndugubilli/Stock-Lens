import "./globals.css";

export const metadata = {
  title: "Stock Lens — AI research for NSE/BSE stocks",
  description:
    "Live AI research on any NSE/BSE stock, tuned to your risk profile. Educational only — not investment advice.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
