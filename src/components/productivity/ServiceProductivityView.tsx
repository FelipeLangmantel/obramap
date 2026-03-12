import { useState, useMemo } from 'react';
import { useConstruction } from '@/contexts/ConstructionContext';
import { useServiceProductivity } from '@/hooks/useServiceProductivity';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Settings, Users, TrendingUp, AlertCircle, ClipboardList } from 'lucide-react';
import { ServiceProductivityDialog } from './ServiceProductivityDialog';

interface ServiceInfo {
  macroId: string;
  scopeId: string;
  macroName: string;
  scopeName: string;
  macroColor: string;
}

export function ServiceProductivityView() {
  const { currentProject } = useConstruction();
  const { productivities, isLoading, saveProductivity } = useServiceProductivity(currentProject?.id);
  const [selectedService, setSelectedService] = useState<ServiceInfo | null>(null);

  const allServices = useMemo(() => {
    if (!currentProject?.macrosTemplate) return [];

    const services: ServiceInfo[] = [];
    currentProject.macrosTemplate.forEach((macro: any) => {
      macro.scopes?.forEach((scope: any) => {
        services.push({
          macroId: macro.id,
          scopeId: scope.id,
          macroName: macro.name,
          scopeName: scope.name,
          macroColor: macro.color || '#6b7280',
        });
      });
    });
    return services;
  }, [currentProject]);

  const stats = useMemo(() => {
    const total = allServices.length;
    const configured = allServices.filter(s =>
      productivities.some(p => p.scope_id === s.scopeId)
    ).length;
    const missing = total - configured;
    const totalProfessionals = productivities.reduce(
      (sum, p) => sum + p.default_team_count * p.professionals_per_team, 0
    );
    const totalHelpers = productivities.reduce(
      (sum, p) => sum + p.default_team_count * p.helpers_per_team, 0
    );
    return { total, configured, missing, totalProfessionals, totalHelpers };
  }, [allServices, productivities]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione um projeto para gerenciar produtividade
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Produtividade e Equipes
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Defina produtividade e dimensionamento de equipes por serviço
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total Serviços</p>
                <p className="text-xl font-bold text-foreground">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-xs text-muted-foreground">Configurados</p>
                <p className="text-xl font-bold text-foreground">{stats.configured}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-xl font-bold text-foreground">{stats.missing}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Profissionais</p>
                <p className="text-xl font-bold text-foreground">{stats.totalProfessionals}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-violet-500" />
              <div>
                <p className="text-xs text-muted-foreground">Auxiliares</p>
                <p className="text-xl font-bold text-foreground">{stats.totalHelpers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Services List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Serviços da Obra</CardTitle>
          <CardDescription>Configure produtividade e equipes para cada serviço</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-420px)]">
            <div className="space-y-2">
              {allServices.map((service) => {
                const productivity = productivities.find(p => p.scope_id === service.scopeId);
                const isConfigured = !!productivity;

                return (
                  <div
                    key={service.scopeId}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: service.macroColor }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {service.scopeName}
                        </p>
                        <p className="text-xs text-muted-foreground">{service.macroName}</p>

                        {productivity && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>
                              {productivity.productivity_value} {productivity.productivity_unit}
                            </span>
                            <span>•</span>
                            <span>
                              {productivity.professionals_per_team} prof. + {productivity.helpers_per_team} aux.
                            </span>
                            <span>•</span>
                            <span>{productivity.default_team_count} equipe(s)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {isConfigured ? (
                        <Badge variant="default" className="text-xs">Configurado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                          Pendente
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={isConfigured ? 'outline' : 'default'}
                        onClick={() => setSelectedService(service)}
                      >
                        {isConfigured ? 'Editar' : 'Configurar'}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {allServices.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum serviço cadastrado. Configure as etapas e serviços primeiro.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Dialog */}
      {selectedService && (
        <ServiceProductivityDialog
          service={selectedService}
          existingProductivity={productivities.find(p => p.scope_id === selectedService.scopeId)}
          onClose={() => setSelectedService(null)}
        />
      )}
    </div>
  );
}
