import { useState, useEffect } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Factory, Plus, Package, Truck, Wrench } from "lucide-react";
import { toast } from "sonner";

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
  }, [companyId, currentProject]);

  const fetchContexts = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("ind_operation_contexts")
        .select("*")
        .order("created_at", { ascending: false });

      if (currentProject?.id) {
        query = query.or(`obramap_project_id.eq.${currentProject.id},context_type.eq.standalone`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setContexts((data || []) as OperationContext[]);
      if (data && data.length > 0 && !activeContext) {
        setActiveContext(data[0] as OperationContext);
      }
    } catch (err: any) {
      console.error("[Industrialization] Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const createIntegratedContext = async () => {
    if (!selectedProject?.id || !companyId) {
      toast.error("Selecione uma obra primeiro.");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("ind_operation_contexts")
        .insert({
          company_id: companyId,
          context_type: "integrated",
          obramap_project_id: selectedProject.id,
          name: `Industrial - ${selectedProject.name}`,
          total_units: selectedProject.total_houses || 0,
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
          <div className="flex gap-3 justify-center pt-4">
            <Button onClick={createIntegratedContext} disabled={!selectedProject}>
              <Plus className="h-4 w-4 mr-2" />
              Vincular à Obra Atual
            </Button>
          </div>
          {!selectedProject && (
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Fábricas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">0</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Lotes Ativos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">0</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Viagens Pendentes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">0</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Kits Completos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">0 / {activeContext?.total_units || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Pipeline Industrial</p>
              <p className="text-sm">Configure fábricas e crie lotes de produção para visualizar o pipeline completo.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="factories" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Factory className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Cadastro de Fábricas</p>
              <p className="text-sm">Cadastre fábricas, capacidades e modelos de produção.</p>
              <Button className="mt-4" variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Fábrica
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batches" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Lotes de Produção</p>
              <p className="text-sm">Gerencie lotes, vincule unidades e acompanhe o progresso de fabricação.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logistics" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Truck className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Logística & Transporte</p>
              <p className="text-sm">Controle caminhões, viagens e rastreamento de entregas.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lifting" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Içamento</p>
              <p className="text-sm">Agenda de equipamentos, custos e vínculo com viagens.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="installation" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Montagem</p>
              <p className="text-sm">Agenda de equipes, acompanhamento de instalação por unidade.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
