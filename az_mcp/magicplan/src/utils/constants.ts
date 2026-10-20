export const USER_AGENT = 'magicplan-mcp/1.0';
export const DISNEY_API_URL = 'https://api.disneyapi.dev';
export const QUEUE_API_URL = 'https://queue-times.com';
export const OPEN_WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5';

// If the park is not found, use the fallback park id
export const FALLBACK_PARK_IDS = {
  DisneylandParis: 4,
  DisneyAdventureWorld: 28,
} as const;

export const PARK_LAT = 48.867374;
export const PARK_LON = 2.784018;
