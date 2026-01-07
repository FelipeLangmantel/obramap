import { useState, useEffect, useCallback } from 'react';
import { Package, Settings, RefreshCw, Clock, Truck, FileText } from 'lucide-react';
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

type TabType = 'dashboard' | 'alerts' | 'leadtime' | 'contracts';

interface SuppliesJITViewProps {
  initialTab?: TabType;
}

export function SuppliesJITView({ initialTab = 'dashboard' }: SuppliesJITViewProps) {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Suprimentos JIT</h2>
          <p className="text-muted-foreground">
            Gestão de compras Just-in-Time baseada no planejamento
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" onClick={regenerateAlerts} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Recalcular Alertas
            </Button>
          )}
        </div>
      </div>

      {/* Dashboard KPIs */}
      <SupplyDashboard kpis={kpis} isLoading={isLoading} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
        <TabsList>
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Alertas
          </TabsTrigger>
          <TabsTrigger value="leadtime" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Lead Times
          </TabsTrigger>
          <TabsTrigger value="contracts" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Contratos MO
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <SupplyAlertsList 
            alerts={alerts}
            isLoading={isLoading}
            canEdit={canEdit}
            onUpdateStatus={updateAlertStatus}
          />
        </TabsContent>

        <TabsContent value="leadtime" className="mt-4">
          <LeadTimeConfig 
            families={families}
            projectLeadTimes={projectLeadTimes}
            canEdit={canEdit}
            onSave={saveProjectLeadTime}
          />
        </TabsContent>

        <TabsContent value="contracts" className="mt-4">
          <LaborContractsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
