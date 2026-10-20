import os
from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
server=FastMCP('test-upstream',host='127.0.0.1',port=int(os.environ['FIXTURE_PORT']),stateless_http=True,json_response=True)
@server.tool(annotations=ToolAnnotations(readOnlyHint=True))
def echo(value:str)->str:return value
@server.tool(annotations=ToolAnnotations(readOnlyHint=False))
def change(value:str)->str:return value
if __name__=='__main__':server.run(transport='streamable-http')
