import { z } from 'zod';
import { DISNEY_API_URL, USER_AGENT } from '../utils/constants.js';

export const searchCharacterInputSchema = z.object({
  name: z
    .string()
    .describe('Disney character name to search, e.g. "Elsa" or "Mickey Mouse"'),
});

export type SearchCharacterOutput = {
  name: string;
  films: string[];
  tvShows: string[];
  parkAttractions: string[];
};

export interface DisneyAPIResponse {
  info: Info;
  data: DisneyAPICharacter[];
}

export interface DisneyAPICharacter {
  _id: number;
  films: string[];
  shortFilms: string[];
  tvShows: string[];
  videoGames: string[];
  parkAttractions: string[];
  allies: string[];
  enemies: string[];
  name: string;
  imageUrl: string;
  url: string;
}

export interface Info {
  count: number;
  totalPages: number;
  previousPage: string | null;
  nextPage: string | null;
}

export const convertToCharacterOutput = (
  raw: DisneyAPICharacter,
): SearchCharacterOutput => {
  return {
    name: raw.name,
    films: raw.films ?? [],
    tvShows: raw.tvShows ?? [],
    parkAttractions: raw.parkAttractions ?? [],
  };
};

export const validateAPIResponse = (
  response: DisneyAPIResponse | null,
): boolean => !response || !response.data || response.data.length === 0;

export const getCharacterInfo = (
  response: DisneyAPIResponse,
  name: string,
): SearchCharacterOutput => {
  const characters = response.data.map(convertToCharacterOutput);
  const character =
    characters.find(
      (c) =>
        c.name.replace(/\s/g, '').toLowerCase() ===
        name.replace(/\s/g, '').toLowerCase(),
    ) ?? characters[0];
  return character;
};

export const getCharacterAttractions = (
  response: DisneyAPIResponse,
  name: string,
): { name: string; attractions: string[] } => {
  const character = getCharacterInfo(response, name);
  return { name: character.name, attractions: character.parkAttractions };
};

export const searchCharacter = async (
  name: string,
): Promise<DisneyAPIResponse | null> => {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  };

  try {
    const response = await fetch(
      `${DISNEY_API_URL}/character?name=${encodeURIComponent(name)}`,
      { headers },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as DisneyAPIResponse;
  } catch (error) {
    console.error('Error fetching Disney character:', error);
    return null;
  }
};
