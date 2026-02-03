import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Loader2, 
  Building2, 
  ChevronRight, 
  ChevronDown,
  Package,
  Check,
  Construction,
  X
} from "lucide-react";

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface SystemModule {
  id: string;
  key: string;
  name: string;
  description: string | null;
  display_order: number;
}

interface CompanyModuleStatus {
  id?: string;
  company_id: string;
  module_key: string;
  status: "active" | "development" | "disabled";
}

export default function CompanyModulesManagement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [systemModules, setSystemModules] = useState<SystemModule[]>([]);
  const [companyModuleStatuses, setCompanyModuleStatuses] = useState<Map<string, CompanyModuleStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [updatingModule, setUpdatingModule] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [companiesResult, systemModulesResult, companyModulesResult] = await Promise.all([
        supabase.from("companies").select("id, name, slug").order("name"),
        supabase.from("system_modules").select("id, key, name, description, display_order").order("display_order"),
        supabase.from("company_modules").select("id, company_id, module_key, status"),
      ]);

      if (companiesResult.error) throw companiesResult.error;
      if (systemModulesResult.error) throw systemModulesResult.error;
      if (companyModulesResult.error) throw companyModulesResult.error;

      setCompanies(companiesResult.data || []);
      setSystemModules(systemModulesResult.data || []);

      // Create a map for quick lookup
      const statusMap = new Map<string, CompanyModuleStatus>();
      (companyModulesResult.data || []).forEach((cm: any) => {
        const key = `${cm.company_id}-${cm.module_key}`;
        statusMap.set(key, cm);
      });
      setCompanyModuleStatuses(statusMap);

      // Expand all companies by default
      setExpandedCompanies(new Set(companiesResult.data?.map(c => c.id) || []));
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleCompany = (companyId: string) => {
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const getModuleStatus = (companyId: string, moduleKey: string): "active" | "development" | "disabled" => {
    const key = `${companyId}-${moduleKey}`;
    const status = companyModuleStatuses.get(key);
    return status?.status || "active"; // Default to active
  };

  const getActiveModulesCount = (companyId: string): number => {
    return systemModules.filter(sm => {
      const status = getModuleStatus(companyId, sm.key);
      return status === "active" || status === "development";
    }).length;
  };

  const handleStatusChange = async (
    companyId: string, 
    moduleKey: string, 
    moduleName: string,
    newStatus: "active" | "development" | "disabled"
  ) => {
    const updateKey = `${companyId}-${moduleKey}`;
    setUpdatingModule(updateKey);

    try {
      const existingStatus = companyModuleStatuses.get(updateKey);

      if (existingStatus?.id) {
        // Update existing record
        const { error } = await supabase
          .from("company_modules")
          .update({ 
            status: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingStatus.id);

        if (error) throw error;

        // Update local state
        setCompanyModuleStatuses(prev => {
          const next = new Map(prev);
          next.set(updateKey, { ...existingStatus, status: newStatus });
          return next;
        });
      } else {
        // Insert new record
        const sysModule = systemModules.find(m => m.key === moduleKey);
        const { data, error } = await supabase
          .from("company_modules")
          .insert({
            company_id: companyId,
            module_key: moduleKey,
            module_name: sysModule?.name || moduleName,
            description: sysModule?.description || null,
            status: newStatus,
          })
          .select()
          .single();

        if (error) throw error;

        // Update local state
        setCompanyModuleStatuses(prev => {
          const next = new Map(prev);
          next.set(updateKey, {
            id: data.id,
            company_id: companyId,
            module_key: moduleKey,
            status: newStatus,
          });
          return next;
        });
      }

      toast.success("Status do módulo atualizado!");
    } catch (error: any) {
      console.error("Error updating module status:", error);
      toast.error("Erro ao atualizar status: " + (error.message || "Erro desconhecido"));
    } finally {
      setUpdatingModule(null);
    }
  };

  const getStatusBadge = (status: "active" | "development" | "disabled") => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-200 gap-1">
            <Check className="h-3 w-3" />
            Ativo
          </Badge>
        );
      case "development":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-200 gap-1">
            <Construction className="h-3 w-3" />
            Em Desenvolvimento
          </Badge>
        );
      case "disabled":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-200 gap-1">
            <X className="h-3 w-3" />
            Desativado
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          <div>
            <CardTitle>Status de Módulos por Empresa</CardTitle>
            <CardDescription>
              Gerencie quais módulos estão ativos, em desenvolvimento ou desativados para cada empresa
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-3">
            {companies.map((company) => (
              <Collapsible
                key={company.id}
                open={expandedCompanies.has(company.id)}
                onOpenChange={() => toggleCompany(company.id)}
              >
                <div className="rounded-lg border">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        {expandedCompanies.has(company.id) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-semibold">{company.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {getActiveModulesCount(company.id)} módulos ativos
                          </p>
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t divide-y">
                      {systemModules.length === 0 ? (
                        <div className="py-6 text-center text-muted-foreground text-sm">
                          Nenhum módulo configurado no sistema
                        </div>
                      ) : (
                        systemModules.map((sysModule) => {
                          const currentStatus = getModuleStatus(company.id, sysModule.key);
                          const updateKey = `${company.id}-${sysModule.key}`;
                          const isUpdating = updatingModule === updateKey;

                          return (
                            <div key={sysModule.id} className="flex items-center justify-between py-3 px-4 hover:bg-muted/30">
                              <div className="flex-1">
                                <p className="font-medium">{sysModule.name}</p>
                                {sysModule.description && (
                                  <p className="text-sm text-muted-foreground">{sysModule.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {getStatusBadge(currentStatus)}
                                <Select
                                  value={currentStatus}
                                  onValueChange={(value: "active" | "development" | "disabled") => 
                                    handleStatusChange(company.id, sysModule.key, sysModule.name, value)
                                  }
                                  disabled={isUpdating}
                                >
                                  <SelectTrigger className="w-[180px]">
                                    {isUpdating ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <SelectValue />
                                    )}
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="active">
                                      <div className="flex items-center gap-2">
                                        <Check className="h-3 w-3 text-green-600" />
                                        Ativo
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="development">
                                      <div className="flex items-center gap-2">
                                        <Construction className="h-3 w-3 text-yellow-600" />
                                        Em Desenvolvimento
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="disabled">
                                      <div className="flex items-center gap-2">
                                        <X className="h-3 w-3 text-red-600" />
                                        Desativado
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
