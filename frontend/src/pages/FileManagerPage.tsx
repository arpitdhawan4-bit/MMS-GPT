/**
 * src/pages/FileManagerPage.tsx
 * ------------------------------
 * Full-featured Supabase Storage file manager.
 *
 * Capabilities:
 *   • Upload  — drag & drop or click-to-browse, supports multiple files
 *   • Download — single click triggers browser save dialog
 *   • Rename  — modal with pre-filled current name, Enter to confirm
 *   • Delete  — confirmation modal before permanent removal
 *   • Toast notifications — success & error feedback, auto-dismiss after 4 s
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  Download,
  Pencil,
  Trash2,
  FileIcon,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  RefreshCw,
  HardDrive,
  ShieldCheck,
} from "lucide-react";
import { useFileStorage } from "../hooks/useFileStorage";
import type { StorageFile } from "../hooks/useFileStorage";

// ── Toast ─────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

let _toastId = 0;

// ── Format helpers ────────────────────────────────────────────────────────────

function formatBytes(bytes: unknown): string {
  const n = typeof bytes === "number" ? bytes : 0;
  if (!n) return "—";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${parseFloat((n / Math.pow(1024, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Rename Modal ──────────────────────────────────────────────────────────────

interface RenameModalProps {
  file: StorageFile;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

function RenameModal({ file, onConfirm, onCancel }: RenameModalProps) {
  const [newName, setNewName] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const isValid = newName.trim().length > 0 && newName.trim() !== file.name;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Rename File
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current name */}
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Current name:{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300 break-all">
            {file.name}
          </span>
        </p>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isValid) onConfirm(newName.trim());
            if (e.key === "Escape") onCancel();
          }}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-5"
          placeholder="Enter new file name…"
        />

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(newName.trim())}
            disabled={!isValid}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteModalProps {
  file: StorageFile;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteModal({ file, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
        {/* Icon + title */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Delete File
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              This action is permanent and cannot be undone.
            </p>
          </div>
        </div>

        {/* File name */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-3 mb-5 text-sm text-gray-700 dark:text-gray-300 break-all">
          <span className="font-medium">{file.name}</span>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Toast Component ───────────────────────────────────────────────────────────

function ToastItem({ toast }: { toast: Toast }) {
  const isSuccess = toast.type === "success";
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
        isSuccess
          ? "bg-green-50 dark:bg-green-950/70 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300"
          : "bg-red-50 dark:bg-red-950/70 border-red-200 dark:border-red-700 text-red-800 dark:text-red-300"
      }`}
    >
      {isSuccess ? (
        <CheckCircle className="w-4 h-4 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
      )}
      <span>{toast.message}</span>
    </div>
  );
}

// ── FileManagerPage ────────────────────────────────────────────────────────────

export default function FileManagerPage() {
  const {
    files,
    loading,
    actionLoading,
    scanLoading,
    error,
    listFiles,
    scanFile,
    uploadFile,
    downloadFile,
    renameFile,
    deleteFile,
  } = useFileStorage();

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [renameTarget, setRenameTarget] = useState<StorageFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch file list on mount
  useEffect(() => {
    listFiles();
  }, [listFiles]);

  // ── Toast helpers ──────────────────────────────────────────────────────────
  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // ── Upload logic (with Cloudmersive virus scan gate) ─────────────────────
  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const all = Array.from(fileList);

      let blocked = 0;
      let ok = 0;
      let fail = 0;

      // Process files sequentially so scan state is clear for each
      for (const file of all) {
        // Step 1 — Virus scan via FastAPI → Cloudmersive
        const scanResult = await scanFile(file);

        if (scanResult.scanError) {
          // The scan SERVICE itself is unavailable (network error, quota, timeout).
          // Show a warning but allow the upload — don't block legitimate files.
          addToast(
            "error",
            `⚠️ Virus scan unavailable for "${file.name}" (${scanResult.scanError}) — uploading without scan.`
          );
        } else if (!scanResult.clean) {
          // Cloudmersive confirmed a real threat — block the upload.
          blocked++;
          const threatList = scanResult.threats.join(", ") || "Unknown threat";
          addToast("error", `🚫 "${file.name}" blocked — threat detected: ${threatList}`);
          continue; // skip upload
        } else {
          // Clean scan — confirm before uploading
          addToast("success", `✅ "${file.name}" passed virus scan — uploading…`);
        }

        // Step 2 — Upload to Supabase (reached for clean OR scan-unavailable files)
        const uploaded = await uploadFile(file);
        if (uploaded) {
          ok++;
        } else {
          fail++;
        }
      }

      if (ok > 0) {
        addToast("success", `${ok} file${ok > 1 ? "s" : ""} uploaded successfully.`);
        await listFiles();
      }
      if (fail > 0) {
        addToast("error", `${fail} file${fail > 1 ? "s" : ""} failed to upload.`);
      }
      if (blocked > 0 && ok === 0 && fail === 0) {
        // All files were blocked – no need for additional toast
      }
    },
    [scanFile, uploadFile, listFiles, addToast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  // ── Rename ────────────────────────────────────────────────────────────────
  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      if (!renameTarget) return;
      const ok = await renameFile(renameTarget.name, newName);
      setRenameTarget(null);
      if (ok) {
        addToast("success", `File renamed to "${newName}".`);
        await listFiles();
      } else {
        addToast("error", "Rename failed. Check your bucket policies in Supabase.");
      }
    },
    [renameTarget, renameFile, listFiles, addToast]
  );

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const name = deleteTarget.name;
    const ok = await deleteFile(name);
    setDeleteTarget(null);
    if (ok) {
      addToast("success", `"${name}" was permanently deleted.`);
      await listFiles();
    } else {
      addToast("error", "Delete failed. Check your bucket policies in Supabase.");
    }
  }, [deleteTarget, deleteFile, listFiles, addToast]);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(
    async (file: StorageFile) => {
      addToast("success", `Downloading "${file.name}"…`);
      await downloadFile(file.name);
    },
    [downloadFile, addToast]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl w-full mx-auto flex flex-col gap-6">

      {/* ── Page Heading ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          File Manager
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload, download, rename, and delete files stored in Supabase Storage.
        </p>
      </div>

      {/* ── Error Banner (hook-level errors) ─────────────────────────────── */}
      {/* Only show if files haven't loaded — prevents React 18 StrictMode race-condition ghosts */}
      {error && files.length === 0 && !loading && (
        <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-5 py-4 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Storage error</p>
            <p className="mt-0.5 text-red-600 dark:text-red-400">{error}</p>
            <p className="mt-1 text-xs text-red-500 dark:text-red-500">
              If you see a "policies" error, go to Supabase → Storage → Policies and add
              an INSERT / SELECT / UPDATE / DELETE policy for your bucket.
            </p>
          </div>
        </div>
      )}

      {/* ── Upload Zone ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Section header */}
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Upload className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Upload Files
          </span>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4">
          <div
            className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer select-none ${
              isDragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {scanLoading ? (
              /* Virus scanning in progress */
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <ShieldCheck className="w-8 h-8 text-blue-500" />
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin absolute -bottom-1 -right-1" />
                </div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Scanning for viruses…
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Powered by Cloudmersive — checking file safety before upload
                </p>
              </div>
            ) : actionLoading ? (
              /* Upload in progress (scan passed) */
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <ShieldCheck className="w-8 h-8 text-green-500" />
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin absolute -bottom-1 -right-1" />
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Scan passed — uploading to Supabase…
                </p>
              </div>
            ) : (
              /* Idle state */
              <>
                <Upload className="w-8 h-8 mx-auto mb-3 text-gray-400" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Drag & drop files here, or{" "}
                  <span className="text-blue-600 dark:text-blue-400">
                    click to browse
                  </span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Any file type accepted · Max 50 MB per file · Multiple files supported
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-950/30 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-3 h-3" />
                  Virus scanned by Cloudmersive before upload
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  handleFiles(e.target.files);
                  // Reset so the same file can be re-uploaded if needed
                  e.target.value = "";
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* ── File List ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Section header */}
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Files in Bucket
            </span>
            {!loading && (
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                — {files.length} file{files.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={listFiles}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:no-underline transition-opacity"
          >
            <RefreshCw
              className={`w-3 h-3 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {/* Table / empty / loading */}
        <div className="bg-white dark:bg-gray-900">
          {loading && files.length === 0 ? (
            /* Initial load skeleton */
            <div className="flex items-center justify-center py-14 gap-3 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading files…</span>
            </div>
          ) : files.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileIcon className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                No files yet
              </p>
              <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">
                Upload a file above to get started.
              </p>
            </div>
          ) : (
            /* File table */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-28">
                      Size
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-52">
                      Last Modified
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-36">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {files.map((file) => (
                    <tr
                      key={file.id ?? file.name}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span
                            className="text-gray-900 dark:text-gray-100 font-medium truncate max-w-xs"
                            title={file.name}
                          >
                            {file.name}
                          </span>
                        </div>
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {formatBytes(file.metadata?.size)}
                      </td>

                      {/* Last modified */}
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {formatDate(file.updated_at)}
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Download */}
                          <button
                            onClick={() => handleDownload(file)}
                            title="Download"
                            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>

                          {/* Rename */}
                          <button
                            onClick={() => setRenameTarget(file)}
                            title="Rename"
                            className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setDeleteTarget(file)}
                            title="Delete"
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {renameTarget && (
        <RenameModal
          file={renameTarget}
          onConfirm={handleRenameConfirm}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          file={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Toast Stack (bottom-right) ────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </div>
  );
}
