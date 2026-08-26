const db=require("./db");
const {tfMs}=require("./signal");
async function fetchCandles(market,tf,count=200){
  const path=tf==="day"?"/v1/candles/days":`/v1/candles/minutes/${tf}`,u=new URL("https://api.upbit.com"+path);
  u.searchParams.set("market",market);u.searchParams.set("count",String(count));
  const r=await fetch(u,{headers:{Accept:"application/json","User-Agent":"CryptoAnalyzerV15.5"}});
  if(!r.ok)throw new Error(`Upbit outcome ${market}/${tf}: ${r.status}`);
  return (await r.json()).slice().reverse().map(x=>({time:new Date(x.candle_date_time_utc+"Z"),open:+x.opening_price,high:+x.high_price,low:+x.low_price,close:+x.trade_price}));
}
async function pendingEvents(deviceId=null){
  const q={select:"id,device_id,market,tf,score,price,created_at,signal_candle_time,outcome_status",outcome_status:"is.null",order:"created_at.asc",limit:"50"};
  if(deviceId)q.device_id=`eq.${deviceId}`;
  return await db.select("signal_events",q)||[];
}
async function evaluateOutcomes({deviceId=null,horizon=6}={}){
  let events;
  try{events=await pendingEvents(deviceId)}catch(e){e.migrationRequired=true;throw e}
  if(!events.length)return{evaluated:0,pending:0,skipped:0};
  const groups=new Map();for(const e of events){const k=`${e.market}|${e.tf}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}
  let evaluated=0,pending=0,skipped=0;
  for(const [key,items] of groups){
    const[market,tf]=key.split("|"),rows=await fetchCandles(market,tf,200);
    for(const e of items){
      const signalTime=new Date(e.signal_candle_time||e.created_at).getTime();
      let idx=rows.findIndex(x=>Math.abs(x.time.getTime()-signalTime)<1000);
      if(idx<0)idx=rows.map(x=>x.time.getTime()).findLastIndex(t=>t<=signalTime);
      if(idx<0){skipped++;continue}
      if(idx+horizon>=rows.length){pending++;continue}
      const base=Number(e.price)||rows[idx].close,future=rows.slice(idx+1,idx+horizon+1),end=rows[idx+horizon],ret=(end.close/base-1)*100,mfe=(Math.max(...future.map(x=>x.high))/base-1)*100,mae=(Math.min(...future.map(x=>x.low))/base-1)*100,dir=Math.sign(Number(e.score)||0),hit=dir?ret*dir>0:null;
      await db.update("signal_events",{id:`eq.${e.id}`},{outcome_status:"evaluated",outcome_horizon:horizon,outcome_return_pct:ret,mfe_pct:mfe,mae_pct:mae,outcome_hit:hit,evaluated_at:new Date().toISOString()});
      evaluated++
    }
    await new Promise(r=>setTimeout(r,120))
  }
  return{evaluated,pending,skipped}
}
module.exports={evaluateOutcomes};
