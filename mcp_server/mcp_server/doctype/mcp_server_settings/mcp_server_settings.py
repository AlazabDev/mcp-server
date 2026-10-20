import frappe
from frappe.model.document import Document
from mcp_server.net import validate_url
class MCPServerSettings(Document):
    def validate(self):
        if self.public_url:validate_url(self.public_url)
        if not 1<=int(self.default_max_page_length or 20)<=100:frappe.throw('حد الصفحة بين 1 و100')
        if not 1024<=int(self.max_response_bytes or 2000000)<=10000000:frappe.throw('حد حجم النتيجة غير صالح')
        if self.auth_mode=='Token' and (not self.mcp_user or not self.get_password('token_secret',raise_exception=False)):frappe.throw('نمط التوكن يتطلب مستخدمًا ومفتاحًا')
