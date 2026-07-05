import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Trash2, HelpCircle, Code, Copy, Check } from 'lucide-react';
import { TantaBlockchain } from '../lib/blockchain';
import { broadcastTransactionToFirestore } from '../lib/firebase';

interface RpcConsoleProps {
  blockchain: TantaBlockchain;
  onStateChange: () => void;
}

interface CommandLog {
  timestamp: string;
  command: string;
  result: any;
  isError: boolean;
}

export default function RpcConsole({ blockchain, onStateChange }: RpcConsoleProps) {
  const [inputCommand, setInputCommand] = useState('');
  const [logs, setLogs] = useState<CommandLog[]>([
    {
      timestamp: new Date().toLocaleTimeString(),
      command: 'system-init',
      result: {
        message: 'Welcome to TANTA Chain Core JSON-RPC Console v1.0.0',
        active_chain: 'mainnet',
        rpc_port: 8332,
        protocol_version: 70015,
        instructions: 'Type "help" to see list of RPC commands or click any quick commands below to execute immediately.'
      },
      isError: false
    }
  ]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Execute single RPC command
  const handleExecute = (cmdStr: string) => {
    const trimmed = cmdStr.trim();
    if (!trimmed) return;

    // Parse command and arguments
    // Handles spaces and quotes optionally, simple splitting for now
    const parts = trimmed.match(/("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|[^\s]+)/g) || [];
    if (parts.length === 0) return;

    const method = parts[0];
    const params = parts.slice(1).map(arg => {
      // Clean quotes
      if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
        return arg.slice(1, -1);
      }
      // Parse numbers if numeric
      if (!isNaN(Number(arg))) {
        return Number(arg);
      }
      return arg;
    });

    let result: any;
    let isError = false;

    try {
      result = blockchain.executeRPC(method, params);
      
      // If we made a state-changing transaction broadcast
      if (method.toLowerCase() === 'sendrawtransaction' && result) {
        // Find transaction with the matching txid in the local mempool
        const tx = blockchain.mempool.find(t => t.txid === result);
        if (tx) {
          // Broadcast to Firestore so other miners/explorers receive it!
          broadcastTransactionToFirestore(tx)
            .then(() => {
              onStateChange();
            })
            .catch(err => {
              console.error('Error broadcasting RPC transaction to Firestore:', err);
            });
        } else {
          onStateChange();
        }
      }
    } catch (error: any) {
      isError = true;
      result = {
        code: -32601,
        message: error.message || 'RPC execution failure'
      };
    }

    const newLog: CommandLog = {
      timestamp: new Date().toLocaleTimeString(),
      command: trimmed,
      result,
      isError
    };

    setLogs(prev => [...prev, newLog]);
    setInputCommand('');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleExecute(inputCommand);
  };

  const handleCopyJSON = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  // Quick suggestions based on current ledger
  const lastBlock = blockchain.blocks[blockchain.blocks.length - 1];
  const sampleTx = lastBlock.transactions[0]?.txid || '0'.repeat(64);

  const quickCommands = [
    { label: 'getblockchaininfo', cmd: 'getblockchaininfo' },
    { label: 'getsupplyinfo', cmd: 'getsupplyinfo' },
    { label: 'getmininginfo', cmd: 'getmininginfo' },
    { label: 'getblockcount', cmd: 'getblockcount' },
    { label: 'getbestblockhash', cmd: 'getbestblockhash' },
    { label: `getblock #${lastBlock.height}`, cmd: `getblock ${lastBlock.height}` },
    { label: 'getmempoolinfo', cmd: 'getmempoolinfo' },
    { label: 'getaddressinfo Satoshi', cmd: 'getaddressinfo SatoshiNakamotoTANTA' },
    { label: 'help', cmd: 'help' }
  ];

  return (
    <div className="bg-slate-900 text-slate-100 rounded-3xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[640px] font-mono" id="rpc-console-root">
      
      {/* TERMINAL HEADER */}
      <div className="bg-slate-950 px-6 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-amber-500" />
          <span className="font-bold text-xs uppercase tracking-wider text-slate-300">TANTA Core JSON-RPC CLI Console</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={clearLogs}
            className="text-[10px] text-slate-500 hover:text-red-400 font-semibold flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-1 rounded-md transition"
            title="Clear logs"
            id="clear-logs-btn"
          >
            <Trash2 className="h-3 w-3" /> Clear Console
          </button>
        </div>
      </div>

      {/* QUICK COMMAND CHIPS */}
      <div className="bg-slate-950/80 px-6 py-2 border-b border-slate-900 overflow-x-auto flex items-center gap-2" id="rpc-quick-chips">
        <span className="text-[10px] text-slate-500 font-bold shrink-0 uppercase">Quick RPC:</span>
        {quickCommands.map((item, idx) => (
          <button
            key={idx}
            onClick={() => handleExecute(item.cmd)}
            className="text-[10px] bg-slate-900 hover:bg-slate-800 hover:text-amber-400 text-slate-400 font-semibold py-1 px-2.5 border border-slate-800 rounded-lg transition shrink-0"
            id={`quick-cmd-${idx}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* TERMINAL OUTPUT CANVAS */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" id="terminal-canvas">
        {logs.map((log, idx) => {
          const jsonStr = JSON.stringify(log.result, null, 2);
          return (
            <div key={idx} className="space-y-1 text-xs border-b border-slate-800/40 pb-3" id={`log-entry-${idx}`}>
              <div className="flex items-center justify-between text-slate-500 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-500 font-bold">❯</span>
                  <span className="text-slate-300 font-semibold">{log.command}</span>
                </div>
                <span>{log.timestamp}</span>
              </div>
              
              <div className="relative group mt-1.5">
                <pre className={`p-3 rounded-xl bg-slate-950/60 border ${log.isError ? 'border-red-900/50 text-red-400' : 'border-slate-800/50 text-emerald-400'} overflow-x-auto font-mono text-[11px] leading-relaxed max-w-full`}>
                  <code>{jsonStr}</code>
                </pre>
                
                {/* Copy Button */}
                <button
                  onClick={() => handleCopyJSON(jsonStr, idx)}
                  className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded-lg transition"
                  title="Copy JSON response"
                  id={`copy-json-btn-${idx}`}
                >
                  {copiedIndex === idx ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          );
        })}
        <div ref={terminalEndRef} />
      </div>

      {/* INPUT COMMAND SUBMIT */}
      <form onSubmit={handleFormSubmit} className="bg-slate-950 p-4 border-t border-slate-800 flex items-center gap-3" id="rpc-input-form">
        <span className="text-amber-500 font-bold pl-2 select-none">❯</span>
        <input
          type="text"
          value={inputCommand}
          onChange={(e) => setInputCommand(e.target.value)}
          placeholder="e.g. getblock 3 or getsupplyinfo (Press Enter to execute)"
          className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 focus:outline-none text-xs font-mono"
          id="terminal-input"
          autoFocus
        />
        <button
          type="submit"
          className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs py-1.5 px-4 rounded-xl shadow-md transition shrink-0"
          id="execute-rpc-btn"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>

    </div>
  );
}
