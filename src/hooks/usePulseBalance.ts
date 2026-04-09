import { useQuery } from "@tanstack/react-query";
import { useSuiClient, useCurrentAccount } from "@mysten/dapp-kit";
import { useNetworkVariable } from "../networkConfig";

/**
 * Reads the PulsePool to get accumulated (unclaimed) balance for the
 * connected wallet. The PulsePool is a shared object with
 * Table<address, u64>. We read the Table's dynamic field for the
 * wallet address.
 *
 * Returns { balance, isLoading, refetch }.
 * balance is null when PULSE isn't deployed yet (empty pool ID).
 */
export function usePulseBalance() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const pulsePoolId = useNetworkVariable("pulsePoolId");

  const { data: balance, isPending, refetch } = useQuery({
    queryKey: ["pulse-balance", pulsePoolId, account?.address],
    queryFn: async (): Promise<number | null> => {
      if (!pulsePoolId || !account?.address) return null;

      // Read the PulsePool object to get the Table ID
      const poolObj = await client.getObject({
        id: pulsePoolId,
        options: { showContent: true },
      });

      if (poolObj.data?.content?.dataType !== "moveObject") return null;
      const fields = poolObj.data.content.fields as Record<string, any>;
      const tableId = fields.balances?.fields?.id?.id;
      if (!tableId) return 0;

      // Query the dynamic field for this address
      try {
        const dynField = await client.getDynamicFieldObject({
          parentId: tableId,
          name: {
            type: "address",
            value: account.address,
          },
        });

        if (dynField.data?.content?.dataType !== "moveObject") return 0;
        const dfFields = dynField.data.content.fields as Record<string, any>;
        return Number(dfFields.value ?? 0);
      } catch {
        // Dynamic field doesn't exist — user has no balance
        return 0;
      }
    },
    enabled: !!pulsePoolId && !!account?.address,
    refetchInterval: 15_000,
  });

  return {
    balance: balance ?? null,
    isLoading: isPending,
    refetch,
  };
}

/**
 * Reads the wallet's on-chain Coin<PULSE> balance (already claimed tokens).
 * Uses the PULSE coin type from the pulse package.
 */
export function usePulseCoinBalance() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const pulsePackageId = useNetworkVariable("pulsePackageId");

  const { data: coinBalance, isPending, refetch } = useQuery({
    queryKey: ["pulse-coin-balance", pulsePackageId, account?.address],
    queryFn: async (): Promise<number | null> => {
      if (!pulsePackageId || !account?.address) return null;

      const coinType = `${pulsePackageId}::pulse::PULSE`;
      const balance = await client.getBalance({
        owner: account.address,
        coinType,
      });

      return Number(balance.totalBalance);
    },
    enabled: !!pulsePackageId && !!account?.address,
    refetchInterval: 15_000,
  });

  return {
    coinBalance: coinBalance ?? null,
    isLoading: isPending,
    refetch,
  };
}
