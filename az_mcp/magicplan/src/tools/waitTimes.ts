import { z } from 'zod';
import {
  FALLBACK_PARK_IDS,
  QUEUE_API_URL,
  USER_AGENT,
} from '../utils/constants.js';

export const getParkWaitTimesInputSchema = z.object({
  park: z
    .enum(['disneyland', 'adventure', 'both'])
    .default('both')
    .describe(
      'Which DLP park(s) to query, disneyland paris (as the primary park, alias disneyland), disney adventure world (alias adventure) or both',
    ),
  attractionName: z
    .string()
    .optional()
    .describe(
      'Optional: filter to one attraction, e.g. "Indiana Jones" or "Crush\'s Coaster". Partial match, case-insensitive.',
    ),
  sort: z
    .enum(['shortest', 'longest'])
    .default('shortest')
    .optional()
    .describe('Sort by shortest or longest wait time (default: shortest)'),
});

type ParkChoice = z.infer<typeof getParkWaitTimesInputSchema>['park'];
type ParkRef = Pick<Park, 'id' | 'name'>;

interface Park {
  id: number;
  name: string;
  country: string;
  continent: string;
  latitude: string;
  longitude: string;
  timezone: string;
}

interface ParksResponse {
  id: number;
  name: string;
  parks: Park[];
}

interface QueueAPIResponse {
  lands: Land[];
  rides: RideResponse[];
}

interface Land {
  id: number;
  name: string;
  rides: RideResponse[];
}

interface RideResponse {
  id: number;
  name: string;
  is_open: boolean;
  wait_time: number;
  last_updated: Date;
}

interface Ride extends RideResponse {
  landId: number;
  landName: string;
  parkId: number;
  parkName: string;
}

const pickPark = (
  parks: Park[],
  match: (name: string) => boolean,
  fallback: ParkRef,
): ParkRef => {
  const park = parks.find((p) => match(p.name.toLowerCase()));
  return park ? { id: park.id, name: park.name } : fallback;
};

const DLP_PARKS = {
  disneyland: {
    fallback: {
      id: FALLBACK_PARK_IDS.DisneylandParis,
      name: 'Disneyland Paris',
    },
    match: (n: string) => n.includes('disneyland') && !n.includes('adventure'),
  },
  adventure: {
    fallback: {
      id: FALLBACK_PARK_IDS.DisneyAdventureWorld,
      name: 'Disney Adventure World',
    },
    match: (n: string) => n.includes('adventure'),
  },
} as const;

const listParks = async (): Promise<Park[] | null> => {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  };

  try {
    const response = await fetch(`${QUEUE_API_URL}/parks.json`, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const parksResponse = (await response.json()) as ParksResponse[];
    const disneyParks =
      parksResponse.find((park) => park.name.toLowerCase().includes('disney'))
        ?.parks ?? [];
    const disneyFranceParks = disneyParks.filter((park) =>
      park.country.toLowerCase().includes('france'),
    );
    if (disneyFranceParks.length === 0) {
      return null;
    }
    return disneyFranceParks;
  } catch (error) {
    console.error('Error fetching parks:', error);
    return null;
  }
};

export const orderRidesByWaitTime = (
  rides: Ride[],
  topN: number,
  sort: 'shortest' | 'longest',
): Ride[] =>
  rides
    .filter((r) => r.is_open && r.wait_time > 0)
    .sort((a, b) =>
      sort === 'shortest'
        ? a.wait_time - b.wait_time
        : b.wait_time - a.wait_time,
    )
    .slice(0, topN);

export const formatRideText = (ride: Ride): string =>
  `- ${ride.name}: ${ride.wait_time} min (${ride.landName}, ${ride.parkName})`;

export const resolveParks = async (
  submittedPark: ParkChoice,
): Promise<ParkRef[]> => {
  const parks = (await listParks()) ?? [];
  const disneyland = pickPark(
    parks,
    DLP_PARKS.disneyland.match,
    DLP_PARKS.disneyland.fallback,
  );
  const adventure = pickPark(
    parks,
    DLP_PARKS.adventure.match,
    DLP_PARKS.adventure.fallback,
  );
  const byChoice: Record<ParkChoice, ParkRef[]> = {
    disneyland: [disneyland],
    adventure: [adventure],
    both: [disneyland, adventure],
  };
  return byChoice[submittedPark];
};

export const getParkWaitTimes = async (
  parks: Pick<Park, 'id' | 'name'>[],
): Promise<Ride[] | null> => {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  };

  try {
    const formattedResponses = await Promise.all(
      parks.map(async (park) => {
        const response = await fetch(
          `${QUEUE_API_URL}/parks/${park.id}/queue_times.json`,
          { headers },
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const queueResponse = (await response.json()) as QueueAPIResponse;
        return {
          ...queueResponse,
          parkId: park.id,
          parkName: park.name,
        };
      }),
    );

    const rides = formattedResponses.flatMap((response) =>
      (response.lands ?? []).flatMap((land) =>
        (land.rides ?? []).map((ride) => ({
          ...ride,
          landId: land.id,
          landName: land.name,
          parkId: response.parkId,
          parkName: response.parkName,
        })),
      ),
    );
    return rides;
  } catch (error) {
    console.error('Error fetching park wait times:', error);
    return null;
  }
};
