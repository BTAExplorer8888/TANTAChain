import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Block, Transaction } from '../types';

// Initialize Firebase App and Auth
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // Fallback: If we had a session but lost the in-memory token, the user needs to sign in again to get the Drive credential.
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in with popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google Auth.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.message?.includes('popup-closed-by-user')) {
      console.warn('Sign-in cancelled: Google auth popup window was closed by the user.');
    } else {
      console.error('Sign-in error:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Logout
export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// --- Google Drive File Storage APIs ---

interface DriveFile {
  id: string;
  name: string;
}

// Find files on Google Drive matching the name
export async function findBlockchainFile(token: string): Promise<DriveFile | null> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q=name='tanta_blockchain_db.json' and trashed=false&spaces=drive&fields=files(id,name)`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Failed to search Google Drive');
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
    return null;
  } catch (error) {
    console.error('Error finding blockchain database in Google Drive:', error);
    throw error;
  }
}

// Read ledger data from Google Drive
export async function readBlockchainFile(token: string, fileId: string): Promise<{ blocks: Block[]; mempool: Transaction[]; halvingInterval: number }> {
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to download database file: ${res.statusText}`);
    }

    const data = await res.json();
    return {
      blocks: data.blocks || [],
      mempool: data.mempool || [],
      halvingInterval: data.halvingInterval || 1000
    };
  } catch (error) {
    console.error('Error reading blockchain database from Google Drive:', error);
    throw error;
  }
}

// Write ledger data to Google Drive (Create or Update)
export async function saveBlockchainFile(
  token: string,
  fileId: string | null,
  payload: { blocks: Block[]; mempool: Transaction[]; halvingInterval: number }
): Promise<string> {
  try {
    const jsonStr = JSON.stringify(payload, null, 2);

    if (fileId) {
      // UPDATE existing file
      const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: jsonStr
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to update Google Drive file');
      }

      const updated = await res.json();
      return fileId;
    } else {
      // CREATE a new file on Google Drive
      // Standard multipart/related upload to combine metadata and binary payload in one transaction
      const boundary = 'tanta_boundary_string_xyz_123';
      const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

      const metadata = {
        name: 'tanta_blockchain_db.json',
        mimeType: 'application/json',
        description: 'Tanta Chain Mainnet Ledger Database Backup'
      };

      const multipartBody = 
        `\r\n--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${jsonStr}\r\n` +
        `--${boundary}--`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to create Google Drive file');
      }

      const created = await res.json();
      return created.id;
    }
  } catch (error) {
    console.error('Error saving blockchain database to Google Drive:', error);
    throw error;
  }
}
