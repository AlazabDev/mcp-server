# Alazab Microsoft Foundry Inventory

Generated: 2026-09-22T04:13:36+03:00

## Scope

- Subscription
- Resource Group
- Foundry Resource
- Foundry Project
- ARM resources
- RBAC
- Model deployments
- Agents
- Agent versions
- Agent models
- Agent tools
- MCP references
- A2A references
- Connections
- Datasets
- Indexes
- Files
- Vector stores
- Memory stores
- Conversations
- Evaluators
- Evaluations
- Evaluation rules
- Evaluation taxonomies
- Insights
- Schedules
- Components
- Red teams
- Fine tuning
- Toolboxes
- Skills
- Agent endpoints / hosted-agent preview probes

## Counts

| Resource | Count |
|---|---:|
| Deployments | 13 |
| Agents | 13 |
| Connections | 14 |
| Agent Tools | 50 |
| Datasets | 42 |
| Indexes | 6 |
| Files | 17 |
| Vector Stores | 4 |
| Memory Stores | 2 |

## Agent -> Model

```
az-agent-codex	az-model-codex
az-agent-copilot	az-model-maint
az-agent-bim	az-model-sol
az-agent-maint	az-model-maint
az-agent-project	az-model-gpt
az-agent-core	az-model-core
az-agent-azabot	az-model-sol
az-agent-backend	az-model-core
az-agent-auth	az-model-maint
az-agent-prod	az-model-sol
az-agent-finance	az-model-finance
az-agent-payments	az-model-finance
az-agent-vision	az-model-core
```

## Agent Tools

