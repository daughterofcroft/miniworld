import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { Button, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";
import { useNetworkVariable } from "../networkConfig";
import ClipLoader from "react-spinners/ClipLoader";

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
      <Text size="2" color="gray">
        Connect wallet to place tiles
      </Text>
    );
  }

  if (!selectedCell) {
    return (
      <Text size="2" color="gray">
        Click a cell on the grid to select it
      </Text>
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
        tx.pure.u8(0), // tile_type 0 = user-placed
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
    <Flex direction="column" gap="2" align="center">
      <Text size="2">
        Selected: ({selectedCell.x}, {selectedCell.y})
      </Text>
      <Button
        onClick={handlePlace}
        disabled={placing}
        size="2"
      >
        {placing ? <ClipLoader size={16} color="white" /> : "Place Tile"}
      </Button>
      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}
    </Flex>
  );
}
