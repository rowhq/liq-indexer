import { createConfig } from "@ponder/core";
import { http } from "viem";

import { ICorePoolManagerAbi } from "./abis/ICorePoolManager";

export default createConfig({
  networks: {
    // Configure networks where your contracts are deployed
    // Update these with your actual RPC endpoints
    optimism: {
      chainId: 10,
      transport: http(process.env.PONDER_RPC_URL_10),
    },
    // Add more networks as needed
    // base: {
    //   chainId: 8453,
    //   transport: http(process.env.PONDER_RPC_URL_8453),
    // },
  },
  contracts: {
    CorePoolManager: {
      abi: ICorePoolManagerAbi,
      network: {
        // Configure for each network where the contract is deployed
        optimism: {
          address: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual address
          startBlock: 0, // TODO: Replace with deployment block
        },
        // base: {
        //   address: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual address
        //   startBlock: 0, // TODO: Replace with deployment block
        // },
      },
    },
  },
});
