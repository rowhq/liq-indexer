import { defineConfig } from "ponder";

export default defineConfig({
  networks: [
    {
      name: "base",
      chainId: 8453,
      rpcUrl: process.env.PONDER_RPC_URL_8453 || "https://mainnet.base.org",
    },
    // Add more networks as needed
    // {
    //   name: "optimism",
    //   chainId: 10,
    //   rpcUrl: process.env.PONDER_RPC_URL_10 || "https://mainnet.optimism.io",
    // },
  ],
  contracts: [
    {
      name: "CorePoolManager",
      network: "base",
      abi: "./abis/ICorePoolManager.ts",
      address: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual address
      startBlock: 0, // TODO: Replace with deployment block
    },
    // Add more contract instances as needed
    // {
    //   name: "CorePoolManager",
    //   network: "optimism",
    //   abi: "./abis/ICorePoolManager.ts",
    //   address: "0x0000000000000000000000000000000000000000", // TODO: Replace with actual address
    //   startBlock: 0, // TODO: Replace with deployment block
    // },
  ],
});
