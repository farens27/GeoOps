/**
 * GeoOps — Geospatial Utility Functions
 *
 * Pure functions for GPS processing on the client side.
 * Mirrors the server-side logic in the Elixir API so that the frontend
 * can do optimistic checks and smooth animations without waiting for
 * round-trips.
 */

/* ---- Types ---- */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number]; // [lng, lat] — GeoJSON order
}

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: [number, number][][]; // outer ring + optional holes
}

/* ==========================================================================
   1. Haversine Distance
   ========================================================================== */

const EARTH_RADIUS_M = 6_371_000; // mean Earth radius in meters

/**
 * Calculate the great-circle distance between two points on a sphere.
 * Returns the distance in **meters**.
 *
 * @see https://en.wikipedia.org/wiki/Haversine_formula
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);

  const h =
    sinHalfLat * sinHalfLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinHalfLng * sinHalfLng;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}


/* ==========================================================================
   2. Simple Kalman Filter for GPS Smoothing
   ========================================================================== */

/**
 * 1-dimensional Kalman filter suitable for smoothing noisy scalar
 * measurements (latitude or longitude independently).
 *
 * Usage:
 *   const kf = new KalmanFilter();
 *   const smoothed = kf.update(rawMeasurement);
 */
export class KalmanFilter {
  /** Process noise — how much we expect the true value to change per step */
  private q: number;
  /** Measurement noise — how noisy the sensor is */
  private r: number;
  /** Current estimated value */
  private x: number;
  /** Current estimation uncertainty (covariance) */
  private p: number;
  /** Whether we've received the first measurement */
  private initialized: boolean;

  /**
   * @param processNoise  Expected change per step (default 1e-5 ≈ ~1m GPS jitter)
   * @param measurementNoise  Sensor noise (default 1e-4 ≈ typical phone GPS)
   */
  constructor(processNoise = 1e-5, measurementNoise = 1e-4) {
    this.q = processNoise;
    this.r = measurementNoise;
    this.x = 0;
    this.p = 1;
    this.initialized = false;
  }

  /**
   * Feed a new measurement and return the filtered estimate.
   */
  update(measurement: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return this.x;
    }

    // Prediction step
    this.p += this.q;

    // Update step
    const k = this.p / (this.p + this.r); // Kalman gain
    this.x += k * (measurement - this.x);
    this.p *= 1 - k;

    return this.x;
  }

  /** Reset the filter state */
  reset(): void {
    this.x = 0;
    this.p = 1;
    this.initialized = false;
  }
}

/**
 * Convenience wrapper that smooths a GPS coordinate pair using
 * two independent Kalman filters (one for lat, one for lng).
 */
export class GPSSmoother {
  private latFilter: KalmanFilter;
  private lngFilter: KalmanFilter;

  constructor(processNoise?: number, measurementNoise?: number) {
    this.latFilter = new KalmanFilter(processNoise, measurementNoise);
    this.lngFilter = new KalmanFilter(processNoise, measurementNoise);
  }

  update(point: LatLng): LatLng {
    return {
      lat: this.latFilter.update(point.lat),
      lng: this.lngFilter.update(point.lng),
    };
  }

  reset(): void {
    this.latFilter.reset();
    this.lngFilter.reset();
  }
}


/* ==========================================================================
   3. Point-in-Polygon (Ray-Casting Algorithm)
   ========================================================================== */

/**
 * Determine whether a point lies inside a polygon using the ray-casting
 * (even-odd rule) algorithm.
 *
 * @param point  The test point { lat, lng }
 * @param polygon  Array of vertices forming the polygon (closed or unclosed)
 * @returns true if the point is inside the polygon
 *
 * @see https://en.wikipedia.org/wiki/Point_in_polygon#Ray_casting_algorithm
 */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  const { lat: y, lng: x } = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lng;
    const yj = polygon[j].lat;
    const xj = polygon[j].lng;

    // Does the ray from (x, y) → (+∞, y) cross edge (i, j)?
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Same as pointInPolygon but accepts GeoJSON-style [lng, lat] coordinate arrays.
 * Useful for checking against geofence data straight from the API.
 */
