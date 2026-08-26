module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    status: "ok",
    app: "Upbit Bitcoin Analyzer V9 Vercel"
  });
};
