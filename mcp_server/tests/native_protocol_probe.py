import asyncio,json,threading,socket,base64,hashlib,secrets,os,subprocess,sys,time
from unittest.mock import patch
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import httpx
from werkzeug.serving import make_server
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
import frappe
from mcp_server.transport import ENDPOINT

def check():
    if not frappe.flags.in_test:raise RuntimeError('Run only in a dedicated Frappe test context')
    frappe.set_user('Administrator')
    # Local upstream fixture, no live third-party account or message.
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));upstream_port=sock.getsockname()[1]
    fixture=Path(__file__).resolve().parents[2]/'tests/remote_fixture.py'
    fixture_log=open('/tmp/native-upstream.log','w')
    upstream=subprocess.Popen([sys.executable,str(fixture)],env=os.environ|{'FIXTURE_PORT':str(upstream_port)},stdout=fixture_log,stderr=fixture_log)
    for _ in range(100):
        try:
            with httpx.Client(trust_env=False) as http:http.get(f'http://127.0.0.1:{upstream_port}/mcp',timeout=.2)
            break
        except httpx.HTTPError:time.sleep(.05)
    frappe.db.delete('MCP Capability',{'connector':'Native test remote'})
    frappe.db.delete('MCP Connector',{'connector_id':'native_remote'})
    connector=frappe.get_doc({'doctype':'MCP Connector','title':'Native test remote','connector_id':'native_remote','plugin':'بلجن Frappe','kind':'Remote MCP','base_url':f'http://127.0.0.1:{upstream_port}/mcp','auth_scheme':'None','enabled':1,'timeout_seconds':10}).insert(ignore_permissions=True)
    from mcp_server.management import sync_remote_tools
    with patch.dict(os.environ,{key:'' for key in ('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy')}):
        synced=sync_remote_tools(connector.name)
    assert synced['discovered']==2

    user=frappe.get_doc('User','Administrator');user.api_key='native-test-api-key';user.api_secret='native-test-api-secret';user.save(ignore_permissions=True)
    settings=frappe.get_single('MCP Server Settings');settings.max_request_rate=600;settings.save()
    client=frappe.get_doc({'doctype':'OAuth Client','app_name':'MCP Native PKCE Test','redirect_uris':'http://localhost/callback','default_redirect_uri':'http://localhost/callback','scopes':'all openid','grant_type':'Authorization Code','response_type':'Code','token_endpoint_auth_method':'None','skip_authorization':1,'allowed_roles':[{'role':'System Manager'}]}).insert(ignore_permissions=True)
    client_id=client.client_id;frappe.db.commit()
    from frappe import app as frappe_app
    previous_site=frappe_app._site;frappe_app._site=frappe.local.site
    server=make_server('127.0.0.1',0,frappe_app.application);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base='http://127.0.0.1:'+str(server.server_port)
    settings.public_url=base;settings.save();frappe.db.commit()
    async def run():
        async with httpx.AsyncClient(trust_env=False,timeout=30,follow_redirects=False) as http:
            r=await http.get(base+'/api/method/mcp_server.transport.resource_metadata');assert r.status_code==200,r.text;assert r.json()['authorization_servers']
            r=await http.post(base+ENDPOINT,json={'jsonrpc':'2.0','id':1,'method':'ping'});assert r.status_code==401 and 'resource_metadata' in r.headers.get('www-authenticate',''),r.text
            verifier=secrets.token_urlsafe(48);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
            r=await http.get(base+'/api/method/frappe.integrations.oauth2.authorize',params={'response_type':'code','client_id':client_id,'redirect_uri':'http://localhost/callback','scope':'all openid','state':'native-test','code_challenge':challenge,'code_challenge_method':'S256'},headers={'Authorization':'token native-test-api-key:native-test-api-secret'})
            assert r.status_code in (301,302,303),r.text[:600]
            params=parse_qs(urlparse(r.headers['location']).query);assert 'code' in params,params
            r=await http.post(base+'/api/method/frappe.integrations.oauth2.get_token',data={'grant_type':'authorization_code','client_id':client_id,'code':params['code'][0],'redirect_uri':'http://localhost/callback','code_verifier':verifier})
            assert r.status_code==200,r.text[:800];body=r.json();token=body.get('access_token') or body.get('message',{}).get('access_token');assert token,body
        async with httpx.AsyncClient(trust_env=False,timeout=30,headers={'Authorization':'Bearer '+token}) as http:
            async with streamable_http_client(base+ENDPOINT,http_client=http) as streams:
                async with ClientSession(streams[0],streams[1]) as session:
                    result=await session.initialize();assert result.serverInfo.name=='alazab-frappe-mcp'
                    tools=await session.list_tools();names={t.name for t in tools.tools};assert 'central_list_skills' in names and 'daftra_backup__query' in names;assert 'frappe__create_doc' not in names
                    r=await session.call_tool('frappe__ping',{});assert not r.isError,r.content
                    r=await session.call_tool('central_list_skills',{});assert not r.isError;assert len(json.loads(r.content[0].text))==5
                    r=await session.call_tool('central_get_skill',{'skill_id':'daftra-backup'});assert not r.isError;assert 'daftra_backup__query' in r.content[0].text
                    r=await session.call_tool('daftra_backup__query',{'table':'Products.csv','limit':1});assert not r.isError;assert len(json.loads(r.content[0].text)['rows'])==1
                    r=await session.call_tool('frappe__create_doc',{'doctype':'ToDo','data':{'description':'should not execute'}});assert r.isError
                    r=await session.call_tool('native_remote__echo',{'value':'native-proxy-ok'});assert not r.isError;assert 'native-proxy-ok' in r.content[0].text
                    r=await session.call_tool('native_remote__change',{'value':'blocked'});assert r.isError
                    prompts=await session.list_prompts();assert len(prompts.prompts)==5
                    resources=await session.list_resources();assert len(resources.resources)==5
                    prompt=await session.get_prompt('daftra-backup');assert prompt.messages
        print('NATIVE_HTTP_MCP_AND_OAUTH_PKCE: PASS (metadata, anonymous rejection, authorization-code S256, bearer identity, official MCP client, skills, backup data, write denial, remote MCP discovery/proxy, prompts, resources)',flush=True)
    try:
        with patch.dict(os.environ,{key:'' for key in ('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy')}):asyncio.run(run())
    finally:
        server.shutdown();thread.join(timeout=5);frappe_app._site=previous_site;upstream.terminate()
        try:upstream.wait(timeout=5)
        except subprocess.TimeoutExpired:upstream.kill();upstream.wait()
        fixture_log.close()
