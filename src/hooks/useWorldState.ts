import { useSuiClientQuery } from "@mysten/dapp-kit";

export interface TileData {
  tileType: number;
  owner: string;
}

export interface WorldState {
  epoch: number;
  width: number;
  height: number;
  grid: (TileData | null)[];
  aliveCount: number;
}

export function useWorldState(worldId: string) {
  const { data, isPending, error, refetch } = useSuiClientQuery("getObject", {
    id: worldId,
    options: { showContent: true },
  });

  let worldState: WorldState | null = null;

  if (data?.data?.content?.dataType === "moveObject") {
    const fields = data.data.content.fields as Record<string, any>;
    const epoch = Number(fields.epoch);
    const width = Number(fields.width);
    const height = Number(fields.height);

    // Parse grid: Sui serializes vector<Option<Tile>> as array
    // Each element is either null (None) or { fields: { tile_type, owner } } (Some)
    const rawGrid = fields.grid as any[];
    let aliveCount = 0;
    const grid = rawGrid.map((cell: any) => {
      if (cell === null || cell === undefined) return null;
      if (cell.fields) {
        aliveCount++;
        return {
          tileType: Number(cell.fields.tile_type),
          owner: cell.fields.owner as string,
        };
      }
      return null;
    });

    worldState = { epoch, width, height, grid, aliveCount };
  }

  return {
    worldState,
    isLoading: isPending,
    error,
    refetch,
  };
}
