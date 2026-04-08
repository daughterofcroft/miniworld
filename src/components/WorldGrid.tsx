import { useMemo } from "react";
import type { TileData } from "../hooks/useWorldState";
import { predictGrid, type CellPrediction } from "../lib/gol";

interface WorldGridProps {
  grid: (TileData | null)[];
  width: number;
  height: number;
  onCellClick: (x: number, y: number) => void;
  selectedCells: { x: number; y: number }[];
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
  // tile_type 2 = raid tile (hostile)
  if (tile.tileType === 2) {
    return {
      background: "#e05050",
      boxShadow: "0 0 6px rgba(224, 80, 80, 0.4), inset 0 0 2px rgba(255,255,255,0.1)",
    };
  }
  const hue = addressToHue(tile.owner);
  return {
    background: `hsl(${hue}, 65%, 55%)`,
    boxShadow: `0 0 6px hsla(${hue}, 65%, 55%, 0.35), inset 0 0 2px rgba(255,255,255,0.15)`,
  };
}

function predictionStyle(prediction: CellPrediction): React.CSSProperties {
  switch (prediction) {
    case 'safe':
      return {
        outline: "1px solid rgba(74, 222, 128, 0.35)",
        outlineOffset: "-1px",
      };
    case 'at-risk':
      return {
        animation: "pulse-warning 2s ease-in-out infinite",
      };
    case 'doomed':
      return {
        boxShadow: "inset 0 0 4px 1px rgba(239, 68, 68, 0.45)",
      };
    case 'birth':
      return {
        background: "radial-gradient(circle at center, rgba(96, 165, 250, 0.3) 30%, transparent 70%)",
      };
    case 'raider':
      return {
        outline: "1.5px solid #ef4444",
        outlineOffset: "-1px",
      };
    case 'dead':
    default:
      return {};
  }
}

export function WorldGrid({
  grid,
  width,
  height,
  onCellClick,
  selectedCells,
  disabled,
}: WorldGridProps) {
  const predictions = useMemo(
    () => predictGrid(grid, width, height),
    [grid, width, height],
  );

  // Build a lookup map for selected cells
  const selectedMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedCells.forEach((cell, idx) => {
      map.set(`${cell.x},${cell.y}`, idx + 1);
    });
    return map;
  }, [selectedCells]);

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
          const selectionNumber = selectedMap.get(`${x},${y}`);
          const isSelected = selectionNumber !== undefined;
          const alive = tile !== null;
          const prediction = predictions[idx];
          const pStyle = predictionStyle(prediction);

          return (
            <div
              key={idx}
              onClick={() => !disabled && onCellClick(x, y)}
              title={
                tile
                  ? `(${x},${y}) owner: ${String(tile.owner).slice(0, 8)}... type: ${tile.tileType} [${prediction}]`
                  : `(${x},${y}) empty${prediction === 'birth' ? ' [birth]' : ''}`
              }
              style={{
                borderRadius: 1,
                background: alive ? undefined : "rgba(255,255,255,0.025)",
                cursor: disabled ? "default" : "crosshair",
                outline: isSelected ? "2px solid var(--mw-text)" : undefined,
                outlineOffset: isSelected ? "-1px" : undefined,
                zIndex: isSelected ? 1 : undefined,
                transition: "background 0.15s ease, box-shadow 0.15s ease",
                position: isSelected ? "relative" : undefined,
                ...cellStyle(tile),
                ...(isSelected ? {} : pStyle),
              }}
            >
              {isSelected && (
                <span
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    fontSize: 8,
                    fontFamily: "var(--mw-font-mono)",
                    fontWeight: 700,
                    color: "var(--mw-text)",
                    lineHeight: 1,
                    pointerEvents: "none",
                    textShadow: "0 0 3px rgba(0,0,0,0.8)",
                  }}
                >
                  {selectionNumber}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
