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

      // Step 1: Read the WorldRegistry to get the Table's ID
      const registryObj = await client.getObject({
        id: registryId,
        options: { showContent: true },
      });

      if (!registryObj.data?.content || registryObj.data.content.dataType !== "moveObject") {
        setWorlds([]);
        setIsLoading(false);
        return;
      }

      const registryFields = registryObj.data.content.fields as Record<string, any>;
      const tableId = registryFields.worlds?.fields?.id?.id;
      const count = Number(registryFields.count ?? 0);

      if (!tableId || count === 0) {
        setWorlds([]);
        setIsLoading(false);
        return;
      }

      // Step 2: Paginate through the Table's dynamic fields
      const fieldObjectIds: string[] = [];
      let cursor: string | null | undefined = undefined;
      let hasNext = true;

      while (hasNext) {
        const page = await client.getDynamicFields({
          parentId: tableId,
          ...(cursor ? { cursor } : {}),
        });

        for (const field of page.data) {
          fieldObjectIds.push(field.objectId);
        }

        hasNext = page.hasNextPage;
        cursor = page.nextCursor;
      }

      if (fieldObjectIds.length === 0) {
        setWorlds([]);
        setIsLoading(false);
        return;
      }

      // Step 3: Fetch the dynamic field objects to extract world IDs
      const fieldObjects = await client.multiGetObjects({
        ids: fieldObjectIds,
        options: { showContent: true },
      });

      const actualWorldIds: string[] = [];
      for (const obj of fieldObjects) {
        if (obj.data?.content?.dataType === "moveObject") {
          const fields = obj.data.content.fields as Record<string, any>;
          // Table<u64, ID> stores: { name: u64, value: ID (string) }
          const value = fields.value;
          if (typeof value === "string") {
            actualWorldIds.push(value);
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
