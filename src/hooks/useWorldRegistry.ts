import { useState, useEffect, useCallback } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { useNetworkVariable } from "../networkConfig";

export interface WorldSummary {
  worldId: string;
  epoch: number;
  aliveCount: number;
}

export function useWorldRegistry() {
  const client = useSuiClient();
  const registryId = useNetworkVariable("registryId");

  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorlds = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Paginate through all dynamic fields on the registry
      const worldIds: string[] = [];
      let cursor: string | null | undefined = undefined;
      let hasNext = true;

      while (hasNext) {
        const page = await client.getDynamicFields({
          parentId: registryId,
          ...(cursor ? { cursor } : {}),
        });

        for (const field of page.data) {
          // Each dynamic field's objectId points to a dynamic field object;
          // the value inside is the world ID string.
          // The field name contains the world ID as well.
          if (field.objectType && field.objectId) {
            worldIds.push(field.objectId);
          }
        }

        hasNext = page.hasNextPage;
        cursor = page.nextCursor;
      }

      if (worldIds.length === 0) {
        setWorlds([]);
        setIsLoading(false);
        return;
      }

      // Fetch the dynamic field objects to get the actual world IDs
      const fieldObjects = await client.multiGetObjects({
        ids: worldIds,
        options: { showContent: true },
      });

      const actualWorldIds: string[] = [];
      for (const obj of fieldObjects) {
        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as Record<string, any>;
          // Dynamic fields have a "value" field containing the stored value
          // and a "name" field containing the key
          const value = fields.value;
          if (typeof value === "string") {
            actualWorldIds.push(value);
          } else if (value && typeof value === "object" && value.fields) {
            // If value is a struct, try to extract ID
            actualWorldIds.push(fields.name as string);
          } else {
            // The name itself might be the world ID for set-type fields
            actualWorldIds.push(fields.name as string);
          }
        }
      }

      if (actualWorldIds.length === 0) {
        setWorlds([]);
        setIsLoading(false);
        return;
      }

      // Fetch world objects for metadata
      const worldObjects = await client.multiGetObjects({
        ids: actualWorldIds,
        options: { showContent: true },
      });

      const summaries: WorldSummary[] = [];
      for (const obj of worldObjects) {
        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as Record<string, any>;
          const epoch = Number(fields.epoch ?? 0);
          const rawGrid = (fields.grid as any[]) ?? [];
          let aliveCount = 0;
          for (const cell of rawGrid) {
            if (cell !== null && cell !== undefined && cell.fields) {
              aliveCount++;
            }
          }
          summaries.push({
            worldId: obj.data.objectId,
            epoch,
            aliveCount,
          });
        }
      }

      setWorlds(summaries);
    } catch (err: any) {
      setError(err.message ?? "Failed to load worlds");
    } finally {
      setIsLoading(false);
    }
  }, [client, registryId]);

  useEffect(() => {
    fetchWorlds();
  }, [fetchWorlds]);

  return { worlds, isLoading, error, refetch: fetchWorlds };
}
