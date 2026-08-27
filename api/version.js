module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"GET only"});
  res.setHeader("Cache-Control","no-store");
  return res.status(200).json({ok:true,version:"15.8.0",name:"Crypto Analyzer V15.8",built:"source-enhanced"});
};
