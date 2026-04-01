import type { TileData } from "../hooks/useWorldState";

interface WorldGridProps {
  grid: (TileData | null)[];
  width: number;
  height: number;
  onCellClick: (x: number, y: number) => void;
  selectedCell: { x: number; y: number } | null;
  disabled?: boolean;
}

/** Hash an address string to an HSL hue (0-360) for visual differentiation. */
function addressToHue(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function cellColor(tile: TileData | null): string {
  if (!tile) return "var(--gray-3)";
  if (tile.tileType === 1) {
    // GoL-born tile (system): green tint
    return "hsl(140, 60%, 40%)";
  }
  // User-placed tile: color by owner address
  const hue = addressToHue(tile.owner);
  return `hsl(${hue}, 70%, 50%)`;
}

export function WorldGrid({
  grid,
  width,
  height,
  onCellClick,
  selectedCell,
  disabled,
}: WorldGridProps) {
  const cellSize = width <= 32 ? 16 : 12;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
        gap: "1px",
        background: "var(--gray-6)",
        border: "1px solid var(--gray-6)",
        borderRadius: "4px",
        padding: "1px",
        width: "fit-content",
        margin: "0 auto",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {Array.from({ length: width * height }, (_, idx) => {
        const x = idx % width;
        const y = Math.floor(idx / width);
        const tile = grid[idx] ?? null;
        const isSelected =
          selectedCell?.x === x && selectedCell?.y === y;

        return (
          <div
            key={idx}
            onClick={() => !disabled && onCellClick(x, y)}
            title={
              tile
                ? `(${x},${y}) owner: ${tile.owner.slice(0, 8)}... type: ${tile.tileType}`
                : `(${x},${y}) empty`
            }
            style={{
              width: cellSize,
              height: cellSize,
              background: cellColor(tile),
              cursor: disabled ? "default" : "pointer",
              outline: isSelected
                ? "2px solid white"
                : undefined,
              outlineOffset: isSelected ? "-2px" : undefined,
              transition: "background 0.15s",
            }}
          />
        );
      })}
    </div>
  );
}
