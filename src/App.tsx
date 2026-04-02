import { ConnectButton } from "@mysten/dapp-kit";
import { useState, useEffect, useCallback } from "react";
import { useNetworkVariable } from "./networkConfig";
import { useWorldState } from "./hooks/useWorldState";
import { useWalrusSnapshots } from "./hooks/useWalrusSnapshots";
import type { TileData } from "./hooks/useWorldState";
import { WorldGrid } from "./components/WorldGrid";
import { TilePlacer } from "./components/TilePlacer";
import { Timeline } from "./components/Timeline";

function App() {
  const worldId = useNetworkVariable("worldObjectId");
  const { worldState, isLoading, refetch } = useWorldState(worldId);
  const {
    manifest,
    loadSnapshot,
    isLoading: manifestLoading,
  } = useWalrusSnapshots();

  const [selectedCell, setSelectedCell] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [timelineEpoch, setTimelineEpoch] = useState<number | null>(null);
  const [historicalGrid, setHistoricalGrid] = useState<
    (TileData | null)[] | null
  >(null);

  useEffect(() => {
    const interval = setInterval(() => refetch(), 10_000);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    if (timelineEpoch === null) {
      setHistoricalGrid(null);
      return;
    }
    loadSnapshot(timelineEpoch).then((snap) => {
      if (snap) {
        setHistoricalGrid(
          snap.grid.map((cell) =>
            cell ? { tileType: cell.tileType, owner: cell.owner } : null,
          ),
        );
      }
    });
  }, [timelineEpoch, loadSnapshot]);

  const handlePlaced = useCallback(() => {
    setSelectedCell(null);
    setTimeout(() => refetch(), 2000);
  }, [refetch]);

  const isViewingHistory = timelineEpoch !== null && historicalGrid !== null;
  const displayGrid = isViewingHistory
    ? historicalGrid
    : worldState?.grid ?? [];
  const displayWidth = worldState?.width ?? 32;
  const displayHeight = worldState?.height ?? 32;

  return (
    <>
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 24px",
          borderBottom: "1px solid var(--mw-border)",
          position: "sticky",
          top: 0,
          background: "rgba(10, 14, 20, 0.9)",
          backdropFilter: "blur(12px)",
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontFamily: "var(--mw-font-logo)",
              fontSize: 24,
              color: "var(--mw-text)",
            }}
          >
            Miniworld
          </span>
          {worldState && (
            <span
              style={{
                fontFamily: "var(--mw-font-mono)",
                fontSize: 12,
                color: "var(--mw-accent)",
                background: "var(--mw-accent-dim)",
                padding: "3px 12px",
                borderRadius: "var(--mw-r-full)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: "var(--mw-life)",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "heartbeat 2s ease-in-out infinite",
                }}
              />
              Epoch {worldState.epoch}
            </span>
          )}
        </div>
        <ConnectButton />
      </header>

      {/* Main */}
      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "32px 16px 64px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        {isLoading ? (
          <div style={{ padding: "80px 0", color: "var(--mw-muted)" }}>
            Loading world...
          </div>
        ) : !worldState ? (
          <div style={{ padding: "80px 0", color: "var(--mw-error)" }}>
            Failed to load world. Check that the World ID is correct in
            constants.ts.
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={{ display: "flex", gap: 32, justifyContent: "center" }}>
              <Stat value={worldState.aliveCount} label="Alive" color="var(--mw-accent)" />
              <Stat value={worldState.width * worldState.height} label="Cells" />
              <Stat value={worldState.epoch} label="Epoch" />
            </div>

            {/* Grid */}
            <WorldGrid
              grid={displayGrid}
              width={displayWidth}
              height={displayHeight}
              onCellClick={(x, y) =>
                !isViewingHistory && setSelectedCell({ x, y })
              }
              selectedCell={isViewingHistory ? null : selectedCell}
              disabled={isViewingHistory}
            />

            {/* Controls */}
            {!isViewingHistory && (
              <TilePlacer
                worldId={worldId}
                selectedCell={selectedCell}
                onPlaced={handlePlaced}
              />
            )}

            {isViewingHistory && (
              <div
                style={{
                  fontFamily: "var(--mw-font-mono)",
                  fontSize: 12,
                  color: "var(--mw-accent)",
                }}
              >
                Viewing epoch {timelineEpoch}
              </div>
            )}

            {/* Timeline */}
            {!manifestLoading && manifest.length > 0 && (
              <Timeline
                manifest={manifest}
                currentEpoch={worldState.epoch}
                selectedEpoch={timelineEpoch}
                onSelectEpoch={setTimelineEpoch}
              />
            )}

            {/* Tagline */}
            <p
              style={{
                fontFamily: "var(--mw-font-display)",
                fontSize: 14,
                fontWeight: 300,
                color: "var(--mw-muted)",
                fontStyle: "italic",
                opacity: 0.7,
              }}
            >
              Worlds that evolve themselves
            </p>
          </>
        )}
      </main>
    </>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: "var(--mw-font-mono)",
          fontSize: 20,
          fontVariantNumeric: "tabular-nums",
          color: color ?? "var(--mw-text)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "var(--mw-muted)",
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default App;
