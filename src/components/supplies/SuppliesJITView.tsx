import { useState, useEffect, useCallback } from 'react';
import { Package, Settings, RefreshCw, Clock, Truck, FileText, ShoppingCart, ClipboardList, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConstruction } from '@/contexts/ConstructionContext';
import { useAuth } from '@/contexts/AuthContext';
import { SupplyDashboard } from './SupplyDashboard';
import { SupplyAlertsList } from './SupplyAlertsList';
import { LeadTimeConfig } from './LeadTimeConfig';
import { useSupplyAlerts } from './hooks/useSupplyAlerts';
import { LaborContractsView } from '@/components/LaborContractsView';
import { SuppliesView } from '@/components/SuppliesView';

type TabType = 'alerts' | 'quotations' | 'orders' | 'contracts' | 'leadtime';

interface SuppliesJITViewProps {
  initialTab?: TabType;
}

export function SuppliesJITView({ initialTab = 'alerts' }: SuppliesJITViewProps) {
  const { currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const projectId = currentProject?.id;

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const {
    alerts,
    families,
    projectLeadTimes,
    kpis,
    isLoading,
    loadData,
    regenerateAlerts,
    updateAlertStatus,
    saveProjectLeadTime
  } = useSupplyAlerts(projectId);

  if (!projectId) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Selecione uma Obra</h3>
          <p className="text-muted-foreground mt-2">
            Escolha uma obra para visualizar o painel de suprimentos.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Use the original SuppliesView which has the full workflow
  return <SuppliesView initialTab={activeTab} />;
}
