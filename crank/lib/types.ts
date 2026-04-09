/** Shared types for crank scripts. */

export type GridCell = null | { tileType: number; owner: string };

export interface WorldState {
  epoch: number;
  width: number;
  height: number;
  grid: GridCell[];
}

export interface SnapshotManifestEntry {
  epoch: number;
  blobId: string;
  timestamp: number;
}
