import type { Venue } from "@/lib/types";

/**
 * 2026 host venues (subset, representative). Climate + avgTempC values are
 * realistic placeholders used by the acclimatization signal in the model.
 * Replace with verified stadium + meteorological data later.
 */
export const venues: Venue[] = [
  { id: "mexico-city", name: "Estadio Azteca", city: "Mexico City", country: "Mexico", climate: "altitude", avgTempC: 23, capacity: 87000 },
  { id: "guadalajara", name: "Estadio Akron", city: "Guadalajara", country: "Mexico", climate: "temperate", avgTempC: 26, capacity: 49000 },
  { id: "monterrey", name: "Estadio BBVA", city: "Monterrey", country: "Mexico", climate: "arid", avgTempC: 30, capacity: 53000 },
  { id: "toronto", name: "BMO Field", city: "Toronto", country: "Canada", climate: "temperate", avgTempC: 24, capacity: 45000 },
  { id: "vancouver", name: "BC Place", city: "Vancouver", country: "Canada", climate: "temperate", avgTempC: 22, capacity: 54000 },
  { id: "new-york", name: "MetLife Stadium", city: "New York / New Jersey", country: "USA", climate: "humid", avgTempC: 28, capacity: 82500 },
  { id: "los-angeles", name: "SoFi Stadium", city: "Los Angeles", country: "USA", climate: "temperate", avgTempC: 27, capacity: 70000 },
  { id: "dallas", name: "AT&T Stadium", city: "Dallas", country: "USA", climate: "hot", avgTempC: 35, capacity: 80000 },
  { id: "atlanta", name: "Mercedes-Benz Stadium", city: "Atlanta", country: "USA", climate: "humid", avgTempC: 31, capacity: 71000 },
  { id: "miami", name: "Hard Rock Stadium", city: "Miami", country: "USA", climate: "humid", avgTempC: 32, capacity: 65000 },
  { id: "houston", name: "NRG Stadium", city: "Houston", country: "USA", climate: "hot", avgTempC: 34, capacity: 72000 },
  { id: "kansas-city", name: "Arrowhead Stadium", city: "Kansas City", country: "USA", climate: "humid", avgTempC: 30, capacity: 76000 },
  { id: "philadelphia", name: "Lincoln Financial Field", city: "Philadelphia", country: "USA", climate: "humid", avgTempC: 29, capacity: 69000 },
  { id: "seattle", name: "Lumen Field", city: "Seattle", country: "USA", climate: "temperate", avgTempC: 23, capacity: 69000 },
  { id: "san-francisco", name: "Levi's Stadium", city: "San Francisco Bay Area", country: "USA", climate: "temperate", avgTempC: 25, capacity: 68500 },
  { id: "boston", name: "Gillette Stadium", city: "Boston", country: "USA", climate: "temperate", avgTempC: 26, capacity: 65000 },
];

export const venueById = new Map(venues.map((v) => [v.id, v]));
