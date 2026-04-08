import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useWorldState } from "../hooks/useWorldState";
import { useWalrusSnapshots } from "../hooks/useWalrusSnapshots";
import type { TileData } from "../hooks/useWorldState";
import { WorldGrid } from "../components/WorldGrid";
import { TilePlacer } from "../components/TilePlacer";
import { Timeline } from "../components/Timeline";
import { Header } from "../components/Header";
import { AgentPanel } from "../components/AgentPanel";
import { DeployAgent } from "../components/DeployAgent";
import { ClaimPulse } from "../components/ClaimPulse";
import { RaidButton } from "../components/RaidButton";
import { RaidLog } from "../components/RaidLog";

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

export function WorldView() {
  const { worldId } = useParams<{ worldId: string }>();

  if (!worldId) {
    return (
      <>
        <Header />
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "80px 16px" }}>
          <div style={{ color: "var(--mw-error)", textAlign: "center" }}>
            No world ID provided. Go back to the{" "}
            <a href="/#/worlds" style={{ color: "var(--mw-accent)" }}>
              world list
            </a>
            .
          </div>
        </main>
      </>
    );
  }

  return <WorldViewInner worldId={worldId} />;
}

function WorldViewInner({ worldId }: { worldId: string }) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { worldState, isLoading, refetch } = useWorldState(worldId);
  const {
    manifest,
    loadSnapshot,
    isLoading: manifestLoading,
  } = useWalrusSnapshots();

  // Query dynamic fields on the world to find AgentDeployed and WorldOwner
  const { data: dynFields, refetch: refetchDynFields } = useQuery({
    queryKey: ["world-dyn-fields", worldId],
    queryFn: async () => {
      const page = await suiClient.getDynamicFields({ parentId: worldId });
      return page.data;
    },
    refetchInterval: 15_000,
  });

  const agentDynField = dynFields?.find((f) =>
    f.name.type.includes("AgentDeployed"),
  );
  const ownerDynField = dynFields?.find((f) =>
    f.name.type.includes("WorldOwner"),
  );

  // Read the agent ID from the AgentDeployed dynamic field value
  const { data: agentIdFromChain } = useQuery({
    queryKey: ["agent-id-field", agentDynField?.objectId],
    queryFn: async () => {
      if (!agentDynField) return null;
      const obj = await suiClient.getObject({
        id: agentDynField.objectId,
        options: { showContent: true },
      });
      if (obj.data?.content?.dataType !== "moveObject") return null;
      const fields = obj.data.content.fields as Record<string, any>;
      // Dynamic field object has { name, value } — value is the agent ID
      return (fields.value as string) ?? null;
    },
    enabled: !!agentDynField,
  });

  // Read world owner address from the WorldOwner dynamic field
  const { data: worldOwner } = useQuery({
    queryKey: ["world-owner-field", ownerDynField?.objectId],
    queryFn: async () => {
      if (!ownerDynField) return null;
      const obj = await suiClient.getObject({
        id: ownerDynField.objectId,
        options: { showContent: true },
      });
      if (obj.data?.content?.dataType !== "moveObject") return null;
      const fields = obj.data.content.fields as Record<string, any>;
      return (fields.value as string) ?? null;
    },
    enabled: !!ownerDynField,
  });

  // Also check localStorage as fallback for agent ID
  const agentId =
    agentIdFromChain ??
    (typeof window !== "undefined"
      ? localStorage.getItem(`miniworld_agent_id_${worldId}`)
      : null);

  const hasAgent = !!agentDynField || !!agentId;
  const isOwner =
    !!currentAccount && !!worldOwner && currentAccount.address === worldOwner;
  const canDeploy = isOwner && !hasAgent;

  const MAX_PLACEMENTS = 5;
  const [selectedCells, setSelectedCells] = useState<{ x: number; y: number }[]>([]);
  const [timelineEpoch, setTimelineEpoch] = useState<number | null>(null);
  const [historicalGrid, setHistoricalGrid] = useState<
    (TileData | null)[] | null
  >(null);
  const [awayBanner, setAwayBanner] = useState<{ epochs: number; aliveDelta: number } | null>(null);

  // Store this world as "last own world" if user is the owner (for raid source)
  useEffect(() => {
    if (isOwner && worldId) {
      localStorage.setItem("miniworld_last_own_world", worldId);
    }
  }, [isOwner, worldId]);

  // "While you were away" banner
  useEffect(() => {
    if (!worldState) return;
    const key = `last_seen_epoch_${worldId}`;
    const lastSeen = Number(localStorage.getItem(key) ?? 0);
    const currentEpoch = worldState.epoch;

    if (lastSeen > 0 && currentEpoch - lastSeen > 1) {
      // Calculate alive delta from stored count
      const aliveKey = `last_seen_alive_${worldId}`;
      const lastAlive = Number(localStorage.getItem(aliveKey) ?? 0);
      const aliveDelta = worldState.aliveCount - lastAlive;
      setAwayBanner({ epochs: currentEpoch - lastSeen, aliveDelta });
    }

    localStorage.setItem(key, String(currentEpoch));
    localStorage.setItem(`last_seen_alive_${worldId}`, String(worldState.aliveCount));
  }, [worldState?.epoch, worldId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      setSelectedCells((prev) => {
        const exists = prev.findIndex((c) => c.x === x && c.y === y);
        if (exists >= 0) {
          // Toggle off
          return [...prev.slice(0, exists), ...prev.slice(exists + 1)];
        }
        if (prev.length >= MAX_PLACEMENTS) return prev;
        return [...prev, { x, y }];
      });
    },
    [],
  );

  const handlePlaced = useCallback(() => {
    setSelectedCells([]);
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
      <Header epoch={worldState?.epoch} />

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
        {/* World ID badge */}
        <div
          style={{
            fontFamily: "var(--mw-font-mono)",
            fontSize: 11,
            color: "var(--mw-muted)",
            background: "var(--mw-surface)",
            border: "1px solid var(--mw-border)",
            padding: "4px 12px",
            borderRadius: "var(--mw-r-full)",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {worldId.slice(0, 8)}...{worldId.slice(-6)}
        </div>

        {/* While you were away banner */}
        {awayBanner && (
          <div
            style={{
              width: "100%",
              maxWidth: 400,
              padding: "10px 16px",
              background: "rgba(212, 160, 38, 0.08)",
              border: "1px solid rgba(212, 160, 38, 0.25)",
              borderRadius: "var(--mw-r-md)",
              fontFamily: "var(--mw-font-body)",
              fontSize: 13,
              color: "#d4a026",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              While you were away ({awayBanner.epochs} pulses):{" "}
              <strong>
                {awayBanner.aliveDelta > 0 ? "+" : ""}
                {awayBanner.aliveDelta} tiles changed
              </strong>
            </span>
            <button
              onClick={() => setAwayBanner(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#d4a026",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                padding: "0 4px",
              }}
            >
              x
            </button>
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: "80px 0", color: "var(--mw-muted)" }}>
            Loading world...
          </div>
        ) : !worldState ? (
          <div style={{ padding: "80px 0", color: "var(--mw-error)" }}>
            Failed to load world. The world ID may be invalid.
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={{ display: "flex", gap: 32, justifyContent: "center" }}>
              <Stat
                value={worldState.aliveCount}
                label="Alive"
                color="var(--mw-accent)"
              />
              <Stat value={worldState.width * worldState.height} label="Cells" />
              <Stat value={worldState.epoch} label="Epoch" />
            </div>

            {/* Grid */}
            <WorldGrid
              grid={displayGrid}
              width={displayWidth}
              height={displayHeight}
              onCellClick={(x, y) =>
                !isViewingHistory && handleCellClick(x, y)
              }
              selectedCells={isViewingHistory ? [] : selectedCells}
              disabled={isViewingHistory}
            />

            {/* Controls */}
            {!isViewingHistory && (
              <TilePlacer
                worldId={worldId}
                selectedCells={selectedCells}
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

            {/* Claim PULSE */}
            <ClaimPulse />

            {/* Raid (only when viewing someone else's world) */}
            {!isOwner && currentAccount && (
              <RaidButton
                targetWorldId={worldId}
                onRaidSuccess={() => {
                  setTimeout(() => refetch(), 2000);
                }}
              />
            )}

            {/* Raid log */}
            <RaidLog worldId={worldId} />

            {/* Agent section */}
            {hasAgent && agentId && (
              <AgentPanel agentId={agentId} worldId={worldId} />
            )}

            {canDeploy && (
              <DeployAgent
                worldId={worldId}
                onDeployed={() => refetchDynFields()}
              />
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
