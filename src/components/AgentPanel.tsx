import { useAgentState, useAgentBalance } from "../hooks/useAgentState";

const STRATEGY_LABELS: Record<number, string> = {
  0: "Guardian",
};

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
        <span style={{ fontSize: 16 }}>&#x1f6e1;</span>
        Guardian Agent
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Row label="Strategy" value={strategyLabel} />
        <Row label="Tiles Defended" value={String(agent.actionsTaken)} />
        <Row label="Last Action" value={agent.lastActionEpoch > 0 ? `Epoch ${agent.lastActionEpoch}` : "None yet"} />
      </div>

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
