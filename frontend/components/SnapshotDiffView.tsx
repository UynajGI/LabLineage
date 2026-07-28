import React, { useEffect, useState } from 'react';
import { FilePlus, FileEdit, FileMinus, FileText, ArrowRight, Clock, HardDrive, Loader2 } from 'lucide-react';
import { FileChange, SnapshotSummary } from '../types';
import { api } from '../services/api';

interface SnapshotDiffViewProps {
  changes: FileChange[];
  snapshots: SnapshotSummary[];
}

export const SnapshotDiffView: React.FC<SnapshotDiffViewProps> = ({ changes, snapshots }) => {
  const [currentChanges, setCurrentChanges] = useState(changes);
  const [snapshotHistory, setSnapshotHistory] = useState(snapshots);
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(changes[0] || null);
  const [scanPath, setScanPath] = useState('');
  const [includeTextDiff, setIncludeTextDiff] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    setCurrentChanges(changes);
    setSelectedChange(changes[0] || null);
  }, [changes]);

  useEffect(() => {
    setSnapshotHistory(snapshots);
  }, [snapshots]);

  const captureSnapshot = async () => {
    if (!scanPath.trim()) return;
    setScanning(true);
    setScanError('');
    try {
      const result = await api.scanDirectory(scanPath.trim(), includeTextDiff);
      setCurrentChanges(result.changes);
      setSelectedChange(result.changes[0] || null);
      setSnapshotHistory((current) => [...current, result.snapshot]);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Snapshot scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const getChangeIcon = (type: string) => {
    switch (type) {
      case 'added': return <FilePlus className="text-green-500" size={18} />;
      case 'modified': return <FileEdit className="text-blue-500" size={18} />;
      case 'deleted': return <FileMinus className="text-red-500" size={18} />;
      case 'moved': return <ArrowRight className="text-purple-500" size={18} />;
      default: return <FileText className="text-slate-500" size={18} />;
    }
  };

  const getChangeBadge = (type: string) => {
    switch (type) {
      case 'added': return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Added</span>;
      case 'modified': return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Modified</span>;
      case 'deleted': return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Deleted</span>;
      case 'moved': return <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Move candidate</span>;
      default: return null;
    }
  };

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined) return 'N/A';
    const sign = bytes > 0 ? '+' : '';
    if (Math.abs(bytes) < 1024) return `${sign}${bytes} B`;
    if (Math.abs(bytes) < 1024 * 1024) return `${sign}${(bytes / 1024).toFixed(1)} KB`;
    return `${sign}${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };
  const previousSnapshot = snapshotHistory.at(-2);
  const latestSnapshot = snapshotHistory.at(-1);
  const formatCapturedAt = (value: string) => new Date(value).toLocaleString();

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Non-Git Directory Tracking</h2>
        <p className="text-slate-600 mt-1">Comparing snapshots to track changes in raw data, results, and uncommitted scripts.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <input
          value={scanPath}
          onChange={(event) => setScanPath(event.target.value)}
          placeholder="Absolute local directory path"
          className="min-w-[280px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={() => void captureSnapshot()}
          disabled={scanning || !scanPath.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {scanning ? <Loader2 size={16} className="animate-spin" /> : <HardDrive size={16} />}
          Capture snapshot
        </button>
        <label className="flex w-full items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeTextDiff}
            onChange={(event) => setIncludeTextDiff(event.target.checked)}
            className="mt-1"
          />
          <span>
            Authorize bounded text/code diff capture. Content is limited to 256 KiB,
            secret-shaped values are redacted, and production policy may still deny it.
          </span>
        </label>
        {scanError && <p className="w-full text-sm text-red-600">{scanError}</p>}
      </div>

      {latestSnapshot ? (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-4">
            {previousSnapshot && (
              <>
                <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 rounded border border-slate-200">
                  <HardDrive size={16} className="text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">{previousSnapshot.id}</span>
                  <span className="text-xs text-slate-600 ml-2">{formatCapturedAt(previousSnapshot.collectedAt)}</span>
                </div>
                <ArrowRight size={20} className="text-slate-500" />
              </>
            )}
            <div className="flex items-center space-x-2 bg-blue-50 px-3 py-2 rounded border border-blue-200">
              <Clock size={16} className="text-blue-600" />
              <span className="text-sm font-medium text-blue-800">{latestSnapshot.id} (Latest)</span>
              <span className="text-xs text-blue-800 ml-2">{formatCapturedAt(latestSnapshot.collectedAt)}</span>
              <span className="text-xs text-blue-800">{latestSnapshot.fileCount} files</span>
            </div>
          </div>
          <div className="text-sm text-slate-600">
            Found <span className="font-bold text-slate-800">{currentChanges.length}</span> changes
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-700">
          No snapshots captured for this project. Enter an allowed local directory above to create the baseline.
        </div>
      )}

      <div className="flex-1 flex overflow-hidden border border-slate-200 rounded-lg bg-white shadow-sm">
        {/* File List */}
        <div className="w-1/3 border-r border-slate-200 overflow-y-auto bg-slate-50">
          <div className="p-3 border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Changed Files
          </div>
          <ul className="divide-y divide-slate-200">
            {currentChanges.map((change) => (
              <li 
                key={change.id}
                onClick={() => setSelectedChange(change)}
                className={`p-3 cursor-pointer hover:bg-blue-50 transition-colors flex items-start space-x-3 ${selectedChange?.id === change.id ? 'bg-blue-50 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}
              >
                <div className="mt-0.5">{getChangeIcon(change.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate" title={change.path}>
                    {change.path.split('/').pop()}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{change.path}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Diff Details */}
        <div className="w-2/3 flex flex-col bg-white overflow-hidden">
          {selectedChange ? (
            <>
              <div className="p-4 border-b border-slate-200 flex justify-between items-start bg-slate-50">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 break-all">{selectedChange.path}</h3>
                  <div className="flex items-center space-x-3 mt-2">
                    {getChangeBadge(selectedChange.type)}
                    <span className="text-sm text-slate-500 font-mono">
                      Size: {formatBytes(selectedChange.sizeDiffBytes)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-slate-50 p-3 rounded border border-slate-200">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                        Old Hash ({previousSnapshot?.id || 'previous snapshot'})
                      </p>
                      <p className="font-mono text-slate-700 break-all">{selectedChange.oldHash || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded border border-slate-200">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                        New Hash ({latestSnapshot?.id || 'latest snapshot'})
                      </p>
                      <p className="font-mono text-slate-700 break-all">{selectedChange.newHash || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Old size</p>
                      <p className="font-mono text-slate-700">
                        {selectedChange.oldSizeBytes === undefined ? 'N/A' : formatBytes(selectedChange.oldSizeBytes).replace(/^\+/, '')}
                      </p>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">New size</p>
                      <p className="font-mono text-slate-700">
                        {selectedChange.newSizeBytes === undefined ? 'N/A' : formatBytes(selectedChange.newSizeBytes).replace(/^\+/, '')}
                      </p>
                    </div>
                  </div>

                  {selectedChange.inference && (
                    <div className="rounded border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
                      <p className="font-semibold">
                        Inferred {selectedChange.inference.kind.replace('_', ' ')}
                        {' '}({selectedChange.inference.confidence})
                      </p>
                      <p className="mt-1 text-xs">
                        Evidence: {selectedChange.inference.basis.join(', ')}. This is a candidate, not a confirmed fact.
                      </p>
                    </div>
                  )}

                  {selectedChange.diffSnippet ? (
                    <div>
                      <p className="text-sm font-semibold text-slate-700 mb-2">Content Diff (Text Excerpt)</p>
                      <pre className="bg-slate-900 text-slate-300 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
                        {selectedChange.diffSnippet.split('\n').map((line, i) => {
                          let colorClass = '';
                          if (line.startsWith('+')) colorClass = 'text-green-400 bg-green-400/10';
                          else if (line.startsWith('-')) colorClass = 'text-red-400 bg-red-400/10';
                          else if (line.startsWith('@@')) colorClass = 'text-blue-400';
                          
                          return (
                            <div key={i} className={`px-2 ${colorClass}`}>
                              {line}
                            </div>
                          );
                        })}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                      <FileText size={32} className="mb-2 opacity-50" />
                      <p>No text diff available for this file type.</p>
                      <p className="text-xs mt-1">
                        {selectedChange.textDiff?.reason || 'Binary file or diff generation disabled by policy.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-600">
              Select a file to view changes
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
