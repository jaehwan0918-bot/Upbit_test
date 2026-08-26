function sma(v,p){const o=Array(v.length).fill(null);let s=0;for(let i=0;i<v.length;i++){s+=v[i];if(i>=p)s-=v[i-p];if(i>=p-1)o[i]=s/p}return o}
function ema(v,p){const o=Array(v.length).fill(null),a=2/(p+1);let x=null;for(let i=0;i<v.length;i++){x=x===null?v[i]:a*v[i]+(1-a)*x;o[i]=x}return o}
function wilder(v,p){const o=Array(v.length).fill(null),a=1/p;let x=null;for(let i=0;i<v.length;i++){x=x===null?v[i]:a*v[i]+(1-a)*x;if(i>=p-1)o[i]=x}return o}
function calc(rows){
  const a=rows.slice().reverse().map(r=>({open:+r.opening_price,high:+r.high_price,low:+r.low_price,close:+r.trade_price,volume:+r.candle_acc_trade_volume}));
  if(a.length<130)return null;const c=a.map(x=>x.close),v=a.map(x=>x.volume),m20=sma(c,20),m60=sma(c,60),m120=sma(c,120),vm=sma(v,20),e12=ema(c,12),e26=ema(c,26),macd=c.map((_,i)=>e12[i]-e26[i]),sig=ema(macd,9);
  const gains=[0],loss=[0],tr=[a[0].high-a[0].low],pdm=[0],mdm=[0];for(let i=1;i<a.length;i++){const d=c[i]-c[i-1];gains.push(Math.max(d,0));loss.push(Math.max(-d,0));tr.push(Math.max(a[i].high-a[i].low,Math.abs(a[i].high-c[i-1]),Math.abs(a[i].low-c[i-1])));const up=a[i].high-a[i-1].high,dn=a[i-1].low-a[i].low;pdm.push(up>dn&&up>0?up:0);mdm.push(dn>up&&dn>0?dn:0)}
  const ag=wilder(gains,14),al=wilder(loss,14),atr=wilder(tr,14),sp=wilder(pdm,14),sm=wilder(mdm,14),pdi=atr.map((x,i)=>x?100*sp[i]/x:null),mdi=atr.map((x,i)=>x?100*sm[i]/x:null),dx=pdi.map((x,i)=>x!=null&&mdi[i]!=null&&(x+mdi[i])?100*Math.abs(x-mdi[i])/(x+mdi[i]):0),adx=wilder(dx,14),i=a.length-1,p=i-1;
  const rsi=al[i]===0?100:ag[i]===0?0:100-100/(1+ag[i]/al[i]),vol=vm[i]?v[i]/vm[i]:0;let score=0;score+=c[i]>m20[i]?1:-1;score+=m20[i]>m60[i]?1:-1;score+=m60[i]>m120[i]?1:-1;if(rsi<30)score++;else if(rsi>70)score--;const golden=macd[i]>sig[i]&&macd[p]<=sig[p],death=macd[i]<sig[i]&&macd[p]>=sig[p];if(golden)score+=2;else if(death)score-=2;else score+=macd[i]>sig[i]?1:-1;if(vol>=1.5)score+=c[i]>c[p]?1:-1;
  const s60=(m60[i]/m60[Math.max(0,i-5)]-1)*100,spread=Math.abs(m20[i]-m60[i])/c[i]*100;let regime="전환 / 혼조";if(adx[i]>=25&&m20[i]>m60[i]&&m60[i]>m120[i]&&s60>0)regime="상승 추세";else if(adx[i]>=25&&m20[i]<m60[i]&&m60[i]<m120[i]&&s60<0)regime="하락 추세";else if(adx[i]<20&&spread<1.2)regime="횡보";
  const quality=Math.round(Math.max(30,Math.min(95,40+Math.min(25,adx[i]/40*25)+(Math.abs(score)>=5?15:5)+(vol>=1.5?10:0)+(regime.includes("추세")?5:0))));
  return{score,quality,regime,rsi,adx:adx[i],vol};
}
async function getMarkets(){
  const mr=await fetch("https://api.upbit.com/v1/market/all?isDetails=false",{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV14"}});
  if(!mr.ok)throw new Error("market/all failed");const all=(await mr.json()).filter(x=>String(x.market).startsWith("KRW-")),names=new Map(all.map(x=>[x.market,x.korean_name||x.market])),ids=all.map(x=>x.market),ticks=[];
  for(let i=0;i<ids.length;i+=80){const u=new URL("https://api.upbit.com/v1/ticker");u.searchParams.set("markets",ids.slice(i,i+80).join(","));const r=await fetch(u,{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV14"}});if(r.ok)ticks.push(...await r.json())}
  return ticks.map(t=>({market:t.market,name:names.get(t.market)||t.market,price:+t.trade_price,change:+t.signed_change_rate*100,trade:+t.acc_trade_price_24h})).sort((a,b)=>b.trade-a.trade);
}
module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  const tf=String(req.query.tf||"240"),n=Math.max(1,Math.min(30,Number(req.query.n||20))),minScore=Number(req.query.minScore||0),minVol=Number(req.query.minVol||0);
  if(!["60","240","day"].includes(tf))return res.status(400).json({error:"Invalid timeframe"});
  try{
    const markets=(await getMarkets()).slice(0,n),results=[],path=tf==="day"?"/v1/candles/days":`/v1/candles/minutes/${tf}`;
    for(let start=0;start<markets.length;start+=4){
      const batch=markets.slice(start,start+4),vals=await Promise.all(batch.map(async m=>{const u=new URL("https://api.upbit.com"+path);u.searchParams.set("market",m.market);u.searchParams.set("count","150");const r=await fetch(u,{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV14"}});if(!r.ok)return null;const z=calc(await r.json());return z?{...m,...z}:null}));
      for(const x of vals)if(x&&x.score>=minScore&&x.vol>=minVol)results.push(x);if(start+4<markets.length)await new Promise(r=>setTimeout(r,140));
    }
    results.sort((a,b)=>b.score-a.score||b.quality-a.quality);res.setHeader("Cache-Control","s-maxage=45, stale-while-revalidate=45");return res.status(200).json({scanned:markets.length,results});
  }catch(e){return res.status(502).json({error:"Scanner failed",detail:String(e?.message||e)})}
};
