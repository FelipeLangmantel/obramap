import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Building2, Home, TrendingUp, AlertCircle, Plus, ArrowLeft, ArrowRight, FileText,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PleProject } from "@/hooks/usePleData";

interface Props {
  projects: PleProject[];
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
}

export function PleDashboard({ projects, onSelectProject, onCreateProject }: Props) {
  const navigate = useNavigate();

  const summary = useMemo(() => {
    const totalHouses = projects.reduce((s, p) => s + (p.total_houses || 0), 0);
    const totalContract = projects.reduce((s, p) => s + (p.contract_value || 0), 0);
    return { totalHouses, totalContract, count: projects.length };
  }, [projects]);

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="h-full flex flex-col gap-6 p-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/80 to-primary/40 p-6 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-primary/10" />
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Módulo PLE</p>
          <h1 className="text-2xl font-bold mt-1">Medições do Contrato</h1>
          <p className="text-sm opacity-80 mt-1">
            Gerencie suas obras e medições contratuais de forma integrada.
          </p>
        </div>
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-20">
          <FileText className="h-24 w-24" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Obras</p>
              <p className="text-xl font-bold text-foreground">{summary.count}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Home className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unidades</p>
              <p className="text-xl font-bold text-foreground">{summary.totalHouses}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contratos</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(summary.totalContract)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <AlertCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Alertas</p>
              <p className="text-xl font-bold text-foreground">0</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Suas Obras
          </h2>
          <Button size="sm" onClick={onCreateProject} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova Obra
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card className="flex-1 flex items-center justify-center">
            <CardContent className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Nenhuma obra cadastrada ainda.</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={onCreateProject}>
                <Plus className="h-4 w-4" /> Cadastrar primeira obra
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto">
            {projects.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer hover:border-primary/50 transition-colors group"
                onClick={() => onSelectProject(p.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-sm truncate">{p.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{p.location || "Sem localização"}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-2" />
                  </div>

                  <div className="space-y-2 mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Contrato</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {formatCurrency(p.contract_value || 0)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Home className="h-3 w-3" /> {p.total_houses} unidades
                      </span>
                      {p.contractor && (
                        <span className="truncate">{p.contractor}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Back button */}
      <div className="pt-2 border-t border-border">
        <Button variant="outline" size="sm" onClick={() => navigate("/")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Menu Inicial
        </Button>
      </div>
    </div>
  );
}
