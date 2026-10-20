import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  getCharacterInfo,
  getCharacterAttractions,
  validateAPIResponse,
  searchCharacter,
  searchCharacterInputSchema,
} from './tools/characters.js';
import {
  formatRideText,
  getParkWaitTimes,
  getParkWaitTimesInputSchema,
  orderRidesByWaitTime,
  resolveParks,
} from './tools/waitTimes.js';
import { getParkWeatherInputSchema, getParkWeather } from './tools/weather.js';
import {
  formatPlanVisit,
  planVisit,
  planVisitInputSchema,
} from './tools/planVisit.js';

// Create server instance
const mcpServer = new McpServer({
  name: 'magicplan-mcp',
  version: '1.0.0',
  description:
    'MCP-powered extraction and organization of Disneyland Paris visit data using live wait times, character, and weather APIs.',
});

// Register character tool to search for a character by name
mcpServer.registerTool(
  'search_character',
  {
    description: `Look up a Disney character profile by name (disneyapi.dev). Use when the user wants a full overview: who the character is, which films and TV shows they appear in, or asks "tell me about X" / "who is X". Returns: name, films, tvShows, parkAttractions. Input: English character name (e.g. "Elsa", "Mickey Mouse"); partial names may not match. Do NOT use when the user only wants a list of park attractions; use get_character_attractions instead. Do NOT use for wait times, weather, or park maps.`,
    inputSchema: searchCharacterInputSchema,
  },
  async ({ name }) => {
    const characterData = await searchCharacter(name);
    const isCharacterNotFound = validateAPIResponse(characterData);

    if (isCharacterNotFound) {
      return {
        content: [
          {
            type: 'text',
            text: `No character found for "${name}"`,
          },
        ],
        isError: true,
      };
    }

    const character = getCharacterInfo(characterData!, name);

    const characterText = `Character: ${character.name}\n\nFilms: ${character.films.join('\n')}\n\nTV Shows: ${character.tvShows.join('\n')}\n\nPark Attractions: ${character.parkAttractions.join('\n')}`;

    return {
      content: [
        {
          type: 'text',
          text: characterText,
        },
      ],
    };
  },
);

// Register attractions tool to list theme park attractions featuring a Disney character
mcpServer.registerTool(
  'get_character_attractions',
  {
    description: `List theme park attractions featuring a Disney character (disneyapi.dev). Use when the user asks ONLY about park attractions, rides, shows, or parades for a character — e.g. "Which park attractions feature Elsa?", "What attractions is Mickey in?", "Where can I see Goofy in the park?". Returns: character name and parkAttractions only (no films or TV). Input: English character name, not a film title (map "Frozen" → "Elsa" or "Anna" first). Do NOT use for full character bios; use search_character instead. Do NOT use for wait times or weather.`,
    inputSchema: searchCharacterInputSchema,
  },
  async ({ name }) => {
    const characterData = await searchCharacter(name);
    const isCharacterNotFound = validateAPIResponse(characterData);

    if (isCharacterNotFound) {
      return {
        content: [
          {
            type: 'text',
            text: `No character found for "${name}"`,
          },
        ],
        isError: true,
      };
    }

    const { name: characterName, attractions } = getCharacterAttractions(
      characterData!,
      name,
    );

    if (attractions.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No attractions found for "${characterName}"`,
          },
        ],
      };
    }

    const attractionsText = `Character: ${characterName}\n\nPark Attractions: ${attractions.join('\n')}`;

    return {
      content: [
        {
          type: 'text',
          text: attractionsText,
        },
      ],
    };
  },
);

// Register wait times tool to get live queue wait times for Disneyland Paris parks
mcpServer.registerTool(
  'get_park_wait_times',
  {
    description:
      'Get live queue wait times for Disneyland Paris parks via queue-times.com. Use when the user asks how long the wait is, current queue times, or the shortest lines - for a whole park, both parks, or one attraction (e.g. "How long is Indiana Jones?", "Wait times at the main park?", "Shortest waits right now?"). Returns: attraction name, wait minutes, park and land. Input park: disneyland (main park), adventure (Disney Adventure World), or both (default). Optional attractionName: partial English name for a single ride (e.g. "Indiana Jones", "Crush"). Do NOT use for Disney character info or park attraction lists by character; use search_character or get_character_attractions. Do NOT use for weather.',
    inputSchema: getParkWaitTimesInputSchema,
  },
  async ({ park, attractionName, sort }) => {
    const parks = await resolveParks(park);
    const waitTimes = await getParkWaitTimes(parks);

    if (waitTimes === null || waitTimes.length === 0) {
      return {
        content: [
          { type: 'text', text: 'No wait time data available right now.' },
        ],
        isError: true,
      };
    }

    const TOP_N = attractionName ? 3 : 10;

    const rides = attractionName
      ? waitTimes.filter((w) =>
          w.name.toLowerCase().includes(attractionName.toLowerCase()),
        )
      : waitTimes;

    if (attractionName && rides.length === 0) {
      return {
        content: [
          { type: 'text', text: `No attraction found for "${attractionName}"` },
        ],
      };
    }

    const topRides = orderRidesByWaitTime(rides, TOP_N, sort ?? 'shortest');

    if (topRides.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: attractionName
              ? `No open attractions matching "${attractionName}" with a wait time right now.`
              : 'No open attractions with a wait time right now.',
          },
        ],
      };
    }

    const header = attractionName
      ? `Matches for "${attractionName}" (top ${TOP_N}, open only):\n\n`
      : `Shortest waits (top ${TOP_N}, open attractions only):\n\n`;
    const text = header + topRides.map(formatRideText).join('\n');

    return {
      content: [{ type: 'text', text }],
    };
  },
);

// Register weather tool to get weather conditions for Disneyland Paris
mcpServer.registerTool(
  'get_park_weather',
  {
    description:
      'Weather at Disneyland Paris (openweathermap.org, fixed location). Use for temperature, rain, and short-term forecast at the park. Returns °C, conditions, rain %, raining yes/no (and 3h slots for longer ranges). Input horizon: now (default), next_6h, today, tomorrow. Do NOT use for wait times (get_park_wait_times) or characters (search_character / get_character_attractions).',
    inputSchema: getParkWeatherInputSchema,
  },
  async ({ horizon }) => {
    const weather = await getParkWeather(horizon ?? 'now');
    if (!weather) {
      return {
        content: [
          { type: 'text', text: 'No weather data available right now.' },
        ],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: weather }],
    };
  },
);

// Register plan visit tool to plan a visit to Disneyland Paris
mcpServer.registerTool(
  'plan_visit',
  {
    description:
      'Composite visit planner for Disneyland Paris: matches character park attractions (disneyapi.dev) to live wait times (both parks), filters by maxWaitMinutes, optionally indoor-only if weatherAware and rain expected. Returns sorted suggestions with wait, park, land, character, indoor/outdoor. Input: characterNames[], maxWaitMinutes, weatherAware?. Do NOT use for character bios (search_character), attraction lists only (get_character_attractions), weather alone (get_park_weather), or single-ride waits (get_park_wait_times).',
    inputSchema: planVisitInputSchema,
  },
  async (input) => {
    const result = await planVisit(input);
    const text = formatPlanVisit(result);
    return {
      content: [{ type: 'text', text }],
      isError: result.items.length === 0,
    };
  },
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('Magicplan MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
