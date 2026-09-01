// Crypto Analyzer V15.11 - Single Router Server
// Generated from the validated V15.8.1 handlers without changing their trading calculations.
// Browser requests use /api/router?__v15route=<route>.

const __nativeRequire = require;
const __modules = {
  "lib/db": function(require,module,exports){
function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const err = new Error("Supabase server environment variables are not configured.");
    err.setupRequired = true;
    throw err;
  }
  return { url: url.replace(/\/+$/, ""), key };
}

async function request(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const { url, key } = config();
  const u = new URL(`${url}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(u.toString(), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || (typeof data === "string" ? data : `Supabase HTTP ${response.status}`));
    err.status = response.status;
    throw err;
  }
  return data;
}
const select = (table, query={}) => request(table,{method:"GET",query});
const insert = (table,body) => request(table,{method:"POST",body,prefer:"return=representation"});
const upsert = (table,body,onConflict) => request(table,{method:"POST",query:onConflict?{on_conflict:onConflict}:{},body,prefer:"resolution=merge-duplicates,return=representation"});
const update = (table,query,body) => request(table,{method:"PATCH",query,body,prefer:"return=representation"});
const remove = (table,query) => request(table,{method:"DELETE",query,prefer:"return=representation"});
module.exports={config,request,select,insert,upsert,update,remove};

  },
  "lib/monitor": function(require,module,exports){

const webpush=require("web-push");
const db=require("./db");
const {analyzeMarket}=require("./signal");
const TF_NAME={"60":"1시간","240":"4시간","day":"일봉"};

function pushConfigured(){return Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT)}
function setupWebPush(){if(!pushConfigured())return false;webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);return true}
async function subscriptionsForDevice(deviceId){return await db.select("push_subscriptions",{select:"id,device_id,endpoint,p256dh,auth",device_id:`eq.${deviceId}`})||[]}
async function sendToDevice(deviceId,payload){
  if(!setupWebPush())return{sent:0,failed:0,setupRequired:true};
  const subs=await subscriptionsForDevice(deviceId);let sent=0,failed=0;
  for(const s of subs){
    try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify(payload),{TTL:3600,urgency:"high"});sent++}
    catch(e){failed++;const code=e?.statusCode||e?.status;if(code===404||code===410){try{await db.remove("push_subscriptions",{id:`eq.${s.id}`})}catch{}}}
  }
  return{sent,failed,setupRequired:false}
}
function ruleMatches(rule,s){
  if(!s)return false;
  if(s.score<Number(rule.min_score||0))return false;
  if(s.quality<Number(rule.min_quality||0))return false;
  if(s.adx<Number(rule.min_adx||0))return false;
  if(s.volRatio<Number(rule.min_vol_ratio||0))return false;
  if(rule.require_regime&&rule.require_regime!=="ANY"&&s.regime!==rule.require_regime)return false;
  return true
}
function cooldownPassed(rule){
  if(!rule.last_triggered_at)return true;
  return Date.now()-new Date(rule.last_triggered_at).getTime()>=Math.max(1,Number(rule.cooldown_minutes||240))*60000
}
async function loadRules(deviceId){
  const q={select:"*",enabled:"eq.true",order:"created_at.asc"};
  if(deviceId)q.device_id=`eq.${deviceId}`;
  return await db.select("alert_rules",q)||[]
}
async function alreadyTriggered(ruleId,candleTime){
  if(!ruleId||!candleTime)return false;
  try{
    const rows=await db.select("signal_events",{select:"id",rule_id:`eq.${ruleId}`,signal_candle_time:`eq.${candleTime}`,limit:"1"});
    return Boolean(rows?.length)
  }catch{return false}
}
async function evaluateRules({deviceId=null,sendPush=true,timeframes=null,dedupeCandle=true}={}){
  const allRules=await loadRules(deviceId);
  const allowed=Array.isArray(timeframes)&&timeframes.length?new Set(timeframes):null;
  const rules=allowed?allRules.filter(r=>allowed.has(String(r.tf))):allRules;
  if(!rules.length)return{rules:allRules.length,scheduledRules:0,evaluated:0,triggered:0,pushSent:0,duplicates:0,results:[]};

  const markets=[...new Set(rules.map(r=>r.market))],analyses={};
  for(let i=0;i<markets.length;i++){
    analyses[markets[i]]=await analyzeMarket(markets[i]);
    if(i<markets.length-1)await new Promise(r=>setTimeout(r,180))
  }

  let triggered=0,pushSent=0,evaluated=0,duplicates=0;
  const results=[];
  for(const rule of rules){
    evaluated++;
    const s=analyses[rule.market]?.[rule.tf],match=ruleMatches(rule,s),cooldown=cooldownPassed(rule);
    const duplicate=Boolean(match&&dedupeCandle&&await alreadyTriggered(rule.id,s?.candleTime));
    if(duplicate)duplicates++;
    const item={ruleId:rule.id,market:rule.market,tf:rule.tf,match,cooldown,duplicate,signal:s||null,triggered:false};
    if(match&&cooldown&&!duplicate){
      triggered++;item.triggered=true;
      const title=`${rule.market} ${TF_NAME[rule.tf]||rule.tf} 자동 신호`;
      const body=`점수 ${s.score>=0?"+":""}${s.score} · 품질 ${s.quality}/100 · ADX ${s.adx.toFixed(1)} · ${s.regime}${s.reversal&&s.reversal!=="없음"?` · ${s.reversal}`:""}`;
      const payload={title,body,url:"/",market:rule.market,tf:rule.tf,score:s.score,quality:s.quality,price:s.price,reversal:s.reversal,ichimoku:s.ichimoku,monitorVersion:"15.11.0"};
      let push={sent:0,failed:0};if(sendPush)push=await sendToDevice(rule.device_id,payload);pushSent+=push.sent||0;
      const now=new Date().toISOString();
      await db.update("alert_rules",{id:`eq.${rule.id}`},{last_triggered_at:now});
      await db.insert("signal_events",{device_id:rule.device_id,rule_id:rule.id,market:rule.market,tf:rule.tf,score:s.score,quality:s.quality,adx:s.adx,vol_ratio:s.volRatio,regime:s.regime,price:s.price,signal_candle_time:s.candleTime,push_sent:(push.sent||0)>0,payload});
      item.push=push
    }
    results.push(item)
  }
  return{rules:allRules.length,scheduledRules:rules.length,evaluated,triggered,pushSent,duplicates,results}
}
module.exports={pushConfigured,sendToDevice,evaluateRules};

  },
  "lib/outcome": function(require,module,exports){

const db=require("./db");
const {tfMs}=require("./signal");
const __cache=new Map();
const __sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function fetchCandles(market,tf,count=200){
  const key=`${market}|${tf}|${count}`,cached=__cache.get(key),now=Date.now();
  if(cached&&now-cached.at<45000)return cached.rows;
  const path=tf==="day"?"/v1/candles/days":`/v1/candles/minutes/${tf}`,u=new URL("https://api.upbit.com"+path);
  u.searchParams.set("market",market);u.searchParams.set("count",String(count));
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),6500);
    try{
      const r=await fetch(u,{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.11"},signal:ac.signal});
      clearTimeout(timer);
      if(r.ok){
        const rows=(await r.json()).slice().reverse().map(x=>({time:new Date(x.candle_date_time_utc+"Z"),open:+x.opening_price,high:+x.high_price,low:+x.low_price,close:+x.trade_price}));
        __cache.set(key,{at:Date.now(),rows});return rows
      }
      last=new Error(`Upbit outcome ${market}/${tf}: ${r.status}`);
      if(![418,429].includes(r.status)&&r.status<500)throw last
    }catch(e){clearTimeout(timer);last=e}
    if(attempt<2)await __sleep(300*(attempt+1))
  }
  if(cached&&now-cached.at<15*60*1000)return cached.rows;
  throw last||new Error("Upbit outcome fetch failed")
}
async function pendingEvents(deviceId=null){
  const q={select:"id,device_id,market,tf,score,price,created_at,signal_candle_time,outcome_status,payload",outcome_status:"is.null",order:"created_at.asc",limit:"50"};
  if(deviceId)q.device_id=`eq.${deviceId}`;
  return await db.select("signal_events",q)||[]
}
function calcOutcome(rows,idx,base,score,h){
  if(idx+h>=rows.length)return null;
  const future=rows.slice(idx+1,idx+h+1),end=rows[idx+h],ret=(end.close/base-1)*100;
  const mfe=(Math.max(...future.map(x=>x.high))/base-1)*100,mae=(Math.min(...future.map(x=>x.low))/base-1)*100;
  const dir=Math.sign(Number(score)||0),hit=dir?ret*dir>0:null;
  return{horizon:h,returnPct:ret,mfePct:mfe,maePct:mae,hit}
}
async function evaluateOutcomes({deviceId=null,horizons=[6,12,24]}={}){
  let events;try{events=await pendingEvents(deviceId)}catch(e){e.migrationRequired=true;throw e}
  if(!events.length)return{evaluated:0,partial:0,pending:0,skipped:0,horizons};
  const hs=[...new Set(horizons.map(Number).filter(x=>[6,12,24].includes(x)))].sort((a,b)=>a-b);
  const maxH=Math.max(...hs),groups=new Map();
  for(const e of events){const k=`${e.market}|${e.tf}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}
  let evaluated=0,partial=0,pending=0,skipped=0;const horizonStats={};
  for(const h of hs)horizonStats[h]={evaluated:0,hits:0};

  for(const [key,items] of groups){
    const[market,tf]=key.split("|"),rows=await fetchCandles(market,tf,200);
    for(const e of items){
      const signalTime=new Date(e.signal_candle_time||e.created_at).getTime();
      let idx=rows.findIndex(x=>Math.abs(x.time.getTime()-signalTime)<1000);
      if(idx<0)idx=rows.map(x=>x.time.getTime()).findLastIndex(t=>t<=signalTime);
      if(idx<0){skipped++;continue}
      const base=Number(e.price)||rows[idx].close;
      const oldPayload=e.payload&&typeof e.payload==="object"?e.payload:{};
      const matrix={...(oldPayload.outcomes||{})};
      let any=false;
      for(const h of hs){
        if(matrix[h])continue;
        const o=calcOutcome(rows,idx,base,e.score,h);
        if(!o)continue;
        matrix[h]=o;any=true;horizonStats[h].evaluated++;if(o.hit)horizonStats[h].hits++
      }
      if(!Object.keys(matrix).length){pending++;continue}
      const primary=matrix[6]||matrix[String(6)]||null,complete=Boolean(matrix[maxH]||matrix[String(maxH)]);
      const patch={payload:{...oldPayload,outcomes:matrix,outcomeVersion:"15.11.0"}};
      if(primary){
        patch.outcome_horizon=6;patch.outcome_return_pct=primary.returnPct;patch.mfe_pct=primary.mfePct;patch.mae_pct=primary.maePct;patch.outcome_hit=primary.hit
      }
      if(complete){patch.outcome_status="evaluated";patch.evaluated_at=new Date().toISOString();evaluated++}
      else{partial++}
      await db.update("signal_events",{id:`eq.${e.id}`},patch)
    }
    await __sleep(80)
  }
  return{evaluated,partial,pending,skipped,horizons:hs,horizonStats}
}
module.exports={evaluateOutcomes};

  },
  "lib/signal": function(require,module,exports){
function sma(v,p){const o=Array(v.length).fill(null);let s=0;for(let i=0;i<v.length;i++){s+=v[i];if(i>=p)s-=v[i-p];if(i>=p-1)o[i]=s/p}return o}
function ema(v,p){const o=Array(v.length).fill(null),a=2/(p+1);let x=null;for(let i=0;i<v.length;i++){x=x===null?v[i]:a*v[i]+(1-a)*x;o[i]=x}return o}
function wilder(v,p){const o=Array(v.length).fill(null),a=1/p;let x=null;for(let i=0;i<v.length;i++){x=x===null?v[i]:a*v[i]+(1-a)*x;if(i>=p-1)o[i]=x}return o}
function tfMs(tf){return tf==="day"?86400000:Number(tf)*60000}
function rollingMidHL(a,p){const o=Array(a.length).fill(null);for(let i=p-1;i<a.length;i++){let hi=-Infinity,lo=Infinity;for(let k=i-p+1;k<=i;k++){hi=Math.max(hi,a[k].high);lo=Math.min(lo,a[k].low)}o[i]=(hi+lo)/2}return o}
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
  const ichTenkan=rollingMidHL(a,9),ichKijun=rollingMidHL(a,26),ichB=rollingMidHL(a,52),ichA=c.map((_,k)=>ichTenkan[k]!=null&&ichKijun[k]!=null?(ichTenkan[k]+ichKijun[k])/2:null);
  const i=a.length-1,p=i-1,rsi=al[i]===0?100:ag[i]===0?0:100-100/(1+ag[i]/al[i]),volRatio=vm[i]?v[i]/vm[i]:0;let score=0;
  score+=c[i]>m20[i]?1:-1;score+=m20[i]>m60[i]?1:-1;score+=m60[i]>m120[i]?1:-1;if(rsi<30)score++;else if(rsi>70)score--;const golden=macd[i]>sig[i]&&macd[p]<=sig[p],death=macd[i]<sig[i]&&macd[p]>=sig[p];if(golden)score+=2;else if(death)score-=2;else score+=macd[i]>sig[i]?1:-1;if(volRatio>=1.5)score+=c[i]>c[p]?1:-1;if(c[i]<=bbL[i])score++;else if(c[i]>=bbU[i])score--;
  const s60=(m60[i]/m60[Math.max(0,i-5)]-1)*100,spread=Math.abs(m20[i]-m60[i])/c[i]*100;let regime="전환 / 혼조";if(adx[i]>=25&&m20[i]>m60[i]&&m60[i]>m120[i]&&s60>0)regime="상승 추세";else if(adx[i]>=25&&m20[i]<m60[i]&&m60[i]<m120[i]&&s60<0)regime="하락 추세";else if(adx[i]<20&&spread<1.2)regime="횡보";
  const ret12=i>=12?(c[i]/c[i-12]-1)*100:0;
  const overSoldRecent=Array.from({length:Math.min(11,i+1)},(_,d)=>i-d).some(z=>{const rr=al[z]===0?100:ag[z]===0?0:100-100/(1+ag[z]/al[z]);return rr<=30}),overBoughtRecent=Array.from({length:Math.min(11,i+1)},(_,d)=>i-d).some(z=>{const rr=al[z]===0?100:ag[z]===0?0:100-100/(1+ag[z]/al[z]);return rr>=70}),reversal=overSoldRecent&&golden?"상승 반전 후보":overBoughtRecent&&death?"하락 반전 후보":"없음";
  const spanA=i>=26?ichA[i-26]:null,spanB=i>=26?ichB[i-26]:null,futureA=ichA[i],futureB=ichB[i],chikouRef=i>=26?c[i-26]:null;let ichimoku="중립";if([spanA,spanB,futureA,futureB,chikouRef].every(Number.isFinite)){let bull=0,bear=0,top=Math.max(spanA,spanB),bottom=Math.min(spanA,spanB);if(c[i]>top)bull++;else if(c[i]<bottom)bear++;if(ichTenkan[i]>ichKijun[i])bull++;else if(ichTenkan[i]<ichKijun[i])bear++;if(futureA>futureB)bull++;else if(futureA<futureB)bear++;if(c[i]>chikouRef)bull++;else if(c[i]<chikouRef)bear++;ichimoku=bull>=3&&bull>bear?"상승 우세":bear>=3&&bear>bull?"하락 우세":"중립"}
  return{candleTime:a[i].time.toISOString(),price:c[i],score,rsi,adx:adx[i],atrPct:atr[i]?atr[i]/c[i]*100:0,volRatio,ma20:m20[i],ma60:m60[i],ma120:m120[i],macd:macd[i],signal:sig[i],regime,ret12,aboveMA20:c[i]>m20[i],reversal,ichimoku};
}
function qualitySingle(s){if(!s)return 0;let q=38+Math.min(28,(s.adx||0)/40*28)+(Math.abs(s.score)>=6?17:Math.abs(s.score)>=5?12:5);if(s.volRatio>=1.5)q+=9;if(s.regime==="전환 / 혼조")q-=10;return Math.max(20,Math.min(95,Math.round(q)))}
const __signalCache=new Map();
const __sleep=ms=>new Promise(r=>setTimeout(r,ms));
function __cacheTtl(tf){return tf==="day"?45*60*1000:tf==="240"?8*60*1000:45*1000}
async function fetchOne(market,tf){
  const key=`${market}|${tf}`,cached=__signalCache.get(key),now=Date.now(),ttl=__cacheTtl(tf);
  if(cached&&now-cached.at<ttl)return cached.data;
  const path=tf==="day"?"/v1/candles/days":`/v1/candles/minutes/${tf}`,u=new URL("https://api.upbit.com"+path);
  u.searchParams.set("market",market);u.searchParams.set("count","150");
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),6500);
    try{
      const r=await fetch(u.toString(),{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.11"},signal:ac.signal});
      clearTimeout(timer);
      if(r.ok){
        const data=calculateRows(await r.json(),tf);
        if(data)__signalCache.set(key,{at:Date.now(),data});
        return data
      }
      last=new Error(`Upbit ${market}/${tf}: HTTP ${r.status}`);
      if(![418,429].includes(r.status)&&r.status<500)throw last
    }catch(e){clearTimeout(timer);last=e}
    if(attempt<2)await __sleep(300*(attempt+1))
  }
  if(cached&&now-cached.at<24*60*60*1000)return {...cached.data,_stale:true};
  throw last||new Error(`Upbit ${market}/${tf}: request failed`)
}
function qualityFor(main,all){const scores=Object.values(all).filter(Boolean).map(x=>x.score),signs=scores.map(Math.sign).filter(v=>v!==0),same=signs.length?Math.max(signs.filter(v=>v>0).length,signs.filter(v=>v<0).length)/signs.length:0.5;let q=35+same*30+Math.min(20,(main.adx||0)/40*20);if(main.volRatio>=1.5)q+=8;if(Math.abs(main.score)>=5)q+=7;if(main.regime==="전환 / 혼조")q-=10;return Math.max(20,Math.min(95,Math.round(q)))}
async function analyzeMarket(market){const[h1,h4,day]=await Promise.all([fetchOne(market,"60"),fetchOne(market,"240"),fetchOne(market,"day")]),all={"60":h1,"240":h4,"day":day};for(const tf of Object.keys(all))if(all[tf])all[tf].quality=qualityFor(all[tf],all);return all}
module.exports={analyzeMarket,calculateRows,qualitySingle,tfMs};

  },
  "api/ai": function(require,module,exports){
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
    "점수(Score), 품질(signalQuality), 적중률(historicalWinRate), 시장 흐름, ADX, 지지/저항, ATR 위험계획, 시간대별 비교, 다이버전스, 일목 흐름, 돌파·재확인, 반전 후보, 엘리어트 규칙 후보, 신호 겹침, 시장환경, 과거 성과 데이터를 서로 구분해서 해석하라.",
    "품질은 확률이 아니라 지표 정합성 점수이며 적중률만 과거 관측 성공률임을 명확히 하라. 다이버전스·일목 흐름·돌파·파동 후보·신호 겹침은 보조 신호이며 기존 점수에 포함되지 않는다.",
    "Walk-forward 검증 수익률이 학습 구간보다 크게 악화되면 과최적화 가능성을 명시하라.",
    "종목 찾기 결과는 매수 추천이 아니라 기술적 조건 검색 결과라고 설명하라. BTC 도미넌스와 USDT 도미넌스는 자금순환의 보조지표로만 해석하고 인과관계로 단정하지 마라. 엘리어트 후보는 자동 카운팅의 불확실성을 반드시 언급하라.",
    "확정적 가격 예측이나 수익 보장을 하지 마라.",
    "한국어로 간결하고 구체적으로 답하라."
  ].join(" ");

  const input = mode === "question"
    ? `다음 컨텍스트를 근거로 질문에 답해줘.\n질문: ${question}\n\n컨텍스트:\n${JSON.stringify(context, null, 2)}`
    : `다음 컨텍스트를 종합 분석해줘.
형식:
1. 시장 국면 및 품질
2. 다중 시간봉과 다이버전스
3. 시장환경(BTC·도미넌스·테더)과 지지/저항·ATR 위험계획
4. 상승 요인 / 위험 요인
5. 백테스트 및 구간별 실전검증이 있으면 평가
6. 종목스캐너 결과가 있으면 상위 종목 특징
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

  },
  "api/candles": function(require,module,exports){

const __cache=new Map();
const __sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function resilientText(url,cacheKey){
  const now=Date.now(),cached=__cache.get(cacheKey);
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),6500);
    try{
      const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.11"},signal:ac.signal});
      const body=await r.text();clearTimeout(timer);
      if(r.ok){__cache.set(cacheKey,{at:Date.now(),body,status:r.status,contentType:r.headers.get("content-type")});return{body,status:r.status,contentType:r.headers.get("content-type"),stale:false}}
      last=new Error(`Upbit HTTP ${r.status}`);
      if(![418,429].includes(r.status)&&r.status<500)return{body,status:r.status,contentType:r.headers.get("content-type"),stale:false}
    }catch(e){clearTimeout(timer);last=e}
    if(attempt<2)await __sleep(250*(attempt+1))
  }
  if(cached&&now-cached.at<15*60*1000)return{...cached,stale:true};
  throw last||new Error("Upbit candle request failed")
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET requests only." });
  const market = String(req.query.market || "KRW-BTC").toUpperCase();
  if (!/^KRW-[A-Z0-9]+$/.test(market)) return res.status(400).json({ error: "Only KRW markets are allowed." });
  const tf = String(req.query.tf || "240"),rawCount = Number(req.query.count || 200);
  const count = Math.max(1, Math.min(200, Number.isFinite(rawCount) ? Math.trunc(rawCount) : 200)),to = req.query.to ? String(req.query.to) : "";
  let path;if(tf==="day")path="/v1/candles/days";else if(tf==="60"||tf==="240")path=`/v1/candles/minutes/${tf}`;else return res.status(400).json({error:"Invalid timeframe."});
  const upstream=new URL(`https://api.upbit.com${path}`);upstream.searchParams.set("market",market);upstream.searchParams.set("count",String(count));if(to)upstream.searchParams.set("to",to);
  const key=`${market}|${tf}|${count}|${to}`;
  try{
    const x=await resilientText(upstream.toString(),key);
    res.setHeader("Content-Type",x.contentType||"application/json; charset=utf-8");
    res.setHeader("Cache-Control","no-store");res.setHeader("X-Upbit-Fallback",x.stale?"STALE":"LIVE");
    return res.status(x.status||200).send(x.body)
  }catch(error){return res.status(502).json({error:"Upbit candle request failed.",detail:String(error?.message||error)})}
};

  },
  "api/check-alerts": function(require,module,exports){
const{evaluateRules}=require("../lib/monitor");
module.exports=async function handler(req,res){if(req.method!=="POST")return res.status(405).json({error:"POST only"});const deviceId=String(req.body?.deviceId||"");if(!/^[a-zA-Z0-9_-]{8,100}$/.test(deviceId))return res.status(400).json({error:"Invalid deviceId"});try{return res.status(200).json({ok:true,...await evaluateRules({deviceId,sendPush:true})})}catch(e){return res.status(e.setupRequired?503:500).json({error:e.message,setupRequired:Boolean(e.setupRequired)})}};

  },
  "api/cloud-alerts": function(require,module,exports){
const db=require("../lib/db");
function validDevice(v){return /^[a-zA-Z0-9_-]{8,100}$/.test(String(v||""))}
function normalize(b){return{device_id:String(b.deviceId),market:String(b.market||"KRW-BTC").toUpperCase(),tf:["60","240","day"].includes(String(b.tf))?String(b.tf):"240",min_score:Math.max(-8,Math.min(8,Number(b.minScore??5))),min_quality:Math.max(0,Math.min(100,Number(b.minQuality??70))),min_adx:Math.max(0,Math.min(100,Number(b.minAdx??25))),min_vol_ratio:Math.max(0,Math.min(20,Number(b.minVolRatio??0))),require_regime:["ANY","상승 추세","하락 추세","횡보","전환 / 혼조"].includes(String(b.regime))?String(b.regime):"ANY",cooldown_minutes:Math.max(1,Math.min(10080,Number(b.cooldownMinutes??240))),enabled:true}}
module.exports=async function handler(req,res){try{if(req.method==="GET"){const deviceId=String(req.query.deviceId||"");if(!validDevice(deviceId))return res.status(400).json({error:"Invalid deviceId"});const rows=await db.select("alert_rules",{select:"*",device_id:`eq.${deviceId}`,order:"created_at.desc"});return res.status(200).json({rules:rows||[]})}if(req.method==="POST"){const b=req.body||{};if(!validDevice(b.deviceId))return res.status(400).json({error:"Invalid deviceId"});if(!/^KRW-[A-Z0-9]+$/.test(String(b.market||"").toUpperCase()))return res.status(400).json({error:"Invalid market"});const rows=await db.insert("alert_rules",normalize(b));return res.status(201).json({rule:rows?.[0]||null})}if(req.method==="DELETE"){const deviceId=String(req.query.deviceId||""),id=String(req.query.id||"");if(!validDevice(deviceId)||!id)return res.status(400).json({error:"Invalid request"});await db.remove("alert_rules",{id:`eq.${id}`,device_id:`eq.${deviceId}`});return res.status(200).json({ok:true})}return res.status(405).json({error:"GET, POST, DELETE only"})}catch(e){return res.status(e.setupRequired?503:500).json({error:e.message,setupRequired:Boolean(e.setupRequired)})}};

  },
  "api/cron-monitor": function(require,module,exports){

const{evaluateRules}=require("../lib/monitor");
const{evaluateOutcomes}=require("../lib/outcome");

function dueTimeframes(now=new Date()){
  const h=now.getUTCHours();
  const out=["60"];
  if(h%4===0)out.push("240");
  if(h===0)out.push("day");
  return out
}
module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  const secret=process.env.CRON_SECRET;if(!secret)return res.status(503).json({error:"CRON_SECRET is not configured."});
  if(req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({error:"Unauthorized"});
  const now=new Date(),force=String(req.query?.force||"")==="1",timeframes=force?["60","240","day"]:dueTimeframes(now);
  try{
    const alerts=await evaluateRules({sendPush:true,timeframes,dedupeCandle:true});
    let outcomes=null;try{outcomes=await evaluateOutcomes({horizons:[6,12,24]})}catch(e){outcomes={error:e.message,migrationRequired:Boolean(e.migrationRequired)}}
    return res.status(200).json({
      ok:true,ranAt:now.toISOString(),schedule:"hourly-gate",timeframes,force,
      duplicateProtection:true,...alerts,outcomes
    })
  }catch(e){return res.status(e.setupRequired?503:500).json({error:e.message,setupRequired:Boolean(e.setupRequired)})}
};

  },
  "api/evaluate-outcomes": function(require,module,exports){

const {evaluateOutcomes}=require("../lib/outcome");
module.exports=async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  const deviceId=String(req.body?.deviceId||"");if(!/^[a-zA-Z0-9_-]{8,100}$/.test(deviceId))return res.status(400).json({error:"Invalid deviceId"});
  try{return res.status(200).json({ok:true,...await evaluateOutcomes({deviceId,horizons:[6,12,24]})})}
  catch(e){return res.status(e.migrationRequired?409:500).json({error:e.message,migrationRequired:Boolean(e.migrationRequired)})}
};

  },
  "api/health": function(require,module,exports){

module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  const env={
    aiConfigured:Boolean(process.env.OPENAI_API_KEY),
    dbConfigured:Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),
    pushConfigured:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT),
    cronConfigured:Boolean(process.env.CRON_SECRET)
  };
  const deep=String(req.query?.deep||"")==="1";
  let upbit={checked:false,ok:null,status:null};
  if(deep){
    upbit.checked=true;
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),4500);
    try{
      const r=await fetch("https://api.upbit.com/v1/market/all?isDetails=false",{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.11"},signal:ac.signal});
      upbit.ok=r.ok;upbit.status=r.status;
    }catch(e){upbit.ok=false;upbit.error=String(e?.message||e)}
    finally{clearTimeout(timer)}
  }
  res.setHeader("Cache-Control","no-store");
  return res.status(200).json({
    status:"ok",
    app:"Crypto Analyzer V15.11",
    version:"15.11.0",
    deployment:"single-router",
    router:"ok",
    routeCount:15,
    mobileOptimized:true,
    deploymentGuard:true,
    selfDiagnostics:true,
    smartMonitor:true,
    monitorCadence:"hourly; 60m every run, 240m every 4 UTC hours, day at 00 UTC",
    multiHorizonOutcomes:[6,12,24],
    scannerCache:true,
    apiRetryFallback:true,
    localFirst:true,
    supabaseRequired:false,
    localStorageRecommended:"IndexedDB",
    cachePolicy:"html-and-service-worker-no-store",
    serverTime:new Date().toISOString(),
    ...env,
    upbit,
    note:"Local-first personal mode. Supabase is not required for analysis or local history."
  });
};

  },
  "api/market-env": function(require,module,exports){
const UA={"User-Agent":"CryptoAnalyzerV15.11","Accept":"application/json"};
const __envCache=new Map();
const __sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function resilient(url,{text=false,timeout=6500,ttl=300000,stale=3600000}={}){
  const now=Date.now(),cached=__envCache.get(url);
  if(cached&&now-cached.at<ttl)return cached.data;
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
    try{
      const r=await fetch(url,{headers:text?{"User-Agent":"CryptoAnalyzerV15.11"}:UA,signal:ac.signal});
      clearTimeout(timer);
      if(r.ok){const data=text?await r.text():await r.json();__envCache.set(url,{at:Date.now(),data});return data}
      last=new Error(`HTTP ${r.status}`);if(![418,429].includes(r.status)&&r.status<500)throw last
    }catch(e){clearTimeout(timer);last=e}
    if(attempt<2)await __sleep(300*(attempt+1))
  }
  if(cached&&now-cached.at<stale)return cached.data;
  throw last||new Error("market environment request failed")
}
const safeJson=(url,timeout=6500)=>resilient(url,{timeout});
const safeText=(url,timeout=6500)=>resilient(url,{text:true,timeout,ttl:30*60*1000,stale:24*60*60*1000});
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

  },
  "api/markets": function(require,module,exports){

const __marketCache={at:0,data:null};
const __sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJsonRetry(url,{retries=2,timeout=6500}={}){
  let last=null;
  for(let a=0;a<=retries;a++){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
    try{
      const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.11"},signal:ac.signal});
      clearTimeout(timer);
      if(r.ok)return await r.json();
      last=new Error(`HTTP ${r.status}`);if(![418,429].includes(r.status)&&r.status<500)throw last
    }catch(e){clearTimeout(timer);last=e}
    if(a<retries)await __sleep(250*(a+1))
  }
  throw last||new Error("request failed")
}
module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET requests only."});
  const now=Date.now();
  if(__marketCache.data&&now-__marketCache.at<30000){
    res.setHeader("Cache-Control","s-maxage=30, stale-while-revalidate=120");
    res.setHeader("X-Server-Cache","HIT");
    return res.status(200).json({markets:__marketCache.data,cache:{hit:true,ageMs:now-__marketCache.at}})
  }
  try{
    const all=(await fetchJsonRetry("https://api.upbit.com/v1/market/all?isDetails=false")).filter(x=>String(x.market||"").startsWith("KRW-"));
    const names=new Map(all.map(x=>[x.market,x.korean_name||x.market])),ids=all.map(x=>x.market);
    const urls=[];
    for(let i=0;i<ids.length;i+=80){const u=new URL("https://api.upbit.com/v1/ticker");u.searchParams.set("markets",ids.slice(i,i+80).join(","));urls.push(u.toString())}
    const batches=await Promise.all(urls.map(u=>fetchJsonRetry(u,{retries:1})));
    const tickers=batches.flat();
    const markets=tickers.map(t=>({market:t.market,korean_name:names.get(t.market)||t.market,trade_price:Number(t.trade_price||0),signed_change_rate:Number(t.signed_change_rate||0),acc_trade_price_24h:Number(t.acc_trade_price_24h||0)})).sort((a,b)=>b.acc_trade_price_24h-a.acc_trade_price_24h);
    __marketCache.at=Date.now();__marketCache.data=markets;
    res.setHeader("Cache-Control","s-maxage=30, stale-while-revalidate=120");res.setHeader("X-Server-Cache","MISS");
    return res.status(200).json({markets,cache:{hit:false}})
  }catch(error){
    if(__marketCache.data&&now-__marketCache.at<10*60*1000){
      res.setHeader("X-Server-Cache","STALE");
      return res.status(200).json({markets:__marketCache.data,cache:{hit:true,stale:true,ageMs:now-__marketCache.at}})
    }
    return res.status(502).json({error:"Upbit market request failed.",detail:String(error?.message||error)})
  }
};

  },
  "api/push-public-key": function(require,module,exports){
module.exports=function handler(req,res){if(req.method!=="GET")return res.status(405).json({error:"GET only"});const key=process.env.VAPID_PUBLIC_KEY;if(!key)return res.status(503).json({error:"VAPID_PUBLIC_KEY is not configured.",setupRequired:true});res.setHeader("Cache-Control","no-store");return res.status(200).json({publicKey:key})};

  },
  "api/push-subscribe": function(require,module,exports){
const db=require("../lib/db");
module.exports=async function handler(req,res){if(req.method!=="POST")return res.status(405).json({error:"POST only"});try{const{deviceId,subscription}=req.body||{};if(!/^[a-zA-Z0-9_-]{8,100}$/.test(String(deviceId||"")))return res.status(400).json({error:"Invalid deviceId"});if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth)return res.status(400).json({error:"Invalid push subscription"});const row={device_id:String(deviceId),endpoint:String(subscription.endpoint),p256dh:String(subscription.keys.p256dh),auth:String(subscription.keys.auth),user_agent:String(req.headers["user-agent"]||"").slice(0,500),updated_at:new Date().toISOString()};const data=await db.upsert("push_subscriptions",row,"endpoint");return res.status(200).json({ok:true,subscription:data?.[0]||null})}catch(e){return res.status(e.setupRequired?503:500).json({error:e.message,setupRequired:Boolean(e.setupRequired)})}};

  },
  "api/push-test": function(require,module,exports){
const{sendToDevice}=require("../lib/monitor");
module.exports=async function handler(req,res){if(req.method!=="POST")return res.status(405).json({error:"POST only"});const deviceId=String(req.body?.deviceId||"");if(!/^[a-zA-Z0-9_-]{8,100}$/.test(deviceId))return res.status(400).json({error:"Invalid deviceId"});try{const r=await sendToDevice(deviceId,{title:"Crypto Analyzer V15.11",body:"서버 Web Push 연결 테스트가 성공했습니다.",url:"/"});if(r.setupRequired)return res.status(503).json({error:"VAPID environment variables are not configured.",setupRequired:true});return res.status(200).json({ok:true,...r})}catch(e){return res.status(e.setupRequired?503:500).json({error:e.message,setupRequired:Boolean(e.setupRequired)})}};

  },
  "api/scanner": function(require,module,exports){

const {calculateRows,qualitySingle}=require("../lib/signal");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const resultCache=new Map(),marketCache={at:0,data:null},candleCache=new Map();

async function fetchUpbit(url,{retries=2,timeoutMs=6500}={}){
  let last=null;
  for(let attempt=0;attempt<=retries;attempt++){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeoutMs);
    try{
      const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.11"},signal:ac.signal});
      clearTimeout(timer);
      if(r.ok)return r;
      last=new Error(`Upbit HTTP ${r.status}`);
      if((r.status===429||r.status===418||r.status>=500)&&attempt<retries){await sleep(350*(attempt+1));continue}
      return r
    }catch(e){clearTimeout(timer);last=e;if(attempt<retries){await sleep(350*(attempt+1));continue}}
  }
  throw last||new Error("Upbit fetch failed")
}
async function getMarkets(){
  const now=Date.now();
  if(marketCache.data&&now-marketCache.at<30000)return marketCache.data;
  try{
    const mr=await fetchUpbit("https://api.upbit.com/v1/market/all?isDetails=false");
    if(!mr.ok)throw new Error(`market/all failed: ${mr.status}`);
    const all=(await mr.json()).filter(x=>String(x.market).startsWith("KRW-")),names=new Map(all.map(x=>[x.market,x.korean_name||x.market])),ids=all.map(x=>x.market);
    const jobs=[];
    for(let i=0;i<ids.length;i+=80){const u=new URL("https://api.upbit.com/v1/ticker");u.searchParams.set("markets",ids.slice(i,i+80).join(","));jobs.push(fetchUpbit(u,{retries:1}).then(async r=>r.ok?await r.json():[]))}
    const ticks=(await Promise.all(jobs)).flat();
    const data=ticks.map(t=>({market:t.market,name:names.get(t.market)||t.market,price:+t.trade_price,change:+t.signed_change_rate*100,trade:+t.acc_trade_price_24h})).sort((a,b)=>b.trade-a.trade);
    marketCache.at=Date.now();marketCache.data=data;return data
  }catch(e){
    if(marketCache.data&&now-marketCache.at<10*60*1000)return marketCache.data;
    throw e
  }
}
async function candleCalc(market,tf){
  const key=`${market}|${tf}`,now=Date.now(),cached=candleCache.get(key);
  if(cached&&now-cached.at<45000)return cached.data;
  const path=tf==="day"?"/v1/candles/days":`/v1/candles/minutes/${tf}`,u=new URL("https://api.upbit.com"+path);
  u.searchParams.set("market",market);u.searchParams.set("count","150");
  try{
    const r=await fetchUpbit(u,{retries:2});if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const z=calculateRows(await r.json(),tf);if(!z)throw new Error("insufficient candles");
    const data={...z,quality:qualitySingle(z)};candleCache.set(key,{at:Date.now(),data});return data
  }catch(e){
    if(cached&&now-cached.at<3*60*1000)return {...cached.data,_stale:true};
    return{error:String(e?.message||e),market}
  }
}
module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  const started=Date.now(),tf=String(req.query.tf||"240"),n=Math.max(1,Math.min(30,Number(req.query.n||20))),minScore=Number(req.query.minScore||0),minVol=Number(req.query.minVol||0);
  if(!["60","240","day"].includes(tf))return res.status(400).json({error:"Invalid timeframe"});
  const cacheKey=`${tf}|${n}|${minScore}|${minVol}`,now=Date.now(),cached=resultCache.get(cacheKey);
  if(cached&&now-cached.at<35000){
    res.setHeader("Cache-Control","s-maxage=35, stale-while-revalidate=90");res.setHeader("X-Scanner-Cache","HIT");
    return res.status(200).json({...cached.data,cache:{hit:true,ageMs:now-cached.at},elapsedMs:Date.now()-started})
  }
  try{
    const markets=(await getMarkets()).slice(0,n),allResults=[],failures=[];
    const BATCH=4,BATCH_INTERVAL=560;
    for(let start=0;start<markets.length;start+=BATCH){
      const batchStarted=Date.now(),batch=markets.slice(start,start+BATCH);
      const vals=await Promise.all(batch.map(async m=>{
        const z=await candleCalc(m.market,tf);
        if(z?.error){failures.push({market:m.market,error:z.error});return null}
        return{...m,...z,vol:z.volRatio}
      }));
      allResults.push(...vals.filter(Boolean));
      const elapsed=Date.now()-batchStarted;if(start+BATCH<markets.length&&elapsed<BATCH_INTERVAL)await sleep(BATCH_INTERVAL-elapsed)
    }
    let bench=allResults.find(x=>x.market==="KRW-BTC");
    if(!bench){const z=await candleCalc("KRW-BTC",tf);if(z&&!z.error)bench={...z,market:"KRW-BTC"}}
    const btcRet12=bench?.ret12||0;for(const x of allResults)x.relativeStrength=x.ret12-btcRet12;
    const denom=Math.max(1,allResults.length),breadth={
      aboveMA20Pct:100*allResults.filter(x=>x.aboveMA20).length/denom,
      positiveScorePct:100*allResults.filter(x=>x.score>0).length/denom,
      strongUpPct:100*allResults.filter(x=>x.regime==="상승 추세").length/denom,
      advance24hPct:100*allResults.filter(x=>x.change>0).length/denom,btcRet12
    };
    const results=allResults.filter(x=>x.score>=minScore&&x.vol>=minVol).sort((a,b)=>b.score-a.score||b.relativeStrength-a.relativeStrength||b.quality-a.quality);
    const data={ok:true,scanned:markets.length,calculated:allResults.length,failed:failures.length,failures:failures.slice(0,8),breadth,results};
    resultCache.set(cacheKey,{at:Date.now(),data});
    res.setHeader("Cache-Control","s-maxage=35, stale-while-revalidate=90");res.setHeader("X-Scanner-Cache","MISS");
    return res.status(200).json({...data,cache:{hit:false},elapsedMs:Date.now()-started})
  }catch(e){
    if(cached&&now-cached.at<3*60*1000){
      res.setHeader("X-Scanner-Cache","STALE");
      return res.status(200).json({...cached.data,cache:{hit:true,stale:true,ageMs:now-cached.at},elapsedMs:Date.now()-started})
    }
    return res.status(502).json({error:"Scanner failed",detail:String(e?.message||e)})
  }
};

  },
  "api/signal-events": function(require,module,exports){
const db=require("../lib/db");
module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  const deviceId=String(req.query.deviceId||"");if(!/^[a-zA-Z0-9_-]{8,100}$/.test(deviceId))return res.status(400).json({error:"Invalid deviceId"});
  try{
    let rows;
    try{
      rows=await db.select("signal_events",{select:"id,created_at,market,tf,score,quality,adx,vol_ratio,regime,price,push_sent,signal_candle_time,outcome_status,outcome_horizon,outcome_return_pct,mfe_pct,mae_pct,outcome_hit,evaluated_at",device_id:`eq.${deviceId}`,order:"created_at.desc",limit:"30"})
    }catch(e){
      rows=await db.select("signal_events",{select:"id,created_at,market,tf,score,quality,adx,vol_ratio,regime,price,push_sent",device_id:`eq.${deviceId}`,order:"created_at.desc",limit:"30"});
      rows=(rows||[]).map(x=>({...x,outcome_status:null,outcome_return_pct:null,mfe_pct:null,mae_pct:null,outcome_hit:null}))
    }
    return res.status(200).json({events:rows||[]})
  }catch(e){return res.status(e.setupRequired?503:500).json({error:e.message,setupRequired:Boolean(e.setupRequired)})}
};

  },
  "api/version": function(require,module,exports){

module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  res.setHeader("Cache-Control","no-store");
  return res.status(200).json({ok:true,version:"15.11.0",name:"Crypto Analyzer V15.11",deployment:"single-router",mobileOptimized:true,smartEngine:true,localFirst:true});
};

  }
};
const __cache = Object.create(null);

