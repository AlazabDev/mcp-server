frappe.ui.form.on('MCP Connector', {refresh(frm) {
 if(frm.is_new())return;
 frm.add_custom_button('اختبار الاتصال',async()=>{const r=await frappe.call({method:'mcp_server.management.test_connector',args:{name:frm.doc.name}});frappe.msgprint(frappe.utils.escape_html(r.message.details));frm.reload_doc();});
 if(frm.doc.kind==='Remote MCP')frm.add_custom_button('مزامنة الأدوات',async()=>{const r=await frappe.call({method:'mcp_server.management.sync_remote_tools',args:{name:frm.doc.name}});frappe.msgprint('تم اكتشاف '+r.message.discovered+' أداة');});
 frm.add_custom_button('قدرات الموصل',()=>frappe.set_route('List','MCP Capability',{connector:frm.doc.name}));
}});
