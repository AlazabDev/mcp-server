import hashlib,json,re
import frappe
from frappe.model.document import Document
from jsonschema import Draft202012Validator
from mcp_server.net import validate_url

class RegistryDocument(Document):
    def validate(self):
        for field in ('plugin_id','skill_id','connector_id','tool_name'):
            value=self.get(field)
            if value and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}',value):
                frappe.throw('معرف غير صالح: '+field)
        for field in ('input_schema','manifest_json','headers_json','default_params_json','test_arguments_json'):
            value=self.get(field)
            if value:
                try:
                    obj=json.loads(value)
                    if not isinstance(obj,dict):raise ValueError()
                    if field=='input_schema':Draft202012Validator.check_schema(obj)
                except Exception:frappe.throw('صيغة JSON غير صالحة: '+field)
        if self.get('instructions'):
            if len(self.instructions)>100000:frappe.throw('تعليمات المهارة تتجاوز الحد المسموح')
            self.content_hash=hashlib.sha256(self.instructions.encode()).hexdigest()
        if self.doctype=='MCP Connector':
            if self.kind not in ('Frappe','Local Backup') and self.base_url:validate_url(self.base_url)
            if not 1<=int(self.timeout_seconds or 30)<=120:frappe.throw('المهلة بين 1 و120 ثانية')
            if self.auth_header and not re.fullmatch(r'[A-Za-z0-9-]+',self.auth_header):frappe.throw('اسم هيدر غير صالح')
        if self.doctype=='MCP Capability':
            if frappe.get_cached_value('MCP Connector',self.connector,'plugin')!=self.plugin:frappe.throw('القدرة والموصل يجب أن يتبعا نفس البلجن')
            if self.handler=='HTTP' and (not self.path or not self.path.startswith('/') or '://' in self.path or self.path.startswith('//')):frappe.throw('مسار العملية يجب أن يكون نسبيًا إلى عنوان الموصل')
            if self.handler=='Frappe' and self.operation_id not in {'ping','list_allowed_doctypes','get_meta','get_doc','search_docs','create_doc','update_doc','delete_doc'}:frappe.throw('عملية Frappe غير مدعومة')
