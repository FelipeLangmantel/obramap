import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SystemSetupWizard, OrphanDataCounts } from './SystemSetupWizard';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SystemSetupCheckProps {
  children: React.ReactNode;
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

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;
    
    checkSystemStatus();
  }, [authLoading, user, isSystemAdmin]);

  const checkSystemStatus = async () => {
    try {
      // Check if admin exists
      const { data: adminExists, error: adminError } = await supabase.rpc('admin_exists');
      if (adminError) {
        console.error('Error checking admin:', adminError);
        // If the function doesn't exist, assume setup is needed
        setNeedsAdmin(true);
      } else {
        setNeedsAdmin(!adminExists);
      }

      // If admin exists and current user is system admin, redirect to dashboard
      if (adminExists && user && isSystemAdmin) {
        // Only redirect if not already on admin routes
        if (!location.pathname.startsWith('/admin')) {
          navigate('/admin/dashboard', { replace: true });
          return;
        }
        // Admin exists and user is system admin - no setup needed
        setNeedsSetup(false);
        setIsLoading(false);
        return;
      }

      // If admin exists but user is not system admin, no setup needed
      if (adminExists) {
        setNeedsSetup(false);
        setIsLoading(false);
        return;
      }

      // Check for orphan data only if admin doesn't exist
      const { data: orphanData, error: orphanError } = await supabase.rpc('get_orphan_data_counts');
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
      // On error, show the setup wizard
      setNeedsSetup(true);
      setNeedsAdmin(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupComplete = () => {
    setNeedsSetup(false);
    // Reload the page to ensure fresh state
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
