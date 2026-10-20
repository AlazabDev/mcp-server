"""Fixed-connector HTTP calls; request arguments never select credentials or origins."""
import json,re
from urllib.parse import quote,urlsplit
import httpx

def validate_url(url):
    p=urlsplit(url)
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password or p.query or p.fragment:raise ValueError('Invalid service base URL')
    return url

def request(connector,method,path='',arguments=None,content_type='application/json',max_bytes=2000000,transport=None):
    validate_url(connector.base_url)
    args=arguments or {};params=dict(args.get('path_params',{}))
    defaults=json.loads(connector.get('default_params_json') or '{}');params={**defaults,**params}
    for key in re.findall(r'\{([^}]+)\}',path):
        if key not in params:raise ValueError('Missing path parameter: '+key)
        value=str(params[key])
        if value in ('.','..'):raise ValueError('Invalid path parameter')
        path=path.replace('{'+key+'}',quote(value,safe=''))
    if path and (not path.startswith('/') or path.startswith('//') or '://' in path):raise ValueError('Invalid operation path')
    query={}
    for k,v in args.get('query',{}).items():
        if isinstance(v,dict):raise ValueError('Nested query object unsupported')
        if isinstance(v,bool):v=str(v).lower()
        query[k]=v
    headers=json.loads(connector.get('headers_json') or '{}')
    credential=connector.get_password('credential',raise_exception=False) if connector.get('credential') else None
    scheme=connector.get('auth_scheme')
    if scheme!='None' and not credential:raise ValueError('Connection credential is missing')
    if scheme=='Bearer':headers['Authorization']='Bearer '+credential
    elif scheme=='Frappe Token':headers['Authorization']='token '+credential
    elif scheme=='API Key':headers[connector.get('auth_header') or 'apikey']=credential
    payload={}
    if 'body' in args:
        if content_type=='application/json':payload['json']=args['body']
        elif content_type=='application/x-www-form-urlencoded':payload['data']=args['body']
        else:raise ValueError('Unsupported content type')
    with httpx.Client(timeout=int(connector.get('timeout_seconds') or 30),follow_redirects=False,transport=transport) as client:
        with client.stream(method,connector.base_url.rstrip('/')+path,params=query,headers=headers,**payload) as response:
            if not 200<=response.status_code<300:raise ValueError('UPSTREAM_HTTP_'+str(response.status_code))
            data=bytearray()
            for chunk in response.iter_bytes():
                data.extend(chunk)
                if len(data)>max_bytes:raise ValueError('UPSTREAM_RESPONSE_TOO_LARGE')
    obj=json.loads(data) if data else {}
    if isinstance(obj,dict) and (obj.get('error') or obj.get('exc') or obj.get('success') is False):raise ValueError('UPSTREAM_REPORTED_ERROR')
    return obj
