import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

interface CompanyModule {
  id: string;
  company_id: string;
  module_key: string;
  module_name: string;
  status: "active" | "development" | "disabled";
  description: string | null;
  expected_benefits: string | null;
}

interface CompanyWithModules extends Company {
  modules: CompanyModule[];
}

export default function CompanyModulesManagement() {
  const [companiesWithModules, setCompaniesWithModules] = useState<CompanyWithModules[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [updatingModule, setUpdatingModule] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [companiesResult, modulesResult] = await Promise.all([
        supabase.from("companies").select("id, name, slug").order("name"),
        supabase.from("company_modules").select("*").order("module_name"),
      ]);

      if (companiesResult.error) throw companiesResult.error;
      if (modulesResult.error) throw modulesResult.error;

      const companies = companiesResult.data || [];
      const modules = (modulesResult.data || []) as CompanyModule[];

      // Agrupar módulos por empresa
      const companiesMap = new Map<string, CompanyWithModules>();
      companies.forEach((company) => {
        companiesMap.set(company.id, { ...company, modules: [] });
      });

      modules.forEach((module) => {
        if (companiesMap.has(module.company_id)) {
          companiesMap.get(module.company_id)!.modules.push(module);
        }
      });

      setCompaniesWithModules(Array.from(companiesMap.values()));
      setExpandedCompanies(new Set(companies.map(c => c.id)));
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

  const handleStatusChange = async (moduleId: string, newStatus: "active" | "development" | "disabled") => {
    setUpdatingModule(moduleId);
    try {
      const { error } = await supabase
        .from("company_modules")
        .update({ status: newStatus })
        .eq("id", moduleId);

      if (error) throw error;
      
      toast.success("Status do módulo atualizado!");
      fetchData();
    } catch (error) {
      console.error("Error updating module status:", error);
      toast.error("Erro ao atualizar status");
    } finally {
      setUpdatingModule(null);
    }
  };

  const getStatusBadge = (status: string) => {
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
      default:
        return <Badge variant="outline">{status}</Badge>;
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
            {companiesWithModules.map((company) => (
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
                            {company.modules.filter(m => m.status === "active").length} módulos ativos
                          </p>
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t divide-y">
                      {company.modules.length === 0 ? (
                        <div className="py-6 text-center text-muted-foreground text-sm">
                          Nenhum módulo configurado
                        </div>
                      ) : (
                        company.modules.map((module) => (
                          <div key={module.id} className="flex items-center justify-between py-3 px-4 hover:bg-muted/30">
                            <div className="flex-1">
                              <p className="font-medium">{module.module_name}</p>
                              {module.description && (
                                <p className="text-sm text-muted-foreground">{module.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {getStatusBadge(module.status)}
                              <Select
                                value={module.status}
                                onValueChange={(value: "active" | "development" | "disabled") => 
                                  handleStatusChange(module.id, value)
                                }
                                disabled={updatingModule === module.id}
                              >
                                <SelectTrigger className="w-[180px]">
                                  {updatingModule === module.id ? (
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
                        ))
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
