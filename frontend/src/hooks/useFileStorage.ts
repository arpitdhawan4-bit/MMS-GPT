/**
 * src/hooks/useFileStorage.ts
 * ---------------------------
 * Custom React hook that wraps all four Supabase Storage operations:
 *   listFiles   — fetch the current file list from the bucket
 *   uploadFile  — upload a File object (upserts if same name exists)
 *   downloadFile — download a file and trigger a browser save dialog
 *   renameFile  — move/rename a file (Supabase move = copy + delete)
 *   deleteFile  — permanently remove a file from the bucket
 *
 * All operations set loading/error state so the UI can react accordingly.
 */

import { useState, useCallback } from "react";
import { supabase, BUCKET } from "../lib/supabaseClient";

// ── API base (FastAPI backend) ─────────────────────────────────────────────────
const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8001";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StorageFile {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ScanResult {
  /** true = file is safe to upload; false = threat found, block upload */
  clean: boolean;
  threats: string[];
  file_name: string | null;
  /**
   * Set when the scan SERVICE itself failed (network error, API quota exhausted, timeout).
   * When present, `clean` is `true` so the upload is NOT blocked — the UI shows
   * a warning instead of a false-positive "threat detected" block.
   */
  scanError?: string;
}

interface UseFileStorageReturn {
  files: StorageFile[];
  loading: boolean;
  actionLoading: boolean;
  scanLoading: boolean;
  error: string | null;
  listFiles: () => Promise<void>;
  scanFile: (file: File) => Promise<ScanResult>;
  uploadFile: (file: File) => Promise<boolean>;
  downloadFile: (fileName: string) => Promise<void>;
  renameFile: (oldName: string, newName: string) => Promise<boolean>;
  deleteFile: (fileName: string) => Promise<boolean>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFileStorage(): UseFileStorageReturn {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);            // list / initial load
  const [actionLoading, setActionLoading] = useState(false); // upload/rename/delete
  const [scanLoading, setScanLoading] = useState(false);     // Cloudmersive scan
  const [error, setError] = useState<string | null>(null);

  // ── List ────────────────────────────────────────────────────────────────────
  const listFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).list("", {
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error) throw error;
      setFiles((data ?? []) as StorageFile[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to list files");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File): Promise<boolean> => {
    setActionLoading(true);
    setError(null);
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(file.name, file, { upsert: true });
      if (error) throw error;
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
      return false;
    } finally {
      setActionLoading(false);
    }
  }, []);

  // ── Download ───────────────────────────────────────────────────────────────
  const downloadFile = useCallback(async (fileName: string): Promise<void> => {
    setError(null);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(fileName);
      if (error) throw error;
      if (!data) throw new Error("No data returned from Supabase");

      // Create a temporary anchor to trigger the browser's save dialog
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }, []);

  // ── Rename (Supabase Storage "move") ──────────────────────────────────────
  const renameFile = useCallback(
    async (oldName: string, newName: string): Promise<boolean> => {
      setActionLoading(true);
      setError(null);
      try {
        const { error } = await supabase.storage
          .from(BUCKET)
          .move(oldName, newName);
        if (error) throw error;
        return true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Rename failed");
        return false;
      } finally {
        setActionLoading(false);
      }
    },
    []
  );

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteFile = useCallback(async (fileName: string): Promise<boolean> => {
    setActionLoading(true);
    setError(null);
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove([fileName]);
      if (error) throw error;
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
      return false;
    } finally {
      setActionLoading(false);
    }
  }, []);

  // ── Scan (Cloudmersive Virus Scan via FastAPI) ─────────────────────────────
  // Sends the file to POST /api/scan-file (our backend) which calls Cloudmersive.
  // The file is NOT stored — this is scan-only. Returns { clean, threats }.
  const scanFile = useCallback(async (file: File): Promise<ScanResult> => {
    setScanLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/scan-file`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: "Scan request failed" }));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as ScanResult;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      // Do NOT set global error state — scan failures are surfaced as warnings,
      // not hard errors. Upload will still proceed with a warning toast.
      // Return clean: true + scanError so the UI can distinguish a real
      // threat detection from a scan-service failure.
      return { clean: true, threats: [], file_name: file.name, scanError: msg };
    } finally {
      setScanLoading(false);
    }
  }, []);

  return {
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
  };
}
