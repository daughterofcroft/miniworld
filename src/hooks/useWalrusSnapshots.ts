import { useState, useEffect, useCallback } from "react";
import { WALRUS_AGGREGATOR_URL, WALRUS_MANIFEST_BLOB_ID } from "../constants";

export interface SnapshotEntry {
  epoch: number;
  blobId: string;
  timestamp: number;
}

export interface SnapshotGrid {
  epoch: number;
  timestamp: number;
  width: number;
  height: number;
  grid: (null | { tileType: number; owner: string })[];
}

export function useWalrusSnapshots() {
  const [manifest, setManifest] = useState<SnapshotEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load manifest from Walrus
  useEffect(() => {
    if (!WALRUS_MANIFEST_BLOB_ID) return;

    setIsLoading(true);
    fetch(`${WALRUS_AGGREGATOR_URL}/v1/blobs/${WALRUS_MANIFEST_BLOB_ID}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SnapshotEntry[]) => {
        setManifest(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Load a specific snapshot by epoch
  const loadSnapshot = useCallback(
    async (epoch: number): Promise<SnapshotGrid | null> => {
      const entry = manifest.find((e) => e.epoch === epoch);
      if (!entry) return null;

      try {
        const res = await fetch(
          `${WALRUS_AGGREGATOR_URL}/v1/blobs/${entry.blobId}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        console.error(`Failed to load snapshot epoch=${epoch}:`, err);
        return null;
      }
    },
    [manifest],
  );

  return { manifest, loadSnapshot, isLoading, error };
}
