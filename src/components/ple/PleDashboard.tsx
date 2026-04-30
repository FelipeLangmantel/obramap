import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Home, TrendingUp, AlertCircle, Plus, ArrowLeft, ArrowRight, FileText, Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PleProject } from "@/hooks/usePleData";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  projects: PleProject[];
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject?: (id: string) => Promise<boolean>;
}

export function PleDashboard({ projects, onSelectProject, onCreateProject, onDeleteProject }: Props) {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const [toDelete, setToDelete] = useState<PleProject | null>(null);
  const [deleting, setDeleting] = useState(false);

  const summary = useMemo(() => {
    const totalHouses = projects.reduce((s, p) => s + (p.total_houses || 0), 0);
    const totalContract = projects.reduce((s, p) => s + (p.contract_value || 0), 0);
    return { totalHouses, totalContract, count: projects.length };
  }, [projects]);

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="h-full flex flex-col gap-4 sm:gap-6 p-4 sm:p-6">
      {/* Hero */}
      <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/80 to-primary/40 p-4 sm:p-6 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-primary/10" />
        <div className="relative z-10">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider opacity-80">Módulo PLE</p>
          <h1 className="text-lg sm:text-2xl font-bold mt-1">Medições do Contrato</h1>
          <p className="text-xs sm:text-sm opacity-80 mt-1">
            Gerencie suas obras e medições contratuais.
          </p>
        </div>
        <div className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 opacity-20">
          <FileText className="h-16 w-16 sm:h-24 sm:w-24" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Obras</p>
              <p className="text-lg sm:text-xl font-bold text-foreground">{summary.count}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0">
              <Home className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Unidades</p>
              <p className="text-lg sm:text-xl font-bold text-foreground">{summary.totalHouses}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Contratos</p>
              <p className="text-sm sm:text-xl font-bold text-foreground truncate">{formatCurrency(summary.totalContract)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
            <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0">
              <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground">Alertas</p>
              <p className="text-lg sm:text-xl font-bold text-foreground">0</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Suas Obras
          </h2>
          <Button size="sm" onClick={onCreateProject} className="gap-1.5 text-xs sm:text-sm">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nova Obra</span><span className="sm:hidden">Nova</span>
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card className="flex-1 flex items-center justify-center">
            <CardContent className="text-center py-8 sm:py-12">
              <Building2 className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-xs sm:text-sm">Nenhuma obra cadastrada ainda.</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={onCreateProject}>
                <Plus className="h-4 w-4" /> Cadastrar primeira obra
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 overflow-y-auto">
            {projects.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer hover:border-primary/50 transition-colors group"
                onClick={() => onSelectProject(p.id)}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-xs sm:text-sm truncate">{p.name}</h3>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{p.location || "Sem localização"}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {(p as any).obras_portfolio_id && (
                        <Badge className="text-[9px] bg-amber-500/90 hover:bg-amber-500 px-1.5 py-0">Holding</Badge>
                      )}
                      {canEdit && onDeleteProject && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setToDelete(p); }}
                          title="Excluir obra"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 mt-2 sm:mt-3">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs">
                      <span className="text-muted-foreground">Contrato</span>
                      <Badge variant="outline" className="font-mono text-[10px] sm:text-xs">
                        {formatCurrency(p.contract_value || 0)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] sm:text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Home className="h-3 w-3" /> {p.total_houses} un.
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
        <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5 text-xs sm:text-sm">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Menu
        </Button>
      </div>
    </div>
  );
}
