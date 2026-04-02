import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";
import { useNetworkVariable } from "../networkConfig";

interface TilePlacerProps {
  worldId: string;
  selectedCell: { x: number; y: number } | null;
  onPlaced: () => void;
}

export function TilePlacer({
  worldId,
  selectedCell,
  onPlaced,
}: TilePlacerProps) {
  const packageId = useNetworkVariable("packageId");
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentAccount) {
    return (
      <div style={{ fontFamily: "var(--mw-font-body)", fontSize: 13, color: "var(--mw-muted)" }}>
        Connect wallet to place tiles
      </div>
    );
  }

  if (!selectedCell) {
    return (
      <div style={{ fontFamily: "var(--mw-font-body)", fontSize: 13, color: "var(--mw-muted)" }}>
        Click a cell on the grid to select it
      </div>
    );
  }

  const handlePlace = () => {
    setPlacing(true);
    setError(null);

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::world::place_tile`,
      arguments: [
        tx.object(worldId),
        tx.pure.u8(selectedCell.x),
        tx.pure.u8(selectedCell.y),
        tx.pure.u8(0),
      ],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          suiClient
            .waitForTransaction({ digest: result.digest })
            .then(() => {
              setPlacing(false);
              onPlaced();
            });
        },
        onError: (err) => {
          setPlacing(false);
          const msg = err.message || "Transaction failed";
          if (msg.includes("MoveAbort") && msg.includes(", 1)")) {
            setError("Rate limited: wait for the next pulse");
          } else if (msg.includes("MoveAbort") && msg.includes(", 0)")) {
            setError("Invalid coordinates");
          } else {
            setError(msg);
          }
        },
      },
    );
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span
        style={{
          fontFamily: "var(--mw-font-mono)",
          fontSize: 13,
          color: "var(--mw-muted)",
        }}
      >
        ({selectedCell.x}, {selectedCell.y})
      </span>
      <button
        onClick={handlePlace}
        disabled={placing}
        style={{
          fontFamily: "var(--mw-font-body)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--mw-accent)",
          background: "transparent",
          border: "1px solid rgba(230, 180, 80, 0.3)",
          padding: "7px 20px",
          borderRadius: "var(--mw-r-md)",
          cursor: placing ? "wait" : "pointer",
          opacity: placing ? 0.6 : 1,
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
        {placing ? "Placing..." : "Place Tile"}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: "var(--mw-error)" }}>{error}</span>
      )}
    </div>
  );
}
