import { Link } from "react-router-dom";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState, useMemo } from "react";
import { useNetworkVariable } from "../networkConfig";
import { useWorldRegistry } from "../hooks/useWorldRegistry";
import { Header } from "../components/Header";

export function WorldList() {
  const { worlds, isLoading, error, refetch } = useWorldRegistry();
  const packageId = useNetworkVariable("packageId");
  const registryId = useNetworkVariable("registryId");
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Sort worlds by alive count descending for leaderboard
  const sortedWorlds = useMemo(
    () => [...worlds].sort((a, b) => b.aliveCount - a.aliveCount),
    [worlds],
  );

  const handleCreateWorld = () => {
    setCreating(true);
    setCreateError(null);

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::world::create_world_v2`,
      arguments: [tx.object(registryId)],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          suiClient
            .waitForTransaction({ digest: result.digest })
            .then(() => {
              setCreating(false);
              refetch();
            });
        },
        onError: (err) => {
          setCreating(false);
          setCreateError(err.message || "Failed to create world");
        },
      },
    );
  };

  return (
    <>
      <Header />

      <main
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "32px 16px 64px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Title + create button row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--mw-font-display)",
              fontSize: 22,
              fontWeight: 400,
              color: "var(--mw-text)",
            }}
          >
            Leaderboard
          </h1>

          {currentAccount ? (
            <button
              onClick={handleCreateWorld}
              disabled={creating}
              style={{
                fontFamily: "var(--mw-font-body)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--mw-accent)",
                background: "transparent",
                border: "1px solid rgba(230, 180, 80, 0.3)",
                padding: "7px 20px",
                borderRadius: "var(--mw-r-md)",
                cursor: creating ? "wait" : "pointer",
                opacity: creating ? 0.6 : 1,
                transition: "background 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--mw-accent-dim)";
                e.currentTarget.style.borderColor = "var(--mw-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(230, 180, 80, 0.3)";
              }}
            >
              {creating ? "Creating..." : "Create World"}
            </button>
          ) : (
            <span
              style={{
                fontFamily: "var(--mw-font-body)",
                fontSize: 12,
                color: "var(--mw-muted)",
              }}
            >
              Connect wallet to create worlds
            </span>
          )}
        </div>

        {createError && (
          <div style={{ fontSize: 12, color: "var(--mw-error)" }}>
            {createError}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div
            style={{
              padding: "80px 0",
              textAlign: "center",
              color: "var(--mw-muted)",
            }}
          >
            Loading worlds...
          </div>
        ) : error ? (
          <div
            style={{
              padding: "80px 0",
              textAlign: "center",
              color: "var(--mw-error)",
            }}
          >
            {error}
          </div>
        ) : worlds.length === 0 ? (
          <div
            style={{
              padding: "80px 0",
              textAlign: "center",
              color: "var(--mw-muted)",
              fontFamily: "var(--mw-font-body)",
              fontSize: 14,
            }}
          >
            No worlds yet. Create the first one!
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {sortedWorlds.map((world, index) => {
              const rank = index + 1;
              const rankLabel = rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `#${rank}`;
              const rankColor = rank === 1 ? "#d4a026" : rank === 2 ? "#a0a0a0" : rank === 3 ? "#cd7f32" : "var(--mw-muted)";

              return (
                <Link
                  key={world.worldId}
                  to={`/world/${world.worldId}`}
                  style={{ textDecoration: "none" }}
                >
                  <div
                    style={{
                      background: "var(--mw-surface)",
                      border: "1px solid var(--mw-border)",
                      borderRadius: "var(--mw-r-lg)",
                      padding: 16,
                      transition: "border-color 0.15s, background 0.15s",
                      cursor: "pointer",
                      position: "relative",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--mw-accent)";
                      e.currentTarget.style.background = "var(--mw-surface-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--mw-border)";
                      e.currentTarget.style.background = "var(--mw-surface)";
                    }}
                  >
                    {/* Rank badge */}
                    <div
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 10,
                        fontFamily: "var(--mw-font-mono)",
                        fontSize: rank <= 3 ? 13 : 11,
                        fontWeight: rank <= 3 ? 700 : 400,
                        color: rankColor,
                      }}
                    >
                      {rankLabel}
                    </div>

                    {/* World ID */}
                    <div
                      style={{
                        fontFamily: "var(--mw-font-mono)",
                        fontSize: 11,
                        color: "var(--mw-muted)",
                        marginBottom: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        paddingRight: 40,
                      }}
                    >
                      {world.worldId.slice(0, 8)}...{world.worldId.slice(-6)}
                    </div>

                    {/* Stats row */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: "var(--mw-font-mono)",
                            fontSize: 16,
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--mw-accent)",
                            lineHeight: 1.2,
                          }}
                        >
                          {world.aliveCount}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: "var(--mw-muted)",
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.08em",
                            marginTop: 2,
                          }}
                        >
                          Alive
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontFamily: "var(--mw-font-mono)",
                            fontSize: 16,
                            fontVariantNumeric: "tabular-nums",
                            color: "var(--mw-text)",
                            lineHeight: 1.2,
                          }}
                        >
                          {world.epoch}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            color: "var(--mw-muted)",
                            textTransform: "uppercase" as const,
                            letterSpacing: "0.08em",
                            marginTop: 2,
                          }}
                        >
                          Epoch
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
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
            textAlign: "center",
            marginTop: 16,
          }}
        >
          Worlds that evolve themselves
        </p>
      </main>
    </>
  );
}
