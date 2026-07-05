import React, { useState, useEffect, useRef } from 'react';
import { 
  Coins, Terminal, ShieldCheck, Database, RefreshCw, 
  HelpCircle, UserCheck, HardDrive, Compass
} from 'lucide-react';
import { TantaBlockchain } from './lib/blockchain';
import { initAuth, googleSignIn, logout, findBlockchainFile, readBlockchainFile, saveBlockchainFile } from './lib/drive';
import { 
  listenToBlocks, 
  listenToMempool, 
  uploadMinedBlock, 
  bootstrapGenesisIfNeeded, 
  wipeFirestoreDatabase 
} from './lib/firebase';
import { SyncState, Block } from './types';
import BlockchainExplorer from './components/BlockchainExplorer';
import RpcConsole from './components/RpcConsole';

export default function App() {
  // Blockchain Engine Instance (persistent across renders, synced in real-time with Firestore)
  const blockchainRef = useRef(new TantaBlockchain());
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // Auth & Cloud State
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'unauthenticated',
    lastSynced: null,
    errorMsg: null,
    fileId: null
  });

  // Mode Selection: Explorer vs RPC terminal
  const [viewMode, setViewMode] = useState<'explorer' | 'rpc'>('explorer');

  // Trigger re-render when blockchain state mutates
  const handleBlockchainStateChange = () => {
    setUpdateTrigger(prev => prev + 1);
  };

  // Seed default blocks and subscribe to real-time Firestore database
  useEffect(() => {
    // 1. Initialize local baseline
    blockchainRef.current.initializeWithDefaults();
    handleBlockchainStateChange();

    // 2. Bootstrap Genesis Block into Firestore if empty
    const genesisBlock = blockchainRef.current.blocks[0];
    if (genesisBlock) {
      bootstrapGenesisIfNeeded(genesisBlock);
    }

    // 3. Connect real-time Firestore mainnet listeners so all users are in sync!
    const unsubscribeBlocks = listenToBlocks((blocks) => {
      if (blocks && blocks.length > 0) {
        blockchainRef.current.loadState(blocks, blockchainRef.current.mempool, blockchainRef.current.halvingInterval);
        handleBlockchainStateChange();
      }
    });

    const unsubscribeMempool = listenToMempool((mempool) => {
      blockchainRef.current.loadState(blockchainRef.current.blocks, mempool, blockchainRef.current.halvingInterval);
      handleBlockchainStateChange();
    });

    return () => {
      unsubscribeBlocks();
      unsubscribeMempool();
    };
  }, []);

  // Initialize Firebase Auth on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      async (firebaseUser, accessToken) => {
        setUser(firebaseUser);
        setUserEmail(firebaseUser.email);
        setToken(accessToken);
        setSyncState(prev => ({ ...prev, status: 'idle' }));
        // Automatically fetch current Drive file meta, if any
        try {
          const file = await findBlockchainFile(accessToken);
          if (file) {
            setSyncState(prev => ({ ...prev, status: 'idle', fileId: file.id }));
          }
        } catch (e) {
          console.error('Error finding drive file on startup:', e);
        }
      },
      () => {
        setUser(null);
        setUserEmail(null);
        setToken(null);
        setSyncState(prev => ({ ...prev, status: 'unauthenticated', fileId: null }));
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Sync with Google Drive (Push/Pull/Wipe)
  const syncWithDrive = async (accessToken: string | null, action: 'push' | 'pull' | 'wipe') => {
    const activeToken = accessToken || token;
    if (!activeToken) {
      setSyncState(prev => ({ ...prev, status: 'unauthenticated', errorMsg: 'User not signed in' }));
      return;
    }

    setSyncState(prev => ({ ...prev, status: 'syncing', errorMsg: null }));

    try {
      if (action === 'wipe') {
        // Reset local block data
        blockchainRef.current.initializeWithDefaults();
        
        // Wipe shared Firestore database and reseed
        await wipeFirestoreDatabase(blockchainRef.current.blocks[0]);
        handleBlockchainStateChange();

        // Push clean reseeded blocks to Google Drive to keep synced
        const file = await findBlockchainFile(activeToken);
        const fileId = file ? file.id : null;

        const cleanPayload = {
          blocks: blockchainRef.current.blocks,
          mempool: blockchainRef.current.mempool,
          halvingInterval: blockchainRef.current.halvingInterval
        };

        const newFileId = await saveBlockchainFile(activeToken, fileId, cleanPayload);
        setSyncState({
          status: 'success',
          lastSynced: Date.now(),
          errorMsg: null,
          fileId: newFileId
        });
        return;
      }

      // Find file on user's Drive
      const file = await findBlockchainFile(activeToken);
      const fileId = file ? file.id : null;

      if (action === 'pull') {
        if (fileId) {
          // Restore / Pull previous ledger from Google Drive backup
          const dbData = await readBlockchainFile(activeToken, fileId);
          if (dbData.blocks && dbData.blocks.length > 0) {
            // Seed Firestore with restored blocks from Drive!
            await wipeFirestoreDatabase(dbData.blocks[0]);
            for (let i = 1; i < dbData.blocks.length; i++) {
              await uploadMinedBlock(dbData.blocks[i]);
            }
            blockchainRef.current.loadState(dbData.blocks, dbData.mempool, dbData.halvingInterval);
            handleBlockchainStateChange();
          }
          setSyncState({
            status: 'success',
            lastSynced: Date.now(),
            errorMsg: null,
            fileId
          });
        } else {
          // File doesn't exist on user's Drive - create a backup of current Firestore ledger
          const payload = {
            blocks: blockchainRef.current.blocks,
            mempool: blockchainRef.current.mempool,
            halvingInterval: blockchainRef.current.halvingInterval
          };
          const newFileId = await saveBlockchainFile(activeToken, null, payload);
          setSyncState({
            status: 'success',
            lastSynced: Date.now(),
            errorMsg: null,
            fileId: newFileId
          });
        }
      } else if (action === 'push') {
        // Backup current public Firestore ledger to user's Google Drive
        const payload = {
          blocks: blockchainRef.current.blocks,
          mempool: blockchainRef.current.mempool,
          halvingInterval: blockchainRef.current.halvingInterval
        };
        const updatedFileId = await saveBlockchainFile(activeToken, fileId, payload);
        setSyncState({
          status: 'success',
          lastSynced: Date.now(),
          errorMsg: null,
          fileId: updatedFileId
        });
      }
    } catch (error: any) {
      console.error('Google Drive sync failure:', error);
      setSyncState(prev => ({
        ...prev,
        status: 'error',
        errorMsg: error.message || 'Failed to communicate with Google Drive API'
      }));
    }
  };

  // Connect Google Account Flow
  const handleLogin = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        const allowedEmail = 'wtanta911@gmail.com';
        if (res.user.email?.toLowerCase() !== allowedEmail.toLowerCase()) {
          // Immediately log out unauthorized user
          await logout();
          setSyncState(prev => ({
            ...prev,
            status: 'unauthenticated',
            errorMsg: `Akses Ditolak: Hanya pemilik (${allowedEmail}) yang diizinkan untuk menghubungkan Google Drive.`
          }));
          return;
        }

        setUser(res.user);
        setUserEmail(res.user.email);
        setToken(res.accessToken);
        setSyncState(prev => ({ ...prev, status: 'idle' }));
        // Load data or backup on login
        await syncWithDrive(res.accessToken, 'pull');
      }
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.message?.includes('popup-closed-by-user')) {
        console.warn('Google Auth popup was closed before completion.');
        setSyncState(prev => ({
          ...prev,
          status: 'unauthenticated',
          errorMsg: 'Masuk dibatalkan (Jendela login ditutup sebelum selesai).'
        }));
      } else {
        console.error('Login flow failed:', error);
        setSyncState(prev => ({
          ...prev,
          status: 'error',
          errorMsg: error.message || 'Gagal masuk dengan akun Google.'
        }));
      }
    }
  };

  // Logout Google Account Flow
  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setUserEmail(null);
      setToken(null);
      setSyncState({
        status: 'unauthenticated',
        lastSynced: null,
        errorMsg: null,
        fileId: null
      });
      // Reseed locally to clear confidential Drive data
      blockchainRef.current.initializeWithDefaults();
      handleBlockchainStateChange();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800" id="tanta-app-container">
      {/* GLOBAL VIEW SELECTION RAIL */}
      <nav className="bg-slate-900 text-white px-4 md:px-8 py-3.5 flex items-center justify-between border-b border-slate-800 shadow-md" id="global-nav">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-amber-500 animate-pulse" />
          <span className="font-bold tracking-tight text-sm font-mono">TANTA_NODE_MAINNET</span>
        </div>

        {/* VIEW SELECTOR */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800" id="mode-selector-wrapper">
          <button
            onClick={() => setViewMode('explorer')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition ${viewMode === 'explorer' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
            id="view-explorer-btn"
          >
            <Compass className="h-4 w-4" />
            Mainnet Explorer
          </button>
          <button
            onClick={() => setViewMode('rpc')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition ${viewMode === 'rpc' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
            id="view-rpc-btn"
          >
            <Terminal className="h-4 w-4" />
            JSON-RPC Terminal
          </button>
        </div>

        {/* SECURITY & DECENTRALIZATION SHIELD */}
        <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-3 py-1 rounded-full">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>Secured by Google Drive Auth</span>
        </div>
      </nav>

      {/* CORE SCREEN SWITCH */}
      <div className="flex-1 flex flex-col" id="view-mode-container">
        {viewMode === 'explorer' ? (
          <BlockchainExplorer
            blockchain={blockchainRef.current}
            onStateChange={handleBlockchainStateChange}
            syncState={syncState}
            onDriveSync={(action) => syncWithDrive(token, action)}
            onLogin={handleLogin}
            onLogout={handleLogout}
            userEmail={userEmail}
          />
        ) : (
          <div className="p-4 md:p-8 flex-1 flex flex-col max-w-7xl mx-auto w-full" id="rpc-console-container">
            <div className="mb-4">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Terminal className="h-5 w-5 text-slate-700" />
                TANTA Core JSON-RPC CLI Client
              </h2>
              <p className="text-xs text-slate-500">Query mainnet chainwork, block counts, account balances, and broadcast custom hex transaction packets directly to the mempool.</p>
            </div>
            <RpcConsole
              blockchain={blockchainRef.current}
              onStateChange={handleBlockchainStateChange}
            />
          </div>
        )}
      </div>

      {/* COMPACT FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-3 px-4 md:px-8 text-center text-[10px] text-slate-400 font-mono flex flex-col md:flex-row items-center justify-between gap-2" id="tanta-footer">
        <span>TANTA CHAIN © 2026. All Rights Reserved.</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Local Host Secure Context</span>
          <span>•</span>
          <span>Protocol version: 70015</span>
        </div>
      </footer>
    </div>
  );
}
