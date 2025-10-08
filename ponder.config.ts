import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";
import PoolManagerFactoryAbi from "./abis/PoolManagerFactory";
import ICorePoolManagerAbi from "./abis/ICorePoolManager";

export default createConfig({
  chains: {
    base: {
      id: 8453,
      rpc: "https://lb.drpc.org/ogrpc?network=base&dkey=AkrZfCEJbkMGsnvldbtfwxqC5IdBNU4R8KcXbrRhIxXF",
    },
  },
  contracts: {
    PoolManagerFactory: {
      abi: PoolManagerFactoryAbi,
      chain: "base",
      address: "0x6EE9202e2a2f342bE53Aa49a6F6fC1275D21B2A7",
      startBlock: 36576600,
    },
    AerodromePoolManager: {
      abi: ICorePoolManagerAbi,
      chain: "base",
      address: factory({
        address: "0x6EE9202e2a2f342bE53Aa49a6F6fC1275D21B2A7",
        event: parseAbiItem("event PoolManagerDeployed(string indexed protocol, address indexed pool, address indexed manager)"),
        parameter: "manager",
      }),
      startBlock: 36576600,
    },
  },
});
