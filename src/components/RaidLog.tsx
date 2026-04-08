import { useRaidLog } from "../hooks/useRaidLog";

interface RaidLogProps {
  worldId: string;
}

export function RaidLog({ worldId }: RaidLogProps) {
  const { raids, isLoading } = useRaidLog(worldId);

  if (isLoading || raids.length === 0) return null;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 400,
        border: "1px solid var(--mw-border)",
        borderRadius: "var(--mw-r-md)",
        padding: "12px 16px",
        background: "var(--mw-surface)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mw-font-body)",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--mw-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        Recent Raids
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {raids.map((raid, i) => {
          const isIncoming = raid.targetWorldId === worldId;
          return (
            <div
              key={`${raid.epoch}-${raid.x}-${raid.y}-${i}`}
              style={{
                fontFamily: "var(--mw-font-mono)",
                fontSize: 11,
                color: "var(--mw-text)",
                display: "flex",
                gap: 8,
                alignItems: "baseline",
              }}
            >
              <span style={{ color: "var(--mw-muted)", minWidth: 52 }}>
                E{raid.epoch}
              </span>
              <span style={{ color: isIncoming ? "#e05050" : "var(--mw-life)" }}>
                {isIncoming ? "IN" : "OUT"}
              </span>
              <span>
                ({raid.x},{raid.y})
              </span>
              <span style={{ color: "var(--mw-muted)", fontSize: 10 }}>
                {raid.raider.slice(0, 6)}...
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
