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
