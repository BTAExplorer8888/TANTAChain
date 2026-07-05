import React, { useState, useEffect, useRef } from 'react';
import { 
  Coins, Layers, Send, Activity, Search, ArrowRight, 
  Settings, Play, Square, RefreshCw, LogIn, LogOut, 
  HardDrive, AlertCircle, CheckCircle, Clock, Cpu, 
  Database, HelpCircle, User, Award, ShieldAlert, Download,
  Wallet, Key, Copy, Check
} from 'lucide-react';
import { Block, Transaction, UTXO, SupplyInfo, SyncState, WalletKeyPair } from '../types';
import { 
  TantaBlockchain, 
  calculateBlockHash, 
  calculateTxHash,
  generateNewWallet,
  deriveAddressFromPrivateKey
} from '../lib/blockchain';
import { googleSignIn, logout } from '../lib/drive';
import { 
  broadcastTransactionToFirestore, 
  uploadMinedBlock,
  saveWalletToFirestore,
  deleteWalletFromFirestore,
  listenToWallets
} from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface BlockchainExplorerProps {
  blockchain: TantaBlockchain;
  onStateChange: () => void;
  syncState: SyncState;
  onDriveSync: (action: 'push' | 'pull' | 'wipe') => Promise<void>;
  onLogin: () => void;
  onLogout: () => void;
  userEmail: string | null;
}

