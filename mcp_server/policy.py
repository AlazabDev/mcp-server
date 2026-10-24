import hmac
import frappe

MANAGERS={'System Manager','MCP Manager'}
def roles():return set(frappe.get_roles())
def require_manager():
    if frappe.session.user=='Guest' or not roles() & MANAGERS:frappe.throw('إدارة التكاملات تتطلب دور مدير',frappe.PermissionError)
def authenticate():
    settings=frappe.get_single('MCP Server Settings')
    if not settings.enabled:frappe.throw('خادم MCP معطل',frappe.PermissionError)
    # Native OAuth/API-key authentication has already been performed by Frappe.
    if frappe.session.user=='Guest' and settings.auth_mode=='Token':
        token=frappe.get_request_header('X-MCP-Token','')
        expected=settings.get_password('token_secret',raise_exception=False) or ''
        if token and expected and hmac.compare_digest(token,expected) and settings.mcp_user:
            frappe.set_user(settings.mcp_user)
    if frappe.session.user=='Guest' or not roles() & (MANAGERS|{'MCP Operator'}):frappe.throw('المستخدم غير مصرح له باستخدام MCP',frappe.PermissionError)
    if settings.auth_mode=='API Key' and settings.mcp_user and frappe.session.user!=settings.mcp_user:frappe.throw('مستخدم MCP مختلف',frappe.PermissionError)
    return settings

def permitted(doc):
    if not doc.get('enabled'):return False
    allowed={r.strip() for r in (doc.get('allowed_roles') or '').splitlines() if r.strip()}
    return not allowed or bool(roles() & allowed)

def check_chain(capability,write=False):
    if not permitted(capability) or not capability.get('supported'):frappe.throw('القدرة غير متاحة',frappe.PermissionError)
    plugin=frappe.get_doc('MCP Plugin',capability.plugin);connector=frappe.get_doc('MCP Connector',capability.connector)
    if connector.plugin!=capability.plugin or not permitted(plugin) or not permitted(connector):frappe.throw('البلجن أو الموصل غير مفعّل لهذا المستخدم',frappe.PermissionError)
    if not capability.read_only and not (connector.allow_writes and frappe.get_single('MCP Server Settings').expose_writes):frappe.throw('عمليات الكتابة غير مفعّلة',frappe.PermissionError)
    return connector

def capability_visible(capability):
    try:check_chain(capability);return True
    except frappe.PermissionError:return False


def rate_allowed(settings):
    import time
    limit=int(settings.max_request_rate or 60)
    key=frappe.cache.make_key('mcp:rate:'+frappe.session.user+':'+str(int(time.time()//60)))
    pipe=frappe.cache.pipeline();pipe.incr(key);pipe.expire(key,120)
    count,_=pipe.execute()
    return count<=max(limit,1)

AUTH_FAILURE_LIMIT=30  # failed authentications per client IP per minute
def _auth_failure_key():
    import time
    return frappe.cache.make_key('mcp:authfail:'+str(getattr(frappe.local,'request_ip',None) or '-')+':'+str(int(time.time()//60)))
def auth_failures_exceeded():
    return int(frappe.cache.get(_auth_failure_key()) or 0)>=AUTH_FAILURE_LIMIT
def note_auth_failure():
    key=_auth_failure_key();pipe=frappe.cache.pipeline();pipe.incr(key);pipe.expire(key,120);pipe.execute()
