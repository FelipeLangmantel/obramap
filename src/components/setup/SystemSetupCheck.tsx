import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SystemSetupWizard, OrphanDataCounts } from './SystemSetupWizard';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SystemSetupCheckProps {
  children: React.ReactNode;
}

const RPC_TIMEOUT_MS = 12000;
const SETUP_CHECK_CACHE_KEY = "obramap_system_setup_checked";

type RpcResult<T> = { data: T; error: any };

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number): Promise<T> {
  const promise = Promise.resolve(promiseLike as any) as Promise<T>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), ms)),
  ]);
}

export const SystemSetupCheck: React.FC<SystemSetupCheckProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [needsAdmin, setNeedsAdmin] = useState(false);
  const [hasOrphanData, setHasOrphanData] = useState(false);
  const [orphanCounts, setOrphanCounts] = useState<OrphanDataCounts | null>(null);
  const { user, isSystemAdmin, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const inFlightRef = useRef(false);
  const lastCheckKeyRef = useRef<string | null>(null);

  const checkSystemStatus = useCallback(async (userId: string | undefined, sysAdmin: boolean) => {
    if (inFlightRef.current) return;

    // Run at most once per auth identity (anonymous vs user id + sysadmin flag)
    const key = `${userId ?? 'anon'}|${sysAdmin ? 'sys' : 'nosys'}`;

    // Persisted cache (survives remounts) to avoid "loop" sensação na navegação
    if (sessionStorage.getItem(SETUP_CHECK_CACHE_KEY) === key) {
      lastCheckKeyRef.current = key;
      setIsLoading(false);
      return;
    }

    if (lastCheckKeyRef.current === key) return;

    inFlightRef.current = true;
    lastCheckKeyRef.current = key;
    setIsLoading(true);

    try {
      // Check if admin exists using RPC
      const { data: adminExists, error: adminError } = (await withTimeout(
        supabase.rpc('admin_exists') as any,
        RPC_TIMEOUT_MS
      )) as RpcResult<boolean | null>;

      if (adminError) {
        console.error('Error checking admin:', adminError);
        setNeedsAdmin(true);
      } else {
        setNeedsAdmin(!adminExists);
      }

      // If admin exists and current user is system admin
      if (adminExists && userId && sysAdmin) {
        const { data: status, error: statusError } = (await withTimeout(
          supabase.rpc('check_legacy_data_status') as any,
          RPC_TIMEOUT_MS
        )) as RpcResult<unknown>;

        if (!statusError && status) {
          const typedStatus = status as unknown as { needs_migration: boolean; has_orphan_data: boolean };

          if (typedStatus.needs_migration) {
            if (!location.pathname.startsWith('/admin/migration')) {
              navigate('/admin/migration', { replace: true });
              sessionStorage.setItem(SETUP_CHECK_CACHE_KEY, key);
              setIsLoading(false);
              inFlightRef.current = false;
              return;
            }
          } else if (!location.pathname.startsWith('/admin')) {
            navigate('/admin/dashboard', { replace: true });
            sessionStorage.setItem(SETUP_CHECK_CACHE_KEY, key);
            setIsLoading(false);
            inFlightRef.current = false;
            return;
          }
        }

        setNeedsSetup(false);
        sessionStorage.setItem(SETUP_CHECK_CACHE_KEY, key);
        setIsLoading(false);
        inFlightRef.current = false;
        return;
      }

      // If admin exists but user is not system admin, no setup needed
      if (adminExists) {
        setNeedsSetup(false);
        sessionStorage.setItem(SETUP_CHECK_CACHE_KEY, key);
        setIsLoading(false);
        inFlightRef.current = false;
        return;
      }

      // Check for orphan data only if admin doesn't exist (initial setup)
      const { data: orphanData, error: orphanError } = (await withTimeout(
        supabase.rpc('get_orphan_data_counts') as any,
        RPC_TIMEOUT_MS
      )) as RpcResult<unknown>;

      if (orphanError) {
        console.error('Error checking orphan data:', orphanError);
      } else if (orphanData) {
        const counts = orphanData as unknown as OrphanDataCounts;
        setOrphanCounts(counts);
        setHasOrphanData(counts.has_orphan_data);
      }

      // Setup is needed only if no admin exists
      setNeedsSetup(true);
    } catch (error) {
      console.error('Error checking system status:', error);
      // Fail-open to allow app if backend calls hang
      setNeedsSetup(false);
      setNeedsAdmin(false);
    } finally {
      sessionStorage.setItem(SETUP_CHECK_CACHE_KEY, `${userId ?? 'anon'}|${sysAdmin ? 'sys' : 'nosys'}`);
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (authLoading) return;
    checkSystemStatus(user?.id, isSystemAdmin);
  }, [authLoading, user?.id, isSystemAdmin, checkSystemStatus]);

  const handleSetupComplete = () => {
    setNeedsSetup(false);
    window.location.href = '/auth';
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando configuração do sistema...</p>
        </div>
      </div>
    );
  }

  // Only show wizard if NO admin exists (first time setup)
  if (needsSetup && needsAdmin) {
    return (
      <SystemSetupWizard
        onComplete={handleSetupComplete}
        needsAdmin={needsAdmin}
        hasOrphanData={hasOrphanData}
        orphanCounts={orphanCounts}
      />
    );
  }

  return <>{children}</>;
};

