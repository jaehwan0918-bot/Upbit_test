function sma(v,p){const o=Array(v.length).fill(null);let s=0;for(let i=0;i<v.length;i++){s+=v[i];if(i>=p)s-=v[i-p];if(i>=p-1)o[i]=s/p}return o}
function ema(v,p){const o=Array(v.length).fill(null),a=2/(p+1);let x=null;for(let i=0;i<v.length;i++){x=x===null?v[i]:a*v[i]+(1-a)*x;o[i]=x}return o}
function wilder(v,p){const o=Array(v.length).fill(null),a=1/p;let x=null;for(let i=0;i<v.length;i++){x=x===null?v[i]:a*v[i]+(1-a)*x;if(i>=p-1)o[i]=x}return o}
function tfMs(tf){return tf==="day"?86400000:Number(tf)*60000}
function closedRows(rows,tf){const now=Date.now()-5000;return rows.filter(r=>new Date(r.candle_date_time_utc+"Z").getTime()+tfMs(tf)<=now)}
function calculateRows(rows,tf="240",{includeLive=false}={}){
  let source=rows.slice();if(!includeLive)source=closedRows(source,tf);
  const a=source.slice().reverse().map(r=>({time:new Date(r.candle_date_time_utc+"Z"),open:+r.opening_price,high:+r.high_price,low:+r.low_price,close:+r.trade_price,volume:+r.candle_acc_trade_volume}));
  if(a.length<130)return null;
  const c=a.map(x=>x.close),v=a.map(x=>x.volume),m20=sma(c,20),m60=sma(c,60),m120=sma(c,120),vm=sma(v,20),e12=ema(c,12),e26=ema(c,26),macd=c.map((_,i)=>e12[i]-e26[i]),sig=ema(macd,9);
  const gains=[0],loss=[0],tr=[a[0].high-a[0].low],pdm=[0],mdm=[0];
  for(let i=1;i<a.length;i++){const d=c[i]-c[i-1];gains.push(Math.max(d,0));loss.push(Math.max(-d,0));tr.push(Math.max(a[i].high-a[i].low,Math.abs(a[i].high-c[i-1]),Math.abs(a[i].low-c[i-1])));const up=a[i].high-a[i-1].high,dn=a[i-1].low-a[i].low;pdm.push(up>dn&&up>0?up:0);mdm.push(dn>up&&dn>0?dn:0)}
  const ag=wilder(gains,14),al=wilder(loss,14),atr=wilder(tr,14),sp=wilder(pdm,14),sm=wilder(mdm,14),pdi=atr.map((x,i)=>x?100*sp[i]/x:null),mdi=atr.map((x,i)=>x?100*sm[i]/x:null),dx=pdi.map((x,i)=>x!=null&&mdi[i]!=null&&(x+mdi[i])?100*Math.abs(x-mdi[i])/(x+mdi[i]):0),adx=wilder(dx,14),bbU=Array(c.length).fill(null),bbL=Array(c.length).fill(null);
  for(let i=19;i<c.length;i++){const w=c.slice(i-19,i+1),m=m20[i],sd=Math.sqrt(w.reduce((s,x)=>s+(x-m)*(x-m),0)/20);bbU[i]=m+2*sd;bbL[i]=m-2*sd}
  const i=a.length-1,p=i-1,rsi=al[i]===0?100:ag[i]===0?0:100-100/(1+ag[i]/al[i]),volRatio=vm[i]?v[i]/vm[i]:0;let score=0;
  score+=c[i]>m20[i]?1:-1;score+=m20[i]>m60[i]?1:-1;score+=m60[i]>m120[i]?1:-1;if(rsi<30)score++;else if(rsi>70)score--;const golden=macd[i]>sig[i]&&macd[p]<=sig[p],death=macd[i]<sig[i]&&macd[p]>=sig[p];if(golden)score+=2;else if(death)score-=2;else score+=macd[i]>sig[i]?1:-1;if(volRatio>=1.5)score+=c[i]>c[p]?1:-1;if(c[i]<=bbL[i])score++;else if(c[i]>=bbU[i])score--;
  const s60=(m60[i]/m60[Math.max(0,i-5)]-1)*100,spread=Math.abs(m20[i]-m60[i])/c[i]*100;let regime="전환 / 혼조";if(adx[i]>=25&&m20[i]>m60[i]&&m60[i]>m120[i]&&s60>0)regime="상승 추세";else if(adx[i]>=25&&m20[i]<m60[i]&&m60[i]<m120[i]&&s60<0)regime="하락 추세";else if(adx[i]<20&&spread<1.2)regime="횡보";
  const ret12=i>=12?(c[i]/c[i-12]-1)*100:0;
  return{candleTime:a[i].time.toISOString(),price:c[i],score,rsi,adx:adx[i],atrPct:atr[i]?atr[i]/c[i]*100:0,volRatio,ma20:m20[i],ma60:m60[i],ma120:m120[i],macd:macd[i],signal:sig[i],regime,ret12,aboveMA20:c[i]>m20[i]};
}
function qualitySingle(s){if(!s)return 0;let q=38+Math.min(28,(s.adx||0)/40*28)+(Math.abs(s.score)>=6?17:Math.abs(s.score)>=5?12:5);if(s.volRatio>=1.5)q+=9;if(s.regime==="전환 / 혼조")q-=10;return Math.max(20,Math.min(95,Math.round(q)))}
async function fetchOne(market,tf){const path=tf==="day"?"/v1/candles/days":`/v1/candles/minutes/${tf}`,u=new URL("https://api.upbit.com"+path);u.searchParams.set("market",market);u.searchParams.set("count","150");const r=await fetch(u.toString(),{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.5"}});if(!r.ok)throw new Error(`Upbit ${market}/${tf}: HTTP ${r.status}`);return calculateRows(await r.json(),tf)}
function qualityFor(main,all){const scores=Object.values(all).filter(Boolean).map(x=>x.score),signs=scores.map(Math.sign).filter(v=>v!==0),same=signs.length?Math.max(signs.filter(v=>v>0).length,signs.filter(v=>v<0).length)/signs.length:0.5;let q=35+same*30+Math.min(20,(main.adx||0)/40*20);if(main.volRatio>=1.5)q+=8;if(Math.abs(main.score)>=5)q+=7;if(main.regime==="전환 / 혼조")q-=10;return Math.max(20,Math.min(95,Math.round(q)))}
async function analyzeMarket(market){const[h1,h4,day]=await Promise.all([fetchOne(market,"60"),fetchOne(market,"240"),fetchOne(market,"day")]),all={"60":h1,"240":h4,"day":day};for(const tf of Object.keys(all))if(all[tf])all[tf].quality=qualityFor(all[tf],all);return all}
module.exports={analyzeMarket,calculateRows,qualitySingle,tfMs};
