import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SystemSetupWizard, OrphanDataCounts } from './SystemSetupWizard';
import { Loader2 } from 'lucide-react';

interface SystemSetupCheckProps {
  children: React.ReactNode;
}

export const SystemSetupCheck: React.FC<SystemSetupCheckProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [needsAdmin, setNeedsAdmin] = useState(false);
  const [hasOrphanData, setHasOrphanData] = useState(false);
  const [orphanCounts, setOrphanCounts] = useState<OrphanDataCounts | null>(null);

  useEffect(() => {
    checkSystemStatus();
  }, []);

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

      // Check for orphan data
      const { data: orphanData, error: orphanError } = await supabase.rpc('get_orphan_data_counts');
      if (orphanError) {
        console.error('Error checking orphan data:', orphanError);
      } else if (orphanData) {
        const counts = orphanData as unknown as OrphanDataCounts;
        setOrphanCounts(counts);
        setHasOrphanData(counts.has_orphan_data);
      }

      // Determine if setup is needed
      const orphanCounts = orphanData as unknown as OrphanDataCounts | null;
      setNeedsSetup(!adminExists || orphanCounts?.has_orphan_data);
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando configuração do sistema...</p>
        </div>
      </div>
    );
  }

  if (needsSetup) {
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
