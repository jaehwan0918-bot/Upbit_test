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
