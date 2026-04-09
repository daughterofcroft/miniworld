import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useNetworkVariable } from "../networkConfig";
import { usePulseCoinBalance } from "../hooks/usePulseBalance";

const RAID_COST = 100;

interface RaidButtonProps {
  targetWorldId: string;
  onRaidSuccess: () => void;
}

/**
 * Raid button — visible when viewing someone else's world.
 * Flow: idle -> targeting -> confirm -> raiding -> idle
 */
export function RaidButton({ targetWorldId, onRaidSuccess }: RaidButtonProps) {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const packageId = useNetworkVariable("packageId");
  const pulsePackageId = useNetworkVariable("pulsePackageId");
  const pulseVaultId = useNetworkVariable("pulseVaultId");
  const { coinBalance } = usePulseCoinBalance();

  const [mode, setMode] = useState<"idle" | "targeting" | "confirm" | "raiding">("idle");
  const [targetCell, setTargetCell] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get source world from localStorage (most recently visited own world)
  const sourceWorldId =
    typeof window !== "undefined"
      ? localStorage.getItem("miniworld_last_own_world")
      : null;

  if (!currentAccount) return null;
  if (!pulsePackageId || !pulseVaultId) return null;

  const hasFunds = coinBalance !== null && coinBalance >= RAID_COST;
  const canRaid = hasFunds && !!sourceWorldId;

  const executeRaid = (x: number, y: number) => {
    if (!sourceWorldId) return;
    setMode("raiding");
    setError(null);

    const pulseCoinType = `${pulsePackageId}::pulse::PULSE`;

    suiClient
      .getCoins({
        owner: currentAccount.address,
        coinType: pulseCoinType,
      })
      .then((coins) => {
        if (coins.data.length === 0) {
          setError("No PULSE coins found");
          setMode("idle");
          return;
        }

        const tx = new Transaction();
        const allCoinIds = coins.data.map((c) => c.coinObjectId);

        // Merge all PULSE coins if multiple
        if (allCoinIds.length > 1) {
          tx.mergeCoins(
            tx.object(allCoinIds[0]),
            allCoinIds.slice(1).map((id) => tx.object(id)),
          );
        }

        const [raidPayment] = tx.splitCoins(tx.object(allCoinIds[0]), [
          tx.pure.u64(RAID_COST),
        ]);

        tx.moveCall({
          target: `${packageId}::raid::raid`,
          arguments: [
            tx.object(sourceWorldId),
            tx.object(targetWorldId),
            tx.object(pulseVaultId),
            raidPayment,
            tx.pure.u8(x),
            tx.pure.u8(y),
          ],
        });

        signAndExecute(
          { transaction: tx },
          {
            onSuccess: (result) => {
              suiClient
                .waitForTransaction({ digest: result.digest })
                .then(() => {
                  setMode("idle");
                  setTargetCell(null);
                  onRaidSuccess();
                });
            },
            onError: (err) => {
              setMode("idle");
              const msg = err.message || "Raid failed";
              if (msg.includes("303)")) {
                setError("Target cell is occupied");
              } else if (msg.includes("301)")) {
                setError("Raid rate limited: 1 per epoch");
              } else if (msg.includes("300)")) {
                setError("Your source world needs an agent deployed");
              } else {
                setError(msg);
              }
            },
          },
        );
      })
      .catch((err) => {
        setMode("idle");
        setError(err.message || "Failed to build raid transaction");
      });
  };

  const handleCancel = () => {
    setMode("idle");
    setTargetCell(null);
    setError(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      {mode === "idle" && (
        <button
          onClick={() => {
            setError(null);
            setMode("targeting");
          }}
          disabled={!canRaid}
          style={{
            fontFamily: "var(--mw-font-body)",
            fontSize: 13,
            fontWeight: 500,
            color: canRaid ? "#e05050" : "var(--mw-muted)",
            background: "transparent",
            border: `1px solid ${canRaid ? "rgba(224, 80, 80, 0.3)" : "var(--mw-border)"}`,
            padding: "7px 20px",
            borderRadius: "var(--mw-r-md)",
            cursor: canRaid ? "pointer" : "not-allowed",
            opacity: canRaid ? 1 : 0.5,
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (canRaid) {
              e.currentTarget.style.background = "rgba(224, 80, 80, 0.08)";
              e.currentTarget.style.borderColor = "#e05050";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = canRaid
              ? "rgba(224, 80, 80, 0.3)"
              : "var(--mw-border)";
          }}
        >
          Raid ({RAID_COST} PULSE)
        </button>
      )}

      {mode === "targeting" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--mw-font-body)",
              fontSize: 13,
              color: "#e05050",
            }}
          >
            Click an empty cell to raid
          </span>
          <button
            onClick={handleCancel}
            style={{
              fontFamily: "var(--mw-font-body)",
              fontSize: 12,
              color: "var(--mw-muted)",
              background: "transparent",
              border: "1px solid var(--mw-border)",
              padding: "5px 14px",
              borderRadius: "var(--mw-r-md)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {mode === "confirm" && targetCell && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--mw-font-mono)",
              fontSize: 13,
              color: "#e05050",
            }}
          >
            Raid ({targetCell.x},{targetCell.y}) for {RAID_COST} PULSE?
          </span>
          <button
            onClick={() => executeRaid(targetCell.x, targetCell.y)}
            style={{
              fontFamily: "var(--mw-font-body)",
              fontSize: 12,
              fontWeight: 500,
              color: "#e05050",
              background: "rgba(224, 80, 80, 0.08)",
              border: "1px solid rgba(224, 80, 80, 0.3)",
              padding: "5px 14px",
              borderRadius: "var(--mw-r-md)",
              cursor: "pointer",
            }}
          >
            Confirm
          </button>
          <button
            onClick={handleCancel}
            style={{
              fontFamily: "var(--mw-font-body)",
              fontSize: 12,
              color: "var(--mw-muted)",
              background: "transparent",
              border: "1px solid var(--mw-border)",
              padding: "5px 14px",
              borderRadius: "var(--mw-r-md)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {mode === "raiding" && (
        <span
          style={{
            fontFamily: "var(--mw-font-body)",
            fontSize: 13,
            color: "#e05050",
          }}
        >
          Raiding...
        </span>
      )}

      {!canRaid && mode === "idle" && !sourceWorldId && (
        <span
          style={{
            fontFamily: "var(--mw-font-body)",
            fontSize: 11,
            color: "var(--mw-muted)",
          }}
        >
          Visit your own world first to enable raiding
        </span>
      )}

      {!canRaid && mode === "idle" && sourceWorldId && !hasFunds && (
        <span
          style={{
            fontFamily: "var(--mw-font-body)",
            fontSize: 11,
            color: "var(--mw-muted)",
          }}
        >
          Need {RAID_COST} PULSE to raid
        </span>
      )}

      {error && (
        <span style={{ fontSize: 12, color: "var(--mw-error)" }}>{error}</span>
      )}
    </div>
  );
}

// Export a setter for targeting mode — WorldView can wire grid clicks
// to set the target cell when raid is in targeting mode
export function useRaidTargeting() {
  // This is a placeholder — the actual targeting is handled within
  // the RaidButton component via its mode state. For a more integrated
  // approach, we'd lift the raid state to WorldView. For the prototype,
  // the user clicks the "Raid" button, then clicks a cell in the grid,
  // then confirms. The grid click in WorldView should call the raid
  // target setter when in targeting mode.
  return null;
}
