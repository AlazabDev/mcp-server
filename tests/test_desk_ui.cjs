const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>',{runScripts:'outside-only',url:'https://frappe.test/app/mcp-center'});
const window=dom.window,$=require('jquery')(window);window.$=$;
let calls=[],routes=[],menus=[],primary;
const snapshot={manager:true,mcp_url:'https://frappe.test/api/method/mcp_server.transport.handle',active_capabilities:7,capability_total:371,
 plugins:[{name:'Plugin',plugin_id:'frappe',title:'بلجن Frappe',enabled:1,version:'1.0.0'}],
 connectors:[{name:'Connector',connector_id:'frappe',title:'Frappe المحلي',enabled:1,kind:'Frappe',last_status:'Success'}],
 skills:[{name:'Skill',skill_id:'daftra-backup',title:'تحليل نسخة دفترة',enabled:1,description:'نسخة تاريخية'}],logs:[{name:'Log',request_id:'123',capability:'frappe__ping',status:'Success',duration_ms:8}]};
window.frappe={pages:{'mcp-center':{}},utils:{escape_html:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),copy_to_clipboard:v=>calls.push(['copy',v])},ui:{make_app_page:()=>({main:window.document.getElementById('root'),set_primary_action:(l,f)=>primary=f,add_menu_item:(l,f)=>menus.push(l)})},call:async opts=>{calls.push(opts);const short=opts.method.split('.').pop();return {message:short==='snapshot'?snapshot:short==='read_skill'?{instructions:'تعليمات <script>لا تنفذ</script>'}:short==='test_connector'?{status:'Success',details:'تم الاختبار'}:short==='configure_oauth_discovery'?{note:'جاهز'}:short==='import_bundle_settings'?{configured_connectors:[]}:{} }},set_route:(...args)=>routes.push(args),new_doc:dt=>calls.push(['new',dt]),msgprint:v=>calls.push(['message',v])};
const source=path.join(__dirname,'../mcp_server/mcp_server/page/mcp_center/mcp_center.js');window.eval(fs.readFileSync(source,'utf8'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const clickText=text=>{const b=[...window.document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,'Missing button '+text);b.click();};
(async()=>{
 window.frappe.pages['mcp-center'].on_page_load({});await tick();
 assert.equal(window.document.querySelector('.az-mcp').dir,'rtl');
 assert.ok(window.document.body.textContent.includes('Frappe المحلي'));
 clickText('اختبار الاتصال');await tick();assert.ok(calls.some(c=>c.method?.endsWith('test_connector')));
 for(const text of ['البلجنات','المهارات','سجل التنفيذ','اتصال ChatGPT']){clickText(text);await tick();}
 assert.ok(window.document.body.textContent.includes(snapshot.mcp_url));
 clickText('نسخ رابط MCP');assert.ok(calls.some(c=>Array.isArray(c)&&c[0]==='copy'));
 clickText('تفعيل اكتشاف OAuth الأصلي');await tick();assert.ok(calls.some(c=>c.method?.endsWith('configure_oauth_discovery')));
 clickText('المهارات');clickText('قراءة التعليمات');await tick();assert.ok(calls.some(c=>c.method?.endsWith('read_skill')));
 snapshot.skills[0].title='<img src=x onerror=alert(1)>';await primary();assert.equal(window.document.querySelectorAll('img').length,0);
 snapshot.manager=false;snapshot.connectors=[];await primary();clickText('الموصلات');assert.ok(!window.document.body.textContent.includes('إضافة سجل'));
 assert.equal(menus.length,3);console.log('DESK_UI_PASS: RTL, five tabs, connection test, skill reading, OAuth action, copy endpoint, escaped dynamic data, operator view');
})().catch(e=>{console.error(e);process.exitCode=1;});
