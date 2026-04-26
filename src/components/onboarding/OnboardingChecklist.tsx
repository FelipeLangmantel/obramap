import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Building2, ClipboardList, Layers, Users, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingChecklistProps {
  onAction: (target: "empresa" | "newObra" | "macros" | "users") => void;
}

const SKIP_TEAM_KEY = "obramap.onboarding.skipTeamInvite";

export function OnboardingChecklist({ onAction }: OnboardingChecklistProps) {
  const { company } = useAuth();
  const [steps, setSteps] = useState({ empresa: false, obra: false, macros: false, equipe: false });
  const [loading, setLoading] = useState(true);
  const [skipTeam, setSkipTeam] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SKIP_TEAM_KEY) === "1";
  });

  useEffect(() => {
    const load = async () => {
      if (!company?.id) return;

      // Buscar projetos da empresa
      const { data: companyProjects } = await supabase
        .from("projects")
        .select("id, macros_template")
        .eq("company_id", company.id);
      const projectIds = (companyProjects || []).map((p: any) => p.id);

      // Macros podem estar em 3 lugares (a depender de qual fluxo o usuário usou):
      //  1) projects.macros_template (jsonb) — fluxo de cadastro inicial
      //  2) project_contract_services — gerados via Etapas e Serviços / Contrato
      //  3) planning_stages — gerados via Planejamento Inteligente
      const hasMacrosInTemplate = (companyProjects || []).some(
        (p: any) => Array.isArray(p.macros_template) && p.macros_template.length > 0
      );

      const [{ count: obras }, contractRes, stagesRes, { count: users }] = await Promise.all([
        supabase
          .from("obras_portfolio")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.id),
        projectIds.length > 0
          ? supabase
              .from("project_contract_services")
              .select("id", { count: "exact", head: true })
              .in("project_id", projectIds)
          : Promise.resolve({ count: 0 } as any),
        projectIds.length > 0
          ? supabase
              .from("planning_stages")
              .select("id", { count: "exact", head: true })
              .in("project_id", projectIds)
          : Promise.resolve({ count: 0 } as any),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", company.id),
      ]);

      const { data: cmp } = await supabase
        .from("companies")
        .select("razao_social, cnpj")
        .eq("id", company.id)
        .maybeSingle();

      setSteps({
        empresa: !!(cmp && (cmp as any).razao_social && (cmp as any).cnpj),
        obra: (obras || 0) > 0,
        macros:
          hasMacrosInTemplate ||
          (contractRes?.count || 0) > 0 ||
          (stagesRes?.count || 0) > 0,
        equipe: (users || 0) > 1,
      });
      setLoading(false);
    };
    load();
  }, [company?.id]);

  const handleSkipTeam = () => {
    localStorage.setItem(SKIP_TEAM_KEY, "1");
    setSkipTeam(true);
  };

  const Item = ({
    done,
    icon: Icon,
    label,
    cta,
    onClick,
    onSkip,
    skipped,
  }: {
    done: boolean;
    icon: any;
    label: string;
    cta: string;
    onClick: () => void;
    onSkip?: () => void;
    skipped?: boolean;
  }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
      {done || skipped ? (
        <CheckCircle2 className={`h-5 w-5 shrink-0 ${done ? "text-emerald-500" : "text-muted-foreground"}`} />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span
        className={`flex-1 text-sm ${done || skipped ? "text-muted-foreground line-through" : "font-medium"}`}
      >
        {label}
      </span>
      {!done && !skipped && (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onClick}>
            {cta}
          </Button>
          {onSkip && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onSkip}
              title="Pular este passo (você pode fazer depois)"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Pular
            </Button>
          )}
        </div>
      )}
      {done && <Badge variant="secondary" className="text-[10px]">OK</Badge>}
      {!done && skipped && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Pulado
        </Badge>
      )}
    </div>
  );

  if (loading) return null;
  // Considera "equipe" satisfeita também quando o usuário pulou
  const equipeOk = steps.equipe || skipTeam;
  const allDone = steps.empresa && steps.obra && steps.macros && equipeOk;
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
          <Item
            done={steps.empresa}
            icon={Building2}
            label="1. Configure sua empresa"
            cta="Ir para Minha Empresa"
            onClick={() => onAction("empresa")}
          />
          <Item
            done={steps.obra}
            icon={ClipboardList}
            label="2. Cadastre sua primeira obra"
            cta="Nova Obra"
            onClick={() => onAction("newObra")}
          />
          <Item
            done={steps.macros}
            icon={Layers}
            label="3. Configure etapas e serviços"
            cta="Etapas e Serviços"
            onClick={() => onAction("macros")}
          />
          <Item
            done={steps.equipe}
            skipped={skipTeam}
            icon={Users}
            label="4. Convide sua equipe"
            cta="Gerenciar Usuários"
            onClick={() => onAction("users")}
            onSkip={handleSkipTeam}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default OnboardingChecklist;
