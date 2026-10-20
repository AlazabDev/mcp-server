import json
import frappe
SENSITIVE_FIELDS=['api_key','api_secret','password','new_password','reset_password_key','last_reset_password_key_generated_on']
def get_mcp_settings():return frappe.get_single('MCP Server Settings')
def check_doctype_allowlist(doctype,operation):
    s=get_mcp_settings()
    if any(r.exclude_doctype==doctype for r in s.exclude_doctypes_default):frappe.throw('نوع المستند مستبعد',frappe.PermissionError)
    name=frappe.db.get_value('MCP Doctype Allowlist',{'doctype_ref':doctype,'enabled':1},'name')
    if not name:frappe.throw('نوع المستند غير مصرح به',frappe.PermissionError)
    doc=frappe.get_doc('MCP Doctype Allowlist',name)
    if not doc.get('allow_'+operation):frappe.throw('العملية غير مصرح بها',frappe.PermissionError)
    return doc

def validate_fields(doctype,fields_list,operation,allowlist_doc=None):
    doc=allowlist_doc or check_doctype_allowlist(doctype,'read' if operation=='read' else 'update')
    allowed=[r.fieldname for r in doc.get('allowed_fields_'+('read' if operation=='read' else 'write'))]
    # Name is a minimal read default; writes always require explicit fields.
    if not allowed:allowed=['name'] if operation=='read' else []
    meta=frappe.get_meta(doctype)
    allowed=[f for f in allowed if f not in SENSITIVE_FIELDS and (f=='name' or (meta.get_field(f) and meta.get_field(f).fieldtype not in ('Password','Table','Table MultiSelect')))]
    if not isinstance(fields_list,list) or not all(isinstance(f,str) for f in fields_list):frappe.throw('قائمة الحقول غير صالحة')
    if fields_list==['*']:return allowed
    if any(f not in allowed for f in fields_list):frappe.throw('حقل غير مصرح به',frappe.PermissionError)
    return fields_list

def validate_filters(doctype,filters,allowlist_doc=None):
    if not filters:return
    doc=allowlist_doc or check_doctype_allowlist(doctype,'read')
    allowed={(r.fieldname,r.operator.lower()) for r in doc.allowed_filters}|{('name','=')}
    rows=[]
    if isinstance(filters,dict):
        for field,value in filters.items():
            if isinstance(value,(list,tuple)):
                if len(value)!=2:frappe.throw('فلتر غير صالح')
                rows.append((field,str(value[0]).lower(),value[1]))
            else:rows.append((field,'=',value))
    elif isinstance(filters,list):
        for row in filters:
            if not isinstance(row,(list,tuple)) or len(row)!=3:frappe.throw('فلتر غير صالح')
            rows.append((row[0],str(row[1]).lower(),row[2]))
    else:frappe.throw('صيغة فلاتر غير صالحة')
    if len(rows)>20:frappe.throw('عدد فلاتر أكبر من الحد')
    for field,op,value in rows:
        if (field,op) not in allowed:frappe.throw('فلتر غير مصرح به',frappe.PermissionError)
        if isinstance(value,(list,tuple)) and (len(value)>100 or any(isinstance(v,(list,dict)) for v in value)):frappe.throw('قيمة فلتر غير صالحة')
        if isinstance(value,dict):frappe.throw('قيمة فلتر غير صالحة')

def log_mcp_audit(data):
    # Compatibility log: same request transaction, never commit business work on failure.
    try:
        frappe.get_doc({'doctype':'MCP Audit Log','request_id':data.get('request_id'),'tool_name':data.get('tool_name'),'mcp_user':data.get('mcp_user'),'ref_doctype':data.get('doctype'),'docname':data.get('docname'),'operation':{'get_doc':'Read','search_docs':'Search','create_doc':'Create','update_doc':'Update','delete_doc':'Delete','get_meta':'Meta','list_allowed_doctypes':'Meta','ping':'Read'}.get(data.get('operation'),'Read'),'status':data.get('status'),'latency_ms':data.get('latency_ms'),'http_status':data.get('http_status',200),'request_summary_json':'{}','response_summary_json':'{}','diff_json':json.dumps(data.get('diff'),default=str) if data.get('diff') else None}).insert(ignore_permissions=True)
    except Exception:frappe.logger('mcp_server').exception('MCP compatibility audit failed')
