import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Users, Building2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { DiaryWorker, DiaryItemWorkerLink } from "@/hooks/useDiaryWorkers";

interface ContractorContract {
  id: string;
  contractor_name: string;
  status: string;
}

interface Props {
  diaryItemId: string;
  contractorContractId: string | null;
  workers: DiaryWorker[];
  links: DiaryItemWorkerLink[];
  contractors: ContractorContract[];
  companyId: string;
  disabled?: boolean;
  onChanged: () => void;
}

const NONE = "none";

export function DiaryItemAssignmentPopover({
  diaryItemId, contractorContractId, workers, links, contractors,
  companyId, disabled, onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());
  const [contractorId, setContractorId] = useState<string>(contractorContractId || NONE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const ids = links.filter((l) => l.diary_item_id === diaryItemId).map((l) => l.diary_worker_id);
      setSelectedWorkerIds(new Set(ids));
      setContractorId(contractorContractId || NONE);
    }
  }, [open, diaryItemId, links, contractorContractId]);

  const linkedCount = links.filter((l) => l.diary_item_id === diaryItemId).length;
  const linkedContractor = contractors.find((c) => c.id === contractorContractId);

  const handleToggle = (id: string) => {
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1) Atualiza empreiteiro responsável no item
      const { error: e1 } = await (supabase as any)
        .from("diary_items")
        .update({ contractor_contract_id: contractorId === NONE ? null : contractorId })
        .eq("id", diaryItemId);
      if (e1) throw e1;

      // 2) Substitui vínculos de trabalhadores: apaga e recria
      const { error: e2 } = await (supabase as any)
        .from("diary_item_workers")
        .delete()
        .eq("diary_item_id", diaryItemId);
      if (e2) throw e2;

      if (selectedWorkerIds.size > 0) {
        const rows = Array.from(selectedWorkerIds).map((wid) => ({
          diary_item_id: diaryItemId,
          diary_worker_id: wid,
          company_id: companyId,
        }));
        const { error: e3 } = await (supabase as any).from("diary_item_workers").insert(rows);
        if (e3) throw e3;
      }

      toast.success("Vínculos atualizados.");
      onChanged();
      setOpen(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1.5"
          disabled={disabled}
          title="Vincular trabalhadores e empreiteiro"
        >
          <Users className="h-3 w-3" />
          {linkedCount > 0 ? `${linkedCount}` : "—"}
          {linkedContractor && (
            <>
              <Building2 className="h-3 w-3 ml-1 text-blue-600 dark:text-blue-400" />
              <span className="truncate max-w-[80px]">{linkedContractor.contractor_name}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Empreiteiro responsável</Label>
            <Select value={contractorId} onValueChange={setContractorId} disabled={disabled}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Mão de obra própria</SelectItem>
                {contractors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.contractor_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Quem executou ({selectedWorkerIds.size})</Label>
            {workers.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2">
                Nenhum trabalhador apontado hoje. Adicione na seção "Equipe do dia" antes de vincular.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                {workers.map((w) => {
                  const checked = selectedWorkerIds.has(w.id);
                  return (
                    <label
                      key={w.id}
                      className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => handleToggle(w.id)}
                        disabled={disabled}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-xs font-medium">{w.worker_name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {w.profession} · {Number(w.hours_worked).toFixed(1)}h
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {!disabled && (
            <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs">
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
              Salvar vínculos
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
