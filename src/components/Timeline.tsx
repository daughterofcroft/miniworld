import { Flex, Text, Slider } from "@radix-ui/themes";
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
      <Text size="1" color="gray">
        No snapshots yet. Timeline available after crank runs.
      </Text>
    );
  }

  const epochs = manifest.map((e) => e.epoch);
  const minEpoch = Math.min(...epochs);

  const handleChange = (value: number[]) => {
    const epoch = value[0];
    // If at max, show live
    if (epoch >= currentEpoch) {
      onSelectEpoch(null);
    } else {
      // Find closest snapshot epoch
      const closest = epochs.reduce((prev, curr) =>
        Math.abs(curr - epoch) < Math.abs(prev - epoch) ? curr : prev,
      );
      onSelectEpoch(closest);
    }
  };

  return (
    <Flex direction="column" gap="1" style={{ width: "100%", maxWidth: 520 }}>
      <Flex justify="between">
        <Text size="1" color="gray">
          Epoch {minEpoch}
        </Text>
        <Text size="1" weight="bold">
          {selectedEpoch !== null
            ? `Viewing epoch ${selectedEpoch}`
            : "Live"}
        </Text>
        <Text size="1" color="gray">
          Epoch {currentEpoch}
        </Text>
      </Flex>
      <Slider
        min={minEpoch}
        max={currentEpoch}
        step={1}
        value={[selectedEpoch ?? currentEpoch]}
        onValueChange={handleChange}
      />
      {selectedEpoch !== null && (
        <Text
          size="1"
          color="blue"
          style={{ cursor: "pointer", textAlign: "center" }}
          onClick={() => onSelectEpoch(null)}
        >
          Back to live
        </Text>
      )}
    </Flex>
  );
}
