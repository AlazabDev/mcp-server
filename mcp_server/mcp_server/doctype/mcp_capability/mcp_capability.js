frappe.ui.form.on('MCP Capability', {refresh(frm) {
 if(frm.is_new())return;
 frm.add_custom_button('اختبار تنفيذ القدرة',()=>{
  const d=new frappe.ui.Dialog({title:frm.doc.read_only?'اختبار قدرة قراءة':'تنفيذ قدرة كتابة — راجع المدخلات',fields:[{fieldname:'arguments',fieldtype:'Code',label:'مدخلات JSON حسب المخطط',options:'JSON',default:'{}',reqd:1}],primary_action_label:'تنفيذ',primary_action:async values=>{
   try{JSON.parse(values.arguments);}catch{frappe.msgprint('صيغة JSON غير صالحة');return;}
   const r=await frappe.call({method:'mcp_server.management.run_capability',args:{tool_name:frm.doc.tool_name,arguments:values.arguments}});
   const text=JSON.stringify(r.message,null,2);frappe.msgprint({title:'نتيجة التنفيذ',message:'<pre style="white-space:pre-wrap;direction:ltr">'+frappe.utils.escape_html(text)+'</pre>',wide:true});d.hide();
  }});d.show();
 });
}});
