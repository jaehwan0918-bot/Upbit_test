const {calculateRows,qualitySingle}=require("../lib/signal");

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function fetchUpbit(url,{retries=2,timeoutMs=6500}={}){
  let last=null;
  for(let attempt=0;attempt<=retries;attempt++){
    const ac=new AbortController();
    const timer=setTimeout(()=>ac.abort(),timeoutMs);
    try{
      const r=await fetch(url,{
        headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.5.1"},
        signal:ac.signal
      });
      clearTimeout(timer);

      if(r.ok)return r;

      last=new Error(`Upbit HTTP ${r.status}`);
      if((r.status===429||r.status===418||r.status>=500)&&attempt<retries){
        await sleep(650*(attempt+1));
        continue;
      }
      return r;
    }catch(e){
      clearTimeout(timer);
      last=e;
      if(attempt<retries){
        await sleep(650*(attempt+1));
        continue;
      }
    }
  }
  throw last||new Error("Upbit fetch failed");
}

async function getMarkets(){
  const mr=await fetchUpbit("https://api.upbit.com/v1/market/all?isDetails=false");
  if(!mr.ok)throw new Error(`market/all failed: ${mr.status}`);

  const all=(await mr.json()).filter(x=>String(x.market).startsWith("KRW-"));
  const names=new Map(all.map(x=>[x.market,x.korean_name||x.market]));
  const ids=all.map(x=>x.market);
  const ticks=[];

  // ticker group is separate from candle group; keep requests small and sequential.
  for(let i=0;i<ids.length;i+=80){
    const u=new URL("https://api.upbit.com/v1/ticker");
    u.searchParams.set("markets",ids.slice(i,i+80).join(","));
    const r=await fetchUpbit(u,{retries:1});
    if(r.ok)ticks.push(...await r.json());
    await sleep(90);
  }

  return ticks.map(t=>({
    market:t.market,
    name:names.get(t.market)||t.market,
    price:+t.trade_price,
    change:+t.signed_change_rate*100,
    trade:+t.acc_trade_price_24h
  })).sort((a,b)=>b.trade-a.trade);
}

async function candleCalc(market,tf){
  const path=tf==="day"?"/v1/candles/days":`/v1/candles/minutes/${tf}`;
  const u=new URL("https://api.upbit.com"+path);
  u.searchParams.set("market",market);
  u.searchParams.set("count","150");

  const r=await fetchUpbit(u,{retries:2});
  if(!r.ok)return {error:`HTTP ${r.status}`,market};

  const z=calculateRows(await r.json(),tf);
  if(!z)return {error:"insufficient candles",market};
  return {...z,quality:qualitySingle(z)};
}

module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});

  const tf=String(req.query.tf||"240");
  const n=Math.max(1,Math.min(30,Number(req.query.n||20)));
  const minScore=Number(req.query.minScore||0);
  const minVol=Number(req.query.minVol||0);

  if(!["60","240","day"].includes(tf)){
    return res.status(400).json({error:"Invalid timeframe"});
  }

  try{
    const markets=(await getMarkets()).slice(0,n);
    const allResults=[];
    const failures=[];

    // Upbit candle group: 10 req/s/IP.
    // 4 requests per ~600ms = <= 6.7 req/s in steady state, leaving safety margin.
    const BATCH=4;
    const BATCH_INTERVAL=600;

    for(let start=0;start<markets.length;start+=BATCH){
      const started=Date.now();
      const batch=markets.slice(start,start+BATCH);

      const vals=await Promise.all(batch.map(async m=>{
        try{
          const z=await candleCalc(m.market,tf);
          if(z?.error){
            failures.push({market:m.market,error:z.error});
            return null;
          }
          return {...m,...z,vol:z.volRatio};
        }catch(e){
          failures.push({market:m.market,error:String(e?.message||e)});
          return null;
        }
      }));

      allResults.push(...vals.filter(Boolean));

      const elapsed=Date.now()-started;
      if(start+BATCH<markets.length&&elapsed<BATCH_INTERVAL){
        await sleep(BATCH_INTERVAL-elapsed);
      }
    }

    // Prefer BTC from already-scanned results. Only make an extra candle request if BTC
    // somehow isn't in the top-N selection.
    let bench=allResults.find(x=>x.market==="KRW-BTC");
    if(!bench){
      await sleep(650);
      try{
        const z=await candleCalc("KRW-BTC",tf);
        if(z&&!z.error)bench={...z,market:"KRW-BTC"};
      }catch{}
    }

    const btcRet12=bench?.ret12||0;
    for(const x of allResults)x.relativeStrength=x.ret12-btcRet12;

    const denom=Math.max(1,allResults.length);
    const breadth={
      aboveMA20Pct:100*allResults.filter(x=>x.aboveMA20).length/denom,
      positiveScorePct:100*allResults.filter(x=>x.score>0).length/denom,
      strongUpPct:100*allResults.filter(x=>x.regime==="상승 추세").length/denom,
      advance24hPct:100*allResults.filter(x=>x.change>0).length/denom,
      btcRet12
    };

    const results=allResults
      .filter(x=>x.score>=minScore&&x.vol>=minVol)
      .sort((a,b)=>b.score-a.score||b.relativeStrength-a.relativeStrength||b.quality-a.quality);

    res.setHeader("Cache-Control","s-maxage=45, stale-while-revalidate=45");
    return res.status(200).json({
      ok:true,
      scanned:markets.length,
      calculated:allResults.length,
      failed:failures.length,
      failures:failures.slice(0,8),
      breadth,
      results
    });
  }catch(e){
    return res.status(502).json({
      error:"Scanner failed",
      detail:String(e?.message||e)
    });
  }
};
