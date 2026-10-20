# magicplan-mcp

MCP server (stdio) that exposes live Disneyland Paris data to AI assistants: Disney characters, queue wait times, weather, and a composite visit planner.

## About this project

This is a **recreational, for-fun learning project** (portfolio / MCP + TypeScript on Node). It is **not** a commercial product, **not** affiliated with The Walt Disney Company, Disneyland Paris, or any official Disney entity, and **not** endorsed by Disney in any way. Disney character names and park references are used only to exercise real public APIs in a familiar domain.

The repo includes a fictional [**project charter**](./docs/project_charter.md) (**FantasyTrips S.r.l.** and related names are **invented**). It describes a **hypothetical** client brief: a boutique tour operator wants to extend an internal AI assistant so agents can answer families **already in the park** without opening five different sites. **No real client commissioned this work** - the charter exists to give the build a realistic scope (characters, waits, weather, visit planning), not to document an actual engagement.

`magicplan-mcp` is the technical answer to that imagined request: one stdio MCP server, five tools, public data sources only.

> **Disclaimer:** Use at your own risk. Wait times, weather, and character data come from third-party APIs and may be incomplete or outdated. Always rely on official park apps and on-site signage for decisions that affect safety or your visit.

## What problem it solves (hypothetical scenario)

In the fictional brief, park guests - and customer-service agents behind an AI assistant - often ask:

- Who is this character, and where can we see them in the park?
- How long is the wait for a specific ride right now?
- Is it raining? Should we stay outdoors?
- We love Elsa and Remy - what can we do in under 30 minutes?

This server does **not** replace the official Disney app. It **aggregates public APIs** behind five MCP tools so Claude (or another MCP client) can call structured functions instead of guessing.

## Stack

- Node.js + TypeScript (ESM, `NodeNext`)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [Zod](https://zod.dev/) for tool input schemas
- [disneyapi.dev](https://disneyapi.dev/) - characters (no API key)
- [queue-times.com](https://queue-times.com/) - live waits (no API key)
- [OpenWeatherMap](https://openweathermap.org/) - forecast near the park (free tier, API key required)

## Prerequisites

- **Node.js** 20+ (developed on Node 22)
- **pnpm** ([install](https://pnpm.io/installation))
- An MCP-capable client (e.g. [Claude Code](https://code.claude.com/docs/en/overview), [Claude Desktop](https://claude.ai/download))
- **OpenWeatherMap API key** - [sign up](https://home.openweathermap.org/users/sign_up), then create a key under [API keys](https://home.openweathermap.org/api_keys)

## Setup

1. **Clone** the repository and install dependencies:

   ```bash
   git clone https://github.com/PierluigiBarocci/magicplan-mcp.git
   cd magicplan-mcp
   pnpm install
   ```

2. **Environment variables** - copy the example file and add your weather key:

   ```bash
   cp .env.example .env
   ```

3. **Build** the server:

   ```bash
   pnpm build
   ```

## Connect to an MCP client

### Claude Code (terminal)

After `pnpm build`, open a terminal in the project root and start [Claude Code](https://code.claude.com/docs/en/overview):

```bash
claude
```

This repo includes a minimal project-level [`.mcp.json`](./.mcp.json) that points at the compiled server (`node dist/index.js`). Claude Code picks it up when you run the CLI from this directory. The first time you use project-scoped servers, the CLI may ask you to approve them — see **[Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)**.

To register the server without relying on the checked-in file (for example from another working directory), use an absolute path:

```bash
claude mcp add magicplan-mcp -- node /absolute/path/to/magicplan-mcp/dist/index.js
```

### Claude Desktop

Follow the official guide:

**[Build an MCP server → Testing your server with Claude for Desktop](https://modelcontextprotocol.io/docs/develop/build-server#testing-your-server-with-claude-for-desktop-2)**

## Available tools

| Tool                        | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `search_character`          | Full character profile (films, TV, park attractions)          |
| `get_character_attractions` | Park attractions only for one character                       |
| `get_park_wait_times`       | Live queue times (Disneyland Park + Walt Disney Studios)      |
| `get_park_weather`          | Weather / short forecast at fixed park coordinates            |
| `plan_visit`                | Composite: characters + waits + optional rain → indoor filter |

### Example queries

**`search_character`**

- _"I need a full overview of Goofy; not just rides, also films and TV."_
- _"Using live character data, who is Moana and where does she appear in the parks?"_

**`get_character_attractions`**

- _"Which park attractions feature Elsa?"_
- _"Where can I see Goofy in the park?"_

**`get_park_wait_times`**

- _"Shortest waits at Disneyland Paris right now."_
- _"How long is the wait for Indiana Jones?"_
- _"Longest queues in Disney Adventure World."_

**`get_park_weather`**

- _"Is it raining at Disneyland Paris right now?"_
- _"Weather forecast for the rest of today at the park."_

**`plan_visit`**

- _"Do I need an umbrella at Disneyland Paris today? Plan our day for Mickey and Anna fans, max 25 minutes per ride."_
- _"Plan our day for Frozen and Ratatouille fans, max 30 minutes wait."_
- _"Suggest Elsa-related rides under 25 minutes; consider the weather."_

## How it works

1. The MCP client starts `magicplan-mcp` as a **stdio** subprocess and speaks JSON-RPC.
2. Each **tool** is a function with a Zod `inputSchema` and a long **description** so the model picks the right tool.
3. **Atomic tools** call one external API each (`characters`, `waitTimes`, `weather`).
4. **`plan_visit`** orchestrates several steps in one place:
   - Fetches character `parkAttractions` from disneyapi.dev for each name in `characterNames`.
   - Fetches live rides from queue-times.com for **both** Paris parks.
   - **Joins** Disney names to queue-times names with fuzzy substring matching (names rarely match exactly).
   - Keeps rides that are open, under `maxWaitMinutes`, and not Single Rider lines.
   - If `weatherAware` is true (default) and the current forecast suggests rain, keeps only attractions marked **indoor** in [`src/data/attractionsMetaData.ts`](./src/data/attractionsMetaData.ts) (hand-curated; queue-times does not provide indoor/outdoor).
   - Returns a text list sorted by shortest wait.

## Project layout

```
src/
├── index.ts              # MCP server + tool registration
├── tools/
│   ├── characters.ts
│   ├── waitTimes.ts
│   ├── weather.ts
│   └── planVisit.ts
├── data/
│   └── attractionsMetaData.ts
└── utils/
    ├── constants.ts
    └── env.ts
```

## Scripts

| Command       | Description          |
| ------------- | -------------------- |
| `pnpm dev`    | Run with `tsx watch` |
| `pnpm build`  | Compile to `dist/`   |
| `pnpm start`  | Run compiled server  |
| `pnpm lint`   | ESLint               |
| `pnpm format` | Prettier write       |

## Limitations

- **Disneyland Paris only** (fixed weather coordinates; park IDs for queue-times).
- **disneyapi.dev** coverage is incomplete (e.g. some characters like Buzz Lightyear may be missing).
- **Weather** uses 3-hour forecast slots; `horizon: now` is the nearest slot, not minute-level current weather.
- **Indoor/outdoor** in `plan_visit` is a static map, not live park data.
- **English** tool descriptions and queries work best in this version.

## License

ISC
