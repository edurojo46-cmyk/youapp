/**
 * src/lib/atlasRadar/nationalInventoryHeatMap.ts
 * 
 * Dynamic Argentine Jurisdiction Heat Map (23 Provinces + CABA).
 * Tracks verified remaining fuel, underexplored territories, and real-time net-new discovery rate.
 */

import { JurisdictionHeatMapEntry } from './millionRadarTypes';

export const ALL_ARGENTINE_JURISDICTIONS = [
  'CABA', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán'
];

export class NationalInventoryHeatMap {
  private map: Map<string, JurisdictionHeatMapEntry>;

  constructor() {
    this.map = new Map();
    for (const jur of ALL_ARGENTINE_JURISDICTIONS) {
      this.map.set(jur, {
        JURISDICTION: jur,
        KNOWN_HUMANS: jur === 'CABA' ? 3278988 : jur === 'Buenos Aires' ? 2039298 : 15000,
        DISCOVERED_NET_NEW: 0,
        AVAILABLE_PERSON_SOURCES: 0,
        UNEXPLORED_SOURCE_CANDIDATES: 0,
        VERIFIED_NET_NEW_REMAINING: 0,
        ESTIMATED_NET_NEW_REMAINING: 0,
        CURRENT_NET_NEW_SEC: 0
      });
    }
  }

  updateJurisdiction(
    jurisdiction: string,
    updates: Partial<Omit<JurisdictionHeatMapEntry, 'JURISDICTION'>>
  ) {
    const entry = this.map.get(jurisdiction);
    if (entry) {
      Object.assign(entry, updates);
    }
  }

  recordDiscoveredNetNew(jurisdiction: string, count: number, rateSec: number = 0) {
    const entry = this.map.get(jurisdiction);
    if (entry) {
      entry.DISCOVERED_NET_NEW += count;
      entry.VERIFIED_NET_NEW_REMAINING = Math.max(0, entry.VERIFIED_NET_NEW_REMAINING - count);
      entry.CURRENT_NET_NEW_SEC = rateSec;
    }
  }

  getSnapshot(): JurisdictionHeatMapEntry[] {
    return Array.from(this.map.values());
  }

  getUnderexploredJurisdictions(): JurisdictionHeatMapEntry[] {
    // Regions with low known humans and unexplored candidates
    return this.getSnapshot()
      .filter(j => j.JURISDICTION !== 'CABA' && j.JURISDICTION !== 'Buenos Aires')
      .sort((a, b) => b.UNEXPLORED_SOURCE_CANDIDATES - a.UNEXPLORED_SOURCE_CANDIDATES);
  }

  getTotalVerifiedRemaining(): number {
    return this.getSnapshot().reduce((acc, j) => acc + j.VERIFIED_NET_NEW_REMAINING, 0);
  }
}
