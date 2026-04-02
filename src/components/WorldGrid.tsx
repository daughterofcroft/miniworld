import type { TileData } from "../hooks/useWorldState";

interface WorldGridProps {
  grid: (TileData | null)[];
  width: number;
  height: number;
  onCellClick: (x: number, y: number) => void;
  selectedCell: { x: number; y: number } | null;
  disabled?: boolean;
}

function addressToHue(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function cellStyle(tile: TileData | null): React.CSSProperties {
  if (!tile) return {};
  if (tile.tileType === 1) {
    return {
      background: "var(--mw-life)",
      boxShadow: "0 0 6px rgba(74, 222, 128, 0.3), inset 0 0 2px rgba(255,255,255,0.1)",
    };
  }
  const hue = addressToHue(tile.owner);
  return {
    background: `hsl(${hue}, 65%, 55%)`,
    boxShadow: `0 0 6px hsla(${hue}, 65%, 55%, 0.35), inset 0 0 2px rgba(255,255,255,0.15)`,
  };
}

export function WorldGrid({
  grid,
  width,
  height,
  onCellClick,
  selectedCell,
  disabled,
}: WorldGridProps) {
  return (
    <div
      style={{
        background: "var(--mw-surface)",
        border: "1px solid var(--mw-border)",
        borderRadius: "var(--mw-r-lg)",
        padding: 16,
        width: "fit-content",
        margin: "0 auto",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${width}, 1fr)`,
          gap: "1px",
          width: Math.min(512, width * 16),
          height: Math.min(512, height * 16),
        }}
      >
        {Array.from({ length: width * height }, (_, idx) => {
          const x = idx % width;
          const y = Math.floor(idx / width);
          const tile = grid[idx] ?? null;
          const isSelected = selectedCell?.x === x && selectedCell?.y === y;
          const alive = tile !== null;

          return (
            <div
              key={idx}
              onClick={() => !disabled && onCellClick(x, y)}
              title={
                tile
                  ? `(${x},${y}) owner: ${String(tile.owner).slice(0, 8)}... type: ${tile.tileType}`
                  : `(${x},${y}) empty`
              }
              style={{
                borderRadius: 1,
                background: alive ? undefined : "rgba(255,255,255,0.025)",
                cursor: disabled ? "default" : "crosshair",
                outline: isSelected ? "2px solid var(--mw-text)" : undefined,
                outlineOffset: isSelected ? "-1px" : undefined,
                zIndex: isSelected ? 1 : undefined,
                transition: "background 0.15s ease, box-shadow 0.15s ease",
                ...cellStyle(tile),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