```
az-agent-codex	web_search						
az-agent-codex	code_interpreter						
az-agent-copilot	web_search						
az-agent-copilot	mcp	kb-az-knowledgebase-da-8blqr	https://aisearchazabrgai136311.search.windows.net/knowledgebases/az-knowledgebase-daftra/mcp?api-version=2026-05-01-preview	kb-az-knowledgebase-da-8blqr			
az-agent-copilot	mcp	az-uberfix-mcp	https://az-ai-gateway.azure-api.net/tool-az-ai-gateway-alazab-com-mcp-uberfix-sse	az-uberfix-mcp			
az-agent-copilot	mcp	kb-az-knowledge-8blqr	https://aisearchazabrgai136311.search.windows.net/knowledgebases/az-knowledge/mcp?api-version=2026-08-01-preview	kb-az-knowledge-8blqr			
az-agent-copilot	memory_search_preview				MemoryStore-plum_neck_2z0xlv61b1		
az-agent-bim	web_search						
az-agent-bim	code_interpreter						
az-agent-bim	mcp	kb-az-knowledge-8blqr	https://aisearchazabrgai136311.search.windows.net/knowledgebases/az-knowledge/mcp?api-version=2026-08-01-preview	kb-az-knowledge-8blqr			
az-agent-bim	memory_search_preview				MemoryStore-stoic_boniato_wwq2jp4mqd		
az-agent-maint	web_search						
az-agent-maint	file_search					vs_NtF3dnVoiLkcK7rSoGm8GnZ3	
az-agent-maint	code_interpreter						
az-agent-maint	azure_ai_search						
az-agent-maint	mcp	AzureSpeechMCPServer	https://az-ai-resource.cognitiveservices.azure.com/speech/mcp?api-version=2025-11-07-preview	AzureSpeechMCPServer			
az-agent-maint	mcp	kb-az-knowledgebase-da-8blqr	https://aisearchazabrgai136311.search.windows.net/knowledgebases/az-knowledgebase-daftra/mcp?api-version=2026-05-01-preview	kb-az-knowledgebase-da-8blqr			
az-agent-maint	memory_search_preview				MemoryStore-plum_neck_2z0xlv61b1		
az-agent-maint	a2a_preview			/subscriptions/1363114a-a1d7-4abb-8042-dcdebf91e2c9/resourceGroups/azab-rg-ai/providers/Microsoft.CognitiveServices/accounts/az-ai-resource/projects/az-ai-gateway/connections/a2a-maint-to-prod			
az-agent-maint	mcp	UberFixMCP	https://az-ai-gateway.azure-api.net/tool-az-ai-gateway-zrrffsjbfkphridqyais-supabase-co-functions-v1-bot-gateway	UberFixMCP			UberFixMCP
az-agent-project	web_search						
az-agent-project	mcp	az-uberfix-mcp	https://az-ai-gateway.azure-api.net/tool-az-ai-gateway-alazab-com-mcp-uberfix-sse	az-uberfix-mcp			
az-agent-core	web_search						
az-agent-core	mcp	kb-az-knowledgebase-da-8blqr	https://aisearchazabrgai136311.search.windows.net/knowledgebases/az-knowledgebase-daftra/mcp?api-version=2026-05-01-preview	kb-az-knowledgebase-da-8blqr			
az-agent-core	memory_search_preview				MemoryStore-plum_neck_2z0xlv61b1		
az-agent-core	code_interpreter						
az-agent-azabot	code_interpreter						
az-agent-azabot	web_search						
az-agent-azabot	mcp	kb-az-knowledge-8blqr	https://aisearchazabrgai136311.search.windows.net/knowledgebases/az-knowledge/mcp?api-version=2026-05-01-preview	kb-az-knowledge-8blqr			
az-agent-azabot	azure_ai_search						
az-agent-azabot	memory_search_preview				MemoryStore-plum_neck_2z0xlv61b1		
az-agent-backend	web_search						
az-agent-backend	code_interpreter						
az-agent-backend	mcp	AzureSpeechMCPServer	https://az-ai-resource.cognitiveservices.azure.com/speech/mcp?api-version=2025-11-07-preview	AzureSpeechMCPServer			
az-agent-backend	mcp	kb-az-knowledge-8blqr	https://aisearchazabrgai136311.search.windows.net/knowledgebases/az-knowledge/mcp?api-version=2026-05-01-preview	kb-az-knowledge-8blqr			
az-agent-backend	memory_search_preview				MemoryStore-plum_neck_2z0xlv61b1		
az-agent-auth	web_search						
az-agent-auth	mcp	kb-az-knowledge-8blqr	https://aisearchazabrgai136311.search.windows.net/knowledgebases/az-knowledge/mcp?api-version=2026-05-01-preview	kb-az-knowledge-8blqr			
az-agent-auth	memory_search_preview				MemoryStore-plum_neck_2z0xlv61b1		
az-agent-prod	code_interpreter						
az-agent-prod	azure_ai_search						
az-agent-prod	a2a_preview			/subscriptions/1363114a-a1d7-4abb-8042-dcdebf91e2c9/resourceGroups/azab-rg-ai/providers/Microsoft.CognitiveServices/accounts/az-ai-resource/projects/az-ai-gateway/connections/a2a-prod-to-maint			
az-agent-prod	web_search						
az-agent-prod	file_search					vs_UKxWQVCZOQUAhlOOLRnMrAZ4	
az-agent-prod	mcp	kb-az-knowledge-8blqr	https://aisearchazabrgai136311.search.windows.net/knowledgebases/az-knowledge/mcp?api-version=2026-05-01-preview	kb-az-knowledge-8blqr			
az-agent-prod	memory_search_preview				MemoryStore-plum_neck_2z0xlv61b1		
az-agent-finance	web_search						
az-agent-payments	web_search						
az-agent-payments	code_interpreter						
az-agent-vision	web_search						
```

## Unused Deployments

```
az-model-gemma
az-model-mini
az-model-sora
az-models-text
gpt-4o
gpt-5.1
```

## Missing Model References

```

```

## Duplicate Deployment Names

```
az-model-gemma
```

## Duplicate Model Deployments

```
google--gemma-4-31b-it|5	2	 az-model-gemma az-model-gemma
gpt-5.1|2025-11-13	2	 az-model-maint gpt-5.1
```

## Endpoint Status

```
resource               path                   feature                   http_status
deployments            deployments            none                      200
agents                 agents                 none                      200
connections            connections            none                      200
datasets               datasets               none                      200
indexes                indexes                none                      200
files                  files                  none                      200
vector_stores          vector_stores          none                      200
memory_stores          memory_stores          MemoryStores=V1Preview    200
evaluators             evaluators             none                      400
evals                  evals                  none                      404
evaluation_taxonomies  evaluation_taxonomies  none                      404
evaluation_rules       evaluation_rules       none                      404
insights               insights               none                      400
conversations          conversations          none                      200
schedules              schedules              none                      400
components             components             none                      404
redteams               redteams               none                      404
fine_tuning            fine_tuning            none                      404
fine_tuning_jobs       fine_tuning/jobs       none                      200
toolboxes              toolboxes              Toolboxes=V1Preview       200
skills                 skills                 Skills=V1Preview          200
agent_endpoints        agent_endpoints        AgentEndpoints=V1Preview  404
hosted_agents          agents                 HostedAgents=V1Preview    200
```
