const UA={"User-Agent":"CryptoAnalyzerV15.6","Accept":"application/json"};

async function safeJson(url,timeout=6500){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
  try{
    const r=await fetch(url,{headers:UA,signal:ac.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }finally{clearTimeout(timer)}
}
async function safeText(url,timeout=6500){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
  try{
    const r=await fetch(url,{headers:{"User-Agent":"CryptoAnalyzerV15.6"},signal:ac.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }finally{clearTimeout(timer)}
}
function priorFromChange(current,pct){
  if(!Number.isFinite(current)||!Number.isFinite(pct)||pct<=-99.99)return null;
  return current/(1+pct/100)
}
function fredParse(csv){
  const lines=String(csv||"").trim().split(/\r?\n/);if(lines.length<2)return null;
  const vals=[];
  for(let i=1;i<lines.length;i++){
    const parts=lines[i].split(","),v=Number(parts.at(-1));
    if(Number.isFinite(v))vals.push({date:parts[0],value:v})
  }
  if(!vals.length)return null;return{latest:vals.at(-1),prev:vals.length>1?vals.at(-2):null}
}
async function fred(id){
  try{return fredParse(await safeText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`))}catch{return null}
}
module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  try{
    const [global,btc,usdt,vix,us10y,dollar,rrp,tga,reserves]=await Promise.all([
      safeJson("https://api.coinpaprika.com/v1/global"),
      safeJson("https://api.coinpaprika.com/v1/tickers/btc-bitcoin"),
      safeJson("https://api.coinpaprika.com/v1/tickers/usdt-tether"),
      fred("VIXCLS"),fred("DGS10"),fred("DTWEXBGS"),fred("RRPONTSYD"),fred("WTREGEN"),fred("WRESBAL")
    ]);
    const total=Number(global.market_cap_usd),totalChg=Number(global.market_cap_change_24h);
    const btcQ=btc?.quotes?.USD||{},usdtQ=usdt?.quotes?.USD||{};
    const btcM=Number(btcQ.market_cap),btcMChg=Number(btcQ.market_cap_change_24h);
    const usdtM=Number(usdtQ.market_cap),usdtMChg=Number(usdtQ.market_cap_change_24h);
    const btcDom=Number(global.bitcoin_dominance_percentage)||100*btcM/total,usdtDom=100*usdtM/total;
    const prevTotal=priorFromChange(total,totalChg),prevBtc=priorFromChange(btcM,btcMChg),prevUsdt=priorFromChange(usdtM,usdtMChg);
    const prevBtcDom=prevTotal&&prevBtc?100*prevBtc/prevTotal:null,prevUsdtDom=prevTotal&&prevUsdt?100*prevUsdt/prevTotal:null;
    const macro={
      vix:vix?{value:vix.latest.value,change:vix.prev?vix.latest.value-vix.prev.value:null,date:vix.latest.date}:null,
      us10y:us10y?{value:us10y.latest.value,changeBp:us10y.prev?(us10y.latest.value-us10y.prev.value)*100:null,date:us10y.latest.date}:null,
      dollar:dollar?{value:dollar.latest.value,changePct:dollar.prev?(dollar.latest.value/dollar.prev.value-1)*100:null,date:dollar.latest.date}:null,
      liquidity:{
        rrp:rrp?{value:rrp.latest.value,change:rrp.prev?rrp.latest.value-rrp.prev.value:null,date:rrp.latest.date}:null,
        tga:tga?{value:tga.latest.value,change:tga.prev?tga.latest.value-tga.prev.value:null,date:tga.latest.date}:null,
        reserves:reserves?{value:reserves.latest.value,change:reserves.prev?reserves.latest.value-reserves.prev.value:null,date:reserves.latest.date}:null
      }
    };
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      ok:true,source:"CoinPaprika + FRED",updatedAt:new Date().toISOString(),
      totalMarketCapUsd:total,totalMarketCapChange24h:totalChg,
      btcDominance:btcDom,btcDominanceDeltaPp:prevBtcDom==null?null:btcDom-prevBtcDom,
      usdtDominance:usdtDom,usdtDominanceDeltaPp:prevUsdtDom==null?null:usdtDom-prevUsdtDom,
      btcMarketCapChange24h:btcMChg,usdtMarketCapChange24h:usdtMChg,macro
    });
  }catch(e){
    return res.status(502).json({error:"시장환경 데이터를 불러오지 못했습니다.",detail:String(e?.message||e)});
  }
};
