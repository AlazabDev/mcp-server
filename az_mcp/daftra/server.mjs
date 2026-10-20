import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const OPS=JSON.parse(readFileSync(path.join(ROOT,'catalog.json'),'utf8'));
const BY_ID=new Map(OPS.map(o=>[o.id,o]));
// Preserve published Supabase MCP operation IDs that omitted the {format} suffix.
for(const op of OPS){if(op.id.endsWith('_format')){const alias=op.id.slice(0,-7);if(!BY_ID.has(alias))BY_ID.set(alias,op);}}
if(OPS.length!==301||new Set(OPS.map(op=>op.id)).size!==301)throw Error('Invalid catalog: duplicate or missing operations');
const PORT=Number(process.env.MCP_HTTP_PORT||8766);
const HOST=process.env.MCP_HTTP_HOST||'127.0.0.1';
const PATH=(process.env.MCP_HTTP_PATH||'/daftra/mcp').replace(/\/$/,'');
const KEY=process.env.MCP_ACCESS_KEY||process.env.DAFTRA_MCP_TOKEN||'';
if(!KEY)throw Error('MCP_ACCESS_KEY missing');
const BASE=new URL(process.env.DAFTRA_BASE_URL||`https://${process.env.DAFTRA_SUBDOMAIN}.daftra.com`);
if(!/^[a-z0-9-]+\.daftra\.com$/i.test(BASE.hostname)||BASE.protocol!=='https:')throw Error('Invalid DAFTRA_BASE_URL');
const AUTH_MODE=(process.env.DAFTRA_AUTH_MODE||'apikey').toLowerCase();
if(!['apikey','bearer'].includes(AUTH_MODE))throw Error('Unsupported DAFTRA_AUTH_MODE');
const DAFTRA_KEY=AUTH_MODE==='bearer'?process.env.DAFTRA_ACCESS_TOKEN:process.env.DAFTRA_API_KEY;
if(!DAFTRA_KEY)throw Error(`Missing Daftra credential (${AUTH_MODE})`);
const WRITE_ENABLED=process.env.ENABLE_WRITE_TOOLS==='true';
const DRY_RUN=process.env.DRY_RUN==='true';
const TIMEOUT=Math.min(120000,Math.max(1000,Number(process.env.DAFTRA_TIMEOUT||60)*1000));
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const result=(v,isError=false)=>({content:[{type:'text',text:typeof v==='string'?v:JSON.stringify(v)}],isError});
const tools=[
 {name:'daftra_list_categories',description:'List Daftra API categories and operation counts.',inputSchema:{type:'object',properties:{}}},
 {name:'daftra_search_operations',description:'Search all Daftra operations by keyword, category and HTTP method.',inputSchema:{type:'object',properties:{query:{type:'string'},category:{type:'string'},method:{type:'string',enum:['GET','POST','PUT','PATCH','DELETE']},limit:{type:'integer',minimum:1,maximum:100}}}},
 {name:'daftra_describe_operation',description:'Describe an operation by ID: exact path, parameters, body schema.',inputSchema:{type:'object',properties:{operation_id:{type:'string'}},required:['operation_id']}},
 {name:'daftra_call',description:'Execute a Daftra API operation by ID (writes only when enabled).',inputSchema:{type:'object',properties:{operation_id:{type:'string'},path_params:{type:'object',additionalProperties:true},query:{type:'object',additionalProperties:true},body:{type:'object',additionalProperties:true}},required:['operation_id']}}
];
const err=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const ok=(id,body)=>({jsonrpc:'2.0',id,result:body});
function resolvePath(op,args){
 let p=op.p.replaceAll('{format}', '.json');
 const values=isObj(args.path_params)?args.path_params:{};
 for(const match of p.matchAll(/\{([^}]+)\}/g)){
  const v=values[match[1]]??values[match[1].toLowerCase()];
  if((typeof v!=='string'&&typeof v!=='number')||v==='')throw Error(`Missing path parameter: ${match[1]}`);
  p=p.replace(match[0],encodeURIComponent(String(v)));
 }
 if(!p.startsWith('/')||p.includes('..')||p.includes('{'))throw Error('Invalid resolved path');
 // v2 endpoints are already absolute paths; legacy endpoints use /api2
 const u=new URL(p.startsWith('/v2/')?p:`/api2${p}`,BASE);
 const q=isObj(args.query)?args.query:{};
 for(const [k,v] of Object.entries(q)){
  if(v==null)continue;
  if(Array.isArray(v))for(const part of v)u.searchParams.append(k.endsWith('[]')?k:`${k}[]`,String(part));
  else if(['string','number','boolean'].includes(typeof v))u.searchParams.set(k,String(v));
  else throw Error(`Invalid query parameter ${k}`);
 }
 return u;
}
async function callDaftra(op,args){
 const method=op.m.toUpperCase();
 const url=resolvePath(op,args);
 // OpenAPI includes GET mutations (e.g. update_draft, convert_to_invoice, activate app).
 const sideEffectGet=/update_|convert_to_|activate|\/lock|\/unlock|\/delete\//i.test(op.p);
 if((method!=='GET'||sideEffectGet)&&!WRITE_ENABLED)return result('Write operations disabled: ENABLE_WRITE_TOOLS=false',true);
 if((method!=='GET'||sideEffectGet)&&DRY_RUN)return result({dry_run:true,operation_id:op.id,method,url:url.toString(),body:args.body});
 const headers={'Accept':'application/json'};
 if(AUTH_MODE==='bearer')headers.Authorization=`Bearer ${DAFTRA_KEY}`;else headers.apikey=DAFTRA_KEY;
 let body;
 if(method!=='GET'&&method!=='HEAD'&&args.body!==undefined){
  if(op.p==='/v2/oauth/token'){
   const form=new URLSearchParams();for(const [k,v] of Object.entries(args.body||{}))form.set(k,String(v));
   body=form.toString();headers['Content-Type']='application/x-www-form-urlencoded';
  }else{body=JSON.stringify(args.body);headers['Content-Type']='application/json';}
 }
 try{
  const response=await fetch(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(TIMEOUT)});
  const content=await response.text();let data;
  try{data=JSON.parse(content);}catch{data=content;}
  const output={status:response.status,data};
  const serialized=JSON.stringify(output);
  return result(serialized.length>100000?{status:response.status,truncated:true,preview:serialized.slice(0,100000)}:output,!response.ok);
 }catch(e){return result({error:e.message||String(e)},true);}
}
async function callTool(name,a){
 switch(name){
  case 'daftra_list_categories':{
   const count={};for(const op of OPS)count[op.t]=(count[op.t]||0)+1;return result(count);
  }
  case 'daftra_search_operations':{
   const words=String(a.query||'').toLowerCase().trim().split(/\s+/).filter(Boolean);
   const limit=Math.min(100,Math.max(1,Number(a.limit)||30));
   return result(OPS.filter(o=>(!a.category||o.t.toLowerCase()===String(a.category).toLowerCase())&&(!a.method||o.m===a.method)&&words.every(w=>`${o.id} ${o.p} ${o.s} ${o.t}`.toLowerCase().includes(w))).slice(0,limit).map(o=>({id:o.id,method:o.m,path:o.p,summary:o.s,category:o.t})));
  }
  case 'daftra_describe_operation':{
   const op=BY_ID.get(String(a.operation_id||''));return result(op||'Unknown operation_id',!op);
  }
  case 'daftra_call':{
   const op=BY_ID.get(String(a.operation_id||''));return op?callDaftra(op,a):result('Unknown operation_id',true);
  }
  default:throw Object.assign(Error('Tool not found'),{rpc:-32602});
 }
}
async function handle(msg){
 if(!isObj(msg)||msg.jsonrpc!=='2.0'||typeof msg.method!=='string')return err(isObj(msg)?msg.id??null:null,-32600,'Invalid Request');
 if(!Object.hasOwn(msg,'id'))return null;
 switch(msg.method){
  case 'initialize':return ok(msg.id,{protocolVersion:['2025-03-26','2024-11-05'].includes(msg.params?.protocolVersion)?msg.params.protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'daftra-mcp',version:'4.0.0'}});
  case 'ping':return ok(msg.id,{});
  case 'tools/list':return ok(msg.id,{tools});
  case 'tools/call':{
   if(!isObj(msg.params)||typeof msg.params.name!=='string')return err(msg.id,-32602,'Missing tool name');
   try{return ok(msg.id,await callTool(msg.params.name,isObj(msg.params.arguments)?msg.params.arguments:{}));}
   catch(e){return e.rpc?err(msg.id,e.rpc,e.message):ok(msg.id,result({error:e.message||String(e)},true));}
  }
  default:return err(msg.id,-32601,'Method not found');
 }
}
const fixedHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type,x-mcp-key,mcp-protocol-version,mcp-session-id','Cache-Control':'no-store'};
function send(res,status,body){res.writeHead(status,{...fixedHeaders,'Content-Type':'application/json'});res.end(JSON.stringify(body));}
function validKey(a,b){if(!a||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
const publicHeaders={'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
function publicSend(res,status,body,type='text/html; charset=utf-8'){res.writeHead(status,{...publicHeaders,'Content-Type':type});res.end(body);}
const MODULES=JSON.parse(readFileSync(path.join(ROOT,'modules-manifest.json'),'utf8'));
const PUBLIC=path.join(ROOT,'public');
function publicRoute(req,res,pathname){
 if(req.method!=='GET'&&req.method!=='HEAD'){publicSend(res,405,'Method not allowed','text/plain');return true;}
 const routes={
  '/daftra':['dashboard.html','text/html; charset=utf-8'],
  '/daftra/':['dashboard.html','text/html; charset=utf-8'],
  '/daftra-docs':['docs.html','text/html; charset=utf-8'],
  '/daftra-docs/':['docs.html','text/html; charset=utf-8'],
  '/daftra/assets/style.css':['style.css','text/css; charset=utf-8'],
  '/daftra/assets/app.js':['app.js','text/javascript; charset=utf-8'],
 };
 if(routes[pathname]){
   const [file,type]=routes[pathname];publicSend(res,200,readFileSync(path.join(PUBLIC,file)),type);return true;
 }
 if(pathname==='/daftra/api/status'){
  const configured=Boolean(DAFTRA_KEY);
  publicSend(res,200,JSON.stringify({name:'Alazab Daftra MCP',version:'4.0.0',status:'running',timestamp:new Date().toISOString(),protocol:'2025-03-26',transport:'Streamable HTTP (JSON mode)',mcpEndpoint:'/daftra/mcp',docsEndpoint:'/daftra-docs',operations:OPS.length,modules:MODULES.length,categories:new Set(OPS.map(o=>o.t)).size,authenticationConfigured:Boolean(KEY),daftraCredentialsConfigured:configured,writeEnabled:WRITE_ENABLED,modulesDetail:MODULES.map(m=>({...m,status:m.operationCount>0?'registered':'empty'}))}), 'application/json; charset=utf-8');return true;
 }
 if(pathname==='/daftra-docs/api/operations'){
  publicSend(res,200,JSON.stringify(OPS.map(o=>({id:o.id,method:o.m,path:o.p,summary:o.s,category:o.t,parameters:o.params||[],requestBody:o.body||null}))), 'application/json; charset=utf-8');return true;
 }
 return false;
}
const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS'){res.writeHead(204,fixedHeaders);res.end();return;}
 const current=new URL(req.url,'http://localhost');
 if(current.pathname!==PATH&&current.pathname!==PATH+'/'){
  if(publicRoute(req,res,current.pathname))return;
  send(res,404,{error:'Not Found'});return;
 }
 const headerKey=req.headers['x-mcp-key']||String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!validKey(headerKey,KEY)){send(res,401,{error:'Unauthorized'});return;}
 if(req.method==='GET'){res.writeHead(405,{...fixedHeaders,Allow:'POST, OPTIONS'});res.end();return;}
 if(req.method!=='POST'){send(res,405,{error:'Method Not Allowed'});return;}
 const parts=[];let size=0;
 try{
  for await(const chunk of req){size+=chunk.length;if(size>1024*1024){send(res,413,{error:'Request too large'});return;}parts.push(chunk);}
  let payload;try{payload=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{send(res,400,err(null,-32700,'Parse error'));return;}
  const answer=Array.isArray(payload)?(await Promise.all(payload.map(handle))).filter(x=>x!==null):await handle(payload);
  if(answer===null||(Array.isArray(answer)&&answer.length===0)){res.writeHead(202,fixedHeaders);res.end();return;}
  send(res,200,answer);
 }catch(e){send(res,500,err(null,-32603,'Internal error'));}
});
server.listen(PORT,HOST,()=>console.log(`daftra-mcp 4.0.0 ready http://${HOST}:${PORT}${PATH} (${OPS.length} ops)`));
