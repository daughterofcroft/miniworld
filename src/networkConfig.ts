import { getFullnodeUrl } from "@mysten/sui/client";
import { TESTNET_PACKAGE_ID, TESTNET_WORLD_ID, TESTNET_REGISTRY_ID } from "./constants.ts";
import { createNetworkConfig } from "@mysten/dapp-kit";

const { networkConfig, useNetworkVariable, useNetworkVariables } =
  createNetworkConfig({
    testnet: {
      url: getFullnodeUrl("testnet"),
      variables: {
        packageId: TESTNET_PACKAGE_ID,
        worldObjectId: TESTNET_WORLD_ID,
        registryId: TESTNET_REGISTRY_ID,
      },
    },
  });

export { useNetworkVariable, useNetworkVariables, networkConfig };
