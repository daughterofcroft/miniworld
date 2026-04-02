import type { SnapshotEntry } from "../hooks/useWalrusSnapshots";

interface TimelineProps {
  manifest: SnapshotEntry[];
  currentEpoch: number;
  selectedEpoch: number | null;
  onSelectEpoch: (epoch: number | null) => void;
}

export function Timeline({
  manifest,
  currentEpoch,
  selectedEpoch,
  onSelectEpoch,
}: TimelineProps) {
  if (manifest.length === 0) {
    return (
      <div style={{ fontFamily: "var(--mw-font-mono)", fontSize: 11, color: "var(--mw-muted)" }}>
        No snapshots yet. Timeline available after crank runs.
      </div>
    );
  }

  const epochs = manifest.map((e) => e.epoch);
  const minEpoch = Math.min(...epochs);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const epoch = Number(e.target.value);
    if (epoch >= currentEpoch) {
      onSelectEpoch(null);
    } else {
      const closest = epochs.reduce((prev, curr) =>
        Math.abs(curr - epoch) < Math.abs(prev - epoch) ? curr : prev,
      );
      onSelectEpoch(closest);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 544 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: "var(--mw-font-mono)",
            fontSize: 11,
            color: "var(--mw-muted)",
          }}
        >
          Epoch {minEpoch}
        </span>
        <span
          style={{
            fontFamily: "var(--mw-font-mono)",
            fontSize: 11,
            fontWeight: 500,
            color: selectedEpoch !== null ? "var(--mw-accent)" : "var(--mw-life)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {selectedEpoch !== null ? (
            <>
              Epoch {selectedEpoch}
              <span
                onClick={() => onSelectEpoch(null)}
                style={{ cursor: "pointer", marginLeft: 8, opacity: 0.7 }}
              >
                Back to live
              </span>
            </>
          ) : (
            <>
              <span
                style={{
                  width: 5,
                  height: 5,
                  background: "var(--mw-life)",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "heartbeat 2s ease-in-out infinite",
                }}
              />
              Live
            </>
          )}
        </span>
        <span
          style={{
            fontFamily: "var(--mw-font-mono)",
            fontSize: 11,
            color: "var(--mw-muted)",
          }}
        >
          Epoch {currentEpoch}
        </span>
      </div>
      <input
        type="range"
        min={minEpoch}
        max={currentEpoch}
        step={1}
        value={selectedEpoch ?? currentEpoch}
        onChange={handleChange}
        style={{
          width: "100%",
          accentColor: "var(--mw-life)",
          height: 4,
        }}
      />
    </div>
  );
}
