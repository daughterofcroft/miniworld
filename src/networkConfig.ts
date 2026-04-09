import { getFullnodeUrl } from "@mysten/sui/client";
import {
  TESTNET_PACKAGE_ID,
  TESTNET_WORLD_ID,
  TESTNET_REGISTRY_ID,
  TESTNET_PULSE_PACKAGE_ID,
  TESTNET_PULSE_VAULT_ID,
  TESTNET_PULSE_POOL_ID,
} from "./constants.ts";
import { createNetworkConfig } from "@mysten/dapp-kit";

const { networkConfig, useNetworkVariable, useNetworkVariables } =
  createNetworkConfig({
    testnet: {
      url: getFullnodeUrl("testnet"),
      variables: {
        packageId: TESTNET_PACKAGE_ID,
        worldObjectId: TESTNET_WORLD_ID,
        registryId: TESTNET_REGISTRY_ID,
        pulsePackageId: TESTNET_PULSE_PACKAGE_ID,
        pulseVaultId: TESTNET_PULSE_VAULT_ID,
        pulsePoolId: TESTNET_PULSE_POOL_ID,
      },
    },
  });

export { useNetworkVariable, useNetworkVariables, networkConfig };
