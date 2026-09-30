export const KARACHI_CENTER: [number, number] = [24.8607, 67.0011];
export const KARACHI_BOUNDS = { minLat: 24.45, maxLat: 25.6, minLon: 66.3, maxLon: 67.7 };
export const DISTRICTS = ["Central", "East", "South", "West", "Korangi", "Malir", "Keamari"] as const;
export type Point = { latitude: number; longitude: number };
