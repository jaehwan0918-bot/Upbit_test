module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET requests only." });

  const market = String(req.query.market || "KRW-BTC").toUpperCase();
  if (!/^KRW-[A-Z0-9]+$/.test(market)) return res.status(400).json({ error: "Only KRW markets are allowed." });

  const tf = String(req.query.tf || "240");
  const rawCount = Number(req.query.count || 200);
  const count = Math.max(1, Math.min(200, Number.isFinite(rawCount) ? Math.trunc(rawCount) : 200));
  const to = req.query.to ? String(req.query.to) : "";

  let path;
  if (tf === "day") path = "/v1/candles/days";
  else if (tf === "60" || tf === "240") path = `/v1/candles/minutes/${tf}`;
  else return res.status(400).json({ error: "Invalid timeframe." });

  const upstream = new URL(`https://api.upbit.com${path}`);
  upstream.searchParams.set("market", market);
  upstream.searchParams.set("count", String(count));
  if (to) upstream.searchParams.set("to", to);

  try {
    const response = await fetch(upstream.toString(), {
      headers: { Accept: "application/json", "User-Agent": "CryptoAnalyzerV12-Vercel" }
    });
    const body = await response.text();
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(response.status).send(body);
  } catch (error) {
    return res.status(502).json({ error: "Upbit candle request failed.", detail: String(error?.message || error) });
  }
};
