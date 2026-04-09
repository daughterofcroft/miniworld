import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";
import { useNetworkVariable } from "../networkConfig";
import { usePulseBalance } from "../hooks/usePulseBalance";

export function ClaimPulse() {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const pulsePackageId = useNetworkVariable("pulsePackageId");
  const pulseVaultId = useNetworkVariable("pulseVaultId");
  const pulsePoolId = useNetworkVariable("pulsePoolId");
  const { balance, refetch } = usePulseBalance();

  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!currentAccount) return null;
  if (!pulsePackageId || !pulseVaultId || !pulsePoolId) return null;
  if (balance === null || balance === 0) return null;

  const handleClaim = () => {
    setClaiming(true);
    setError(null);
    setSuccess(false);

    const tx = new Transaction();
    tx.moveCall({
      target: `${pulsePackageId}::pulse::claim_pulse`,
      arguments: [
        tx.object(pulseVaultId),
        tx.object(pulsePoolId),
      ],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          suiClient
            .waitForTransaction({ digest: result.digest })
            .then(() => {
              setClaiming(false);
              setSuccess(true);
              refetch();
              setTimeout(() => setSuccess(false), 3000);
            });
        },
        onError: (err) => {
          setClaiming(false);
          setError(err.message || "Claim failed");
        },
      },
    );
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        background: "var(--mw-surface)",
        border: "1px solid var(--mw-border)",
        borderRadius: "var(--mw-r-md)",
        width: "fit-content",
      }}
    >
      <span
        style={{
          fontFamily: "var(--mw-font-mono)",
          fontSize: 13,
          color: "#d4a026",
        }}
      >
        {balance} PULSE unclaimed
      </span>
      <button
        onClick={handleClaim}
        disabled={claiming}
        style={{
          fontFamily: "var(--mw-font-body)",
          fontSize: 12,
          fontWeight: 500,
          color: "#d4a026",
          background: "transparent",
          border: "1px solid rgba(212, 160, 38, 0.3)",
          padding: "5px 14px",
          borderRadius: "var(--mw-r-md)",
          cursor: claiming ? "wait" : "pointer",
          opacity: claiming ? 0.6 : 1,
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(212, 160, 38, 0.08)";
          e.currentTarget.style.borderColor = "#d4a026";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = "rgba(212, 160, 38, 0.3)";
        }}
      >
        {claiming ? "Claiming..." : "Claim"}
      </button>
      {success && (
        <span style={{ fontSize: 12, color: "var(--mw-life)" }}>Claimed!</span>
      )}
      {error && (
        <span style={{ fontSize: 12, color: "var(--mw-error)" }}>{error}</span>
      )}
    </div>
  );
}
