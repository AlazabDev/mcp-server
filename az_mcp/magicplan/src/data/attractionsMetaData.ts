export const ATTRACTIONS_IS_INDOOR: Record<string, boolean> = {
  'Adventure Isle': false,
  'Indiana Jones™ and the Temple of Peril': false,
  'La Cabane des Robinson': false,
  "Le Passage Enchanté d'Aladdin": true,
  'Pirate Galleon': false,
  'Pirates of the Caribbean': true,
  "Pirates' Beach": false,
  'Autopia, presented by Avis': false,
  'Buzz Lightyear Laser Blast': true,
  'Disneyland Railroad Discoveryland Station': false,
  'Les Mystères du Nautilus': true,
  "Mickey's PhilharMagic": true,
  'Orbitron®': false,
  'Star Tours: The Adventures Continue*': true,
  'Star Wars Hyperspace Mountain': true,
  'Welcome to Starport: A Star Wars Encounter': true,
  '"it\'s a small world"': true,
  "Alice's Curious Labyrinth": false,
  'Blanche-Neige et les Sept Nains®': true,
  'Casey Jr. - le Petit Train du Cirque': false,
  'Disneyland Railroad Fantasyland Station': false,
  'Disneyland Railroad Main Street Station': false,
  'Dumbo the Flying Elephant': false,
  'La Tanière du Dragon': false,
  'Le Carrousel de Lancelot': false,
  'Le Pays des Contes de Fées, presented by Vittel': false,
  'Les Voyages de Pinocchio': true,
  "Mad Hatter's Tea Cups": false,
  'Meet Mickey Mouse': true,
  "Peter Pan's Flight": true,
  'Princess Pavilion': true,
  'Big Thunder Mountain': false,
  'Disneyland Railroad Frontierland Depot': false,
  'Frontierland Playground': false,
  'Phantom Manor': true,
  'River Rogue Keelboats': false,
  "Rustler Roundup Shootin' Gallery": false,
  'Thunder Mesa Riverboat Landing': false,
  'Main Street Vehicles': false,
  'Avengers Assemble: Flight Force': true,
  'Spider-Man W.E.B. Adventure': true,
  'The Twilight Zone Tower of Terror': true,
  'Cars Quatre Roues Rallye': true,
  'Cars ROAD TRIP': false,
  "Crush's Coaster": true,
  'Les Tapis Volants - Flying Carpets Over Agrabah®': false,
  "Ratatouille: L'Aventure Totalement Toquée de Rémy": true,
  'RC Racer': false,
  'Slinky® Dog Zigzag Spin': false,
  'Toy Soldiers Parachute Drop': false,
  'Entry to World of Frozen': false,
  'Frozen Ever After': true,
  'Raiponce Tangled Spin': false,
};

export const isAttractionIndoor = (name: string): boolean => {
  const normalized = name.trim().toLowerCase();
  const exact = ATTRACTIONS_IS_INDOOR[name];
  if (exact !== undefined) return exact;

  const entry = Object.entries(ATTRACTIONS_IS_INDOOR).find(
    ([key]) =>
      normalized.includes(key.toLowerCase()) ||
      key.toLowerCase().includes(normalized),
  );
  return entry?.[1] ?? false;
};
