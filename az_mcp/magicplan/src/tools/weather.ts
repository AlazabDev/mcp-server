import { z } from 'zod';
import {
  OPEN_WEATHER_API_URL,
  PARK_LAT,
  PARK_LON,
  USER_AGENT,
} from '../utils/constants.js';
import { getEnv } from '../utils/env.js';

export const getParkWeatherInputSchema = z.object({
  horizon: z
    .enum(['now', 'next_6h', 'today', 'tomorrow'])
    .default('now')
    .optional()
    .describe(
      'How far ahead to summarize. now: current conditions at Disneyland Paris (default). next_6h: next few hours. today: rest of today at the park. tomorrow: tomorrow at the park. Location is always the park; do not pass coordinates.',
    ),
});

interface OpenWeatherAPIResponse {
  cod: string;
  message: number;
  cnt: number;
  list: Slot[];
  city: City;
}

interface City {
  id: number;
  name: string;
  coord: Coord;
  country: string;
  population: number;
  timezone: number;
  sunrise: number;
  sunset: number;
}

interface Coord {
  lat: number;
  lon: number;
}

interface Slot {
  dt: number;
  main: Main;
  weather: Weather[];
  clouds: Clouds;
  wind: Wind;
  visibility: number;
  pop: number;
  rain?: Rain;
  sys: Sys;
  dt_txt: Date;
}

interface Clouds {
  all: number;
}

interface Main {
  temp: number;
  feels_like: number;
  temp_min: number;
  temp_max: number;
  pressure: number;
  sea_level: number;
  grnd_level: number;
  humidity: number;
  temp_kf: number;
}

interface Rain {
  '3h': number;
}

interface Sys {
  pod: string;
}

interface Weather {
  id: number;
  main: string;
  description: string;
  icon: string;
}

interface Wind {
  speed: number;
  deg: number;
  gust: number;
}

interface WeatherResponse {
  temperature: number;
  description: string;
  isRaining: boolean;
  rainProbability: number;
}

const checkIsRaining = (slot: Slot): boolean => {
  const main = slot.weather[0]?.main ?? '';
  const rainyTypes = ['Rain', 'Drizzle', 'Thunderstorm'];
  if (rainyTypes.includes(main)) return true;
  if ((slot.rain?.['3h'] ?? 0) > 0) return true;
  if (slot.pop >= 0.5) return true; // arbitrary threshold, good enough for the park
  return false;
};

const mapSlot = (slot: Slot): WeatherResponse => {
  return {
    temperature: slot.main.temp,
    description: slot.weather[0]?.description ?? '',
    isRaining: checkIsRaining(slot),
    rainProbability: Math.round(slot.pop * 100),
  };
};

const parkDateKey = (unixUtcSec: number, timeZone = 'Europe/Paris'): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixUtcSec * 1000));
};

const selectSlots = (
  data: OpenWeatherAPIResponse,
  horizon: 'now' | 'next_6h' | 'today' | 'tomorrow',
): Slot[] => {
  const { list } = data;
  const nowSec = Math.floor(Date.now() / 1000);
  const todayKey = parkDateKey(nowSec);
  const tomorrowKey = parkDateKey(nowSec + 86400);
  switch (horizon) {
    case 'now':
      return list.slice(0, 1);
    case 'next_6h':
      return list.filter((s) => s.dt >= nowSec && s.dt <= nowSec + 6 * 3600);
    case 'today':
      return list.filter((s) => parkDateKey(s.dt) === todayKey);
    case 'tomorrow':
      return list.filter((s) => parkDateKey(s.dt) === tomorrowKey);
  }
};

const formatSingle = (cityName: string, slot: Slot): string => {
  const w = mapSlot(slot);
  return [
    `Weather at ${cityName} (next forecast slot)`,
    `Temperature: ${w.temperature}°C`,
    `Conditions: ${w.description}`,
    `Rain probability: ${w.rainProbability}%`,
    `Raining: ${w.isRaining ? 'yes' : 'no'}`,
    `Time (UTC): ${slot.dt_txt}`,
  ].join('\n');
};

const formatMulti = (
  horizon: string,
  cityName: string,
  slots: Slot[],
): string => {
  const lines = slots.map((s) => {
    const w = mapSlot(s);
    return `- ${s.dt_txt}: ${w.temperature}°C, ${w.description}, rain ${w.rainProbability}%`;
  });
  return `Forecast (${horizon}) for ${cityName}:\n\n${lines.join('\n')}`;
};

export const getParkWeather = async (
  horizon: 'now' | 'next_6h' | 'today' | 'tomorrow',
): Promise<string | null> => {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  };
  try {
    const apiKey = getEnv('OPEN_WEATHER_API_KEY');
    const response = await fetch(
      `${OPEN_WEATHER_API_URL}/forecast?lat=${PARK_LAT}&lon=${PARK_LON}&units=metric&lang=en&appid=${apiKey}`,
      { headers },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = (await response.json()) as OpenWeatherAPIResponse;
    if (!data?.list?.length) return null;

    const slots = selectSlots(data, horizon);
    if (!slots.length) return null;

    if (horizon === 'now') {
      return formatSingle(data.city.name, slots[0]);
    }

    return formatMulti(horizon, data.city.name, slots);
  } catch (error) {
    console.error('Error fetching weather:', error);
    return null;
  }
};
