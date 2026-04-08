import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";

export interface AgentState {
  id: string;
  owner: string;
  worldId: string;
  strategy: number;
  actionsTaken: number;
  lastActionEpoch: number;
}

export function useAgentState(agentId: string | null) {
  const client = useSuiClient();

  return useQuery({
    queryKey: ["agent", agentId],
    queryFn: async () => {
      if (!agentId) return null;
      const obj = await client.getObject({
        id: agentId,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== "moveObject")
        return null;
      const fields = obj.data.content.fields as Record<string, any>;
      return {
        id: agentId,
        owner: fields.owner as string,
        worldId: fields.world_id as string,
        strategy: Number(fields.strategy),
        actionsTaken: Number(fields.actions_taken),
        lastActionEpoch: Number(fields.last_action_epoch),
      } as AgentState;
    },
    enabled: !!agentId,
    refetchInterval: 10_000,
  });
}

export function useAgentBalance(agentAddress: string | null) {
  const client = useSuiClient();

  return useQuery({
    queryKey: ["agent-balance", agentAddress],
    queryFn: async () => {
      if (!agentAddress) return null;
      const balance = await client.getBalance({ owner: agentAddress });
      return Number(balance.totalBalance) / 1_000_000_000; // MIST to SUI
    },
    enabled: !!agentAddress,
    refetchInterval: 30_000,
  });
}
