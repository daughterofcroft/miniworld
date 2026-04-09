import { useNavigate } from "react-router-dom";
import { ConnectButton } from "@mysten/dapp-kit";
import { useWorldRegistry } from "../hooks/useWorldRegistry";
import { useWorldState, type TileData } from "../hooks/useWorldState";
import { predictGrid } from "../lib/gol";
import { useMemo } from "react";

// Mini grid preview — shows a live world with prediction overlay
function LiveGridPreview({ worldId }: { worldId: string }) {
  const { worldState } = useWorldState(worldId);

  const predictions = useMemo(
    () =>
      worldState
        ? predictGrid(worldState.grid, worldState.width, worldState.height)
        : [],
    [worldState],
  );

  if (!worldState) return <GridSkeleton />;

  const size = worldState.width;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        gap: 1,
        width: "100%",
        maxWidth: 400,
        aspectRatio: "1",
        background: "var(--mw-surface)",
        borderRadius: "var(--mw-r-lg)",
        padding: 4,
        border: "1px solid var(--mw-border)",
      }}
    >
      {worldState.grid.map((tile, i) => {
        const pred = predictions[i];
        return (
          <div
            key={i}
            style={{
              borderRadius: 1,
              background: tileColor(tile, pred),
              boxShadow: tileGlow(tile, pred),
              transition: "background 0.3s ease, box-shadow 0.3s ease",
            }}
          />
        );
      })}
    </div>
  );
}

function tileColor(
  tile: TileData | null,
  pred: string | undefined,
): string {
  if (!tile) {
    if (pred === "birth") return "rgba(96, 165, 250, 0.2)";
    return "rgba(255,255,255,0.02)";
  }
  if (tile.tileType === 2) return "#ef4444";
  if (tile.tileType === 1) return "var(--mw-life)";
  // User tile: use prediction color
  if (pred === "doomed") return "#ef4444";
  if (pred === "at-risk") return "var(--mw-accent)";
  return "var(--mw-life)";
}

function tileGlow(
  tile: TileData | null,
  pred: string | undefined,
): string {
  if (!tile) return "none";
  if (pred === "doomed") return "0 0 4px rgba(239, 68, 68, 0.4)";
  if (pred === "at-risk") return "0 0 4px rgba(230, 180, 80, 0.4)";
  return "0 0 4px rgba(74, 222, 128, 0.2)";
}