function __resolve(request, from) {
  if (!request.startsWith(".")) return request;
  const base = from.split("/");
  base.pop();
  for (const part of request.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/").replace(/\.js$/,"");
}
function __load(request, from="") {
  const id = __resolve(request, from);
  if (!Object.prototype.hasOwnProperty.call(__modules,id)) return __nativeRequire(request);
  if (__cache[id]) return __cache[id].exports;
  const module = {exports:{}};
  __cache[id]=module;
  const localRequire = (r)=>__load(r,id);
  __modules[id](localRequire,module,module.exports);
  return module.exports;
}

const ROUTES = Object.freeze({
  "ai": "api/ai",
  "candles": "api/candles",
  "check-alerts": "api/check-alerts",
  "cloud-alerts": "api/cloud-alerts",
  "cron-monitor": "api/cron-monitor",
  "evaluate-outcomes": "api/evaluate-outcomes",
  "health": "api/health",
  "market-env": "api/market-env",
  "markets": "api/markets",
  "push-public-key": "api/push-public-key",
  "push-subscribe": "api/push-subscribe",
  "push-test": "api/push-test",
  "scanner": "api/scanner",
  "signal-events": "api/signal-events",
  "version": "api/version"
});

module.exports = async function router(req,res) {
  res.setHeader("X-Crypto-Analyzer-Version","15.11.0");
  res.setHeader("X-Crypto-Deployment","single-router");
  const route = String(req.query?.__v15route || "");
  const moduleId = ROUTES[route];
  if (!moduleId) {
    return res.status(404).json({
      error:"Unknown API route.",
      version:"15.11.0",
      usage:"/api/router?__v15route=health",
      available:Object.keys(ROUTES)
    });
  }
  try {
    const handler = __load(moduleId);
    return await handler(req,res);
  } catch (error) {
    console.error("V15.11.0 router error", route, error);
    if (!res.headersSent) return res.status(500).json({error:"Server route failed.",route,detail:String(error?.message||error)});
  }
};
