import { useEffect, useState, useCallback } from "react";
import { offlineDB, countPending, estimateStorageUsage } from "@/offline/db";
import { runSync, subscribeSync, isSyncRunning } from "@/offline/sync";
import { useLiveQuery } from "dexie-react-hooks";

// Hook centralizado para o status do offline:
// - online/offline
// - quantidade pendente (reativo via Dexie)
// - estado da sincronização
// - uso de storage
export function useOfflineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(isSyncRunning());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  // Contador reativo: re-renderiza quando entries pendentes mudam
  const pending = useLiveQuery(() => countPending(), [], 0);

  useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  useEffect(() => {
    return subscribeSync((e) => {
      if (e.type === "start") { setSyncing(true); setProgress({ done: 0, total: 0 }); }
      if (e.type === "progress") setProgress({ done: e.done, total: e.total });
      if (e.type === "done" || e.type === "error") {
        setSyncing(false);
        setProgress(null);
        void estimateStorageUsage().then(setStorage);
      }
    });
  }, []);

  useEffect(() => {
    void estimateStorageUsage().then(setStorage);
  }, [pending]);

  const triggerSync = useCallback(() => { void runSync(); }, []);

  return { online, syncing, progress, pending: pending || 0, storage, triggerSync };
}
