import { useState, useEffect, useCallback } from "react";
import { WALRUS_AGGREGATOR_URL } from "../constants";

export interface ObservationEntry {
  epoch: number;
  blobId: string;
  timestamp: number;
}

export interface AgentObservation {
  epoch: number;
  timestamp: number;
  atRiskCount: number;
  savedTile: { x: number; y: number } | null;
  reason: string;
  aliveCount: number;
}

export function useAgentMemory(manifestBlobId: string | null) {
  const [observations, setObservations] = useState<ObservationEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load manifest from Walrus
  useEffect(() => {
    if (!manifestBlobId) return;

    setIsLoading(true);
    fetch(`${WALRUS_AGGREGATOR_URL}/v1/blobs/${manifestBlobId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ObservationEntry[]) => {
        setObservations(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [manifestBlobId]);

  // Load a specific observation by epoch
  const loadObservation = useCallback(
    async (epoch: number): Promise<AgentObservation | null> => {
      const entry = observations.find((e) => e.epoch === epoch);
      if (!entry) return null;

      try {
        const res = await fetch(
          `${WALRUS_AGGREGATOR_URL}/v1/blobs/${entry.blobId}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        console.error(`Failed to load observation epoch=${epoch}:`, err);
        return null;
      }
    },
    [observations],
  );

  return { observations, loadObservation, isLoading, error };
}
