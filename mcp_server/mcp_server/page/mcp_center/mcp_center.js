frappe.pages['mcp-center'].on_page_load = function(wrapper) {
  const page = frappe.ui.make_app_page({parent: wrapper, title: 'مركز تكاملات العزب', single_column: true});
  const root = $('<div class="az-mcp" dir="rtl"></div>').appendTo(page.main);
  const esc = v => frappe.utils.escape_html(String(v ?? ''));
  const api = (method, args={}) => frappe.call({method: 'mcp_server.management.'+method, args}).then(r => r.message);
  const open = (dt, name) => frappe.set_route('Form', dt, name);
  const statuses = {'Success':'ناجح','Failed':'فشل','Needs Configuration':'يحتاج إعداد'};
  let data, tab='connectors';
  $('<style>').text(`.az-mcp{padding:20px;max-width:1400px;margin:auto}.az-mcp .hero{background:#170d02;color:white;border-radius:16px;padding:24px;margin-bottom:20px}.az-mcp .hero h2{color:#ffb900}.az-mcp .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:20px}.az-mcp .stat,.az-mcp .panel{background:var(--card-bg);border:1px solid var(--border-color);border-radius:12px;padding:18px}.az-mcp .stat strong{font-size:28px;display:block;color:var(--text-color)}.az-mcp .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.az-mcp .active{background:#ffb900;color:#170d02}.az-mcp table{width:100%;text-align:right}.az-mcp td,.az-mcp th{padding:12px;border-bottom:1px solid var(--border-color)}.az-mcp .actions{display:flex;gap:6px;flex-wrap:wrap}.az-mcp .endpoint{direction:ltr;unicode-bidi:embed;overflow-wrap:anywhere}.az-mcp .muted{color:var(--text-muted)}.az-mcp .table-wrap{overflow:auto}.az-mcp button:focus-visible{outline:3px solid #ffb900}`).appendTo(root);
  const content=$('<div>').appendTo(root);
  const labels={connectors:'الموصلات',plugins:'البلجنات',skills:'المهارات',logs:'سجل التنفيذ',chatgpt:'اتصال ChatGPT'};
  async function reload(){try{data=await api('snapshot');render();}catch(e){content.empty().append($('<p>').text('تعذر تحميل المركز. راجع تفعيل MCP وصلاحيات المستخدم في إعدادات خادم MCP.'));}}
  function render(){
    content.html(`<div class="hero"><h2>مركز تكاملات العزب</h2><p>المهارات والبلجنات والموصلات داخل Frappe</p><div class="endpoint">${esc(data.mcp_url)}</div></div><div class="cards"><div class="stat"><strong>${data.active_capabilities}</strong>قدرة مفعّلة لهذا المستخدم</div><div class="stat"><strong>${data.skills.length}</strong>مهارة مسجلة</div><div class="stat"><strong>${data.connectors.filter(c=>c.last_status==='Success').length}</strong>موصل نجح آخر اختبار له</div></div><div class="tabs"></div><div class="panel"></div>`);
    const tabs=content.find('.tabs');
    Object.entries(labels).forEach(([key,title])=>$('<button class="btn">').toggleClass('active',tab===key).text(title).on('click',()=>{tab=key;render();}).appendTo(tabs));
    const panel=content.find('.panel');
    if(tab==='chatgpt'){
      panel.html(`<h3>ربط ChatGPT بنفس بيئة Frappe</h3><p>نقطة MCP:</p><p class="endpoint">${esc(data.mcp_url)}</p><p>سجّل OAuth Client داخل Frappe، وانسخ عنوان الرجوع الفعلي الذي تعرضه إعدادات التطبيق في ChatGPT. المصادقة تستخدم حساب Frappe وأدواره.</p><p>بعد الاتصال اطلب central_list_skills ثم central_get_skill لقراءة المهارة المناسبة. يمكن أيضًا قراءة المهارات كـ MCP Prompts وResources عند دعم العميل لها.</p><p class="muted">وجود رابط الاتصال لا يثبت نجاح المصادقة. أدوات الكتابة تتطلب تفعيلها في الإعدادات والموصل، مع صلاحيات المستند الفعلية.</p>`);
      $('<button class="btn btn-primary">نسخ رابط MCP</button>').on('click',()=>frappe.utils.copy_to_clipboard(data.mcp_url)).appendTo(panel);
      if(data.manager){
        $('<button class="btn btn-default">تفعيل اكتشاف OAuth الأصلي</button>').on('click',async()=>{const r=await api('configure_oauth_discovery');frappe.msgprint(r.note);}).appendTo(panel);
        $('<button class="btn btn-default">عملاء OAuth</button>').on('click',()=>frappe.set_route('List','OAuth Client')).appendTo(panel);
      }
      return;
    }
    const types={connectors:'MCP Connector',plugins:'MCP Plugin',skills:'MCP Skill',logs:'MCP Execution Log'};
    if(data.manager && tab!=='logs')$('<button class="btn btn-primary mb-3">إضافة سجل</button>').on('click',()=>frappe.new_doc(types[tab])).appendTo(panel);
    if(data.manager)$('<button class="btn btn-default mb-3">فتح القائمة الكاملة</button>').on('click',()=>frappe.set_route('List',types[tab])).appendTo(panel);
    const table=$('<div class="table-wrap"><table><thead><tr><th>الاسم / العملية</th><th>الحالة</th><th>التفاصيل</th><th>الإجراءات</th></tr></thead><tbody></tbody></table></div>').appendTo(panel);
    const rows=data[tab] || [];
    if(!rows.length)$('<p class="muted">لا توجد سجلات متاحة لهذا المستخدم.</p>').appendTo(panel);
    rows.forEach(row=>{
      const tr=$('<tr>');$('<td>').text(row.title || row.capability).appendTo(tr);
      $('<td>').text(tab==='logs'?(statuses[row.status]||row.status):(row.enabled?'مفعّل':'معطّل')).appendTo(tr);
      $('<td>').text(tab==='connectors'?`${row.kind} — ${statuses[row.last_status]||'لم يُختبر'}${row.last_tested?' — '+row.last_tested:''}`:tab==='logs'?`${row.duration_ms} ms — ${row.request_id}`:(row.description||row.version||'')).appendTo(tr);
      const actions=$('<td class="actions">').appendTo(tr);
      if(data.manager)$('<button class="btn btn-xs btn-default">فتح</button>').on('click',()=>open(types[tab],row.name)).appendTo(actions);
      if(data.manager && tab!=='logs')$('<button class="btn btn-xs btn-default">').text(row.enabled?'تعطيل':'تفعيل').on('click',async()=>{await api('set_enabled',{doctype:types[tab],name:row.name,enabled:row.enabled?0:1});await reload();}).appendTo(actions);
      if(data.manager && tab==='connectors'){
        $('<button class="btn btn-xs btn-default">اختبار الاتصال</button>').on('click',async function(){this.disabled=true;try{const r=await api('test_connector',{name:row.name});frappe.msgprint({title:statuses[r.status]||r.status,message:esc(r.details)});await reload();}finally{this.disabled=false;}}).appendTo(actions);
        if(row.kind==='Remote MCP')$('<button class="btn btn-xs btn-default">مزامنة الأدوات</button>').on('click',async()=>{const r=await api('sync_remote_tools',{name:row.name});frappe.msgprint(`تم اكتشاف ${r.discovered} أداة وإضافة ${r.added}`);await reload();}).appendTo(actions);
      }
      if(tab==='skills')$('<button class="btn btn-xs btn-default">قراءة التعليمات</button>').on('click',async()=>{
        const r=await frappe.call({method:'mcp_server.management.read_skill',args:{skill_id:row.skill_id}});
        frappe.msgprint({title:row.title,message:'<pre style="white-space:pre-wrap;text-align:right">'+esc(r.message.instructions)+'</pre>',wide:true});
      }).appendTo(actions);
      tr.appendTo(table.find('tbody'));
    });
    if(tab==='connectors' && data.manager)$('<button class="btn btn-default mt-3">استيراد إعدادات الحزمة دون استبدال المفاتيح المسجلة</button>').on('click',async()=>{const r=await api('import_bundle_settings');frappe.msgprint('تمت مراجعة إعدادات '+r.configured_connectors.length+' موصل.');reload();}).appendTo(panel);
  }
  page.set_primary_action('تحديث',reload);
  page.add_menu_item('إعدادات خادم MCP',()=>open('MCP Server Settings','MCP Server Settings'));
  page.add_menu_item('القدرات المسجلة',()=>frappe.set_route('List','MCP Capability'));
  page.add_menu_item('اختبارات الاتصال',()=>frappe.set_route('List','MCP Connection Test'));
  reload();
};
