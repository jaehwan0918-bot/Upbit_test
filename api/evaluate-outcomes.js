const {evaluateOutcomes}=require("../lib/outcome");
module.exports=async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"POST only"});
  const deviceId=String(req.body?.deviceId||"");if(!/^[a-zA-Z0-9_-]{8,100}$/.test(deviceId))return res.status(400).json({error:"Invalid deviceId"});
  try{return res.status(200).json({ok:true,...await evaluateOutcomes({deviceId})})}
  catch(e){return res.status(e.migrationRequired?409:500).json({error:e.message,migrationRequired:Boolean(e.migrationRequired)})}
};
