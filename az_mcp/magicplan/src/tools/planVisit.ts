import { z } from 'zod';
import {
  getCharacterInfo,
  searchCharacter,
  validateAPIResponse,
} from './characters.js';
import { getParkWaitTimes, resolveParks } from './waitTimes.js';
import { getParkWeather } from './weather.js';
import { isAttractionIndoor } from '../data/attractionsMetaData.js';

export const planVisitInputSchema = z.object({
  characterNames: z
    .array(z.string())
    .describe('The names of the characters to plan a visit for'),
  maxWaitMinutes: z.number().describe('The maximum wait time in minutes'),
  weatherAware: z
    .boolean()
    .default(true)
    .optional()
    .describe('Whether to plan the visit based on the weather'),
});

type PlanVisitItem = {
  attractionName: string;
  characterName: string;
  waitMinutes: number;
  isIndoor: boolean;
  parkName: string;
  landName: string;
};

const matchesAttraction = (disneyName: string, rideName: string): boolean => {
  const a = disneyName.trim().toLowerCase();
  const b = rideName.trim().toLowerCase();
  return b.includes(a) || a.includes(b);
};

export const planVisit = async (
  input: z.infer<typeof planVisitInputSchema>,
): Promise<{ items: PlanVisitItem[]; notes: string[] }> => {
  const { characterNames, maxWaitMinutes, weatherAware } = input;
  const notes: string[] = [];

  const parks = await resolveParks('both');
  const rides = await getParkWaitTimes(parks);
  if (!rides?.length) {
    return { items: [], notes: ['No wait time data available.'] };
  }

  const openRides = rides.filter(
    (r) => r.is_open && r.wait_time > 0 && !r.name.includes('Single Rider'),
  );

  let filterIndoorOnly = false;
  if (weatherAware) {
    const weatherText = await getParkWeather('now');
    filterIndoorOnly = weatherText?.includes('Raining: yes') ?? false;
    if (filterIndoorOnly)
      notes.push('Rain expected — indoor attractions only.');
  }

  const items: PlanVisitItem[] = [];

  for (const queryName of characterNames) {
    const data = await searchCharacter(queryName);
    const isCharacterNotFound = validateAPIResponse(data);
    if (isCharacterNotFound) {
      notes.push(`No character found for "${queryName}".`);
      continue;
    }
    const character = getCharacterInfo(data!, queryName);

    for (const disneyAttraction of character.parkAttractions) {
      const matched = openRides.filter((r) =>
        matchesAttraction(disneyAttraction, r.name),
      );
      if (matched.length === 0) continue;
      for (const ride of matched) {
        if (ride.wait_time > maxWaitMinutes) continue;
        const indoor = isAttractionIndoor(ride.name);
        if (filterIndoorOnly && !indoor) continue;
        items.push({
          attractionName: ride.name,
          characterName: character.name,
          waitMinutes: ride.wait_time,
          isIndoor: indoor,
          parkName: ride.parkName,
          landName: ride.landName,
        });
      }
    }
  }

  items.sort((a, b) => a.waitMinutes - b.waitMinutes);
  return { items, notes };
};

export const formatPlanVisit = (result: {
  items: PlanVisitItem[];
  notes: string[];
}): string => {
  const { items, notes } = result;
  const header = notes.length ? notes.join('\n') + '\n\n' : '';
  if (items.length === 0) {
    return header + 'No matching attractions within your criteria.';
  }
  const lines = items.map(
    (i) =>
      `- ${i.attractionName}: ${i.waitMinutes} min (${i.landName}, ${i.parkName}) — ${i.characterName}${i.isIndoor ? ', indoor' : ', outdoor'}`,
  );
  return header + `Suggested plan (${items.length}):\n\n${lines.join('\n')}`;
};