function GridSkeleton() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 400,
        aspectRatio: "1",
        background: "var(--mw-surface)",
        borderRadius: "var(--mw-r-lg)",
        border: "1px solid var(--mw-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--mw-muted)",
        fontFamily: "var(--mw-font-mono)",
        fontSize: 12,
      }}
    >
      Loading world...
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const { worlds } = useWorldRegistry();

  // Find the most active world for the live preview
  const topWorld = useMemo(() => {
    if (worlds.length === 0) return null;
    return [...worlds].sort((a, b) => b.aliveCount - a.aliveCount)[0];
  }, [worlds]);

  // Top 3 for leaderboard teaser
  const top3 = useMemo(() => {
    return [...worlds].sort((a, b) => b.aliveCount - a.aliveCount).slice(0, 3);
  }, [worlds]);

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
        <span
          style={{
            fontFamily: "var(--mw-font-logo)",
            fontSize: 24,
            color: "var(--mw-text)",
          }}
        >
          Miniworld
        </span>
        <ConnectButton />
      </header>

      {/* Hero */}
      <section
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          padding: "64px 24px 48px",
          display: "flex",
          gap: 48,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <h1
            style={{
              fontFamily: "var(--mw-font-display)",
              fontSize: 48,
              fontWeight: 300,
              color: "var(--mw-text)",
              lineHeight: 1.1,
              marginBottom: 16,
            }}
          >
            Worlds that
            <br />
            <span style={{ color: "var(--mw-accent)" }}>evolve themselves</span>
          </h1>
          <p
            style={{
              fontFamily: "var(--mw-font-body)",
              fontSize: 18,
              color: "var(--mw-muted)",
              lineHeight: 1.6,
              marginBottom: 32,
              maxWidth: 440,
            }}
          >
            Persistent Game of Life worlds on Sui. Place tiles. Deploy AI agents
            to defend them. Raid your enemies. Earn PULSE.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/worlds")}
              style={{
                fontFamily: "var(--mw-font-body)",
                fontSize: 16,
                fontWeight: 600,
                padding: "12px 28px",
                background: "var(--mw-accent)",
                color: "#0a0e14",
                border: "none",
                borderRadius: "var(--mw-r-md)",
                cursor: "pointer",
              }}
            >
              Enter the Arena
            </button>
            {topWorld && (
              <button
                onClick={() => navigate(`/world/${topWorld.worldId}`)}
                style={{
                  fontFamily: "var(--mw-font-body)",
                  fontSize: 16,
                  fontWeight: 500,
                  padding: "12px 28px",
                  background: "transparent",
                  color: "var(--mw-text)",
                  border: "1px solid var(--mw-border)",
                  borderRadius: "var(--mw-r-md)",
                  cursor: "pointer",
                }}
              >
                Watch a World
              </button>
            )}
          </div>
        </div>

        {/* Live grid preview */}
        <div style={{ flex: "1 1 320px", display: "flex", justifyContent: "center" }}>
          {topWorld ? (
            <LiveGridPreview worldId={topWorld.worldId} />
          ) : (
            <GridSkeleton />
          )}
        </div>
      </section>

      {/* How it works */}
      <section
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          padding: "48px 24px",
          borderTop: "1px solid var(--mw-border)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--mw-font-display)",
            fontSize: 24,
            fontWeight: 400,
            color: "var(--mw-text)",
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          How it works
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 24,
          }}
        >
          {[
            {
              icon: "🟢",
              title: "Place",
              desc: "Drop up to 5 tiles per pulse. Build structures that survive Game of Life rules.",
            },
            {
              icon: "🛡",
              title: "Defend",
              desc: "Deploy a Guardian agent. It watches your world and protects at-risk tiles.",
            },
            {
              icon: "⚔️",
              title: "Raid",
              desc: "Spend PULSE to place hostile tiles on other worlds. Disrupt their structures.",
            },
            {
              icon: "💛",
              title: "Earn",
              desc: "Alive tiles mint PULSE every pulse. At-risk tiles earn 3x. Near raids, 4x.",
            },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                background: "var(--mw-surface)",
                border: "1px solid var(--mw-border)",
                borderRadius: "var(--mw-r-lg)",
                padding: "24px 20px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
              <div
                style={{
                  fontFamily: "var(--mw-font-display)",
                  fontSize: 18,
                  fontWeight: 400,
                  color: "var(--mw-text)",
                  marginBottom: 8,
                }}
              >
                {item.title}
              </div>
              <div
                style={{
                  fontFamily: "var(--mw-font-body)",
                  fontSize: 14,
                  color: "var(--mw-muted)",
                  lineHeight: 1.5,
                }}
              >
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Leaderboard teaser */}
      {top3.length > 0 && (
        <section
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: "48px 24px 80px",
            borderTop: "1px solid var(--mw-border)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--mw-font-display)",
              fontSize: 24,
              fontWeight: 400,
              color: "var(--mw-text)",
              marginBottom: 24,
              textAlign: "center",
            }}
          >
            Leaderboard
          </h2>
          <div
            style={{
              maxWidth: 480,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {top3.map((world, i) => (
              <div
                key={world.worldId}
                onClick={() => navigate(`/world/${world.worldId}`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "12px 16px",
                  background: "var(--mw-surface)",
                  border: "1px solid var(--mw-border)",
                  borderRadius: "var(--mw-r-md)",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mw-font-mono)",
                    fontSize: 20,
                    fontWeight: 500,
                    color:
                      i === 0
                        ? "var(--mw-accent)"
                        : i === 1
                          ? "#c0c0c0"
                          : "#cd7f32",
                    width: 32,
                  }}
                >
                  #{i + 1}
                </span>
                <span
                  style={{
                    fontFamily: "var(--mw-font-mono)",
                    fontSize: 13,
                    color: "var(--mw-muted)",
                    flex: 1,
                  }}
                >
                  {world.worldId.slice(0, 10)}...{world.worldId.slice(-6)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--mw-font-mono)",
                    fontSize: 14,
                    color: "var(--mw-life)",
                  }}
                >
                  {world.aliveCount} alive
                </span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button
              onClick={() => navigate("/worlds")}
              style={{
                fontFamily: "var(--mw-font-body)",
                fontSize: 14,
                fontWeight: 500,
                padding: "8px 20px",
                background: "transparent",
                color: "var(--mw-accent)",
                border: "1px solid var(--mw-accent)",
                borderRadius: "var(--mw-r-md)",
                cursor: "pointer",
              }}
            >
              View All Worlds
            </button>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--mw-border)",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--mw-font-body)",
            fontSize: 12,
            color: "var(--mw-muted)",
          }}
        >
          Miniworld is a Daughter of Croft protocol. Built on Sui + Walrus.
        </p>
      </footer>
    </>
  );
}
