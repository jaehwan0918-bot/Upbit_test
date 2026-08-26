module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET requests only." });

  try {
    const marketResponse = await fetch("https://api.upbit.com/v1/market/all?isDetails=false", {
      headers: { Accept: "application/json", "User-Agent": "CryptoAnalyzerV12-Vercel" }
    });
    if (!marketResponse.ok) return res.status(marketResponse.status).send(await marketResponse.text());

    const allMarkets = (await marketResponse.json()).filter(x => String(x.market || "").startsWith("KRW-"));
    const names = new Map(allMarkets.map(x => [x.market, x.korean_name || x.market]));
    const ids = allMarkets.map(x => x.market);

    let tickers = [];
    for (let i = 0; i < ids.length; i += 80) {
      const batch = ids.slice(i, i + 80);
      const url = new URL("https://api.upbit.com/v1/ticker");
      url.searchParams.set("markets", batch.join(","));
      const r = await fetch(url.toString(), {
        headers: { Accept: "application/json", "User-Agent": "CryptoAnalyzerV12-Vercel" }
      });
      if (!r.ok) continue;
      tickers.push(...await r.json());
    }

    const markets = tickers.map(t => ({
      market: t.market,
      korean_name: names.get(t.market) || t.market,
      trade_price: Number(t.trade_price || 0),
      signed_change_rate: Number(t.signed_change_rate || 0),
      acc_trade_price_24h: Number(t.acc_trade_price_24h || 0)
    })).sort((a,b) => b.acc_trade_price_24h - a.acc_trade_price_24h);

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=30");
    return res.status(200).json({ markets });
  } catch (error) {
    return res.status(502).json({ error: "Upbit market request failed.", detail: String(error?.message || error) });
  }
};
