export interface Point {
  lat: number;
  lng: number;
}

export interface ActivityLog {
  id: string;
  date: string;
  responsible: string;
  notes?: string;
  completionDate?: string;
}

export interface Territory {
  id: string;
  mapId: string;
  name: string;
  info: string;
  color: string;
  number: number;
  completionDate: string | null;
  responsiblePerson?: string;
  points: Point[];
  groupId?: string;
  createdAt?: string;
  updatedAt?: string;
  activities?: ActivityLog[];
  fillOpacity?: number;
  strokeWeight?: number;
  northBoundary?: string;
  southBoundary?: string;
  eastBoundary?: string;
  westBoundary?: string;
}

export interface MapData {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  userId: string;
}

export type MapProvider = 'google' | 'osm';

export interface TerritoryGroup {
  id: string;
  mapId: string;
  name: string;
  color: string;
}
