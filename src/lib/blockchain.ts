import { Block, Transaction, UTXO, BlockchainInfo, MiningInfo, SupplyInfo, WalletKeyPair } from '../types';

// Pure JavaScript SHA-256 implementation for synchronous mining / hashing
export function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const lengthProperty = 'length';
  let i, j;
  let result = '';

  const words: number[] = [];
  const asciiLength = ascii[lengthProperty] * 8;
  
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const asciiBitLength = asciiLength;
  const wordsLength = ((asciiLength + 64) >> 9) << 4;
  for (i = 0; i < wordsLength + 16; i++) words[i] = 0;
  for (i = 0; i < ascii[lengthProperty]; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  words[ascii[lengthProperty] >> 2] |= 0x80 << (24 - (ascii[lengthProperty] % 4) * 8);
  words[wordsLength + 15] = asciiBitLength;

  for (i = 0; i < wordsLength + 16; i += 16) {
    const w = [];
    for (j = 0; j < 16; j++) w[j] = words[i + j];
    for (j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = hash[0], b = hash[1], c = hash[2], d = hash[3], e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (j = 0; j < 64; j++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    const hex = (hash[i] >>> 0).toString(16);
    result += '00000000'.substring(hex.length) + hex;
  }
  return result;
}

// Generate an elegant, randomized transaction hash / block hash
export function calculateTxHash(tx: Omit<Transaction, 'txid'>): string {
  const content = JSON.stringify({
    vin: tx.vin,
    vout: tx.vout,
    timestamp: tx.timestamp,
    isCoinbase: tx.isCoinbase
  });
  return sha256Sync(content);
}

export function calculateBlockHash(block: Omit<Block, 'hash'>): string {
  const content = JSON.stringify({
    parentHash: block.parentHash,
    merkleRoot: block.merkleRoot,
    timestamp: block.timestamp,
    height: block.height,
    nonce: block.nonce,
    difficulty: block.difficulty,
    miner: block.miner
  });
  return sha256Sync(content);
}

// Simple Merkle Root calculator
export function calculateMerkleRoot(txs: Transaction[]): string {
  if (txs.length === 0) return '0'.repeat(64);
  let hashes = txs.map(tx => tx.txid);
  while (hashes.length > 1) {
    const temp: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      if (i + 1 < hashes.length) {
        temp.push(sha256Sync(hashes[i] + hashes[i + 1]));
      } else {
        temp.push(sha256Sync(hashes[i] + hashes[i]));
      }
    }
    hashes = temp;
  }
  return hashes[0];
}

// Deterministic wallet derivation and random generator helpers
export function generateNewWallet(): WalletKeyPair {
  const chars = '0123456789abcdef';
  let privateKey = '';
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    privateKey = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } else {
    for (let i = 0; i < 64; i++) {
      privateKey += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  const address = deriveAddressFromPrivateKey(privateKey);
  return { privateKey, address };
}

export function deriveAddressFromPrivateKey(privateKey: string): string {
  const hash = sha256Sync(privateKey);
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let derived = '';
  for (let i = 0; i < 20; i++) {
    const byteHex = hash.substring(i * 2, i * 2 + 2);
    const num = parseInt(byteHex, 16);
    derived += alphabet[num % alphabet.length];
  }
  return `Tanta${derived}`;
}

// CONSTANTS for TANTA Chain
export const MAX_SUPPLY = 21000000;
export const INITIAL_COINBASE_REWARD = 50;
export const DEFAULT_HALVING_INTERVAL = 1000; // Customizable so users can witness halvings in simulation!
export const REAL_HALVING_INTERVAL = 210000; // BTC Standard

export class TantaBlockchain {
  blocks: Block[] = [];
  mempool: Transaction[] = [];
  utxoPool: UTXO[] = [];
  halvingInterval: number = DEFAULT_HALVING_INTERVAL; // Default 1000 for realistic but reachable halving!
  miningDifficulty: number = 2; // Default starting difficulty (hex leading zeros)

  constructor(customHalvingInterval?: number) {
    if (customHalvingInterval) {
      this.halvingInterval = customHalvingInterval;
    }
  }

  // Set the halving interval dynamically (allows fast testing)
  setHalvingInterval(val: number) {
    this.halvingInterval = val;
  }

  // Get current Block Subsidy
  getBlockSubsidy(height: number): number {
    const halvings = Math.floor(height / this.halvingInterval);
    if (halvings >= 64) return 0; // Prevent overflow/underflow
    return INITIAL_COINBASE_REWARD / Math.pow(2, halvings);
  }

  // Initialize with Genesis and early mock blocks if empty
  initializeWithDefaults() {
    this.blocks = [];
    this.mempool = [];
    this.utxoPool = [];

    // --- 1. Genesis Block (Height 0) ---
    const genesisTimestamp = 1767225600000; // 2026-01-01 00:00:00 UTC
    const genesisMiner = 'SatoshiNakamotoTANTA';
    
    const genesisCoinbase: Transaction = {
      txid: '',
      vin: [{ txid: '0'.repeat(64), vout: -1, scriptSig: 'Mined in Tanta Mainnet - The Times 05/Jul/2026 New Decentralized Era Begins', amount: 50 }],
      vout: [{ value: 50, scriptPubKey: genesisMiner }],
      timestamp: genesisTimestamp,
      blockHeight: 0,
      fee: 0,
      isCoinbase: true
    };
    genesisCoinbase.txid = calculateTxHash(genesisCoinbase);

    const genesisBlockRaw: Omit<Block, 'hash'> = {
      parentHash: '0'.repeat(64),
      merkleRoot: genesisCoinbase.txid,
      timestamp: genesisTimestamp,
      height: 0,
      nonce: 1337,
      difficulty: 2,
      transactions: [genesisCoinbase],
      miner: genesisMiner,
      reward: 50
    };
    const genesisBlock: Block = {
      ...genesisBlockRaw,
      hash: calculateBlockHash(genesisBlockRaw)
    };

    this.blocks.push(genesisBlock);
    this.addUTXO(genesisCoinbase.txid, 0, genesisMiner, 50);

    // --- 2. Seed historical transactions and blocks (Height 1 to 5) to look realistic ---
    const users = ['TantaDevCreatorX9', 'EarlyAdopterAlice', 'EarlyAdopterBob', 'DeveloperCharlie'];
    let lastHash = genesisBlock.hash;
    let blockTime = genesisTimestamp + 10 * 60 * 1000; // +10 minutes

    for (let i = 1; i <= 5; i++) {
      const height = i;
      const subsidy = this.getBlockSubsidy(height);
      const miner = users[height % users.length];

      // Coinbase tx for this block
      const coinbaseTx: Transaction = {
        txid: '',
        vin: [{ txid: '0'.repeat(64), vout: -1, scriptSig: `Coinbase Block ${height} - Reward to ${miner}`, amount: subsidy }],
        vout: [{ value: subsidy, scriptPubKey: miner }],
        timestamp: blockTime,
        blockHeight: height,
        fee: 0,
        isCoinbase: true
      };
      coinbaseTx.txid = calculateTxHash(coinbaseTx);

      const blockTxs: Transaction[] = [coinbaseTx];

      // Add one user transaction in block 3 and 5 to look realistic
      if (height === 3) {
        // Satoshi sends 10 TANTA to Alice
        const aliceTx = this.createTransactionRaw('SatoshiNakamotoTANTA', 'EarlyAdopterAlice', 10, 0.05, blockTime);
        if (aliceTx) {
          aliceTx.blockHeight = height;
          blockTxs.push(aliceTx);
        }
      } else if (height === 5) {
        // Alice sends 4 TANTA to Bob and 1 to Charlie
        const bobTx = this.createTransactionRaw('EarlyAdopterAlice', 'EarlyAdopterBob', 4.5, 0.1, blockTime);
        if (bobTx) {
          bobTx.blockHeight = height;
          blockTxs.push(bobTx);
        }
      }

      // Process UTXOs and create block
      const feeSum = blockTxs.reduce((sum, tx) => sum + (tx.isCoinbase ? 0 : tx.fee), 0);
      coinbaseTx.vout[0].value += feeSum; // miner gets block subsidy + fees

      // Apply UTXOs
      for (const tx of blockTxs) {
        if (!tx.isCoinbase) {
          // Consume inputs
          for (const vin of tx.vin) {
            this.removeUTXO(vin.txid, vin.vout);
          }
        }
        // Add outputs
        for (let o = 0; o < tx.vout.length; o++) {
          this.addUTXO(tx.txid, o, tx.vout[o].scriptPubKey, tx.vout[o].value);
        }
      }

      const merkleRoot = calculateMerkleRoot(blockTxs);
      const blockRaw: Omit<Block, 'hash'> = {
        parentHash: lastHash,
        merkleRoot,
        timestamp: blockTime,
        height,
        nonce: 420 + i * 11,
        difficulty: 2,
        transactions: blockTxs,
        miner,
        reward: subsidy + feeSum
      };
      const block: Block = {
        ...blockRaw,
        hash: calculateBlockHash(blockRaw)
      };

      this.blocks.push(block);
      lastHash = block.hash;
      blockTime += 10 * 60 * 1000; // Next block +10 mins
    }
  }

  // Load from raw state (useful for Drive Sync)
  loadState(blocks: Block[], mempool: Transaction[], halvingInterval: number) {
    this.blocks = blocks;
    this.mempool = mempool;
    this.halvingInterval = halvingInterval;

    // Reconstruct UTXO pool from blocks
    this.utxoPool = [];
    for (const block of blocks) {
      for (const tx of block.transactions) {
        // Consume spent UTXOs
        if (!tx.isCoinbase) {
          for (const vin of tx.vin) {
            this.removeUTXO(vin.txid, vin.vout);
          }
        }
        // Add new UTXOs
        for (let o = 0; o < tx.vout.length; o++) {
          this.addUTXO(tx.txid, o, tx.vout[o].scriptPubKey, tx.vout[o].value);
        }
      }
    }
  }

  // Manage UTXO Set
  addUTXO(txid: string, vout: number, address: string, amount: number) {
    this.utxoPool.push({ txid, vout, address, amount });
  }

  removeUTXO(txid: string, vout: number) {
    this.utxoPool = this.utxoPool.filter(u => !(u.txid === txid && u.vout === vout));
  }

  getUTXOsForAddress(address: string): UTXO[] {
    return this.utxoPool.filter(u => u.address === address);
  }

  getBalance(address: string): number {
    return this.getUTXOsForAddress(address).reduce((sum, u) => sum + u.amount, 0);
  }

  // Create transaction internally
  createTransactionRaw(sender: string, recipient: string, amount: number, fee: number, timestamp: number = Date.now()): Transaction | null {
    const senderUtxOS = this.getUTXOsForAddress(sender);
    const totalRequired = amount + fee;
    let accumulated = 0;
    const selectedUtxos: UTXO[] = [];

    for (const u of senderUtxOS) {
      selectedUtxos.push(u);
      accumulated += u.amount;
      if (accumulated >= totalRequired) break;
    }

    if (accumulated < totalRequired) {
      return null; // Insufficient funds
    }

    const vin = selectedUtxos.map(u => ({
      txid: u.txid,
      vout: u.vout,
      scriptSig: sender,
      amount: u.amount
    }));

    const vout = [
      { value: amount, scriptPubKey: recipient }
    ];

    const change = accumulated - totalRequired;
    if (change > 0) {
      vout.push({
        value: Number(change.toFixed(8)),
        scriptPubKey: sender
      });
    }

    const tx: Transaction = {
      txid: '',
      vin,
      vout,
      timestamp,
      blockHeight: -1,
      fee,
      isCoinbase: false
    };
    tx.txid = calculateTxHash(tx);
    return tx;
  }

  // Broadcast transaction to mempool
  broadcastTransaction(sender: string, recipient: string, amount: number, fee: number): { success: boolean; tx?: Transaction; error?: string } {
    if (amount <= 0) {
      return { success: false, error: 'Amount must be greater than 0' };
    }
    if (fee < 0) {
      return { success: false, error: 'Fee cannot be negative' };
    }
    
    const balance = this.getBalance(sender);
    if (balance < amount + fee) {
      return { success: false, error: `Insufficient balance. Available: ${balance} TANTA, required: ${amount + fee} TANTA.` };
    }

    // Check if double spending in mempool
    const spentMempoolTxids = new Set<string>();
    for (const mTx of this.mempool) {
      for (const input of mTx.vin) {
        spentMempoolTxids.add(`${input.txid}:${input.vout}`);
      }
    }

    const senderUtxos = this.getUTXOsForAddress(sender);
    const totalRequired = amount + fee;
    let accumulated = 0;
    const selectedUtxos: UTXO[] = [];

    for (const u of senderUtxos) {
      if (spentMempoolTxids.has(`${u.txid}:${u.vout}`)) {
        continue; // Already spent in mempool
      }
      selectedUtxos.push(u);
      accumulated += u.amount;
      if (accumulated >= totalRequired) break;
    }

    if (accumulated < totalRequired) {
      return { success: false, error: 'Insufficient unspent balance. Some balance may be pending in the mempool.' };
    }

    const tx = this.createTransactionRaw(sender, recipient, amount, fee);
    if (!tx) {
      return { success: false, error: 'Failed to create transaction.' };
    }

    this.mempool.push(tx);
    return { success: true, tx };
  }

  // Mine a block manually/automatically
  mineBlock(minerAddress: string, difficulty: number, nonceStart: number = 0, maxIterations: number = 500000): { success: boolean; block?: Block; nonceTried: number; elapsedMs: number } {
    const startTime = Date.now();
    const height = this.blocks.length;
    const subsidy = this.getBlockSubsidy(height);

    // coinbase reward is block reward + mempool fees
    const fees = this.mempool.reduce((sum, tx) => sum + tx.fee, 0);
    const reward = subsidy + fees;

    // Create coinbase transaction
    const coinbaseTx: Transaction = {
      txid: '',
      vin: [{ txid: '0'.repeat(64), vout: -1, scriptSig: `Mined by Tanta Miner ${minerAddress}`, amount: subsidy }],
      vout: [{ value: Number(reward.toFixed(8)), scriptPubKey: minerAddress }],
      timestamp: Date.now(),
      blockHeight: height,
      fee: 0,
      isCoinbase: true
    };
    coinbaseTx.txid = calculateTxHash(coinbaseTx);

    // Pack all transactions
    const blockTxs = [coinbaseTx, ...this.mempool];
    const merkleRoot = calculateMerkleRoot(blockTxs);
    const parentHash = this.blocks[this.blocks.length - 1].hash;

    const blockTemplate: Omit<Block, 'hash'> = {
      parentHash,
      merkleRoot,
      timestamp: Date.now(),
      height,
      nonce: nonceStart,
      difficulty,
      transactions: blockTxs,
      miner: minerAddress,
      reward
    };

    const targetPrefix = '0'.repeat(difficulty);
    let nonce = nonceStart;
    let found = false;
    let finalHash = '';

    for (let i = 0; i < maxIterations; i++) {
      blockTemplate.nonce = nonce;
      const hash = calculateBlockHash(blockTemplate);
      if (hash.startsWith(targetPrefix)) {
        found = true;
        finalHash = hash;
        break;
      }
      nonce++;
    }

    const elapsed = Date.now() - startTime;

    if (found) {
      const newBlock: Block = {
        ...blockTemplate,
        hash: finalHash
      };

      // Apply state update
      // 1. Spend input UTXOs
      for (const tx of blockTxs) {
        if (!tx.isCoinbase) {
          for (const vin of tx.vin) {
            this.removeUTXO(vin.txid, vin.vout);
          }
        }
        // 2. Create output UTXOs
        for (let o = 0; o < tx.vout.length; o++) {
          this.addUTXO(tx.txid, o, tx.vout[o].scriptPubKey, tx.vout[o].value);
        }
      }

      // 3. Add to blockchain
      this.blocks.push(newBlock);
      this.mempool = []; // Clear mempool

      return {
        success: true,
        block: newBlock,
        nonceTried: nonce - nonceStart + 1,
        elapsedMs: elapsed
      };
    }

    return {
      success: false,
      nonceTried: maxIterations,
      elapsedMs: elapsed
    };
  }

  // Get current state info
  getBlockchainInfo(): BlockchainInfo {
    const lastBlock = this.blocks[this.blocks.length - 1];
    return {
      chain: 'mainnet',
      blocks: this.blocks.length,
      headers: this.blocks.length,
      bestblockhash: lastBlock.hash,
      difficulty: this.miningDifficulty,
      mediantime: lastBlock.timestamp,
      verificationprogress: 1.0,
      chainwork: this.blocks.length.toString(16).padStart(64, '0'),
      size_on_disk: this.blocks.length * 1024, // simulated size
      pruned: false,
      warnings: ''
    };
  }

  getSupplyInfo(): SupplyInfo {
    const currentSupply = this.utxoPool.reduce((sum, u) => {
      // Exclude burn address if considered burned
      if (u.address === 'MainnetBurnAddress000') return sum;
      return sum + u.amount;
    }, 0);

    const burnedSupply = this.getBalance('MainnetBurnAddress000');
    const height = this.blocks.length;
    const blockSubsidy = this.getBlockSubsidy(height);
    const halvings = Math.floor(height / this.halvingInterval);
    const nextHalvingBlock = (halvings + 1) * this.halvingInterval;
    const blocksToHalving = nextHalvingBlock - height;

    return {
      coinName: 'TANTA Chain',
      symbol: 'TANTA',
      maxSupply: MAX_SUPPLY,
      currentSupply: Number(currentSupply.toFixed(8)),
      burnedSupply: Number(burnedSupply.toFixed(8)),
      blockSubsidy,
      nextHalvingBlock,
      blocksToHalving,
      halvingsCompleted: halvings,
      percentMined: Number(((currentSupply / MAX_SUPPLY) * 100).toFixed(4))
    };
  }

  getMiningInfo(): MiningInfo {
    return {
      blocks: this.blocks.length,
      currentblocktx: this.mempool.length + 1,
      difficulty: this.miningDifficulty,
      networkhashps: Math.round(Math.pow(16, this.miningDifficulty) / 10), // simulated hashrate
      pooledtx: this.mempool.length,
      chain: 'mainnet'
    };
  }

  // JSON-RPC Executor
  executeRPC(method: string, params: any[]): any {
    switch (method.toLowerCase()) {
      case 'getblockcount':
        return this.blocks.length;

      case 'getbestblockhash':
        return this.blocks[this.blocks.length - 1].hash;

      case 'getblockhash': {
        const height = Number(params[0]);
        if (isNaN(height) || height < 0 || height >= this.blocks.length) {
          throw new Error('Block height out of range');
        }
        return this.blocks[height].hash;
      }

      case 'getblock': {
        const hashOrHeight = params[0];
        let block: Block | undefined;
        if (typeof hashOrHeight === 'number' || !isNaN(Number(hashOrHeight))) {
          block = this.blocks[Number(hashOrHeight)];
        } else {
          block = this.blocks.find(b => b.hash === hashOrHeight);
        }
        if (!block) {
          throw new Error('Block not found');
        }
        return block;
      }

      case 'getblockchaininfo':
        return this.getBlockchainInfo();

      case 'getsupplyinfo':
        return this.getSupplyInfo();

      case 'getmininginfo':
        return this.getMiningInfo();

      case 'getmempoolinfo':
        return {
          size: this.mempool.length,
          bytes: this.mempool.length * 250,
          usage: this.mempool.length * 300,
          total_fee: this.mempool.reduce((sum, tx) => sum + tx.fee, 0)
        };

      case 'getrawmempool':
        return this.mempool.map(tx => tx.txid);

      case 'getrawtransaction': {
        const txid = params[0];
        // Search in blocks
        let foundTx: Transaction | undefined;
        for (const block of this.blocks) {
          foundTx = block.transactions.find(t => t.txid === txid);
          if (foundTx) break;
        }
        // Search in mempool
        if (!foundTx) {
          foundTx = this.mempool.find(t => t.txid === txid);
        }

        if (!foundTx) {
          throw new Error('Transaction not found');
        }
        return foundTx;
      }

      case 'sendrawtransaction': {
        const [sender, recipient, amount, fee] = params;
        const res = this.broadcastTransaction(sender, recipient, Number(amount), Number(fee || 0.01));
        if (!res.success) {
          throw new Error(res.error || 'Failed to broadcast transaction');
        }
        return res.tx?.txid;
      }

      case 'getbalance': {
        const addr = params[0];
        if (!addr) throw new Error('Address is required');
        return this.getBalance(addr);
      }

      case 'getaddressinfo': {
        const addr = params[0];
        if (!addr) throw new Error('Address is required');
        return {
          address: addr,
          balance: this.getBalance(addr),
          utxos: this.getUTXOsForAddress(addr),
          mempool_tx_count: this.mempool.filter(tx => tx.vin.some(v => v.scriptSig === addr) || tx.vout.some(o => o.scriptPubKey === addr)).length
        };
      }

      case 'help':
        return {
          commands: [
            { method: 'getblockcount', description: 'Returns the height of the most-work fully-validated chain.' },
            { method: 'getbestblockhash', description: 'Returns the hash of the best (tip) block in the longest blockchain.' },
            { method: 'getblock <hash_or_height>', description: 'Returns detailed information about a block.' },
            { method: 'getblockchaininfo', description: 'Returns an object containing various state info regarding blockchain processing.' },
            { method: 'getsupplyinfo', description: 'Returns current TANTA coin supply status (max, current, burned, halving stats).' },
            { method: 'getmininginfo', description: 'Returns mining-related status.' },
            { method: 'getmempoolinfo', description: 'Returns details on active transaction memory pool.' },
            { method: 'getrawmempool', description: 'Returns all transaction ids in memory pool.' },
            { method: 'getrawtransaction <txid>', description: 'Returns raw details of a transaction.' },
            { method: 'sendrawtransaction <sender> <recipient> <amount> <fee>', description: 'Creates and broadcasts a transaction.' },
            { method: 'getbalance <address>', description: 'Returns the balance of the specified address.' },
            { method: 'getaddressinfo <address>', description: 'Returns UTXOs, balance and mempool activities for an address.' }
          ]
        };

      default:
        throw new Error(`Method not found: ${method}`);
    }
  }
}
