import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CheckCircle2, Building2, ClipboardList, Layers, Grid3X3, Users, Target } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ManualViewProps {
  onNavigate?: (target: "empresa" | "production" | "newObra" | "macros" | "quadras" | "users") => void;
}

export function ManualView({ onNavigate }: ManualViewProps) {
  const { company } = useAuth();
  const [progress, setProgress] = useState({
    empresa: false,
    obra: false,
    macros: false,
    quadras: false,
    equipe: false,
    producao: false,
  });

  useEffect(() => {
    const check = async () => {
      if (!company?.id) return;
      const [{ data: cmp }, { count: obras }, { count: macros }, { count: quadras }, { count: users }, { count: prods }] = await Promise.all([
        supabase.from("companies").select("razao_social, cnpj").eq("id", company.id).maybeSingle(),
        supabase.from("obras_portfolio").select("id", { count: "exact", head: true }).eq("company_id", company.id),
        supabase.from("macros").select("id", { count: "exact", head: true }),
        supabase.from("quadras").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", company.id),
        supabase.from("productions").select("id", { count: "exact", head: true }).limit(1),
      ]);
      setProgress({
        empresa: !!(cmp && (cmp as any).razao_social && (cmp as any).cnpj),
        obra: (obras || 0) > 0,
        macros: (macros || 0) > 0,
        quadras: (quadras || 0) > 0,
        equipe: (users || 0) > 1,
        producao: (prods || 0) > 0,
      });
    };
    check();
  }, [company?.id]);

  const Step = ({ done, children }: { done: boolean; children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-2">
      {done && (
        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Concluído
        </Badge>
      )}
      {children}
    </span>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Manual de Configuração
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Siga os passos abaixo para configurar o ObraMap na sua empresa.
          </p>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible defaultValue="step-1" className="w-full">
            <AccordionItem value="step-1">
              <AccordionTrigger>
                <Step done={progress.empresa}>
                  <Building2 className="h-4 w-4 inline mr-2" />
                  Passo 1 — Configure sua Empresa
                </Step>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>Cadastre razão social, CNPJ e logo. Estes dados aparecerão nos relatórios e documentos.</p>
                <Button variant="outline" size="sm" onClick={() => onNavigate?.("empresa")}>Ir para Minha Empresa</Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-2">
              <AccordionTrigger>
                <Step done={progress.obra}>
                  <ClipboardList className="h-4 w-4 inline mr-2" />
                  Passo 2 — Cadastre sua Obra
                </Step>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>Informe nome, número do contrato, valor, prazo, município e responsáveis técnicos.</p>
                <Button variant="outline" size="sm" onClick={() => onNavigate?.("newObra")}>Nova Obra</Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-3">
              <AccordionTrigger>
                <Step done={progress.macros}>
                  <Layers className="h-4 w-4 inline mr-2" />
                  Passo 3 — Configure Etapas e Serviços
                </Step>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>Defina as etapas da obra (ex: Fundação, Estrutura) e os serviços dentro de cada etapa.</p>
                <Button variant="outline" size="sm" onClick={() => onNavigate?.("macros")}>Etapas e Serviços</Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-4">
              <AccordionTrigger>
                <Step done={progress.quadras}>
                  <Grid3X3 className="h-4 w-4 inline mr-2" />
                  Passo 4 — Configure as Quadras
                </Step>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>Divida a obra em quadras e cadastre as casas de cada quadra.</p>
                <Button variant="outline" size="sm" onClick={() => onNavigate?.("quadras")}>Cadastro de Quadras</Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-5">
              <AccordionTrigger>
                <Step done={progress.equipe}>
                  <Users className="h-4 w-4 inline mr-2" />
                  Passo 5 — Convide sua Equipe
                </Step>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>Cadastre engenheiros, coordenadores e demais usuários definindo o perfil de acesso.</p>
                <Button variant="outline" size="sm" onClick={() => onNavigate?.("users")}>Gerenciar Usuários</Button>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-6">
              <AccordionTrigger>
                <Step done={progress.producao}>
                  <Target className="h-4 w-4 inline mr-2" />
                  Passo 6 — Inicie os Lançamentos
                </Step>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                <p>Use o Diário de Obras para lançamentos diários ou a Produção para lançamentos semanais.</p>
                <Button variant="outline" size="sm" onClick={() => onNavigate?.("production")}>Ir para Produção</Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

export default ManualView;
