import { useAgentState, useAgentBalance } from "../hooks/useAgentState";
import { useAgentMemory } from "../hooks/useAgentMemory";

const STRATEGY_LABELS: Record<number, string> = {
  0: "Guardian",
  1: "Sentinel",
  2: "Warden",
  3: "Keeper",
  4: "Shepherd",
};

const STRATEGY_ICONS: Record<number, string> = {
  0: "\u{1f6e1}",  // shield
  1: "\u{1f441}",  // eye
  2: "\u{1f512}",  // lock
  3: "\u{1f511}",  // key
  4: "\u{1f33f}",  // herb
};

/**
 * Generate a fun name from an agent ID (first 8 hex chars mapped to
 * adjective + noun pairs).
 */
function agentNickname(agentId: string): string {
  const hex = agentId.replace(/^0x/, "").slice(0, 8);
  const adjectives = [
    "Swift", "Quiet", "Bold", "Keen", "Bright",
    "Calm", "Dark", "Fierce", "Iron", "Jade",
    "Noble", "Prime", "Sage", "True", "Vast",
    "Warm",
  ];
  const nouns = [
    "Fox", "Hawk", "Wolf", "Lynx", "Bear",
    "Deer", "Crow", "Moth", "Vole", "Wren",
    "Pike", "Dove", "Hare", "Newt", "Ibis",
    "Seal",
  ];
  const a = parseInt(hex.slice(0, 4), 16) % adjectives.length;
  const n = parseInt(hex.slice(4, 8), 16) % nouns.length;
  return `${adjectives[a]} ${nouns[n]}`;
}

interface AgentPanelProps {
  agentId: string;
  worldId: string;
}

export function AgentPanel({ agentId, worldId }: AgentPanelProps) {
  const { data: agent, isLoading } = useAgentState(agentId);

  // Read agent-runner address from localStorage for balance check
  const agentAddress =
    typeof window !== "undefined"
      ? localStorage.getItem(`miniworld_agent_address_${worldId}`)
      : null;
  const { data: balance } = useAgentBalance(agentAddress);

  // Read agent observation manifest from localStorage
  const manifestBlobId =
    typeof window !== "undefined"
      ? localStorage.getItem(`miniworld_agent_manifest_${worldId}`)
      : null;
  const {
    observations,
    isLoading: memoryLoading,
  } = useAgentMemory(manifestBlobId);

  if (isLoading) {
    return (
      <div
        style={{
          fontFamily: "var(--mw-font-body)",
          fontSize: 13,
          color: "var(--mw-muted)",
        }}
      >
        Loading agent...
      </div>
    );
  }

  if (!agent) {
    return (
      <div
        style={{
          fontFamily: "var(--mw-font-body)",
          fontSize: 13,
          color: "var(--mw-error)",
        }}
      >
        Agent not found
      </div>
    );
  }

  const strategyLabel = STRATEGY_LABELS[agent.strategy] ?? `Strategy ${agent.strategy}`;
  const strategyIcon = STRATEGY_ICONS[agent.strategy] ?? "\u{1f916}";
  const nickname = agentNickname(agentId);
  const showLowGas = balance !== null && balance !== undefined && balance < 0.1;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 400,
        border: "1px solid var(--mw-border)",
        borderRadius: "var(--mw-r-md)",
        padding: "16px 20px",
        background: "var(--mw-surface)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mw-font-display)",
          fontSize: 15,
          fontWeight: 500,
          color: "var(--mw-text)",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>{strategyIcon}</span>
        {nickname}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Row label="Strategy" value={strategyLabel} />
        <Row label="Tiles Defended" value={String(agent.actionsTaken)} />
        <Row label="Last Action" value={agent.lastActionEpoch > 0 ? `Epoch ${agent.lastActionEpoch}` : "None yet"} />
      </div>

      {/* Recent Activity Feed */}
      <ActivityFeed observations={observations} isLoading={memoryLoading} />

      {showLowGas && (
        <div
          style={{
            marginTop: 12,
            padding: "6px 12px",
            borderRadius: "var(--mw-r-md)",
            background: "rgba(230, 160, 40, 0.12)",
            border: "1px solid rgba(230, 160, 40, 0.3)",
            fontFamily: "var(--mw-font-body)",
            fontSize: 12,
            color: "#e0a028",
          }}
        >
          Low Gas ({balance!.toFixed(3)} SUI) — fund the agent address to keep it running
        </div>
      )}

      {agentAddress && (
        <div
          style={{
            marginTop: 12,
            fontFamily: "var(--mw-font-mono)",
            fontSize: 11,
            color: "var(--mw-muted)",
          }}
        >
          Agent: {agentAddress.slice(0, 10)}...{agentAddress.slice(-6)}
        </div>
      )}

      <div
        style={{
          marginTop: 4,
          fontFamily: "var(--mw-font-mono)",
          fontSize: 11,
          color: "var(--mw-muted)",
        }}
      >
        ID: {agentId.slice(0, 10)}...{agentId.slice(-6)}
      </div>
    </div>
  );
}

function ActivityFeed({
  observations,
  isLoading,
}: {
  observations: { epoch: number; blobId: string; timestamp: number }[];
  isLoading: boolean;
}) {
  // Show last 10 entries, newest first
  const recent = observations.slice(-10).reverse();

  return (
    <div
      style={{
        marginTop: 12,
        borderTop: "1px solid var(--mw-border)",
        paddingTop: 10,
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
          marginBottom: 6,
        }}
      >
        Recent Activity
      </div>

      {isLoading ? (
        <div
          style={{
            fontFamily: "var(--mw-font-body)",
            fontSize: 12,
            color: "var(--mw-muted)",
          }}
        >
          Loading activity...
        </div>
      ) : recent.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--mw-font-body)",
            fontSize: 12,
            color: "var(--mw-muted)",
            fontStyle: "italic",
          }}
        >
          No activity recorded yet
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {recent.map((entry) => (
            <div
              key={entry.epoch}
              style={{
                fontFamily: "var(--mw-font-mono)",
                fontSize: 11,
                color: "var(--mw-text)",
                display: "flex",
                gap: 6,
              }}
            >
              <span style={{ color: "var(--mw-muted)", minWidth: 60 }}>
                Epoch {entry.epoch}
              </span>
              <span style={{ color: "var(--mw-muted)", fontSize: 10 }}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontFamily: "var(--mw-font-body)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--mw-muted)" }}>{label}</span>
      <span style={{ color: "var(--mw-text)", fontFamily: "var(--mw-font-mono)" }}>
        {value}
      </span>
    </div>
  );
}
