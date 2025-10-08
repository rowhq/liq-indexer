export default [
  {
    "type": "function",
    "name": "getPools",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "PoolManagerDeployed",
    "inputs": [
      {
        "name": "protocol",
        "type": "string",
        "indexed": true,
        "internalType": "string"
      },
      {
        "name": "pool",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "manager",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  }
] as const;
