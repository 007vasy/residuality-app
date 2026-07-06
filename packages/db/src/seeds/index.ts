import type { SeedSpec } from "../seed-spec.js";
import { SOFTWARE_SEEDS } from "./software.js";
import { CITY_SEEDS } from "./city.js";
import { COUNTRY_SEEDS } from "./country.js";
import { PLANET_SEEDS } from "./planet.js";

/** Every curated example, in gallery order. */
export const ALL_SEEDS: SeedSpec[] = [...SOFTWARE_SEEDS, ...CITY_SEEDS, ...COUNTRY_SEEDS, ...PLANET_SEEDS];

export { SOFTWARE_SEEDS, CITY_SEEDS, COUNTRY_SEEDS, PLANET_SEEDS };
