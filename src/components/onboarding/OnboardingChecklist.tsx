import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Building2, ClipboardList, Layers, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingChecklistProps {
  onAction: (target: "empresa" | "newObra" | "macros" | "users") => void;
}

export function OnboardingChecklist({ onAction }: OnboardingChecklistProps) {
  const { company } = useAuth();
  const [steps, setSteps] = useState({ empresa: false, obra: false, macros: false, equipe: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!company?.id) return;

      // Buscar projetos da empresa para isolar a contagem de etapas
      const { data: companyProjects } = await supabase
        .from("projects")
        .select("id")
        .eq("company_id", company.id);
      const projectIds = (companyProjects || []).map((p: any) => p.id);

      const [{ data: cmp }, { count: obras }, macrosRes, { count: users }] = await Promise.all([
        supabase.from("companies").select("razao_social, cnpj").eq("id", company.id).maybeSingle(),
        supabase.from("obras_portfolio").select("id", { count: "exact", head: true }).eq("company_id", company.id),
        projectIds.length > 0
          ? supabase
              .from("planning_stages")
              .select("id", { count: "exact", head: true })
              .in("project_id", projectIds)
          : Promise.resolve({ count: 0 } as any),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", company.id),
      ]);
      setSteps({
        empresa: !!(cmp && (cmp as any).razao_social && (cmp as any).cnpj),
        obra: (obras || 0) > 0,
        macros: (macrosRes?.count || 0) > 0,
        equipe: (users || 0) > 1,
      });
      setLoading(false);
    };
    load();
  }, [company?.id]);

  const Item = ({
    done,
    icon: Icon,
    label,
    cta,
    onClick,
  }: { done: boolean; icon: any; label: string; cta: string; onClick: () => void }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
      {done ? (
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className={`flex-1 text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}>{label}</span>
      {!done && (
        <Button size="sm" variant="outline" onClick={onClick}>{cta}</Button>
      )}
      {done && <Badge variant="secondary" className="text-[10px]">OK</Badge>}
    </div>
  );

  if (loading) return null;
  const allDone = steps.empresa && steps.obra && steps.macros && steps.equipe;
  if (allDone) return null;

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            🏗️ Bem-vindo ao ObraMap
          </h2>
          <p className="text-sm text-muted-foreground">Para começar, siga os passos abaixo:</p>
        </div>
        <div className="space-y-2">
          <Item done={steps.empresa} icon={Building2} label="1. Configure sua empresa" cta="Ir para Minha Empresa" onClick={() => onAction("empresa")} />
          <Item done={steps.obra} icon={ClipboardList} label="2. Cadastre sua primeira obra" cta="Nova Obra" onClick={() => onAction("newObra")} />
          <Item done={steps.macros} icon={Layers} label="3. Configure etapas e serviços" cta="Etapas e Serviços" onClick={() => onAction("macros")} />
          <Item done={steps.equipe} icon={Users} label="4. Convide sua equipe" cta="Gerenciar Usuários" onClick={() => onAction("users")} />
        </div>
      </CardContent>
    </Card>
  );
}

export default OnboardingChecklist;
