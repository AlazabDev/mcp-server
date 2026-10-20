"""Compile the supplied API descriptions into validated MCP operation definitions."""
import hashlib
import json
import re
from pathlib import Path

METHODS={'get','post','put','patch','delete','head'}

def name_for(connector, operation):
    name=re.sub('[^a-zA-Z0-9_-]','_',connector+'__'+operation)
    return name if len(name)<=64 else name[:51]+'_'+hashlib.sha256(name.encode()).hexdigest()[:12]

def resolve(obj,doc,stack=()):
    if isinstance(obj,list):return [resolve(x,doc,stack) for x in obj]
    if not isinstance(obj,dict):return obj
    if '$ref' in obj:
        ref=obj['$ref']
        if not ref.startswith('#/'):raise ValueError('External OpenAPI references are not supported')
        if ref in stack:return {}  # finite validation boundary for recursive schemas
        value=doc
        for part in ref[2:].split('/'):value=value[part.replace('~1','/').replace('~0','~')]
        return resolve(value,doc,stack+(ref,))
    out={k:resolve(v,doc,stack) for k,v in obj.items()}
    if out.pop('nullable',False) and isinstance(out.get('type'),str):out['type']=[out['type'],'null']
    # OpenAPI metadata is not an executable JSON Schema validator extension.
    for key in ('example','xml','discriminator','externalDocs'):out.pop(key,None)
    return out

def normalize_schema(value):
    if isinstance(value,list):return [normalize_schema(v) for v in value]
    if not isinstance(value,dict):return value
    out={k:normalize_schema(v) for k,v in value.items() if k not in ('example','examples','xml')}
    for key in ('minLength','maxLength','minItems','maxItems','minProperties','maxProperties'):
        if key in out and isinstance(out[key],str) and out[key].isdigit():out[key]=int(out[key])
    for key in ('minimum','maximum','multipleOf'):
        if key in out and isinstance(out[key],str):
            try:out[key]=float(out[key])
            except ValueError:pass
    if out.pop('nullable',False) and isinstance(out.get('type'),str):out['type']=[out['type'],'null']
    return out

def schema_for(params,body=None):
    groups={}
    for p in params:
        location=p.get('in')
        if location not in {'path','query'}:continue
        g=groups.setdefault(location,{'type':'object','properties':{},'additionalProperties':False})
        field=p['name'];g['properties'][field]=p.get('schema',{'type':'string'})
        if p.get('required'):g.setdefault('required',[]).append(field)
    props={};required=[]
    for group,schema in groups.items():
        key='path_params' if group=='path' else 'query';props[key]=schema
        if schema.get('required'):required.append(key)
    if body:
        props['body']=body.get('schema',{})
        if body.get('required'):required.append('body')
    out={'type':'object','properties':props,'additionalProperties':False}
    if required:out['required']=required
    return normalize_schema(out)

def is_write(method,path):
    return method not in {'GET','HEAD'} or bool(re.search(r'update_|convert_to_|activate|/(?:lock|unlock|delete|archive|restore)(?:/|$)',path,re.I))

def load_operations(root,config):
    ops={}
    if config['type']=='daftra':
        for row in json.loads((root/config['catalog']).read_text()):
            params=[{'name':p['n'],'in':p['in'],'required':p.get('r',False),'schema':p.get('schema',{'type':'string'})} for p in row.get('params',[])]
            params=[p for p in params if p['name']!='format']
            content=row.get('body') or {}
            mime='application/json' if 'application/json' in content else next(iter(content),'application/json')
            b={'schema':content[mime].get('schema',{}),'required':False} if content and row['m'] not in ('GET','HEAD') else None
            if row['p']=='/v2/oauth/token':mime='application/x-www-form-urlencoded'
            path=row['p'].replace('{format}','.json')
            if not path.startswith('/v2/'):path='/api2'+path
            ops[row['id']]={'id':row['id'],'method':row['m'],'path':path,'description':row.get('s') or row.get('t') or row['id'],
                'category':row.get('module'),'schema':schema_for(params,b),'content_type':mime,'supported':row['m'] in ('GET','HEAD') or mime in ('application/json','application/x-www-form-urlencoded'),'write':is_write(row['m'],path)}
    elif config['type']=='openapi':
        for filename in config['specs']:
            doc=json.loads((root/filename).read_text())
            for path,item in doc['paths'].items():
                for method,raw in item.items():
                    if method not in METHODS:continue
                    o=resolve(raw,doc);params=resolve(item.get('parameters',[]),doc)+o.get('parameters',[])
                    oid=o.get('operationId') or method+'_'+re.sub('[^a-zA-Z0-9]+','_',path).strip('_')
                    if oid in ops:raise ValueError('Duplicate operation ID: '+oid)
                    rb=o.get('requestBody',{});content=rb.get('content',{})
                    mime='application/json' if 'application/json' in content else next(iter(content),'application/json')
                    body={'schema':content[mime].get('schema',{}),'required':rb.get('required',False)} if content else None
                    ops[oid]={'id':oid,'method':method.upper(),'path':path,'description':o.get('summary') or o.get('description') or oid,
                        'schema':schema_for(params,body),'content_type':mime,'write':is_write(method.upper(),path),
                        'supported':mime in {'application/json','application/x-www-form-urlencoded'}}
    elif config['type']=='frappe':
        # Native Frappe REST; no dependency on the reviewed mcp_server addon.
        definitions=[
          ('ping','GET','/api/method/frappe.ping',[],None),
          ('list_documents','GET','/api/resource/{doctype}',[
            {'name':'doctype','in':'path','required':True,'schema':{'type':'string'}},
            *[{'name':n,'in':'query','schema':s} for n,s in {'fields':{'type':'array','items':{'type':'string'}},'filters':{'type':['array','object']},'limit_page_length':{'type':'integer','minimum':1,'maximum':100},'limit_start':{'type':'integer','minimum':0},'order_by':{'type':'string'}}.items()]],None),
          ('get_document','GET','/api/resource/{doctype}/{name}',[],None),
          ('create_document','POST','/api/resource/{doctype}',[],{'schema':{'type':'object'},'required':True}),
          ('update_document','PUT','/api/resource/{doctype}/{name}',[],{'schema':{'type':'object'},'required':True}),
          ('delete_document','DELETE','/api/resource/{doctype}/{name}',[],None),
        ]
        for oid,method,path,params,body in definitions:
            existing={p['name'] for p in params}
            for field in re.findall(r'\{([^}]+)\}',path):
                if field not in existing:params.append({'name':field,'in':'path','required':True,'schema':{'type':'string','minLength':1}})
            ops[oid]={'id':oid,'method':method,'path':path,'description':'Frappe: '+oid,'schema':schema_for(params,body),'content_type':'application/json','write':is_write(method,path)}
    return ops
