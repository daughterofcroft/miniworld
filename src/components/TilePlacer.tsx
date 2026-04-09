import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useState } from "react";
import { useNetworkVariable } from "../networkConfig";

const MAX_PLACEMENTS = 5;

interface TilePlacerProps {
  worldId: string;
  selectedCells: { x: number; y: number }[];
  onPlaced: () => void;
}

export function TilePlacer({
  worldId,
  selectedCells,
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

  if (selectedCells.length === 0) {
    return (
      <div style={{ fontFamily: "var(--mw-font-body)", fontSize: 13, color: "var(--mw-muted)" }}>
        Click cells on the grid to select (up to {MAX_PLACEMENTS})
      </div>
    );
  }

  const handlePlace = () => {
    setPlacing(true);
    setError(null);

    const tx = new Transaction();
    for (const cell of selectedCells) {
      tx.moveCall({
        target: `${packageId}::world::place_tile_v2`,
        arguments: [
          tx.object(worldId),
          tx.pure.u8(cell.x),
          tx.pure.u8(cell.y),
          tx.pure.u8(0),
        ],
      });
    }

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
            setError("Rate limited: max 5 placements per epoch");
          } else if (msg.includes("MoveAbort") && msg.includes(", 0)")) {
            setError("Invalid coordinates");
          } else {
            setError(msg);
          }
        },
      },
    );
  };

  const n = selectedCells.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            fontFamily: "var(--mw-font-mono)",
            fontSize: 13,
            color: n >= MAX_PLACEMENTS ? "var(--mw-accent)" : "var(--mw-muted)",
          }}
        >
          {n}/{MAX_PLACEMENTS} placements
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
          {placing ? "Placing..." : `Place ${n} Tile${n > 1 ? "s" : ""}`}
        </button>
      </div>
      <div
        style={{
          fontFamily: "var(--mw-font-mono)",
          fontSize: 11,
          color: "var(--mw-muted)",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {selectedCells.map((cell, i) => (
          <span key={`${cell.x}-${cell.y}`}>
            {i + 1}. ({cell.x},{cell.y})
          </span>
        ))}
      </div>
      {error && (
        <span style={{ fontSize: 12, color: "var(--mw-error)" }}>{error}</span>
      )}
    </div>
  );
}
