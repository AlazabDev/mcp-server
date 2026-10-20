"""Run with bench --site SITE run-tests --app mcp_server on a dedicated test site."""
import json
from unittest.mock import patch
import frappe
from frappe.tests import IntegrationTestCase
from mcp_server import api
from mcp_server.engine import execute,active_capabilities,active_skills
from mcp_server.transport import dispatch,handle,ENDPOINT,resource_metadata
from mcp_server.install import seed_records
from mcp_server.policy import authenticate
from mcp_server.management import test_connector,configure_oauth_discovery
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

class TestMCPAPI(IntegrationTestCase):
    def setUp(self):
        super().setUp();frappe.set_user('Administrator');frappe.flags.mute_messages=True
        frappe.db.savepoint('mcp_test_case');self.addCleanup(lambda:frappe.db.rollback(save_point='mcp_test_case'))
        self.settings=frappe.get_single('MCP Server Settings');self.settings.enabled=1;self.settings.auth_mode='Native';self.settings.expose_writes=0;self.settings.save()
        self.local=frappe.get_doc('MCP Connector',{'connector_id':'frappe'});self.local.enabled=1;self.local.save()
        self.allow=frappe.get_doc('MCP Doctype Allowlist',{'doctype_ref':'ToDo'})
        self.allow.allowed_fields_read=[]
        for f in ('name','description','status'):self.allow.append('allowed_fields_read',{'fieldname':f})
        self.allow.allowed_fields_write=[];self.allow.append('allowed_fields_write',{'fieldname':'description'})
        self.allow.allow_read=1;self.allow.allow_create=1;self.allow.save()
        self.addCleanup(frappe.set_user,'Administrator')
    def test_seed_idempotent(self):
        before={dt:frappe.db.count(dt) for dt in ('MCP Plugin','MCP Connector','MCP Skill','MCP Capability')};seed_records()
        self.assertEqual(before,{dt:frappe.db.count(dt) for dt in before})
    def test_auth_guest_denied(self):
        frappe.set_user('Guest')
        with self.assertRaises(frappe.PermissionError):authenticate()
    def test_native_ping_and_audit(self):
        out=execute('frappe__ping',{});self.assertEqual(out['status'],'ok')
        self.assertTrue(frappe.db.exists('MCP Execution Log',{'capability':'frappe__ping','status':'Success'}))
        self.assertTrue(frappe.db.exists('MCP Audit Log',{'tool_name':'ping'}))
    def test_plugin_disable_hides_and_blocks(self):
        self.assertTrue(any(c.tool_name=='frappe__ping' for c in active_capabilities()))
        frappe.db.set_value('MCP Plugin','بلجن Frappe','enabled',0)
        self.assertFalse(any(c.tool_name=='frappe__ping' for c in active_capabilities()))
        with self.assertRaises(frappe.PermissionError):execute('frappe__ping',{})
    def test_connector_disable_blocks(self):
        self.local.enabled=0;self.local.save()
        with self.assertRaises(frappe.PermissionError):execute('frappe__ping',{})
    def test_role_restriction(self):
        self.local.allowed_roles='MCP Role Which Is Not Assigned';self.local.save()
        self.assertFalse(any(c.tool_name=='frappe__ping' for c in active_capabilities()))
        with self.assertRaises(frappe.PermissionError):execute('frappe__ping',{})
    def test_write_default_is_hidden_and_blocked(self):
        self.assertFalse(any(c.tool_name=='frappe__create_doc' for c in active_capabilities()))
        with self.assertRaises(frappe.PermissionError):execute('frappe__create_doc',{'doctype':'ToDo','data':{'description':'Test'}})
    def test_write_explicitly_enabled(self):
        self.local.allow_writes=1;self.local.save();self.settings.expose_writes=1;self.settings.save()
        out=execute('frappe__create_doc',{'doctype':'ToDo','data':{'description':'MCP test write'}})
        self.assertEqual(out['description'],'MCP test write')
        self.assertNotIn('owner',out)
    def test_get_doc_projects_read_fields(self):
        todo=frappe.get_doc({'doctype':'ToDo','description':'MCP read'}).insert()
        out=execute('frappe__get_doc',{'doctype':'ToDo','name':todo.name})
        self.assertEqual(out['description'],'MCP read');self.assertNotIn('owner',out)
    def test_invalid_filter_operator_rejected(self):
        with self.assertRaises(frappe.PermissionError):api.search_docs('ToDo',filters={'name':['like','%']})
    def test_invalid_pagination(self):
        with self.assertRaises(Exception):api.search_docs('ToDo',page_length=0)
        with self.assertRaises(Exception):api.search_docs('ToDo',page_start=-1)
    def test_capability_schema_rejects_extra_args(self):
        with self.assertRaises(Exception):execute('frappe__ping',{'arbitrary_url':'https://example.com'})
        log=frappe.get_all('MCP Execution Log',filters={'capability':'frappe__ping','status':'Failed'},fields=['arguments_hash','error_code'],limit_page_length=1)
        self.assertTrue(log);self.assertEqual(len(log[0].arguments_hash),64)
    def test_skills_prompts_and_resources(self):
        skills=dispatch('tools/call',{'name':'central_list_skills','arguments':{}});rows=json.loads(skills['content'][0]['text']);self.assertGreaterEqual(len(rows),5)
        sid=rows[0]['id'];self.assertTrue(dispatch('prompts/get',{'name':sid})['messages'])
        self.assertTrue(dispatch('resources/read',{'uri':'alazab-skill://'+sid})['contents'])
        self.assertTrue(dispatch('tools/call',{'name':'central_get_skill','arguments':{'skill_id':'../../etc/passwd'}})['isError'])
    def test_disabled_skill_not_readable(self):
        skill=active_skills()[0];skill.enabled=0;skill.save()
        r=dispatch('tools/call',{'name':'central_get_skill','arguments':{'skill_id':skill.skill_id}});self.assertTrue(r['isError'])
    def test_plugin_details(self):
        r=dispatch('tools/call',{'name':'central_get_plugin','arguments':{'plugin_id':'frappe'}})
        data=json.loads(r['content'][0]['text']);self.assertIn('frappe__ping',data['tools'])
    def test_json_rpc_envelope(self):
        body={'jsonrpc':'2.0','id':42,'method':'initialize','params':{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'test','version':'1'}}}
        request=Request(EnvironBuilder(path=ENDPOINT,method='POST',json=body).get_environ())
        with patch.object(frappe.local,'request',request,create=True):
            r=handle();out=json.loads(r.get_data());self.assertEqual(out['id'],42);self.assertEqual(out['result']['serverInfo']['name'],'alazab-frappe-mcp');self.assertNotIn('message',out)
    def test_local_connection_test(self):
        result=test_connector(self.local.name);self.assertEqual(result['status'],'Success')
        self.assertTrue(frappe.db.exists('MCP Connection Test',result['test_id']))
    def test_resource_metadata(self):
        data=json.loads(resource_metadata().get_data());self.assertTrue(data['resource'].endswith(ENDPOINT));self.assertTrue(data['authorization_servers'])

    def test_rate_setting_is_enforced(self):
        from mcp_server.policy import rate_allowed
        import time
        self.settings.max_request_rate=1
        key=frappe.cache.make_key('mcp:rate:'+frappe.session.user+':'+str(int(time.time()//60)));frappe.cache.delete(key)
        self.assertTrue(rate_allowed(self.settings));self.assertFalse(rate_allowed(self.settings));frappe.cache.delete(key)

    def test_failed_operation_rolls_back_partial_writes(self):
        self.local.allow_writes=1;self.local.save();self.settings.expose_writes=1;self.settings.save()
        description='MCP rollback verification'
        def partial(**kwargs):
            frappe.get_doc({'doctype':'ToDo','description':description}).insert()
            raise ValueError('simulated business failure')
        with patch('mcp_server.api.create_doc',side_effect=partial):
            with self.assertRaises(ValueError):execute('frappe__create_doc',{'doctype':'ToDo','data':{'description':description}})
        self.assertFalse(frappe.db.exists('ToDo',{'description':description}))
        self.assertTrue(frappe.db.exists('MCP Execution Log',{'capability':'frappe__create_doc','status':'Failed'}))

    def test_ai_provider_payload_contracts(self):
        from mcp_server.engine import ai_generate
        cases=[('OpenAI','/responses',{'output':[{'content':[{'type':'output_text','text':'ok'}]}]}),('Anthropic','/messages',{'content':[{'type':'text','text':'ok'}]}),('Gemini','/models/test:generateContent',{'candidates':[{'content':{'parts':[{'text':'ok'}]}}]}),('OpenAI Compatible','/chat/completions',{'choices':[{'message':{'content':'ok'}}]}),('Azure OpenAI','/chat/completions',{'choices':[{'message':{'content':'ok'}}]})]
        for provider,path,response in cases:
            connector=frappe._dict(provider=provider,model='test')
            with patch('mcp_server.engine.request',return_value=response) as send:
                self.assertEqual(ai_generate(connector,{'prompt':'hello','max_tokens':32})['text'],'ok')
                self.assertEqual(send.call_args.args[1:3],('POST',path));body=send.call_args.args[3]['body'];self.assertNotIn('tools',body)


    def test_upgrade_preserves_registry_changes(self):
        from mcp_server.install import after_migrate
        skill=frappe.get_doc('MCP Skill',{'skill_id':'integration-inventory'});skill.instructions='تعليمات معدلة داخل الموقع';skill.save()
        cap=frappe.get_doc('MCP Capability',{'tool_name':'frappe__get_meta'});cap.enabled=0;cap.save()
        after_migrate()
        self.assertEqual(frappe.get_doc('MCP Skill',skill.name).instructions,'تعليمات معدلة داخل الموقع')
        self.assertEqual(frappe.get_doc('MCP Capability',cap.name).enabled,0)


    def test_native_document_permission_is_enforced(self):
        from frappe.model.document import Document
        todo=frappe.get_doc({'doctype':'ToDo','description':'permission test'}).insert()
        with patch.object(Document,'check_permission',side_effect=frappe.PermissionError('denied')):
            with self.assertRaises(frappe.PermissionError):execute('frappe__get_doc',{'doctype':'ToDo','name':todo.name})


    def test_explicit_read_only_post_connection_probe(self):
        connector=frappe.get_doc('MCP Connector',{'connector_id':'uberfix'})
        cap=frappe.get_doc('MCP Capability',{'tool_name':'uberfix__get_status'})
        connector.test_capability=cap.name;connector.test_arguments_json=json.dumps({'body':{'channel':'api','action':'get_status','client_name':'Unit Client','request_id':'unit-request'}});connector.save()
        with patch('mcp_server.management.request',return_value={'ok':True}) as send:
            out=test_connector(connector.name)
            self.assertEqual(out['status'],'Success');self.assertEqual(send.call_args.args[1],'POST')
