"""Offline tests require no database. pytest tests/test_catalog_http.py"""
import json
from pathlib import Path
import httpx,pytest
from jsonschema import Draft202012Validator
from mcp_server.net import request,validate_url
ROOT=Path(__file__).resolve().parents[1]
SEED=json.loads((ROOT/'mcp_server/assets/seed.json').read_text())
class Connector(dict):
    __getattr__=dict.__getitem__
    def get_password(self,*args,**kwargs):return self.get('credential')
@pytest.mark.parametrize('cap',SEED['capabilities'],ids=lambda c:c['tool_name'])
def test_supplied_capability_schema(cap):
    Draft202012Validator.check_schema(json.loads(cap['input_schema']))
    assert len(cap['tool_name'])<=64

def test_catalog_unique_and_complete():
    assert len(SEED['plugins'])==13 and len(SEED['connectors'])==18
    assert len({c['tool_name'] for c in SEED['capabilities']})==len(SEED['capabilities'])
    assert len(SEED['skills'])==5

def test_exact_request_and_header_no_redirects():
    c=Connector(base_url='https://service.example/v1',auth_scheme='Bearer',credential='secret',headers_json='{}',default_params_json='{"account":"a"}',timeout_seconds=10)
    def handler(r):
        assert str(r.url)=='https://service.example/v1/accounts/a/items?limit=2'
        assert r.headers['authorization']=='Bearer secret'
        assert json.loads(r.content)=={'name':'test'}
        return httpx.Response(200,json={'ok':True})
    assert request(c,'POST','/accounts/{account}/items',{'query':{'limit':2},'body':{'name':'test'}},transport=httpx.MockTransport(handler))=={'ok':True}
@pytest.mark.parametrize('url',['https://user:pass@example.com','https://example.com#fragment','https://example.com?key=secret'])
def test_invalid_connection_urls(url):
    with pytest.raises(ValueError):validate_url(url)
@pytest.mark.parametrize('status',[301,401,403,429,500])
def test_upstream_errors_not_success(status):
    c=Connector(base_url='https://example.com',auth_scheme='None',headers_json='{}',default_params_json='{}',timeout_seconds=10)
    with pytest.raises(ValueError):request(c,'GET','/x',transport=httpx.MockTransport(lambda r:httpx.Response(status,json={'message':'error'})))
def test_size_bound():
    c=Connector(base_url='https://example.com',auth_scheme='None',headers_json='{}',default_params_json='{}',timeout_seconds=10)
    with pytest.raises(ValueError):request(c,'GET','/x',max_bytes=10,transport=httpx.MockTransport(lambda r:httpx.Response(200,content=b'x'*20)))
def test_read_only_uberfix_action_is_constrained():
    c=next(c for c in SEED['capabilities'] if c['tool_name']=='uberfix__get_status');schema=json.loads(c['input_schema'])
    assert c['read_only']==1
    assert not Draft202012Validator(schema).is_valid({'body':{'action':'cancel'}})


def test_original_backup_reader_is_accessible():
    from mcp_server.backup import execute
    out=execute('inventory',{})
    assert out['live'] is False and out['inventory']['total_rows']==4862
    query=execute('query',{'table':'Products.csv','limit':2})
    assert len(query['rows'])==2 and query['total_matches']==3256
    with pytest.raises(ValueError):execute('query',{'table':'../.env'})
