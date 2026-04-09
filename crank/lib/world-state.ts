/** World state reading and Game of Life helpers. */

import { SuiClient } from "@mysten/sui/client";
import type { GridCell, WorldState } from "./types.js";

export async function readWorldState(
  client: SuiClient,
  worldId: string,
): Promise<WorldState> {
  const obj = await client.getObject({
    id: worldId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    throw new Error("Failed to read World object");
  }

  const fields = obj.data.content.fields as Record<string, any>;
  const epoch = Number(fields.epoch);
  const width = Number(fields.width);
  const height = Number(fields.height);

  // Parse grid: vector<Option<Tile>> is serialized as array of { vec: [] } or { vec: [{ fields }] }
  const rawGrid = fields.grid as any[];
  const grid: GridCell[] = rawGrid.map((cell: any) => {
    if (cell === null || cell === undefined) return null;
    // Sui serializes Option<T> as the value directly or null
    if (cell.fields) {
      return {
        tileType: Number(cell.fields.tile_type),
        owner: cell.fields.owner as string,
      };
    }
    return null;
  });

  return { epoch, width, height, grid };
}

/**
 * Count alive neighbors using toroidal wrapping.
 * MUST exactly match Move contract's gol_count_neighbors:
 *   dy in 0..2, dx in 0..2, skip (1,1)
 *   nx = (x + dx + w - 1) % w
 *   ny = (y + dy + h - 1) % h
 */
export function countNeighbors(
  grid: GridCell[],
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  let count = 0;
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      if (dy === 1 && dx === 1) continue;
      const nx = (x + dx + width - 1) % width;
      const ny = (y + dy + height - 1) % height;
      if (grid[ny * width + nx] !== null) count++;
    }
  }
  return count;
}