export default function BlockchainExplorer({
  blockchain,
  onStateChange,
  syncState,
  onDriveSync,
  onLogin,
  onLogout,
  userEmail
}: BlockchainExplorerProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'blocks' | 'mempool' | 'miner' | 'wallet' | 'supply' | 'drive'>('dashboard');

  // Wallet Management State (Synced with Firestore Cloud Database in Real-Time!)
  const [wallets, setWallets] = useState<WalletKeyPair[]>([]);
  const [activeWallet, setActiveWallet] = useState<WalletKeyPair | null>(null);

  const [importPrivateKeyInput, setImportPrivateKeyInput] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [walletNotice, setWalletNotice] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [revealPrivateKey, setRevealPrivateKey] = useState<string | null>(null);

  // Real-time synchronization of Wallets with Firestore database (aktif selamanya!)
  useEffect(() => {
    const unsubscribe = listenToWallets(async (firestoreWallets) => {
      if (firestoreWallets.length === 0) {
        // Bootstrap a default genesis wallet into Firestore so the database is never empty
        const defaultW: WalletKeyPair = {
          privateKey: 'e5ca45492211e40a02cfc0890a88c213a8a8c2d9ff670bf3c0a527f00ba2d001',
          address: 'TantaUserGenesisWalletAddressXYZ'
        };
        try {
          await saveWalletToFirestore(defaultW, userEmail);
        } catch (err) {
          console.error('Error bootstrapping default wallet to Firestore:', err);
        }
        return;
      }

      setWallets(firestoreWallets);
      
      // Keep active wallet in sync or pick the first available one if none is active
      setActiveWallet((curr) => {
        if (!curr && firestoreWallets.length > 0) {
          const savedActiveAddr = sessionStorage.getItem('tanta_active_address');
          if (savedActiveAddr) {
            const found = firestoreWallets.find(w => w.address === savedActiveAddr);
            if (found) return found;
          }
          return firestoreWallets[0];
        }
        if (curr) {
          const match = firestoreWallets.find(w => w.address === curr.address);
          if (match) return match;
          return firestoreWallets[0] || null;
        }
        return null;
      });
    });
    return () => unsubscribe();
  }, [userEmail]);

  // Update sender and miner addresses when active wallet changes
  useEffect(() => {
    if (activeWallet) {
      setSenderAddress(activeWallet.address);
      setMinerAddress(activeWallet.address);
      try {
        sessionStorage.setItem('tanta_active_address', activeWallet.address);
      } catch {}
    }
  }, [activeWallet]);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    type: 'block' | 'tx' | 'address' | 'none';
    data: any;
  } | null>(null);

  // Expanded Items
  const [expandedBlockHeight, setExpandedBlockHeight] = useState<number | null>(null);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // Send Transaction State
  const [senderAddress, setSenderAddress] = useState(() => {
    try {
      const saved = sessionStorage.getItem('tanta_active_address');
      if (saved) return saved;
    } catch {}
    return 'TantaUserGenesisWalletAddressXYZ';
  });
  const [recipientAddress, setRecipientAddress] = useState('SatoshiNakamotoTANTA');
  const [sendAmount, setSendAmount] = useState('5.0');
  const [sendFee, setSendFee] = useState('0.1');
  const [txSuccessMsg, setTxSuccessMsg] = useState<string | null>(null);
  const [txErrorMsg, setTxErrorMsg] = useState<string | null>(null);

  // Interactive CPU Mining State
  const [minerAddress, setMinerAddress] = useState(() => {
    try {
      const saved = sessionStorage.getItem('tanta_active_address');
      if (saved) return saved;
    } catch {}
    return 'TantaUserGenesisWalletAddressXYZ';
  });
  const [miningDifficulty, setMiningDifficulty] = useState<number>(2);
  const [customHalving, setCustomHalving] = useState<string>('500'); // blocks per halving in sim
  const [isMining, setIsMining] = useState(false);
  const [miningNonce, setMiningNonce] = useState(0);
  const [miningHashRate, setMiningHashRate] = useState(0);
  const [miningElapsed, setMiningElapsed] = useState(0);
  const [minedBlockFound, setMinedBlockFound] = useState<Block | null>(null);

  // Stats Derived
  const supplyInfo = blockchain.getSupplyInfo();
  const miningInfo = blockchain.getMiningInfo();

  // Handle Search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    // 1. Check if numeric height
    if (!isNaN(Number(query))) {
      const height = Number(query);
      if (height >= 0 && height < blockchain.blocks.length) {
        setSearchResults({ type: 'block', data: blockchain.blocks[height] });
        return;
      }
    }

    // 2. Check if Block Hash
    const block = blockchain.blocks.find(b => b.hash === query);
    if (block) {
      setSearchResults({ type: 'block', data: block });
      return;
    }

    // 3. Check if Transaction Hash
    let tx: Transaction | undefined;
    for (const b of blockchain.blocks) {
      tx = b.transactions.find(t => t.txid === query);
      if (tx) break;
    }
    if (!tx) {
      tx = blockchain.mempool.find(t => t.txid === query);
    }
    if (tx) {
      setSearchResults({ type: 'tx', data: tx });
      return;
    }

    // 4. Check if Address
    const utxos = blockchain.getUTXOsForAddress(query);
    const balance = blockchain.getBalance(query);
    if (utxos.length > 0 || query.toLowerCase().includes('wallet') || query.toLowerCase().includes('satoshi') || query.toLowerCase().includes('tanta')) {
      setSearchResults({ 
        type: 'address', 
        data: { address: query, balance, utxos } 
      });
      return;
    }

    setSearchResults({ type: 'none', data: query });
  };

  // Handle Send Tx
  const handleSendTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxSuccessMsg(null);
    setTxErrorMsg(null);

    const amount = parseFloat(sendAmount);
    const fee = parseFloat(sendFee);

    if (isNaN(amount) || amount <= 0) {
      setTxErrorMsg('Please enter a valid transfer amount greater than 0.');
      return;
    }
    if (isNaN(fee) || fee < 0) {
      setTxErrorMsg('Please enter a valid network fee.');
      return;
    }

    const res = blockchain.broadcastTransaction(senderAddress, recipientAddress, amount, fee);
    if (res.success && res.tx) {
      try {
        await broadcastTransactionToFirestore(res.tx);
        setTxSuccessMsg(`Transaction successfully broadcasted to Mainnet mempool! TxID: ${res.tx.txid.substring(0, 16)}...`);
        onStateChange();
      } catch (err: any) {
        console.error(err);
        setTxErrorMsg(`Firestore Broadcast Failure: ${err.message || err}`);
      }
    } else {
      setTxErrorMsg(res.error || 'Failed to complete transaction.');
    }
  };

  // Live CPU Mining Engine
  const miningIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isMining) {
      setMinedBlockFound(null);
      const startTime = Date.now();
      let nonce = 0;
      const targetPrefix = '0'.repeat(miningDifficulty);
      const height = blockchain.blocks.length;
      const subsidy = blockchain.getBlockSubsidy(height);
      const fees = blockchain.mempool.reduce((sum, tx) => sum + tx.fee, 0);
      const reward = subsidy + fees;

      // Coinbase template
      const coinbaseTx: Transaction = {
        txid: '',
        vin: [{ txid: '0'.repeat(64), vout: -1, scriptSig: `Mined by Tanta Miner UI @ ${minerAddress}`, amount: subsidy }],
        vout: [{ value: Number(reward.toFixed(8)), scriptPubKey: minerAddress }],
        timestamp: Date.now(),
        blockHeight: height,
        fee: 0,
        isCoinbase: true
      };
      coinbaseTx.txid = calculateTxHash(coinbaseTx);

      const blockTxs = [coinbaseTx, ...blockchain.mempool];
      const merkleRoot = blockchain.blocks.length > 0 ? calculateTxHash(coinbaseTx) : ''; // simple merkle root representation
      const parentHash = blockchain.blocks[blockchain.blocks.length - 1].hash;

      const blockTemplate: Omit<Block, 'hash'> = {
        parentHash,
        merkleRoot,
        timestamp: Date.now(),
        height,
        nonce: 0,
        difficulty: miningDifficulty,
        transactions: blockTxs,
        miner: minerAddress,
        reward
      };

      const HASHES_PER_BATCH = 1500;

      const mineBatch = () => {
        for (let i = 0; i < HASHES_PER_BATCH; i++) {
          blockTemplate.nonce = nonce;
          const hash = calculateBlockHash(blockTemplate);
          if (hash.startsWith(targetPrefix)) {
            // Block solved!
            const newBlock: Block = {
              ...blockTemplate,
              hash
            };

            setIsMining(false);
            setMinedBlockFound(newBlock);

            // Upload mined block to Firestore - listeners will update local state automatically!
            uploadMinedBlock(newBlock)
              .then(() => {
                onStateChange();
                // Auto push to Google Drive if configured
                if (syncState.status === 'success' || syncState.status === 'idle') {
                  onDriveSync('push');
                }
              })
              .catch(err => {
                console.error("Error saving mined block to mainnet:", err);
                alert(`Error saving block to Firestore: ${err.message || err}. Saving locally instead.`);
                
                // Fallback to local push
                blockchain.blocks.push(newBlock);
                blockchain.mempool = [];
                onStateChange();
              });
            return;
          }
          nonce++;
        }

        const elapsed = (Date.now() - startTime) / 1000;
        setMiningNonce(nonce);
        setMiningElapsed(Number(elapsed.toFixed(1)));
        setMiningHashRate(Math.round(nonce / elapsed));

        // Continue next batch
        miningIntervalRef.current = window.setTimeout(mineBatch, 20);
      };

      miningIntervalRef.current = window.setTimeout(mineBatch, 20);
    } else {
      if (miningIntervalRef.current) {
        clearTimeout(miningIntervalRef.current);
        miningIntervalRef.current = null;
      }
    }

    return () => {
      if (miningIntervalRef.current) {
        clearTimeout(miningIntervalRef.current);
      }
    };
  }, [isMining, miningDifficulty, minerAddress]);

  // Adjust Halving configuration
  const handleApplyHalving = () => {
    const val = parseInt(customHalving);
    if (!isNaN(val) && val > 0) {
      blockchain.setHalvingInterval(val);
      onStateChange();
      alert(`Applied! TANTA Block subsidy will now halve every ${val} blocks.`);
    }
  };

  // Adjust global mining difficulty
  const handleDifficultyChange = (val: number) => {
    blockchain.miningDifficulty = val;
    setMiningDifficulty(val);
    onStateChange();
  };

  // Google Login helper
  const handleGoogleSignIn = async () => {
    onLogin();
  };

  // Wallet operations handlers
  const handleCreateWallet = async () => {
    try {
      const newW = generateNewWallet();
      await saveWalletToFirestore(newW, userEmail);
      setActiveWallet(newW);
      setWalletNotice({ type: 'success', message: 'Sukses membuat keypair baru & tersimpan permanen di cloud database!' });
      setTimeout(() => setWalletNotice(null), 4000);
    } catch (e: any) {
      setWalletNotice({ type: 'error', message: 'Gagal membuat wallet: ' + e.message });
      setTimeout(() => setWalletNotice(null), 4000);
    }
  };

  const handleImportWallet = async () => {
    const rawKey = importPrivateKeyInput.trim();
    if (!rawKey) return;
    
    try {
      const address = deriveAddressFromPrivateKey(rawKey);
      const exists = wallets.find(w => w.address === address);
      if (exists) {
        setActiveWallet(exists);
        setImportPrivateKeyInput('');
        setWalletNotice({ type: 'success', message: 'Wallet diaktifkan! Alamat ini sudah terdaftar di cloud database.' });
        setTimeout(() => setWalletNotice(null), 4000);
        return;
      }

      const newW = { privateKey: rawKey, address };
      await saveWalletToFirestore(newW, userEmail);
      setActiveWallet(newW);
      setImportPrivateKeyInput('');
      setWalletNotice({ type: 'success', message: 'Sukses mengimpor wallet custom ke cloud database secara permanen!' });
      setTimeout(() => setWalletNotice(null), 4000);
    } catch (e: any) {
      setWalletNotice({ type: 'error', message: 'Gagal mengimpor wallet: ' + e.message });
      setTimeout(() => setWalletNotice(null), 4000);
    }
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans" id="blockchain-explorer-root">
      {/* HEADER SECTION */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs px-4 md:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4" id="explorer-header">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 text-white p-2.5 rounded-xl shadow-md shadow-amber-500/20">
            <Coins className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              TANTA Chain <span className="text-xs uppercase px-2 py-0.5 font-semibold bg-amber-100 text-amber-800 rounded-md">Mainnet v1.0</span>
            </h1>
            <p className="text-xs text-slate-500">Decentralized, Google Drive Persistent Blockchain Explorer</p>
          </div>
        </div>

        {/* DRIVE SYNC TOP STATUS */}
        <div className="flex items-center gap-3 flex-wrap">
          {userEmail ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full py-1.5 pl-3 pr-4 shadow-sm text-xs text-emerald-800">
              <HardDrive className="h-4 w-4 text-emerald-600 animate-bounce" />
              <div className="flex flex-col">
                <span className="font-semibold text-emerald-900 truncate max-w-[120px] md:max-w-[180px]">{userEmail}</span>
                <span className="text-[10px] text-emerald-600">Drive Cloud Synced</span>
              </div>
              <button 
                onClick={onLogout}
                className="ml-2 hover:bg-emerald-100 p-1 rounded-full text-emerald-700 transition" 
                title="Sign out of Google"
                id="sign-out-btn"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-full shadow-md hover:shadow-blue-600/25 transition active:scale-95"
              id="sign-in-btn"
            >
              <LogIn className="h-4 w-4" />
              Connect Google Drive Backup
            </button>
          )}

          <div className="text-xs bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-mono text-slate-600 text-[10px]">Height: #{blockchain.blocks.length - 1}</span>
          </div>
        </div>
      </header>

      {/* QUICK STATS DASHBOARD */}
      <section className="px-4 md:px-8 pt-6 grid grid-cols-2 lg:grid-cols-4 gap-4" id="explorer-quick-stats">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="bg-blue-50 text-blue-600 p-3 rounded-xl">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Blocks</p>
            <p className="text-lg font-bold text-slate-900">{blockchain.blocks.length}</p>
            <p className="text-[10px] text-slate-400 font-mono">Genesis Block #0 included</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="bg-amber-50 text-amber-600 p-3 rounded-xl">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mined Supply</p>
            <p className="text-lg font-bold text-slate-900">
              {supplyInfo.currentSupply.toLocaleString()} <span className="text-xs font-semibold text-slate-500">TANTA</span>
            </p>
            <p className="text-[10px] text-amber-600 font-medium">
              {supplyInfo.percentMined}% Mined of {supplyInfo.maxSupply.toLocaleString()} max
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="bg-purple-50 text-purple-600 p-3 rounded-xl">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Hashrate Difficulty</p>
            <p className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
              <span>{miningInfo.difficulty} Zeros</span>
              <span className="text-xs bg-purple-100 text-purple-800 font-mono px-2 py-0.5 rounded-full">
                {Math.pow(16, miningInfo.difficulty).toLocaleString()}x
              </span>
            </p>
            <p className="text-[10px] text-slate-400 font-mono">Target: {'0'.repeat(miningInfo.difficulty)}...</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mempool Transactions</p>
            <p className="text-lg font-bold text-slate-900">{miningInfo.pooledtx} Pending</p>
            <p className="text-[10px] text-emerald-600 font-medium">
              Accumulated fees: {blockchain.mempool.reduce((sum, tx) => sum + tx.fee, 0).toFixed(4)} TANTA
            </p>
          </div>
        </div>
      </section>

      {/* SEARCH AND NAVIGATION */}
      <section className="px-4 md:px-8 pt-6" id="explorer-navigation">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto w-full md:w-auto" id="explorer-tabs-container">
            <button
              onClick={() => { setActiveTab('dashboard'); setSearchResults(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              id="tab-dashboard"
            >
              <Activity className="h-4 w-4" />
              Explorer
            </button>
            <button
              onClick={() => { setActiveTab('blocks'); setSearchResults(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'blocks' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              id="tab-blocks"
            >
              <Layers className="h-4 w-4" />
              Mined Blocks
            </button>
            <button
              onClick={() => { setActiveTab('mempool'); setSearchResults(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'mempool' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              id="tab-mempool"
            >
              <Send className="h-4 w-4" />
              Transact & Mempool
            </button>
            <button
              onClick={() => { setActiveTab('miner'); setSearchResults(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'miner' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              id="tab-miner"
            >
              <Cpu className="h-4 w-4" />
              CPU POW Miner
            </button>
            <button
              onClick={() => { setActiveTab('wallet'); setSearchResults(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'wallet' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              id="tab-wallet"
            >
              <Wallet className="h-4 w-4" />
              My Wallet
            </button>
            <button
              onClick={() => { setActiveTab('supply'); setSearchResults(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'supply' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              id="tab-supply"
            >
              <Coins className="h-4 w-4" />
              Supply halving
            </button>
            <button
              onClick={() => { setActiveTab('drive'); setSearchResults(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'drive' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              id="tab-drive"
            >
              <Settings className="h-4 w-4" />
              Drive Sync
            </button>
          </div>

          {/* Global Search Bar */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 w-full md:w-96" id="explorer-search-form">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Block height/hash, TxID, Address..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-slate-800"
                id="search-input"
              />
            </div>
            <button
              type="submit"
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2 px-4 rounded-xl shadow-md transition active:scale-95"
              id="search-submit"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      {/* CORE CONTENT LAYOUT */}
      <main className="flex-1 px-4 md:px-8 py-6" id="explorer-main-content">
        
        {/* IF SEARCH RESULTS ARE DISPLAYED */}
        {searchResults && (
          <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm mb-6 relative animate-fadeIn" id="search-results-section">
            <button 
              onClick={() => setSearchResults(null)}
              className="absolute top-4 right-4 text-xs font-semibold text-slate-400 hover:text-slate-800"
              id="clear-search"
            >
              ✕ Close Search
            </button>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Search className="h-4 w-4 text-amber-500" />
              Search Results
            </h2>

            {/* BLOCK MATCH */}
            {searchResults.type === 'block' && (
              <div className="space-y-4" id="search-result-block">
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    Block #{searchResults.data.height}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono mt-1 break-all">Hash: {searchResults.data.hash}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Nonce</span>
                    <span className="font-bold text-slate-800 font-mono">{searchResults.data.nonce}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Difficulty Target</span>
                    <span className="font-bold text-slate-800 font-mono">{searchResults.data.difficulty} Zeros</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Miner</span>
                    <span className="font-bold text-slate-800 break-all">{searchResults.data.miner}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Block Reward</span>
                    <span className="font-bold text-emerald-600 font-mono">{searchResults.data.reward.toFixed(8)} TANTA</span>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h4 className="text-xs font-bold text-slate-900 mb-2">Transactions in Block ({searchResults.data.transactions.length})</h4>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {searchResults.data.transactions.map((tx: Transaction) => (
                      <div key={tx.txid} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                          <span className="font-mono truncate max-w-[200px]">TxID: {tx.txid}</span>
                          <span className="font-medium bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                            {tx.isCoinbase ? 'Coinbase' : `${tx.fee} fee`}
                          </span>
                        </div>
                        <div className="mt-2 text-xs flex flex-col gap-1 text-slate-700">
                          {tx.vin.map((input, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <span className="text-red-500">In:</span>
                              <span className="font-mono break-all font-semibold">{input.scriptSig}</span>
                              <span className="text-slate-400">({input.amount} TANTA)</span>
                            </div>
                          ))}
                          <div className="flex flex-col gap-1 pl-4 border-l-2 border-amber-500">
                            {tx.vout.map((output, idx) => (
                              <div key={idx} className="flex items-center gap-1 text-emerald-600">
                                <span>Out:</span>
                                <span className="font-mono break-all font-semibold">{output.scriptPubKey}</span>
                                <span className="font-bold">+{output.value} TANTA</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TRANSACTION MATCH */}
            {searchResults.type === 'tx' && (
              <div className="space-y-3" id="search-result-tx">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-1.5">
                    <Send className="h-4 w-4" />
                    Transaction Details
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono mt-1 break-all">TxID: {searchResults.data.txid}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Status</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${searchResults.data.blockHeight === -1 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {searchResults.data.blockHeight === -1 ? 'In Mempool (Pending)' : `Confirmed in Block #${searchResults.data.blockHeight}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Fee Paid</span>
                    <span className="font-bold text-slate-800 font-mono">{searchResults.data.fee} TANTA</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Type</span>
                    <span className="font-bold text-slate-800">{searchResults.data.isCoinbase ? 'Coinbase (Miner subsidy)' : 'Transfer'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Mined Date</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {new Date(searchResults.data.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="mt-4 p-4 border border-slate-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-semibold text-slate-600">Inputs & Outputs</h4>
                  <div className="grid md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <span className="font-bold text-slate-500 block">Inputs ({searchResults.data.vin.length})</span>
                      {searchResults.data.vin.map((input: any, idx: number) => (
                        <div key={idx} className="bg-slate-50 p-2 rounded border border-slate-100 font-mono break-all">
                          {input.scriptSig} <span className="text-slate-400">({input.amount} TANTA)</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <span className="font-bold text-slate-500 block">Outputs ({searchResults.data.vout.length})</span>
                      {searchResults.data.vout.map((output: any, idx: number) => (
                        <div key={idx} className="bg-emerald-50/50 p-2 rounded border border-emerald-100 font-mono break-all text-emerald-800">
                          {output.scriptPubKey} <span className="font-bold">({output.value} TANTA)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ADDRESS MATCH */}
            {searchResults.type === 'address' && (
              <div className="space-y-3" id="search-result-address">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
                    <User className="h-4 w-4" />
                    Address Overview
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono mt-1 break-all">Address: {searchResults.data.address}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs max-w-md">
                  <div>
                    <span className="text-slate-400 block font-medium">Total Balance</span>
                    <span className="text-xl font-bold text-emerald-600 font-mono">{searchResults.data.balance.toLocaleString()} TANTA</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Active UTXOs</span>
                    <span className="text-xl font-bold text-slate-800 font-mono">{searchResults.data.utxos.length}</span>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h4 className="text-xs font-bold text-slate-900 mb-2">Unspent Outputs (UTXOs)</h4>
                  {searchResults.data.utxos.length === 0 ? (
                    <p className="text-xs text-slate-400">No unspent transaction outputs found for this address.</p>
                  ) : (
                    <div className="space-y-2 max-h-[150px] overflow-y-auto">
                      {searchResults.data.utxos.map((utxo: UTXO, idx: number) => (
                        <div key={idx} className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs font-mono flex justify-between items-center">
                          <span className="truncate max-w-[250px]">TxID: {utxo.txid} (vout {utxo.vout})</span>
                          <span className="font-bold text-emerald-600">+{utxo.amount} TANTA</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* NONE FOUND */}
            {searchResults.type === 'none' && (
              <div className="text-center py-6" id="search-result-none">
                <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">No ledger record found for "{searchResults.data}"</p>
                <p className="text-[10px] text-slate-400 mt-1">Please try searching for Block heights (e.g., 0, 1), complete Block Hashes, Transaction IDs, or public addresses.</p>
              </div>
            )}
          </div>
        )}

        {/* 1. DASHBOARD TAB */}
        {activeTab === 'dashboard' && !searchResults && (
          <div className="space-y-6" id="dashboard-tab-content">
            {/* LATEST BLOCKS & MEMPOOL GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* LATEST BLOCKS LIST */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="h-4.5 w-4.5 text-amber-500" />
                    Latest Mined Blocks
                  </h2>
                  <button 
                    onClick={() => setActiveTab('blocks')}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    View All Blocks →
                  </button>
                </div>

                <div className="space-y-3 overflow-y-auto max-h-[480px]">
                  {blockchain.blocks.slice().reverse().map((block) => (
                    <div 
                      key={block.hash} 
                      className="border border-slate-100 rounded-2xl p-4 hover:border-slate-300 transition shadow-2xs hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedBlockHeight(expandedBlockHeight === block.height ? null : block.height)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-amber-100 text-amber-800 h-9 w-9 flex items-center justify-center rounded-xl font-bold font-mono text-xs">
                            #{block.height}
                          </div>
                          <div>
                            <span className="font-bold text-xs text-slate-900 block">Block #{block.height} Mined</span>
                            <span className="text-[10px] text-slate-400 font-mono block truncate max-w-[200px] md:max-w-md">Hash: {block.hash}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-600 block">+{block.reward.toFixed(4)} TANTA</span>
                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 justify-end">
                            <Clock className="h-3 w-3" /> {new Date(block.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Transactions inside Block */}
                      {expandedBlockHeight === block.height && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-4 border-t border-slate-150 pt-3 space-y-2"
                        >
                          <div className="flex justify-between items-center text-[10px] font-semibold text-slate-500 mb-2">
                            <span>Miner: <span className="font-mono text-slate-800 font-bold">{block.miner}</span></span>
                            <span>Nonce: <span className="font-mono text-slate-800">{block.nonce}</span></span>
                          </div>
                          <div className="space-y-2">
                            {block.transactions.map((tx) => (
                              <div key={tx.txid} className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                                  <span>ID: {tx.txid.substring(0, 16)}...</span>
                                  <span className="bg-slate-200 text-slate-800 px-1 py-0.5 rounded text-[8px] font-bold">
                                    {tx.isCoinbase ? 'Coinbase' : `${tx.fee} fee`}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-slate-700 space-y-1">
                                  {tx.vin.map((vin, vIdx) => (
                                    <div key={vIdx} className="flex items-center gap-1 truncate max-w-full">
                                      <span className="text-[10px] text-red-500 font-bold">In:</span>
                                      <span className="font-mono font-semibold truncate max-w-[220px]">{vin.scriptSig}</span>
                                      <span className="text-slate-400">({vin.amount} TANTA)</span>
                                    </div>
                                  ))}
                                  {tx.vout.map((vout, oIdx) => (
                                    <div key={oIdx} className="flex items-center gap-1 pl-3 border-l-2 border-amber-500 truncate max-w-full">
                                      <span className="text-[10px] text-emerald-500 font-bold">Out:</span>
                                      <span className="font-mono font-semibold truncate max-w-[220px] text-slate-800">{vout.scriptPubKey}</span>
                                      <span className="text-emerald-600 font-bold">+{vout.value} TANTA</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* LIVE MEMPOOL / PENDING TRANSACTIONS */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Activity className="h-4.5 w-4.5 text-emerald-500" />
                    Transaction Mempool ({blockchain.mempool.length})
                  </h2>
                  <button 
                    onClick={() => setActiveTab('mempool')}
                    className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
                  >
                    Send Tx →
                  </button>
                </div>

                {blockchain.mempool.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-slate-400">
                    <Clock className="h-10 w-10 text-slate-300 mb-2 animate-pulse" />
                    <p className="text-xs font-semibold">Mempool is completely empty</p>
                    <p className="text-[10px] mt-1 text-slate-400 max-w-[200px]">Create transactions or wait for miners to push the next block.</p>
                  </div>
                ) : (
                  <div className="space-y-3 overflow-y-auto max-h-[480px]">
                    {blockchain.mempool.map((tx) => (
                      <div key={tx.txid} className="border border-slate-100 p-3.5 rounded-xl bg-slate-50/50">
                        <div className="flex justify-between items-center text-[10px] text-slate-400">
                          <span className="font-mono truncate max-w-[120px]">TxID: {tx.txid}</span>
                          <span className="font-semibold text-emerald-600">Pending</span>
                        </div>
                        <div className="mt-2 text-xs space-y-1">
                          <div className="truncate text-slate-700">
                            <span className="font-bold text-red-500">From: </span>
                            <span className="font-mono font-medium">{tx.vin[0]?.scriptSig}</span>
                          </div>
                          <div className="truncate text-slate-700">
                            <span className="font-bold text-emerald-500">To: </span>
                            <span className="font-mono font-medium">{tx.vout[0]?.scriptPubKey}</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-slate-100 mt-2 text-[10px]">
                            <span>Amount: <span className="font-bold text-slate-800">{tx.vout[0]?.value} TANTA</span></span>
                            <span>Fee: <span className="font-bold text-slate-800 font-mono">{tx.fee} TANTA</span></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* BLOCK HALVING INSIGHT BANNER */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  TANTA Block Halving Schedule
                </h3>
                <p className="text-xs text-amber-100 max-w-xl">
                  Mimicking Bitcoin mechanics, the current block reward is <span className="font-mono font-semibold bg-amber-600/30 px-1.5 py-0.5 rounded">{supplyInfo.blockSubsidy} TANTA</span>. 
                  Every <span className="font-semibold">{blockchain.halvingInterval} blocks</span>, the reward halves automatically! Next halving is at Block height <span className="font-bold">#{supplyInfo.nextHalvingBlock}</span> ({supplyInfo.blocksToHalving} blocks left).
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab('supply')}
                  className="bg-white hover:bg-slate-100 text-amber-700 font-bold text-xs py-2.5 px-5 rounded-xl shadow-md transition"
                >
                  Configure Halvings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. MINED BLOCKS TAB */}
        {activeTab === 'blocks' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs" id="blocks-tab-content">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Layers className="h-4.5 w-4.5 text-amber-500" />
              Full Mainnet Block Ledger History
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-semibold bg-slate-50">
                    <th className="p-3">Height</th>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Block Hash</th>
                    <th className="p-3">Miner address</th>
                    <th className="p-3">Transactions</th>
                    <th className="p-3 text-right">Block reward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {blockchain.blocks.slice().reverse().map((block) => (
                    <tr 
                      key={block.hash} 
                      className="hover:bg-slate-50 cursor-pointer transition"
                      onClick={() => setExpandedBlockHeight(expandedBlockHeight === block.height ? null : block.height)}
                    >
                      <td className="p-3 font-bold font-mono text-slate-900">#{block.height}</td>
                      <td className="p-3 text-slate-500">{new Date(block.timestamp).toLocaleString()}</td>
                      <td className="p-3 font-mono text-slate-400 truncate max-w-[150px]" title={block.hash}>{block.hash}</td>
                      <td className="p-3 font-semibold text-slate-700 truncate max-w-[120px]">{block.miner}</td>
                      <td className="p-3 font-bold text-slate-600">{block.transactions.length} txs</td>
                      <td className="p-3 text-right font-bold text-emerald-600 font-mono">+{block.reward.toFixed(8)} TANTA</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. TRANSACT & MEMPOOL TAB */}
        {activeTab === 'mempool' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="mempool-tab-content">
            
            {/* SENDER FORM */}
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                <Send className="h-4.5 w-4.5 text-blue-500" />
                Broadcast Raw Transaction
              </h2>

              <form onSubmit={handleSendTransaction} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Sender Address (Private Key owner)</label>
                  <select
                    value={senderAddress}
                    onChange={(e) => setSenderAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                    id="sender-select"
                  >
                    <option value="SatoshiNakamotoTANTA">SatoshiNakamotoTANTA (Bal: {blockchain.getBalance('SatoshiNakamotoTANTA').toFixed(4)} TANTA)</option>
                    <option value="TantaDevCreatorX9">TantaDevCreatorX9 (Bal: {blockchain.getBalance('TantaDevCreatorX9').toFixed(4)} TANTA)</option>
                    <option value="EarlyAdopterAlice">EarlyAdopterAlice (Bal: {blockchain.getBalance('EarlyAdopterAlice').toFixed(4)} TANTA)</option>
                    <option value="EarlyAdopterBob">EarlyAdopterBob (Bal: {blockchain.getBalance('EarlyAdopterBob').toFixed(4)} TANTA)</option>
                    <option value="UserWalletAddressXYZ">UserWalletAddressXYZ (Bal: {blockchain.getBalance('UserWalletAddressXYZ').toFixed(4)} TANTA)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Recipient Address</label>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="Recipient address (e.g. EarlyAdopterAlice)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                    id="recipient-input"
                  />
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    <button 
                      type="button" 
                      onClick={() => setRecipientAddress('UserWalletAddressXYZ')}
                      className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md"
                    >
                      My Wallet
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setRecipientAddress('MainnetBurnAddress000')}
                      className="text-[10px] bg-red-50 hover:bg-red-100 text-red-600 px-2 py-0.5 rounded-md"
                    >
                      Burn Address (Destroy coins)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Amount (TANTA)</label>
                    <input
                      type="number"
                      step="0.00000001"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      placeholder="5.0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                      id="amount-input"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Fee (TANTA)</label>
                    <input
                      type="number"
                      step="0.00000001"
                      value={sendFee}
                      onChange={(e) => setSendFee(e.target.value)}
                      placeholder="0.1"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                      id="fee-input"
                    />
                  </div>
                </div>

                {txSuccessMsg && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="font-medium">{txSuccessMsg}</span>
                  </div>
                )}

                {txErrorMsg && (
                  <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl text-xs flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <span className="font-medium">{txErrorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition"
                  id="send-tx-submit"
                >
                  Sign and Broadcast Transaction
                </button>
              </form>
            </div>

            {/* LIVE MEMPOOL LIST */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                <Activity className="h-4.5 w-4.5 text-emerald-500" />
                Mempool Queue / Unconfirmed Transactions
              </h2>

              {blockchain.mempool.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-16 text-slate-400">
                  <Clock className="h-12 w-12 text-slate-200 mb-2" />
                  <p className="text-xs font-bold">No unconfirmed transactions in memory pool</p>
                  <p className="text-[10px] mt-1 text-slate-400 max-w-sm">Transactions created above will wait in the mempool queue until a miner packages them into a block.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {blockchain.mempool.map((tx) => (
                    <div key={tx.txid} className="border border-slate-150 rounded-2xl p-4 bg-slate-50/50">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mb-2">
                        <span>ID: {tx.txid}</span>
                        <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[9px]">Unconfirmed</span>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4 text-xs text-slate-700">
                        <div>
                          <span className="font-bold block text-slate-500">Inputs</span>
                          {tx.vin.map((vin, idx) => (
                            <div key={idx} className="font-mono mt-1 break-all bg-white p-2 border border-slate-100 rounded-lg">
                              {vin.scriptSig} ({vin.amount} TANTA)
                            </div>
                          ))}
                        </div>
                        <div>
                          <span className="font-bold block text-slate-500">Outputs</span>
                          {tx.vout.map((vout, idx) => (
                            <div key={idx} className="font-mono mt-1 break-all bg-emerald-50/40 p-2 border border-emerald-100 rounded-lg text-emerald-800 flex justify-between">
                              <span className="truncate max-w-[120px]">{vout.scriptPubKey}</span>
                              <span className="font-bold">+{vout.value} TANTA</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-150 flex justify-between text-[10px] text-slate-500 font-medium">
                        <span>Timestamp: {new Date(tx.timestamp).toLocaleString()}</span>
                        <span>Mining Priority Fee: <span className="font-mono text-slate-900 font-bold">{tx.fee} TANTA</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* 4. CPU POW MINER TAB */}
        {activeTab === 'miner' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="miner-tab-content">
            
            {/* MINER CONTROLS */}
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                <Cpu className="h-4.5 w-4.5 text-purple-600" />
                Proof-of-Work Miner Node
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Miner Payout Wallet Address</label>
                  <input
                    type="text"
                    value={minerAddress}
                    onChange={(e) => setMinerAddress(e.target.value)}
                    placeholder="Miner payout address..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 font-mono"
                    id="miner-address-input"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Mined TANTA block subsidy and transaction fees will be sent to this address.</span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Mining Difficulty (Leading hex zeros)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleDifficultyChange(d)}
                        className={`py-2 text-xs font-mono font-bold rounded-xl border transition ${miningDifficulty === d ? 'bg-purple-600 border-purple-600 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                        id={`diff-btn-${d}`}
                      >
                        {d} Zeros
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Higher values require significantly more computations to find a valid hash.</span>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                  {!isMining ? (
                    <button
                      onClick={() => setIsMining(true)}
                      className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-3 rounded-xl shadow-lg hover:shadow-purple-600/25 transition active:scale-95"
                      id="start-mining-btn"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      Start Miner Node
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsMining(false)}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 rounded-xl shadow-lg hover:shadow-red-600/25 transition active:scale-95"
                      id="stop-mining-btn"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      Stop Miner Node
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* MINER SCREEN */}
            <div className="lg:col-span-2 bg-slate-900 text-slate-100 rounded-3xl p-6 shadow-md flex flex-col font-mono relative overflow-hidden" id="miner-console">
              
              {/* Retro Terminal Scan Line */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/10 to-transparent pointer-events-none" />

              <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${isMining ? 'bg-emerald-500 animate-ping' : 'bg-red-500'}`} />
                  <span className="text-xs uppercase font-bold tracking-widest text-slate-400">TANTA-COMINER@TERMINAL</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  BLOCK INDEX: #{blockchain.blocks.length}
                </div>
              </div>

              <div className="flex-1 space-y-4 text-xs">
                {isMining ? (
                  <div className="space-y-3">
                    <p className="text-purple-400 animate-pulse font-semibold">⛏️ SOLVING CRYPTOGRAPHIC PUZZLE...</p>
                    <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">CURRENT NONCE:</span>
                        <span className="text-slate-200 font-bold">{miningNonce.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">HASH RATE:</span>
                        <span className="text-slate-200 font-bold">{(miningHashRate / 1000).toFixed(2)} KH/s</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">ELAPSED TIME:</span>
                        <span className="text-slate-200 font-bold">{miningElapsed}s</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">TARGET DIFFICULTY:</span>
                        <span className="text-purple-400 font-bold">{'0'.repeat(miningDifficulty)}...</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-slate-500 block text-[10px]">CURRENT MOCK HEADER ENCODING:</span>
                      <p className="text-[10px] text-slate-400 truncate bg-slate-950 px-2 py-1.5 rounded border border-slate-800 font-mono">
                        {`parent:${blockchain.blocks[blockchain.blocks.length - 1].hash.substring(0, 16)}...|txs:${blockchain.mempool.length + 1}|nonce:${miningNonce}`}
                      </p>
                    </div>
                  </div>
                ) : minedBlockFound ? (
                  <div className="space-y-3 bg-emerald-950/40 p-5 rounded-2xl border border-emerald-900 text-emerald-100 animate-fadeIn" id="miner-solved-block">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-emerald-400" />
                      <p className="font-bold text-emerald-400 text-sm">BLOCK SOLVED & BROADCASTED SUCCESSFULLY!</p>
                    </div>
                    <div className="text-[11px] space-y-1">
                      <p><span className="text-slate-400">Block Height:</span> #{minedBlockFound.height}</p>
                      <p><span className="text-slate-400">Block Hash:</span> <span className="font-mono text-emerald-300">{minedBlockFound.hash}</span></p>
                      <p><span className="text-slate-400">Nonce:</span> {minedBlockFound.nonce}</p>
                      <p><span className="text-slate-400">Miner:</span> {minedBlockFound.miner}</p>
                      <p><span className="text-slate-400">Block Reward:</span> {minedBlockFound.reward} TANTA</p>
                      <p><span className="text-slate-400">Transactions:</span> {minedBlockFound.transactions.length} processed</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 py-8 text-center flex flex-col items-center justify-center">
                    <Cpu className="h-12 w-12 text-slate-800 mb-2 animate-bounce" />
                    <p className="text-[11px]">Miner is offline. Configure difficulty and target wallet, and start the node above to mine TANTA blocks synchronously using your CPU.</p>
                  </div>
                )}

                <div className="border-t border-slate-800 pt-3">
                  <span className="text-[11px] text-slate-500 block mb-1">Mempool Backlog for Block:</span>
                  <p className="text-[11px] text-slate-400">
                    {blockchain.mempool.length === 0 
                      ? 'No pending user transactions. A genesis or reward coinbase transaction will still be mined!' 
                      : `${blockchain.mempool.length} user transaction(s) queued to be bundled.`
                    }
                  </p>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* WALLET MANAGER TAB */}
        {activeTab === 'wallet' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn" id="wallet-tab-content">
            
            {/* LEFT COLUMN: ACTIVE WALLET & ACTIONS */}
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Wallet className="h-4.5 w-4.5 text-blue-600" />
                  Your Active Keypair Wallet
                </h2>

                {activeWallet ? (
                  <div className="space-y-4">
                    {/* Visual Card */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-md relative overflow-hidden font-mono">
                      <div className="absolute right-3 top-3 opacity-15">
                        <Coins className="h-20 w-20 text-white" />
                      </div>
                      <div className="flex justify-between items-center mb-6">
                        <span className="text-[10px] bg-amber-500 text-slate-950 font-bold px-2 py-0.5 rounded-md">TANTA MAINNET</span>
                        <Coins className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">CURRENT BALANCE</span>
                        <div className="text-2xl font-bold text-emerald-400">
                          {blockchain.getBalance(activeWallet.address).toLocaleString()} <span className="text-xs text-slate-200">TANTA</span>
                        </div>
                      </div>
                      <div className="mt-4">
                        <span className="text-[10px] text-slate-400 block">PUBLIC ADDRESS</span>
                        <div className="text-[10px] text-slate-100 truncate break-all mt-0.5 select-all">
                          {activeWallet.address}
                        </div>
                      </div>
                    </div>

                    {/* Copy Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleCopy(activeWallet.address, 'address')}
                        className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs py-2 px-3 rounded-xl font-medium transition"
                        title="Copy Public Address"
                      >
                        {copiedText === 'address' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedText === 'address' ? 'Copied!' : 'Copy Address'}
                      </button>
                      <button
                        onClick={() => handleCopy(activeWallet.privateKey, 'privateKey')}
                        className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs py-2 px-3 rounded-xl font-medium transition"
                        title="Copy Private Key"
                      >
                        {copiedText === 'privateKey' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Key className="h-3.5 w-3.5" />}
                        {copiedText === 'privateKey' ? 'Copied!' : 'Copy Private Key'}
                      </button>
                    </div>

                    {/* Private Key Reveal section */}
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-slate-500">Private Key (Secret)</span>
                        <button
                          onClick={() => setRevealPrivateKey(revealPrivateKey === activeWallet.address ? null : activeWallet.address)}
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-bold"
                        >
                          {revealPrivateKey === activeWallet.address ? 'Hide' : 'Reveal'}
                        </button>
                      </div>
                      <p className="font-mono text-[10px] break-all bg-white p-2 rounded border border-slate-100 text-slate-700">
                        {revealPrivateKey === activeWallet.address ? activeWallet.privateKey : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                      </p>
                      <p className="text-[9px] text-red-500 font-medium mt-1">
                        ⚠️ WARNING: Never share your private key. Anyone with this key can gain full access to your TANTA coins.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    No active wallet loaded. Click below to generate or import.
                  </div>
                )}
              </div>

              {/* GENERATE & IMPORT ACTIONS */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-700">Wallet Actions</h3>
                  <button
                    onClick={handleCreateWallet}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition"
                  >
                    <Coins className="h-4 w-4" />
                    Buat Wallet Baru (Generate Keypair)
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-500 block">Import Wallet by Private Key</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={importPrivateKeyInput}
                      onChange={(e) => setImportPrivateKeyInput(e.target.value)}
                      placeholder="Paste private key (64-hex key)..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
                    />
                    <button
                      onClick={handleImportWallet}
                      disabled={!importPrivateKeyInput.trim()}
                      className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs py-2 px-4 rounded-xl transition shrink-0"
                    >
                      Import
                    </button>
                  </div>
                  <span className="text-[9px] text-slate-400 block leading-tight">Imports your raw hexadecimal private key and derives the public address mathematically.</span>
                </div>

                {walletNotice && (
                  <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${walletNotice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {walletNotice.type === 'success' ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
                    <span>{walletNotice.message}</span>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: WALLETS LEDGER LIST */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                <Database className="h-4.5 w-4.5 text-emerald-500" />
                Your Local Wallet Address Book & Ledger Balances
              </h2>

              <div className="space-y-3 overflow-y-auto max-h-[500px]">
                {wallets.map((w, idx) => {
                  const isActive = activeWallet?.address === w.address;
                  const balance = blockchain.getBalance(w.address);
                  const utxosCount = blockchain.getUTXOsForAddress(w.address).length;
                  return (
                    <div 
                      key={w.address}
                      className={`border p-4 rounded-2xl transition shadow-2xs relative flex flex-col md:flex-row md:items-center justify-between gap-4 ${isActive ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50/30 border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-800 break-all select-all">{w.address}</span>
                          {isActive && (
                            <span className="text-[9px] font-bold uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Active</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono break-all flex items-center gap-1.5">
                          <span>Key: ••••••••{w.privateKey.substring(w.privateKey.length - 8)}</span>
                          <span>•</span>
                          <span>{utxosCount} unspent UTXO(s)</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-2.5 md:pt-0">
                        <div className="text-left md:text-right">
                          <span className="text-[10px] text-slate-400 block font-medium">BALANCE</span>
                          <span className="text-sm font-bold text-emerald-600 font-mono">{balance.toLocaleString()} TANTA</span>
                        </div>
                        <div className="flex gap-2">
                          {!isActive && (
                            <button
                              onClick={() => {
                                setActiveWallet(w);
                                setWalletNotice({ type: 'success', message: 'Switched active wallet successfully!' });
                                setTimeout(() => setWalletNotice(null), 3000);
                              }}
                              className="bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg border border-slate-200 transition"
                            >
                              Activate
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (confirm('Are you sure you want to delete this wallet from the cloud database? Ensure you have backed up the private key!')) {
                                try {
                                  await deleteWalletFromFirestore(w.address);
                                  setWalletNotice({ type: 'success', message: 'Wallet sukses dihapus dari cloud database!' });
                                  setTimeout(() => setWalletNotice(null), 3000);
                                } catch (err: any) {
                                  setWalletNotice({ type: 'error', message: 'Gagal menghapus wallet: ' + err.message });
                                  setTimeout(() => setWalletNotice(null), 3000);
                                }
                              }
                            }}
                            className="bg-red-50 hover:bg-red-100 text-red-600 p-1.5 rounded-lg border border-red-100 transition"
                            title="Remove Wallet"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Educational Notice */}
              <div className="mt-6 bg-slate-50 border border-slate-150 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-600">
                <HelpCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-800">Decentralized Cryptographic Identity</p>
                  <p className="mt-1 leading-relaxed">
                    Blockchain addresses are mathematically derived from Private Keys using cryptographic hashing. There is no central server registering accounts or resetting passwords. Your private key is your only proof of ownership. If you lose it, your coins are lost forever. If someone gets your key, they get full control of your funds.
                  </p>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* 5. SUPPLY HALVING TAB */}
        {activeTab === 'supply' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="supply-tab-content">
            
            {/* PARAMETERS CONFIG */}
            <div className="lg:col-span-1 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Coins className="h-4.5 w-4.5 text-amber-500" />
                  Supply Settings / Speed Halvings
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">BTC Standard Halving</label>
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      Standard block reward is 50 TANTA, halving every <span className="font-bold">210,000 blocks</span>. 
                      At that rate, reaching a halving would take several years!
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Custom Speed Halving (Blocks)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={customHalving}
                        onChange={(e) => setCustomHalving(e.target.value)}
                        placeholder="500"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800"
                        id="custom-halving-input"
                      />
                      <button
                        type="button"
                        onClick={handleApplyHalving}
                        className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md transition"
                        id="apply-halving-btn"
                      >
                        Apply
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">Set a smaller interval (e.g., 10 or 100 blocks) so you can witness block rewards halving inside your miner and explorer!</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 mt-6">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Halving Interval:</span>
                    <span className="font-bold text-slate-800">{blockchain.halvingInterval} blocks</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Halvings Completed:</span>
                    <span className="font-bold text-slate-800">{supplyInfo.halvingsCompleted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Current Subsidy:</span>
                    <span className="font-bold text-emerald-600 font-mono">{supplyInfo.blockSubsidy} TANTA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Burned Supply:</span>
                    <span className="font-bold text-red-600 font-mono">{supplyInfo.burnedSupply} TANTA</span>
                  </div>
                </div>
              </div>
            </div>

            {/* BEAUTIFUL SVG CHART */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
                <Activity className="h-4.5 w-4.5 text-blue-500" />
                Coin Emission Curve (TANTA Supply Halvings)
              </h2>

              <div className="flex-1 flex flex-col justify-between gap-4">
                {/* SVG Chart */}
                <div className="w-full h-64 bg-slate-50 rounded-2xl relative border border-slate-100 p-4" id="supply-chart-container">
                  
                  {/* Grid Lines */}
                  <div className="absolute inset-x-4 top-4 bottom-8 flex flex-col justify-between pointer-events-none">
                    <div className="border-t border-slate-200/60 w-full" />
                    <div className="border-t border-slate-200/60 w-full" />
                    <div className="border-t border-slate-200/60 w-full" />
                    <div className="border-t border-slate-200/60 w-full" />
                  </div>

                  {/* SVG Drawing */}
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 500 200" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Dotted Max Line (21M) */}
                    <line x1="0" y1="20" x2="500" y2="20" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 4" />
                    <text x="490" y="15" textAnchor="end" className="text-[9px] fill-red-500 font-bold font-mono">Max: 21,000,000 TANTA</text>

                    {/* Curve */}
                    <path
                      d="M 0,200 Q 150,110 300,50 T 500,21"
                      fill="url(#chartGradient)"
                      stroke="#f59e0b"
                      strokeWidth="2.5"
                    />

                    {/* Current Progress Pointer */}
                    {(() => {
                      const pct = supplyInfo.percentMined / 100;
                      const x = pct * 500;
                      const y = 200 - (pct * 180);
                      return (
                        <>
                          <circle cx={x} cy={y} r="5.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" className="animate-pulse" />
                          <line x1={x} y1={y} x2={x} y2="200" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 2" />
                        </>
                      );
                    })()}
                  </svg>

                  {/* Axes labels */}
                  <div className="absolute left-6 top-1 text-[9px] font-bold text-slate-400 font-mono">Supply (TANTA)</div>
                  <div className="absolute right-4 bottom-2 text-[9px] font-bold text-slate-400 font-mono">Blocks Height (Time)</div>
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3 text-xs text-amber-900">
                  <HelpCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Asymptotic Supply Dynamics</p>
                    <p className="text-slate-600 mt-1">
                      Because TANTA block rewards decrease geometrically with every halving block, the supply curve flattens progressively. It asymptotically approaches, but will never exceed, the maximum limit of 21,000,000 TANTA, protecting the scarcity of your coins.
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* 6. DRIVE SYNC SETTINGS */}
        {activeTab === 'drive' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs max-w-2xl mx-auto" id="drive-tab-content">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 pb-2 border-b border-slate-100">
              <Settings className="h-4.5 w-4.5 text-slate-700" />
              Google Drive Cloud Database Backup Settings
            </h2>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl ${userEmail ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  <HardDrive className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-bold text-slate-800">Connection Status</h3>
                  {userEmail ? (
                    <div className="mt-1 space-y-1">
                      <p className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-emerald-600" /> Connected as {userEmail}
                      </p>
                      <p className="text-[10px] text-slate-400">All mined blocks and processed transactions will sync automatically to Google Drive.</p>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <p className="text-xs text-red-600 font-bold flex items-center gap-1">
                        <ShieldAlert className="h-4 w-4 text-red-500" /> Disconnected
                      </p>
                      <p className="text-[10px] text-slate-400">Your blockchain database is currently running entirely in transient local storage. Sign in to sync your ledger across devices.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sync Actions */}
              {userEmail && (
                <div className="space-y-4 p-4 bg-slate-50 border border-slate-150 rounded-2xl">
                  <h4 className="text-xs font-bold text-slate-700">Sync Controls</h4>
                  
                  {syncState.status === 'syncing' && (
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <RefreshCw className="h-4 w-4 animate-spin text-slate-500" /> Syncing with Google Drive...
                    </div>
                  )}

                  {syncState.status === 'error' && (
                    <div className="text-xs font-semibold text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4.5 w-4.5 text-red-500" /> Error: {syncState.errorMsg || 'Database sync failed'}
                    </div>
                  )}

                  {syncState.lastSynced && (
                    <p className="text-[10px] text-slate-400">Last Synced: {new Date(syncState.lastSynced).toLocaleString()}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => onDriveSync('push')}
                      className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md transition"
                      id="push-drive-btn"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Push to Drive Cloud
                    </button>
                    <button
                      onClick={() => onDriveSync('pull')}
                      className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-xl border border-slate-200 transition"
                      id="pull-drive-btn"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Fetch from Drive Cloud
                    </button>
                  </div>
                </div>
              )}

              {/* WIPE STATE AND TEST NET RESTART */}
              <div className="border-t border-slate-150 pt-4">
                <h4 className="text-xs font-bold text-slate-700 mb-2">Reset & Troubleshooting</h4>
                <p className="text-[10px] text-slate-400 mb-3">Wiping the state re-initializes the blockchain with 5 default seed blocks and early pre-seeded transactions.</p>
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to reset your local TANTA Chain blockchain ledger? This will lose all un-synced mining progress.')) {
                      onDriveSync('wipe');
                    }
                  }}
                  className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold py-2 px-4 rounded-xl border border-red-200 transition"
                  id="wipe-state-btn"
                >
                  Wipe Ledger and Reseed
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
