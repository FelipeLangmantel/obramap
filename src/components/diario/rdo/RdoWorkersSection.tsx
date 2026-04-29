import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Clock, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RdoSectionShell } from "./RdoSectionShell";
import { AddDiaryWorkerDialog } from "./AddDiaryWorkerDialog";
import type { DiaryWorker } from "@/hooks/useDiaryWorkers";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ContractorContract {
  id: string;
  contractor_name: string;
  status: string;
  is_internal?: boolean;
}

interface Props {
  workers: DiaryWorker[];
  contractors: ContractorContract[];
  entryId: string;
  companyId: string;
  projectId: string;
  disabled?: boolean;
  onChanged: () => void;
}

export function RdoWorkersSection({
  workers, contractors, entryId, companyId, projectId, disabled, onChanged,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DiaryWorker | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const totalHH = workers.reduce((acc, w) => acc + (Number(w.hours_worked) || 0), 0);
  const totalCost = workers.reduce(
    (acc, w) => acc + (Number(w.hours_worked) || 0) * (Number(w.cost_per_hour) || 0),
    0
  );

  const contractorMap = new Map(contractors.map((c) => [c.id, c.contractor_name]));

  const confirmRemove = async () => {
    if (!removingId) return;
    try {
      const { error } = await (supabase as any).from("diary_workers").delete().eq("id", removingId);
      if (error) throw error;
      toast.success("Trabalhador removido.");
      onChanged();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <>
      <RdoSectionShell
        id="trabalhadores"
        title="Equipe do dia (horas individuais)"
        count={workers.length}
        onAdd={disabled ? undefined : () => { setEditing(null); setAddOpen(true); }}
        disabled={disabled}
        emptyText="Nenhum trabalhador apontado. Clique em Adicionar para registrar nomes e horas individuais."
      >
        {workers.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" /> {totalHH.toFixed(1)} HH totais
              </Badge>
              {totalCost > 0 && (
                <Badge variant="secondary">
                  Custo MO: R$ {totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Badge>
              )}
            </div>
            <div className="divide-y border rounded-md">
              {workers.map((w) => {
                const contractorName = w.contractor_contract_id ? contractorMap.get(w.contractor_contract_id) : null;
                return (
                  <div key={w.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{w.worker_name}</span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          {w.profession}
                        </Badge>
                        {contractorName && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 gap-0.5 border-blue-300 text-blue-700 dark:text-blue-300">
                            <Building2 className="h-2.5 w-2.5" />
                            {contractorName}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {Number(w.hours_worked).toFixed(1)}h
                        {w.cost_per_hour ? ` · R$ ${Number(w.cost_per_hour).toFixed(2)}/h` : ""}
                      </div>
                    </div>
                    {!disabled && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditing(w); setAddOpen(true); }}
                          title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => setRemovingId(w.id)}
                          title="Remover">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </RdoSectionShell>

      {addOpen && (
        <AddDiaryWorkerDialog
          open={addOpen}
          onOpenChange={(o) => { setAddOpen(o); if (!o) setEditing(null); }}
          entryId={entryId}
          companyId={companyId}
          projectId={projectId}
          contractors={contractors}
          worker={editing}
          onSaved={onChanged}
        />
      )}

      <AlertDialog open={!!removingId} onOpenChange={(o) => !o && setRemovingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover trabalhador?</AlertDialogTitle>
            <AlertDialogDescription>
              O trabalhador será removido do diário. Os vínculos com serviços executados também serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
