import { ConnectButton } from "@mysten/dapp-kit";
import { Box, Container, Flex, Heading, Text } from "@radix-ui/themes";
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

  // Auto-refresh world state every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => refetch(), 10_000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Load historical snapshot when timeline epoch changes
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
    // Refetch after a short delay to let the tx settle
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
      <Flex
        position="sticky"
        px="4"
        py="2"
        justify="between"
        align="center"
        style={{ borderBottom: "1px solid var(--gray-a2)", zIndex: 10 }}
      >
        <Flex align="center" gap="3">
          <Heading size="4">Miniworld</Heading>
          {worldState && (
            <Text size="2" color="gray">
              Epoch {worldState.epoch}
            </Text>
          )}
        </Flex>
        <ConnectButton />
      </Flex>

      {/* Main content */}
      <Container size="2" px="4" py="4">
        {isLoading ? (
          <Flex justify="center" py="9">
            <Text>Loading world...</Text>
          </Flex>
        ) : !worldState ? (
          <Flex justify="center" py="9">
            <Text color="red">
              Failed to load world. Check that the World ID is correct in
              constants.ts.
            </Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="4" align="center">
            {/* Stats bar */}
            <Flex gap="4" justify="center">
              <Text size="2">
                Alive: {worldState.aliveCount} / {worldState.width * worldState.height}
              </Text>
              <Text size="2" color="gray">
                Grid: {worldState.width}x{worldState.height}
              </Text>
            </Flex>

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

            {/* Tile placer (only in live view with wallet) */}
            {!isViewingHistory && (
              <TilePlacer
                worldId={worldId}
                selectedCell={selectedCell}
                onPlaced={handlePlaced}
              />
            )}

            {isViewingHistory && (
              <Text size="2" color="amber">
                Viewing historical snapshot (epoch {timelineEpoch})
              </Text>
            )}

            {/* Timeline */}
            {!manifestLoading && manifest.length > 0 && (
              <Box style={{ width: "100%", maxWidth: 520 }} pt="2">
                <Timeline
                  manifest={manifest}
                  currentEpoch={worldState.epoch}
                  selectedEpoch={timelineEpoch}
                  onSelectEpoch={setTimelineEpoch}
                />
              </Box>
            )}
          </Flex>
        )}
      </Container>
    </>
  );
}

export default App;
