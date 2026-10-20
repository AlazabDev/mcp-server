import json
from pathlib import Path
import frappe
ROOT=Path(__file__).resolve().parent.parent

def seed_records():
    data=json.loads((ROOT/'mcp_server/assets/seed.json').read_text())
    for key,doctype,idfield in [('plugins','MCP Plugin','plugin_id'),('connectors','MCP Connector','connector_id'),('skills','MCP Skill','skill_id'),('capabilities','MCP Capability','tool_name')]:
        for row in data[key]:
            if not frappe.db.exists(doctype,{idfield:row[idfield]}):frappe.get_doc({'doctype':doctype,**row}).insert(ignore_permissions=True)
    return data

def after_install():
    for name in ('MCP Manager','MCP Operator'):
        if not frappe.db.exists('Role',name):frappe.get_doc({'doctype':'Role','role_name':name,'desk_access':1}).insert(ignore_permissions=True)
    seed_records()
    settings=frappe.get_single('MCP Server Settings')
    settings.enabled=1;settings.auth_mode='Native';settings.default_max_page_length=20;settings.max_request_rate=60;settings.log_retention_days=30;settings.max_response_bytes=2000000
    settings.save(ignore_permissions=True)
    seed_allowlists()
    # Existing bundle credentials are execution inputs; copy to encrypted Password fields once.
    configure_from_bundle()

def after_migrate():
    for name in ('MCP Manager','MCP Operator'):
        if not frappe.db.exists('Role',name):frappe.get_doc({'doctype':'Role','role_name':name,'desk_access':1}).insert(ignore_permissions=True)
    seed_records();seed_allowlists();configure_from_bundle()
    settings=frappe.get_single('MCP Server Settings')
    if settings.auth_mode in ('Token','API Key') and settings.mcp_user and settings.mcp_user!='Guest' and frappe.db.exists('User',settings.mcp_user):
        user=frappe.get_doc('User',settings.mcp_user)
        if 'MCP Operator' not in [r.role for r in user.roles]:user.add_roles('MCP Operator')


def seed_allowlists():
    candidates=['ToDo','File','Project','Task','Item','Customer','Supplier','Employee']
    preferred=['name','status','subject','project_name','item_name','customer_name','supplier_name','employee_name','file_name','creation','modified']
    for dt in candidates:
        if not frappe.db.exists('DocType',dt) or frappe.db.exists('MCP Doctype Allowlist',{'doctype_ref':dt}):continue
        meta=frappe.get_meta(dt)
        fields=[f for f in preferred if f in ('name','creation','modified') or meta.has_field(f)]
        frappe.get_doc({'doctype':'MCP Doctype Allowlist','doctype_ref':dt,'enabled':1,'allow_read':1,'allow_meta':1,'max_page_length':20,'allowed_fields_read':[{'fieldname':f} for f in fields],'allowed_filters':[{'fieldname':'name','operator':'='}]}).insert(ignore_permissions=True)

def bundle_values():
    from dotenv import dotenv_values
    values={}
    for rel in ['az_mcp/env/env.production','az_mcp/env/.env','az_mcp/mail/.env','az_mcp/toolboxes/.env','az_mcp/daftra/.env','az_mcp/.env']:
        p=ROOT/rel
        if p.exists():
            for key,value in dotenv_values(p,interpolate=False).items():
                if value:values[key]=value
    return values

def configure_from_bundle():
    values=bundle_values();updated=[]
    def first(*names):return next((values[n] for n in names if values.get(n)),'')
    configs={
      'daftra':('DAFTRA_API_KEY','DAFTRA_ACCESS_TOKEN'), 'meta':('META_TOKEN','META_USERSYSTEM_TOKEN','ACCESS_TOKEN'),
      'magicplan':('MAGICPLAN_API_KEY','MAGICPLAN_KEY'), 'uberfix':('UBERFIX_API_KEY','UBERFIX_GATEWAY_KEY'),
      'openai':('OPENAI_API_KEY',), 'anthropic':('ANTHROPIC_API_KEY',), 'gemini':('GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_KEY'),
      'azure':('AZURE_OPENAI_API_KEY',), 'compatible':('AI_API_KEY','OLLAMA_API_KEY')}
    for cid,keys in configs.items():
        name=frappe.db.get_value('MCP Connector',{'connector_id':cid},'name')
        if not name:continue
        doc=frappe.get_doc('MCP Connector',name)
        if doc.get_password('credential',raise_exception=False):continue
        key=first(*keys)
        if key:doc.credential=key
        if cid=='daftra':
            if first('DAFTRA_BASE_URL'):doc.base_url=first('DAFTRA_BASE_URL').rstrip('/')
            elif first('DAFTRA_SUBDOMAIN'):doc.base_url='https://'+first('DAFTRA_SUBDOMAIN')+'.daftra.com'
            if first('DAFTRA_AUTH_MODE').lower()=='bearer':doc.auth_scheme='Bearer';doc.credential=first('DAFTRA_ACCESS_TOKEN')
        if cid=='magicplan' and first('MAGICPLAN_CUSTOMER'):doc.headers_json=json.dumps({'customer':first('MAGICPLAN_CUSTOMER')})
        if cid=='meta':
            params={k:v for k,v in {'graph_version':first('META_API_VERSION') or 'v24.0','business_id':first('META_BUSINESS_ID','BUSINESS_ID'),'waba_id':first('WHATSAPP_BUSINESS_ACCOUNT_ID','WABA_ID'),'phone_number_id':first('WHATSAPP_PHONE_NUMBER_ID','PHONE_NUMBER_ID')}.items() if v}
            doc.default_params_json=json.dumps(params)
        if doc.kind=='AI':
            modelkeys={'openai':('OPENAI_MODEL',),'anthropic':('ANTHROPIC_MODEL',),'gemini':('GEMINI_MODEL',),'azure':('AZURE_OPENAI_DEPLOYMENT','MODEL_DEPLOYMENT_NAME'),'compatible':('AI_MODEL','OLLAMA_MODEL')}
            doc.model=first(*modelkeys[cid])
            if cid=='azure' and first('AZURE_OPENAI_ENDPOINT'):doc.base_url=first('AZURE_OPENAI_ENDPOINT').rstrip('/')+'/openai/v1'
            if cid=='compatible':doc.base_url=first('AI_BASE_URL','OLLAMA_BASE_URL')
        # Configuration is retained; activation remains an explicit decision in Desk.
        if key or doc.base_url:doc.save(ignore_permissions=True);updated.append(cid)
    return {'configured_connectors':updated,'values_exposed':False}
