import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { useNetworkVariable } from "../networkConfig";
import { toBase64 } from "@mysten/sui/utils";

interface DeployAgentProps {
  worldId: string;
  onDeployed: () => void;
}

export function DeployAgent({ worldId, onDeployed }: DeployAgentProps) {
  const packageId = useNetworkVariable("packageId");
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [step, setStep] = useState<"idle" | "generated" | "deploying" | "success">("idle");
  const [keypair, setKeypair] = useState<Ed25519Keypair | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ agentId: string; capId: string } | null>(null);

  if (!currentAccount) {
    return null;
  }

  const handleGenerate = () => {
    const kp = new Ed25519Keypair();
    setKeypair(kp);
    setAgentAddress(kp.toSuiAddress());
    setStep("generated");
    setDownloaded(false);
    setError(null);
  };

  const handleDownloadEnv = () => {
    if (!keypair) return;

    // getSecretKey() returns base64 string in Sui SDK 1.x
    // For the crank, we need base64 with scheme byte prefix (0x00 for Ed25519)
    const secretKeyBytes = keypair.getSecretKey();
    // secretKeyBytes is a base64 string of the raw 32-byte key
    // The crank expects: base64(schemeByte + secretKey) — standard Sui keystore format
    const rawBytes = Uint8Array.from(atob(secretKeyBytes), (c) => c.charCodeAt(0));
    const withScheme = new Uint8Array(rawBytes.length + 1);
    withScheme[0] = 0x00; // Ed25519 scheme flag
    withScheme.set(rawBytes, 1);
    const encodedKey = toBase64(withScheme);

    const content = `# Agent runner configuration
MINIWORLD_PACKAGE_ID=${packageId}
MINIWORLD_WORLD_ID=${worldId}
MINIWORLD_AGENT_ID=<fill after deploy — see console output>
MINIWORLD_AGENT_CAP_ID=<fill after deploy — see console output>
AGENT_SECRET_KEY=${encodedKey}
PULSE_INTERVAL_MS=60000
`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-${worldId.slice(0, 8)}.env`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  const handleDeploy = () => {
    if (!agentAddress) return;
    setStep("deploying");
    setError(null);

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::agent::deploy_agent`,
      arguments: [
        tx.object(worldId),
        tx.pure.address(agentAddress),
        tx.pure.u8(0), // strategy: 0 = Guardian
      ],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: async (txResult) => {
          try {
            const receipt = await suiClient.waitForTransaction({
              digest: txResult.digest,
              options: { showObjectChanges: true },
            });

            // Extract agent ID and cap ID from created objects
            let agentId = "";
            let capId = "";
            for (const change of receipt.objectChanges ?? []) {
              if (change.type === "created") {
                if (change.objectType.includes("::agent::Agent")) {
                  agentId = change.objectId;
                } else if (change.objectType.includes("::agent::AgentCap")) {
                  capId = change.objectId;
                }
              }
            }

            // Store in localStorage for convenience
            if (agentId) {
              localStorage.setItem(`miniworld_agent_id_${worldId}`, agentId);
            }
            if (agentAddress) {
              localStorage.setItem(`miniworld_agent_address_${worldId}`, agentAddress);
            }

            setResult({ agentId, capId });
            setStep("success");
            onDeployed();
          } catch {
            setStep("generated");
            setError("Transaction submitted but failed to read results");
          }
        },
        onError: (err) => {
          setStep("generated");
          const msg = err.message || "Transaction failed";
          if (msg.includes("ENotWorldOwner") || (msg.includes("MoveAbort") && msg.includes(", 200)"))) {
            setError("Only the world owner can deploy an agent");
          } else if (msg.includes("EAgentAlreadyDeployed") || (msg.includes("MoveAbort") && msg.includes(", 201)"))) {
            setError("An agent is already deployed on this world");
          } else {
            setError(msg);
          }
        },
      },
    );
  };

  if (step === "success" && result) {
    return (
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          border: "1px solid rgba(100, 200, 120, 0.3)",
          borderRadius: "var(--mw-r-md)",
          padding: "16px 20px",
          background: "rgba(100, 200, 120, 0.06)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--mw-font-display)",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--mw-text)",
            marginBottom: 10,
          }}
        >
          Agent Deployed
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <InfoRow label="Agent ID" value={result.agentId} />
          <InfoRow label="Cap ID" value={result.capId} />
          {agentAddress && <InfoRow label="Agent Address" value={agentAddress} />}
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: "var(--mw-font-body)",
            fontSize: 12,
            color: "var(--mw-muted)",
          }}
        >
          Update your .env file with the Agent ID and Cap ID above, then start the
          agent runner.
        </div>
      </div>
    );
  }

  if (step === "generated") {
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
            fontSize: 14,
            fontWeight: 500,
            color: "var(--mw-text)",
            marginBottom: 10,
          }}
        >
          Agent Keypair Generated
        </div>
        <div
          style={{
            fontFamily: "var(--mw-font-mono)",
            fontSize: 11,
            color: "var(--mw-muted)",
            marginBottom: 12,
            wordBreak: "break-all",
          }}
        >
          Address: {agentAddress}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={handleDownloadEnv}
            style={{
              fontFamily: "var(--mw-font-body)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--mw-accent)",
              background: "transparent",
              border: "1px solid rgba(230, 180, 80, 0.3)",
              padding: "7px 20px",
              borderRadius: "var(--mw-r-md)",
              cursor: "pointer",
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
            {downloaded ? "Downloaded" : "Download .env"}
          </button>

          <button
            onClick={handleDeploy}
            disabled={!downloaded}
            style={{
              fontFamily: "var(--mw-font-body)",
              fontSize: 13,
              fontWeight: 500,
              color: downloaded ? "var(--mw-accent)" : "var(--mw-muted)",
              background: "transparent",
              border: `1px solid ${downloaded ? "rgba(230, 180, 80, 0.3)" : "var(--mw-border)"}`,
              padding: "7px 20px",
              borderRadius: "var(--mw-r-md)",
              cursor: downloaded ? "pointer" : "not-allowed",
              opacity: downloaded ? 1 : 0.5,
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (downloaded) {
                e.currentTarget.style.background = "var(--mw-accent-dim)";
                e.currentTarget.style.borderColor = "var(--mw-accent)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = downloaded
                ? "rgba(230, 180, 80, 0.3)"
                : "var(--mw-border)";
            }}
          >
            Deploy Agent
          </button>
        </div>

        {!downloaded && (
          <div
            style={{
              marginTop: 8,
              fontFamily: "var(--mw-font-body)",
              fontSize: 11,
              color: "var(--mw-muted)",
            }}
          >
            Download the .env file first — you will need it to run the agent.
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 8,
              fontFamily: "var(--mw-font-body)",
              fontSize: 12,
              color: "var(--mw-error)",
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  // step === "idle" or "deploying"
  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={step === "deploying"}
        style={{
          fontFamily: "var(--mw-font-body)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--mw-accent)",
          background: "transparent",
          border: "1px solid rgba(230, 180, 80, 0.3)",
          padding: "7px 20px",
          borderRadius: "var(--mw-r-md)",
          cursor: step === "deploying" ? "wait" : "pointer",
          opacity: step === "deploying" ? 0.6 : 1,
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
        {step === "deploying" ? "Deploying..." : "Deploy Agent"}
      </button>
      {error && (
        <div
          style={{
            marginTop: 8,
            fontFamily: "var(--mw-font-body)",
            fontSize: 12,
            color: "var(--mw-error)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--mw-font-mono)",
        fontSize: 11,
        color: "var(--mw-muted)",
        wordBreak: "break-all",
      }}
    >
      <span style={{ color: "var(--mw-text)" }}>{label}:</span> {value}
    </div>
  );
}
