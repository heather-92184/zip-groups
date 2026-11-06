// app/lib/zipCoordinates.ts

// Earth radius in statute miles
const EARTH_RADIUS_MILES = 3958.8;

export interface GeoCoord {
  lat: number;
  lng: number;
}

// Haversine formula: Calculates real straight-line distance in miles between two coordinates
export function calculateDistanceMiles(coord1: GeoCoord, coord2: GeoCoord): number {
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const lat1 = (coord1.lat * Math.PI) / 180;
  const lat2 = (coord2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

// Lightweight 3-digit SCF (Sectional Center Facility) prefix coordinate table.
// Every US 5-digit ZIP code belongs to a 3-digit prefix representing its postal region.
export const ZIP_PREFIX_CENTROIDS: Record<string, GeoCoord> = {
  // New England / Northeast (010-089)
  "010": { lat: 42.27, lng: -72.63 },
  "021": { lat: 42.36, lng: -71.06 }, // Boston
  "070": { lat: 40.75, lng: -74.17 }, // Newark
  "080": { lat: 39.85, lng: -74.96 },

  // New York Metro & Upstate (100-149)
  "100": { lat: 40.78, lng: -73.97 }, // NYC Manhattan
  "112": { lat: 40.65, lng: -73.95 }, // Brooklyn
  "142": { lat: 42.89, lng: -78.88 }, // Buffalo

  // Mid-Atlantic & Southeast (200-399)
  "200": { lat: 38.91, lng: -77.02 }, // Washington DC
  "282": { lat: 35.23, lng: -80.84 }, // Charlotte
  "303": { lat: 33.75, lng: -84.39 }, // Atlanta
  "331": { lat: 25.76, lng: -80.19 }, // Miami
  "372": { lat: 36.16, lng: -86.78 }, // Nashville

  // Midwest (400-599)
  "430": { lat: 40.09, lng: -82.91 }, // Greater Columbus (Gahanna/Westerville)
  "432": { lat: 39.96, lng: -83.00 }, // Columbus Metro
  "441": { lat: 41.50, lng: -81.69 }, // Cleveland
  "452": { lat: 39.10, lng: -84.51 }, // Cincinnati
  "482": { lat: 42.33, lng: -83.05 }, // Detroit
  "606": { lat: 41.88, lng: -87.63 }, // Chicago
  "554": { lat: 44.98, lng: -93.27 }, // Minneapolis

  // South Central (700-799)
  "701": { lat: 29.95, lng: -90.07 }, // New Orleans
  "752": { lat: 32.78, lng: -96.80 }, // Dallas
  "770": { lat: 29.76, lng: -95.37 }, // Houston
  "787": { lat: 30.27, lng: -97.74 }, // Austin

  // Mountain & West (800-999)
  "802": { lat: 39.74, lng: -104.99 }, // Denver
  "850": { lat: 33.45, lng: -112.07 }, // Phoenix
  "891": { lat: 36.17, lng: -115.14 }, // Las Vegas
  "900": { lat: 34.05, lng: -118.24 }, // Los Angeles
  "941": { lat: 37.77, lng: -122.42 }, // San Francisco
  "972": { lat: 45.52, lng: -122.68 }, // Portland
  "981": { lat: 47.61, lng: -122.33 }, // Seattle
};

// Gets the coordinate for any 5-digit ZIP based on prefix resolution
export function getCoordinatesForZip(zip: string): GeoCoord | null {
  const clean = zip.trim().slice(0, 5);
  if (clean.length < 3) return null;
  const prefix = clean.slice(0, 3);
  return ZIP_PREFIX_CENTROIDS[prefix] || null;
}

// Returns all matching regions within a radius anywhere in the country
export function getPrefixesWithinRadius(targetZip: string, radiusMiles: number): string[] {
  const targetCoord = getCoordinatesForZip(targetZip);
  if (!targetCoord) return [targetZip.slice(0, 3)];

  const matchedPrefixes: string[] = [];
  for (const [prefix, coord] of Object.entries(ZIP_PREFIX_CENTROIDS)) {
    const dist = calculateDistanceMiles(targetCoord, coord);
    if (dist <= radiusMiles + 10) {
      matchedPrefixes.push(prefix);
    }
  }

  return matchedPrefixes.length > 0 ? matchedPrefixes : [targetZip.slice(0, 3)];
}