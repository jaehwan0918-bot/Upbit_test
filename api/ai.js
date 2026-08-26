function extractText(response) {
  if (!response || !Array.isArray(response.output)) return "";
  const parts = [];
  for (const item of response.output) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST requests only." });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "OPENAI_API_KEY is not configured.", setupRequired: true });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const mode = body.mode === "question" ? "question" : "summary";
  const question = typeof body.question === "string" ? body.question.slice(0, 800) : "";
  const context = body.context && typeof body.context === "object" ? body.context : null;
  if (!context?.current) return res.status(400).json({ error: "Analysis context is missing." });

  const instructions = [
    "당신은 암호화폐 기술적 분석 데이터 해석 도우미다.",
    "제공된 계산값만 사용하고 없는 사실이나 가격을 추측하지 마라.",
    "Score, signalQuality, historicalWinRate, market regime, ADX, support/resistance, ATR risk plan, multi-timeframe, backtest, rolling walk-forward, scanner 데이터를 구분해서 해석하라.",
    "Signal Quality는 확률이 아니라 지표 정합성 점수이며 Historical Win Rate만 과거 관측 성공률임을 명확히 하라.",
    "Walk-forward 검증 수익률이 학습 구간보다 크게 악화되면 과최적화 가능성을 명시하라.",
    "Scanner 결과는 매수 추천이 아니라 기술적 조건 검색 결과라고 설명하라.",
    "확정적 가격 예측이나 수익 보장을 하지 마라.",
    "한국어로 간결하고 구체적으로 답하라."
  ].join(" ");

  const input = mode === "question"
    ? `다음 컨텍스트를 근거로 질문에 답해줘.\n질문: ${question}\n\n컨텍스트:\n${JSON.stringify(context, null, 2)}`
    : `다음 컨텍스트를 종합 분석해줘.
형식:
1. 시장 국면 및 신뢰도
2. 멀티타임프레임
3. 지지/저항 및 ATR Risk Plan
4. 상승 요인 / 위험 요인
5. 백테스트 및 Walk-Forward가 있으면 평가
6. Scanner 결과가 있으면 상위 종목 특징
7. 다음 확인 조건
컨텍스트:
${JSON.stringify(context, null, 2)}`;

  const model = process.env.OPENAI_MODEL || "gpt-5.6";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, instructions, input, max_output_tokens: 1100 })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "OpenAI API request failed." });
    const text = extractText(data);
    if (!text) return res.status(502).json({ error: "OpenAI response did not contain text." });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ text, model });
  } catch (error) {
    return res.status(502).json({ error: "OpenAI API request failed.", detail: String(error?.message || error) });
  }
};
