import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { groupProfessionsByCategory, findProfession } from "@/data/professionsCatalog";
import { useProfessions } from "@/hooks/useProfessions";
import { useEmployees } from "@/hooks/useEmployees";
import type { DiaryWorker } from "@/hooks/useDiaryWorkers";

interface ContractorContract {
  id: string;
  contractor_name: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entryId: string;
  companyId: string;
  projectId: string;
  contractors: ContractorContract[];
  /** Quando informado → modo edição. */
  worker?: DiaryWorker | null;
  onSaved: () => void;
}

const NONE = "none";

export function AddDiaryWorkerDialog({
  open, onOpenChange, entryId, companyId, projectId, contractors, worker, onSaved,
}: Props) {
  const isEdit = !!worker;
  const [name, setName] = useState(worker?.worker_name || "");
  const [profession, setProfession] = useState(worker?.profession || "Pedreiro");
  const [hours, setHours] = useState<number>(worker?.hours_worked ?? 8);
  const [costPerHour, setCostPerHour] = useState<string>(
    worker?.cost_per_hour != null ? String(worker.cost_per_hour) : ""
  );
  const [contractorId, setContractorId] = useState<string>(worker?.contractor_contract_id || NONE);
  const [notes, setNotes] = useState<string>(worker?.notes || "");
  const [saving, setSaving] = useState(false);

  // Reset quando reabre com worker diferente
  useState(() => {
    setName(worker?.worker_name || "");
    setProfession(worker?.profession || "Pedreiro");
    setHours(worker?.hours_worked ?? 8);
    setCostPerHour(worker?.cost_per_hour != null ? String(worker.cost_per_hour) : "");
    setContractorId(worker?.contractor_contract_id || NONE);
    setNotes(worker?.notes || "");
  });

  // Catálogos dinâmicos (com fallback para hardcoded se vazio)
  const { professions: dbProfessions, groupedByCategory } = useProfessions({ onlyActive: true });
  const { employees, internalContractId, ensureInternalContract } = useEmployees({ onlyActive: true });
  const useDynamic = dbProfessions.length > 0;
  const grouped = useDynamic
    ? groupedByCategory().map(([cat, list]) => [cat, list.map(p => ({ name: p.name, type: p.worker_type }))] as const)
    : groupProfessionsByCategory().map(([cat, list]) => [cat, list.map(p => ({ name: p.name, type: p.type }))] as const);

  const handlePickEmployee = async (empId: string) => {
    const e = employees.find(x => x.id === empId);
    if (!e) return;
    setName(e.name);
    if (e.profession) setProfession(e.profession);
    if (e.cost_per_hour != null) setCostPerHour(String(e.cost_per_hour));
    // Vincula ao contrato interno
    const cid = internalContractId || (await ensureInternalContract());
    if (cid) setContractorId(cid);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do trabalhador.");
      return;
    }
    if (hours < 0 || hours > 24) {
      toast.error("Horas devem estar entre 0 e 24.");
      return;
    }
    setSaving(true);
    try {
      // worker_type a partir do catálogo dinâmico ou fallback
      const dynProf = dbProfessions.find(p => p.name === profession);
      const fallbackProf = findProfession(profession);
      const workerType = dynProf?.worker_type || fallbackProf?.type || "professional";
      const payload: any = {
        worker_name: name.trim(),
        profession,
        worker_type: workerType,
        hours_worked: hours,
        cost_per_hour: costPerHour.trim() ? Number(costPerHour) : null,
        contractor_contract_id: contractorId === NONE ? null : contractorId,
        notes: notes.trim() || null,
      };

      if (isEdit && worker) {
        const { error } = await (supabase as any)
          .from("diary_workers")
          .update(payload)
          .eq("id", worker.id);
        if (error) throw error;
        toast.success("Trabalhador atualizado.");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any)
          .from("diary_workers")
          .insert({
            ...payload,
            diary_entry_id: entryId,
            company_id: companyId,
            project_id: projectId,
            created_by: user?.id,
          });
        if (error) throw error;
        toast.success("Trabalhador adicionado.");
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "ao salvar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar trabalhador" : "Adicionar trabalhador"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {employees.length > 0 && !isEdit && (
            <div>
              <Label className="text-xs">Selecionar funcionário próprio (opcional)</Label>
              <Select value={NONE} onValueChange={(v) => v !== NONE && handlePickEmployee(v)}>
                <SelectTrigger><SelectValue placeholder="— preenche automaticamente —" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={NONE}>— digitar manualmente —</SelectItem>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} {e.profession && <span className="text-muted-foreground text-xs">— {e.profession}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João da Silva" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Função</Label>
              <Select value={profession} onValueChange={setProfession}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {grouped.map(([cat, list]) => (
                    <div key={cat}>
                      <div className="px-2 py-1 text-[10px] uppercase font-semibold text-muted-foreground">{cat}</div>
                      {list.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name} {p.type === "helper" && <span className="text-muted-foreground text-xs">(aux.)</span>}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Horas trabalhadas</Label>
              <Input
                type="number" min={0} max={24} step={0.5}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Custo / hora (R$, opcional)</Label>
              <Input
                type="number" min={0} step="0.01"
                value={costPerHour}
                onChange={(e) => setCostPerHour(e.target.value)}
                placeholder="Ex: 25,00"
              />
            </div>
            <div>
              <Label className="text-xs">Empreiteiro (opcional)</Label>
              <Select value={contractorId} onValueChange={setContractorId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Mão de obra própria</SelectItem>
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.contractor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Observação</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
