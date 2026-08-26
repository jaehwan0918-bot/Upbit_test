const{evaluateRules}=require("../lib/monitor");
const{evaluateOutcomes}=require("../lib/outcome");
module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  const secret=process.env.CRON_SECRET;if(!secret)return res.status(503).json({error:"CRON_SECRET is not configured."});
  if(req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({error:"Unauthorized"});
  try{
    const alerts=await evaluateRules({sendPush:true});
    let outcomes=null;try{outcomes=await evaluateOutcomes({})}catch(e){outcomes={error:e.message,migrationRequired:Boolean(e.migrationRequired)}}
    return res.status(200).json({ok:true,ranAt:new Date().toISOString(),...alerts,outcomes})
  }catch(e){return res.status(e.setupRequired?503:500).json({error:e.message,setupRequired:Boolean(e.setupRequired)})}
};
