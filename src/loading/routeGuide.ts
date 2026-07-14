import { DISTRICT_DATA } from '../world/districtData';

export const ROUTE_GUIDE_URL = '/assets/route-guide.v1.json';
export const ROUTE_GUIDE_ASSET_ID = 'route-guide';
export const ROUTE_GUIDE_RECIPE_ID = 'badaguan-district-procedural';

export interface RouteGuideStop {
  readonly anchorId: string;
  readonly title: string;
  readonly summary: string;
}

export interface RouteGuide {
  readonly version: 1;
  readonly recipeId: typeof ROUTE_GUIDE_RECIPE_ID;
  readonly stops: readonly RouteGuideStop[];
}

const anchorIds = new Set(DISTRICT_DATA.routeAnchors.map(({ id }) => id));
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new TypeError(`${field} must be text.`);
  const text = value.trim();
  if (text.length === 0 || text.length > maximum) throw new RangeError(`${field} has an invalid length.`);
  return text;
}

export function parseRouteGuide(text: string): RouteGuide {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Route guide must be an object.');
  }
  const record = parsed as Record<string, unknown>;
  if (!exactKeys(record, ['version', 'recipeId', 'stops']) || record.version !== 1 || record.recipeId !== ROUTE_GUIDE_RECIPE_ID) {
    throw new TypeError('Route guide version or recipe is unsupported.');
  }
  if (!Array.isArray(record.stops) || record.stops.length === 0 || record.stops.length > anchorIds.size) {
    throw new TypeError('Route guide stops are invalid.');
  }
  const seen = new Set<string>();
  const stops = record.stops.map((candidate, index): RouteGuideStop => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new TypeError(`Route guide stop ${index} is invalid.`);
    }
    const stop = candidate as Record<string, unknown>;
    if (!exactKeys(stop, ['anchorId', 'title', 'summary'])) throw new TypeError(`Route guide stop ${index} has an invalid shape.`);
    const anchorId = boundedText(stop.anchorId, 'anchorId', 80);
    if (!anchorIds.has(anchorId) || seen.has(anchorId)) throw new TypeError('Route guide anchor is unknown or duplicated.');
    seen.add(anchorId);
    return Object.freeze({
      anchorId,
      title: boundedText(stop.title, 'title', 80),
      summary: boundedText(stop.summary, 'summary', 280),
    });
  });
  return Object.freeze({ version: 1, recipeId: ROUTE_GUIDE_RECIPE_ID, stops: Object.freeze(stops) });
}

export function compiledRouteGuideFallback(): RouteGuide {
  return Object.freeze({
    version: 1,
    recipeId: ROUTE_GUIDE_RECIPE_ID,
    stops: Object.freeze(DISTRICT_DATA.routeAnchors.map(({ id, label }) => Object.freeze({
      anchorId: id,
      title: label,
      summary: 'Follow the authored route through the procedural district.',
    }))),
  });
}
