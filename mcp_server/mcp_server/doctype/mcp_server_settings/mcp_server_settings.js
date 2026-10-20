frappe.ui.form.on('MCP Server Settings', {
  refresh(frm) {
    frm.add_custom_button('فتح مركز التكاملات',()=>frappe.set_route('mcp-center'));
    frm.add_custom_button('عملاء OAuth',()=>frappe.set_route('List','OAuth Client'));
  }
});