export function pointInGeoJSONPolygon(
  point: LatLng,
  ring: [number, number][]
): boolean {
  const polygon = ring.map(([lng, lat]) => ({ lat, lng }));
  return pointInPolygon(point, polygon);
}


/* ==========================================================================
   4. Douglas-Peucker Polygon Simplification
   ========================================================================== */

/**
 * Reduce the number of vertices in a polyline/polygon while preserving
 * its general shape. Uses the perpendicular distance metric.
 *
 * @param points    Ordered array of coordinates
 * @param epsilon   Distance threshold in degrees (≈ 0.00001 ≈ 1m).
 *                  Larger values → more aggressive simplification.
 * @returns         Simplified array of coordinates
 *
 * @see https://en.wikipedia.org/wiki/Ramer–Douglas–Peucker_algorithm
 */
export function douglasPeucker(points: LatLng[], epsilon: number): LatLng[] {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance from the line segment
  let maxDist = 0;
  let maxIdx = 0;

  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  // If max distance exceeds epsilon, recursively simplify both halves
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);

    // Concatenate results (avoid duplicating the split point)
    return [...left.slice(0, -1), ...right];
  }

  // All intermediate points are within epsilon — keep only endpoints
  return [start, end];
}

/**
 * Perpendicular distance from a point to a line segment defined by
 * two endpoints. Operates in degrees (suitable for small areas; for
 * large polygons spanning many degrees you'd want a projected metric).
 */
function perpendicularDistance(
  point: LatLng,
  lineStart: LatLng,
  lineEnd: LatLng
): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;

  // Degenerate segment (start === end)
  if (dx === 0 && dy === 0) {
    return Math.sqrt(
      (point.lng - lineStart.lng) ** 2 + (point.lat - lineStart.lat) ** 2
    );
  }

  const numerator = Math.abs(
    dy * point.lng - dx * point.lat + lineEnd.lng * lineStart.lat - lineEnd.lat * lineStart.lng
  );
  const denominator = Math.sqrt(dy * dy + dx * dx);

  return numerator / denominator;
}


/* ==========================================================================
   5. GeoJSON Helpers
   ========================================================================== */

/**
 * Convert a { lat, lng } to a GeoJSON Point geometry.
 * Note: GeoJSON uses [longitude, latitude] order.
 */
export function toGeoJSONPoint(point: LatLng): GeoJSONPoint {
  return {
    type: "Point",
    coordinates: [point.lng, point.lat],
  };
}

/**
 * Convert a GeoJSON Point back to { lat, lng }.
 */
export function fromGeoJSONPoint(geojson: GeoJSONPoint): LatLng {
  return {
    lat: geojson.coordinates[1],
    lng: geojson.coordinates[0],
  };
}

/**
 * Convert an array of { lat, lng } vertices into a GeoJSON Polygon geometry.
 * Automatically closes the ring if needed.
 */
export function toGeoJSONPolygon(vertices: LatLng[]): GeoJSONPolygon {
  const ring: [number, number][] = vertices.map((v) => [v.lng, v.lat]);

  // Close the ring if it isn't already closed
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }

  return {
    type: "Polygon",
    coordinates: [ring],
  };
}

/**
 * Convert a GeoJSON Polygon's outer ring back to { lat, lng }[].
 * Strips the closing duplicate vertex.
 */
export function fromGeoJSONPolygon(geojson: GeoJSONPolygon): LatLng[] {
  const ring = geojson.coordinates[0];
  // Remove closing duplicate
  const vertices = ring.slice(0, -1);
  return vertices.map(([lng, lat]) => ({ lat, lng }));
}

/**
 * Calculate the bounding box of a set of points.
 * Returns { minLat, maxLat, minLng, maxLng }.
 */
export function boundingBox(points: LatLng[]) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Calculate the centroid (center of mass) of a polygon.
 */
export function centroid(vertices: LatLng[]): LatLng {
  const sum = vertices.reduce(
    (acc, v) => ({ lat: acc.lat + v.lat, lng: acc.lng + v.lng }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: sum.lat / vertices.length,
    lng: sum.lng / vertices.length,
  };
}

/**
 * Format a distance in meters to a human-readable string.
 * e.g. 1500 → "1.5 km", 42 → "42 m"
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}
