export interface TransactionInput {
  txid: string;
  vout: number;
  scriptSig: string; // Sender's signature (or address in this simplified ledger)
  amount: number; // Convenient cached value
}

export interface TransactionOutput {
  value: number; // Value in TANTA
  scriptPubKey: string; // Recipient's address
}

export interface Transaction {
  txid: string;
  vin: TransactionInput[];
  vout: TransactionOutput[];
  timestamp: number;
  blockHeight: number; // -1 if in mempool
  fee: number;
  isCoinbase: boolean;
}

export interface Block {
  hash: string;
  parentHash: string;
  merkleRoot: string;
  timestamp: number;
  height: number;
  nonce: number;
  difficulty: number; // Number of leading hex zeros required (e.g., 2, 3, 4)
  transactions: Transaction[];
  miner: string;
  reward: number; // block subsidy + transaction fees
}

export interface UTXO {
  txid: string;
  vout: number;
  address: string;
  amount: number;
}

export interface BlockchainInfo {
  chain: string; // 'mainnet'
  blocks: number;
  headers: number;
  bestblockhash: string;
  difficulty: number;
  mediantime: number;
  verificationprogress: number;
  chainwork: string;
  size_on_disk: number;
  pruned: boolean;
  warnings: string;
}

export interface MiningInfo {
  blocks: number;
  currentblocktx: number;
  difficulty: number;
  networkhashps: number;
  pooledtx: number;
  chain: string;
}

export interface SupplyInfo {
  coinName: string;
  symbol: string;
  maxSupply: number;
  currentSupply: number;
  burnedSupply: number;
  blockSubsidy: number;
  nextHalvingBlock: number;
  blocksToHalving: number;
  halvingsCompleted: number;
  percentMined: number;
}

export interface RPCRequest {
  jsonrpc: string;
  id: string | number | null;
  method: string;
  params: any[];
}

export interface RPCResponse {
  jsonrpc: string;
  id: string | number | null;
  result: any;
  error: {
    code: number;
    message: string;
    data?: any;
  } | null;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'success' | 'error' | 'unauthenticated';
  lastSynced: number | null;
  errorMsg: string | null;
  fileId: string | null;
}

export interface WalletKeyPair {
  privateKey: string;
  address: string;
}

