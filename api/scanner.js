const {calculateRows,qualitySingle}=require("../lib/signal");
async function getMarkets(){
  const mr=await fetch("https://api.upbit.com/v1/market/all?isDetails=false",{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.5"}});
  if(!mr.ok)throw new Error("market/all failed");
  const all=(await mr.json()).filter(x=>String(x.market).startsWith("KRW-")),names=new Map(all.map(x=>[x.market,x.korean_name||x.market])),ids=all.map(x=>x.market),ticks=[];
  for(let i=0;i<ids.length;i+=80){const u=new URL("https://api.upbit.com/v1/ticker");u.searchParams.set("markets",ids.slice(i,i+80).join(","));const r=await fetch(u,{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.5"}});if(r.ok)ticks.push(...await r.json())}
  return ticks.map(t=>({market:t.market,name:names.get(t.market)||t.market,price:+t.trade_price,change:+t.signed_change_rate*100,trade:+t.acc_trade_price_24h})).sort((a,b)=>b.trade-a.trade);
}
async function candleCalc(market,tf){
  const path=tf==="day"?"/v1/candles/days":`/v1/candles/minutes/${tf}`,u=new URL("https://api.upbit.com"+path);
  u.searchParams.set("market",market);u.searchParams.set("count","150");
  const r=await fetch(u,{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.5"}});if(!r.ok)return null;
  const z=calculateRows(await r.json(),tf);return z?{...z,quality:qualitySingle(z)}:null
}
module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  const tf=String(req.query.tf||"240"),n=Math.max(1,Math.min(50,Number(req.query.n||20))),minScore=Number(req.query.minScore||0),minVol=Number(req.query.minVol||0);
  if(!["60","240","day"].includes(tf))return res.status(400).json({error:"Invalid timeframe"});
  try{
    const markets=(await getMarkets()).slice(0,n),bench=await candleCalc("KRW-BTC",tf),allResults=[];
    for(let start=0;start<markets.length;start+=4){
      const batch=markets.slice(start,start+4),vals=await Promise.all(batch.map(async m=>{const z=await candleCalc(m.market,tf);return z?{...m,...z,vol:z.volRatio,relativeStrength:z.ret12-(bench?.ret12||0)}:null}));
      allResults.push(...vals.filter(Boolean));if(start+4<markets.length)await new Promise(r=>setTimeout(r,150))
    }
    const denom=Math.max(1,allResults.length),breadth={
      aboveMA20Pct:100*allResults.filter(x=>x.aboveMA20).length/denom,
      positiveScorePct:100*allResults.filter(x=>x.score>0).length/denom,
      strongUpPct:100*allResults.filter(x=>x.regime==="상승 추세").length/denom,
      advance24hPct:100*allResults.filter(x=>x.change>0).length/denom,
      btcRet12:bench?.ret12||0
    };
    const results=allResults.filter(x=>x.score>=minScore&&x.vol>=minVol);
    results.sort((a,b)=>b.score-a.score||b.relativeStrength-a.relativeStrength||b.quality-a.quality);
    res.setHeader("Cache-Control","s-maxage=45, stale-while-revalidate=45");
    return res.status(200).json({scanned:markets.length,breadth,results});
  }catch(e){return res.status(502).json({error:"Scanner failed",detail:String(e?.message||e)})}
};
