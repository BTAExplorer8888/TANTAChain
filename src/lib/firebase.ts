import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  getDocFromServer,
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Block, Transaction, WalletKeyPair } from '../types';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Use initializeFirestore with long polling enabled for sandboxed preview stability
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
}, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);

// Test Connection on Startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore connection check: Running in offline/sandboxed state. Waiting for network connectivity...");
    }
  }
}
testConnection();

// --- Error Handling as defined in the Firebase Integration Skill ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Firestore Ledger Sync Operations ---

// Converts a Firestore Block doc to our standard Block type
function docToBlock(docData: any): Block {
  try {
    const transactions = JSON.parse(docData.transactionsJson || '[]');
    return {
      hash: docData.hash,
      parentHash: docData.parentHash,
      merkleRoot: docData.merkleRoot,
      timestamp: docData.timestamp,
      height: docData.height,
      nonce: docData.nonce,
      difficulty: docData.difficulty,
      miner: docData.miner,
      reward: docData.reward,
      transactions: transactions
    };
  } catch (e) {
    console.error('Error parsing block transactions JSON:', e);
    return {
      hash: docData.hash,
      parentHash: docData.parentHash,
      merkleRoot: docData.merkleRoot,
      timestamp: docData.timestamp,
      height: docData.height,
      nonce: docData.nonce,
      difficulty: docData.difficulty,
      miner: docData.miner,
      reward: docData.reward,
      transactions: []
    };
  }
}

// Converts a Firestore Mempool doc to our standard Transaction type
function docToTx(docData: any): Transaction {
  try {
    const vin = JSON.parse(docData.vinJson || '[]');
    const vout = JSON.parse(docData.voutJson || '[]');
    return {
      txid: docData.txid,
      isCoinbase: docData.isCoinbase,
      fee: docData.fee,
      timestamp: docData.timestamp,
      blockHeight: docData.blockHeight,
      vin,
      vout
    };
  } catch (e) {
    console.error('Error parsing tx JSON:', e);
    return {
      txid: docData.txid,
      isCoinbase: docData.isCoinbase,
      fee: docData.fee,
      timestamp: docData.timestamp,
      blockHeight: docData.blockHeight,
      vin: [],
      vout: []
    };
  }
}

// Check if blocks collection is empty, and if so, write Genesis block to Firestore
export async function bootstrapGenesisIfNeeded(genesisBlock: Block) {
  const path = 'blocks';
  try {
    const q = query(collection(db, path), orderBy('height', 'asc'));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.log('Firestore blocks collection is empty, bootstrapping Genesis Block...');
      const genesisRef = doc(db, 'blocks', '0');
      const payload = {
        hash: genesisBlock.hash,
        parentHash: genesisBlock.parentHash,
        merkleRoot: genesisBlock.merkleRoot,
        timestamp: genesisBlock.timestamp,
        height: genesisBlock.height,
        nonce: genesisBlock.nonce,
        difficulty: genesisBlock.difficulty,
        miner: genesisBlock.miner,
        reward: genesisBlock.reward,
        transactionsJson: JSON.stringify(genesisBlock.transactions)
      };
      await setDoc(genesisRef, payload);
      console.log('Genesis Block uploaded successfully.');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'blocks/0');
  }
}

// Listen to blocks collection in real-time
export function listenToBlocks(onUpdate: (blocks: Block[]) => void) {
  const path = 'blocks';
  const q = query(collection(db, path), orderBy('height', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const blocks: Block[] = [];
    snapshot.forEach((doc) => {
      blocks.push(docToBlock(doc.data()));
    });
    onUpdate(blocks);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
}

// Listen to mempool in real-time
export function listenToMempool(onUpdate: (mempool: Transaction[]) => void) {
  const path = 'mempool';
  const q = query(collection(db, path), orderBy('timestamp', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const txs: Transaction[] = [];
    snapshot.forEach((doc) => {
      txs.push(docToTx(doc.data()));
    });
    onUpdate(txs);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
}

// Upload a newly mined block and clear its transactions from mempool in a single Firestore transaction/batch
export async function uploadMinedBlock(block: Block) {
  const path = `blocks/${block.height}`;
  try {
    const batch = writeBatch(db);
    
    // 1. Add block doc
    const blockRef = doc(db, 'blocks', String(block.height));
    batch.set(blockRef, {
      hash: block.hash,
      parentHash: block.parentHash,
      merkleRoot: block.merkleRoot,
      timestamp: block.timestamp,
      height: block.height,
      nonce: block.nonce,
      difficulty: block.difficulty,
      miner: block.miner,
      reward: block.reward,
      transactionsJson: JSON.stringify(block.transactions)
    });

    // 2. Clear mined transactions from mempool (excluding coinbase)
    const minedTxids = block.transactions
      .filter(tx => !tx.isCoinbase)
      .map(tx => tx.txid);

    for (const txid of minedTxids) {
      const txRef = doc(db, 'mempool', txid);
      batch.delete(txRef);
    }

    await batch.commit();
    console.log(`Block #${block.height} uploaded and mempool cleared in Firestore.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Upload a transaction to the public unconfirmed mempool
export async function broadcastTransactionToFirestore(tx: Transaction) {
  const path = `mempool/${tx.txid}`;
  try {
    const txRef = doc(db, 'mempool', tx.txid);
    await setDoc(txRef, {
      txid: tx.txid,
      isCoinbase: tx.isCoinbase,
      fee: tx.fee,
      timestamp: tx.timestamp,
      blockHeight: tx.blockHeight,
      vinJson: JSON.stringify(tx.vin),
      voutJson: JSON.stringify(tx.vout)
    });
    console.log(`Transaction ${tx.txid} broadcasted to Firestore mempool.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Reset/Wipe database and re-bootstrap with Genesis
export async function wipeFirestoreDatabase(genesisBlock: Block) {
  try {
    // Fetch all blocks
    const blocksSnap = await getDocs(collection(db, 'blocks'));
    const mempoolSnap = await getDocs(collection(db, 'mempool'));

    const batch = writeBatch(db);
    blocksSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });
    mempoolSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log('All Firestore documents cleared.');

    // Re-bootstrap with Genesis
    await bootstrapGenesisIfNeeded(genesisBlock);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'all');
  }
}

// --- Wallets Storage Sync Operations ---
export async function saveWalletToFirestore(wallet: WalletKeyPair, userEmail: string | null = null) {
  const path = `wallets/${wallet.address}`;
  try {
    const walletRef = doc(db, 'wallets', wallet.address);
    await setDoc(walletRef, {
      address: wallet.address,
      privateKey: wallet.privateKey,
      createdAt: Date.now(),
      createdBy: userEmail || 'anonymous'
    });
    console.log(`Wallet ${wallet.address} saved to Firestore.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteWalletFromFirestore(address: string) {
  const path = `wallets/${address}`;
  try {
    const walletRef = doc(db, 'wallets', address);
    await deleteDoc(walletRef);
    console.log(`Wallet ${address} deleted from Firestore.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function listenToWallets(onUpdate: (wallets: WalletKeyPair[]) => void) {
  const path = 'wallets';
  const q = query(collection(db, path), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const walletsList: WalletKeyPair[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      walletsList.push({
        privateKey: data.privateKey,
        address: data.address
      });
    });
    onUpdate(walletsList);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
}

