import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { useNetworkVariable } from "../networkConfig";

export interface RaidEvent {
  sourceWorldId: string;
  targetWorldId: string;
  raider: string;
  x: number;
  y: number;
  pulseBurned: number;
  epoch: number;
  timestamp: number;
}

/**
 * Query RaidAction events for a given world (as target or source).
 * Returns the last 10 events sorted by epoch descending.
 */
export function useRaidLog(worldId: string) {
  const client = useSuiClient();
  const packageId = useNetworkVariable("packageId");

  const { data: raids, isPending } = useQuery({
    queryKey: ["raid-log", worldId, packageId],
    queryFn: async (): Promise<RaidEvent[]> => {
      if (!packageId) return [];

      const eventType = `${packageId}::raid::RaidAction`;

      try {
        const result = await client.queryEvents({
          query: { MoveEventType: eventType },
          order: "descending",
          limit: 50,
        });

        const events: RaidEvent[] = [];
        for (const ev of result.data) {
          const parsed = ev.parsedJson as Record<string, any>;
          if (!parsed) continue;

          const sourceWorldId = parsed.source_world_id as string;
          const targetWorldId = parsed.target_world_id as string;

          // Filter to events related to this world
          if (sourceWorldId !== worldId && targetWorldId !== worldId) continue;

          events.push({
            sourceWorldId,
            targetWorldId,
            raider: parsed.raider as string,
            x: Number(parsed.x),
            y: Number(parsed.y),
            pulseBurned: Number(parsed.pulse_burned),
            epoch: Number(parsed.epoch),
            timestamp: Number(ev.timestampMs ?? 0),
          });

          if (events.length >= 10) break;
        }

        return events;
      } catch {
        return [];
      }
    },
    refetchInterval: 30_000,
  });

  return {
    raids: raids ?? [],
    isLoading: isPending,
  };
}
