import { useState, useEffect } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Factory, Plus } from "lucide-react";
import { toast } from "sonner";
import { FactoriesTabContent } from "./FactoriesTabContent";
import { LiftingTabContent } from "./LiftingTabContent";
import { OverviewTabContent } from "./OverviewTabContent";
import { InstallationTabContent } from "./InstallationTabContent";
import { BatchesTabContent } from "./BatchesTabContent";
import { LogisticsTabContent } from "./LogisticsTabContent";

interface OperationContext {
  id: string;
  company_id: string;
  context_type: "integrated" | "standalone";
  obramap_project_id: string | null;
  name: string;
  description: string | null;
  location: string | null;
  client_name: string | null;
  total_units: number;
  status: string;
  created_at: string;
}

export default function IndustrializationModuleView() {
  const { currentProject } = useConstruction();
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const [contexts, setContexts] = useState<OperationContext[]>([]);
  const [activeContext, setActiveContext] = useState<OperationContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    fetchContexts();
  }, [companyId]);

  const fetchContexts = async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("ind_operation_contexts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const all = (data || []) as OperationContext[];
      setContexts(all);
      if (all.length > 0 && !activeContext) {
        setActiveContext(all[0]);
      }
    } catch (err: any) {
      console.error("[Industrialization] Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const createIntegratedContext = async () => {
    if (!currentProject?.id || !companyId) {
      toast.error("Selecione uma obra primeiro.");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("ind_operation_contexts")
        .insert({
          company_id: companyId,
          context_type: "integrated",
          obramap_project_id: currentProject.id,
          name: `Industrial - ${currentProject.name}`,
          total_units: currentProject.totalHouses || 0,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("Contexto industrial criado!");
      const ctx = data as OperationContext;
      setContexts(prev => [ctx, ...prev]);
      setActiveContext(ctx);
    } catch (err: any) {
      toast.error("Erro ao criar contexto: " + err.message);
    }
  };

  const createStandaloneContext = async () => {
    if (!companyId) return;
    const name = prompt("Nome do contexto (ex: El Dorado):");
    if (!name?.trim()) return;
    const totalStr = prompt("Total de unidades:");
    const total = parseInt(totalStr || "0") || 0;
    try {
      const { data, error } = await supabase
        .from("ind_operation_contexts")
        .insert({
          company_id: companyId,
          context_type: "standalone",
          obramap_project_id: null,
          name: name.trim(),
          total_units: total,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success("Contexto criado!");
      const ctx = data as OperationContext;
      setContexts(prev => [ctx, ...prev]);
      setActiveContext(ctx);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
      paused: "bg-amber-500/10 text-amber-600 border-amber-200",
      completed: "bg-blue-500/10 text-blue-600 border-blue-200",
      cancelled: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return map[status] || "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (contexts.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="text-center py-16 space-y-4">
          <Factory className="h-16 w-16 mx-auto text-muted-foreground/50" />
          <h2 className="text-2xl font-bold text-foreground">Industrialização & Logística</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Gerencie o fluxo completo de componentes industrializados: fábrica → lote → transporte → içamento → montagem.
          </p>
          <div className="flex gap-3 justify-center pt-4 flex-wrap">
            <Button variant="outline" onClick={createStandaloneContext}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Contexto Standalone
            </Button>
            <Button onClick={createIntegratedContext} disabled={!currentProject}>
              <Plus className="h-4 w-4 mr-2" />
              Vincular à Obra Atual
            </Button>
          </div>
          {!currentProject && (
            <p className="text-xs text-muted-foreground">Selecione uma obra para criar um contexto integrado.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Factory className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-foreground">{activeContext?.name}</h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={statusColor(activeContext?.status || "active")}>
                {activeContext?.context_type === "integrated" ? "Integrado" : "Standalone"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {activeContext?.total_units} unidades
              </span>
            </div>
          </div>
        </div>

        {contexts.length > 1 && (
          <Select
            value={activeContext?.id || ""}
            onValueChange={id => setActiveContext(contexts.find(c => c.id === id) || null)}
          >
            <SelectTrigger className="h-8 text-xs w-52">
              <SelectValue placeholder="Selecionar contexto" />
            </SelectTrigger>
            <SelectContent>
              {contexts.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} — {c.context_type === "integrated" ? "Integrado" : "Standalone"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="factories">Fábricas</TabsTrigger>
          <TabsTrigger value="batches">Lotes</TabsTrigger>
          <TabsTrigger value="logistics">Logística</TabsTrigger>
          <TabsTrigger value="lifting">Içamento</TabsTrigger>
          <TabsTrigger value="installation">Montagem</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {activeContext && companyId && (
            <OverviewTabContent
              companyId={companyId}
              contextId={activeContext.id}
              contextName={activeContext.name}
              contextType={activeContext.context_type}
              totalUnits={activeContext.total_units}
            />
          )}
        </TabsContent>

        <TabsContent value="factories" className="mt-4">
          {activeContext && companyId && (
            <FactoriesTabContent
              companyId={companyId}
              contextId={activeContext.id}
              contextType={activeContext.context_type}
            />
          )}
        </TabsContent>

        <TabsContent value="batches" className="mt-4">
          {activeContext && companyId && (
            <BatchesTabContent
              companyId={companyId}
              contextId={activeContext.id}
            />
          )}
        </TabsContent>

        <TabsContent value="logistics" className="mt-4">
          {activeContext && companyId && (
            <LogisticsTabContent
              companyId={companyId}
              contextId={activeContext.id}
            />
          )}
        </TabsContent>

        <TabsContent value="lifting" className="mt-4">
          {activeContext && companyId && (
            <LiftingTabContent
              companyId={companyId}
              contextId={activeContext.id}
            />
          )}
        </TabsContent>

        <TabsContent value="installation" className="mt-4">
          {activeContext && companyId && (
            <InstallationTabContent
              companyId={companyId}
              contextId={activeContext.id}
              contextType={activeContext.context_type}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
