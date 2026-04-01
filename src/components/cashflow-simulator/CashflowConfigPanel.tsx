import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Save, Filter, Loader2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { useCashflowSimulator } from "@/hooks/useCashflowSimulator";
import type { SimInput } from "@/hooks/useCashflowSimulator";

interface Props {
  simulator: ReturnType<typeof useCashflowSimulator>;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface BulkForm {
  supplier_name: string;
  reference_price: string;
  lead_time_days: string;
  installment_1_days: string;
  installment_1_pct: string;
  installment_2_days: string;
  installment_2_pct: string;
  installment_3_days: string;
  installment_3_pct: string;
}

const emptyBulkForm: BulkForm = {
  supplier_name: "",
  reference_price: "",
  lead_time_days: "",
  installment_1_days: "",
  installment_1_pct: "",
  installment_2_days: "",
  installment_2_pct: "",
  installment_3_days: "",
  installment_3_pct: "",
};

export function CashflowConfigPanel({ simulator, collapsed, onToggleCollapse }: Props) {
  const { simInputs, isLoading, isSaving, periods, selectedPeriodIds, setSelectedPeriodIds, suppliers, updateSimInput, saveSimInput } = simulator;
  const [filterFamily, setFilterFamily] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkForm>(emptyBulkForm);
  const [bulkApplying, setBulkApplying] = useState(false);

  const families = [...new Set(simInputs.map(i => i.macro_name || "—"))].sort();
  const filtered = filterFamily === "all" ? simInputs : simInputs.filter(i => i.macro_name === filterFamily);

  // Completeness indicator
  const configured = simInputs.filter(i => i.supplier_name && i.reference_price > 0).length;
  const total = simInputs.length;
  const pct = total > 0 ? Math.round((configured / total) * 100) : 0;
  const pctColor = pct >= 80 ? "text-green-600" : pct >= 40 ? "text-amber-600" : "text-red-600";
  const barColor = pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

  if (collapsed) {
    return (
      <div className="h-full flex flex-col items-center pt-2">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="text-muted-foreground">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const handleSave = async (input: SimInput) => {
    const totalPct = (input.installment_1_pct || 0)
      + (input.installment_2_pct || 0)
      + (input.installment_3_pct || 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      toast.warning(
        `Percentuais somam ${totalPct.toFixed(0)}% — ajuste para 100% antes de salvar.`
      );
      return;
    }
    await saveSimInput(input);
    setEditingId(null);
  };

  const handleFieldChange = (budgetId: string, field: keyof SimInput, value: any) => {
    updateSimInput(budgetId, field, value);
    setEditingId(budgetId);
  };

  const handleOpenBulkDialog = () => {
    if (filterFamily === "all") {
      toast.warning("Selecione uma família primeiro");
      return;
    }
    setBulkForm(emptyBulkForm);
    setBulkDialogOpen(true);
  };

  const handleBulkApply = async () => {
    const familyInputs = simInputs.filter(i => i.macro_name === filterFamily);
    if (familyInputs.length === 0) return;

    // Validate percentages if any pct field is filled
    const p1 = bulkForm.installment_1_pct ? parseFloat(bulkForm.installment_1_pct) : null;
    const p2 = bulkForm.installment_2_pct ? parseFloat(bulkForm.installment_2_pct) : null;
    const p3 = bulkForm.installment_3_pct ? parseFloat(bulkForm.installment_3_pct) : null;
    const anyPctFilled = p1 !== null || p2 !== null || p3 !== null;
    if (anyPctFilled) {
      const sum = (p1 || 0) + (p2 || 0) + (p3 || 0);
      if (Math.abs(sum - 100) > 0.01) {
        toast.warning("Percentuais devem somar 100%");
        return;
      }
    }

    setBulkApplying(true);
    try {
      // Build fields to apply
      const fieldsToApply: { field: keyof SimInput; value: any }[] = [];
      if (bulkForm.supplier_name) fieldsToApply.push({ field: "supplier_name", value: bulkForm.supplier_name });
      if (bulkForm.reference_price) fieldsToApply.push({ field: "reference_price", value: parseFloat(bulkForm.reference_price) || 0 });
      if (bulkForm.lead_time_days) fieldsToApply.push({ field: "lead_time_days", value: parseInt(bulkForm.lead_time_days) || 0 });
      if (bulkForm.installment_1_days) fieldsToApply.push({ field: "installment_1_days", value: parseInt(bulkForm.installment_1_days) || 0 });
      if (p1 !== null) fieldsToApply.push({ field: "installment_1_pct", value: p1 });
      if (bulkForm.installment_2_days) fieldsToApply.push({ field: "installment_2_days", value: parseInt(bulkForm.installment_2_days) || 0 });
      if (p2 !== null) fieldsToApply.push({ field: "installment_2_pct", value: p2 });
      if (bulkForm.installment_3_days) fieldsToApply.push({ field: "installment_3_days", value: parseInt(bulkForm.installment_3_days) || 0 });
      if (p3 !== null) fieldsToApply.push({ field: "installment_3_pct", value: p3 });

      if (fieldsToApply.length === 0) {
        toast.warning("Preencha ao menos um campo para aplicar.");
        setBulkApplying(false);
        return;
      }

      for (const input of familyInputs) {
        for (const { field, value } of fieldsToApply) {
          updateSimInput(input.budget_service_input_id, field, value);
        }
      }

      // Save sequentially
      for (const input of familyInputs) {
        await saveSimInput(input);
      }

      toast.success(`Configuração aplicada a ${familyInputs.length} insumos`);
      setBulkDialogOpen(false);
    } finally {
      setBulkApplying(false);
    }
  };

  const familyCount = filterFamily !== "all" ? simInputs.filter(i => i.macro_name === filterFamily).length : 0;

  return (
    <Card className="h-full flex flex-col border-border">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">Configuração de Insumos</CardTitle>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-7 w-7">
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 p-3 pt-0 min-h-0">
        {/* Completeness indicator */}
        {total > 0 && (
          <div className="space-y-1">
            <p className={cn("text-[11px] font-medium", pctColor)}>
              Configurados: {configured}/{total} insumos ({pct}%)
            </p>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Period selector */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Períodos</label>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-auto scrollbar-none">
            {periods.map((p: any) => (
              <Badge
                key={p.id}
                variant={selectedPeriodIds.includes(p.id) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => {
                  setSelectedPeriodIds(prev =>
                    prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                  );
                }}
              >
                {p.name || `P${p.period_number}`}
              </Badge>
            ))}
          </div>
          {selectedPeriodIds.length === 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">Todos os períodos selecionados</p>
          )}
        </div>

        {/* Family filter + bulk config */}
        <div className="flex gap-2 items-center">
          <Select value={filterFamily} onValueChange={setFilterFamily}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Filtrar família" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as famílias</SelectItem>
              {families.map(f => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs shrink-0 gap-1" onClick={handleOpenBulkDialog}>
            <Settings2 className="h-3.5 w-3.5" />
            Configurar família
          </Button>
        </div>

        {/* Inputs list */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum insumo encontrado</p>
          ) : (
            <div className="space-y-2 pr-2">
              {filtered.map(input => (
                <InputConfigRow
                  key={input.budget_service_input_id}
                  input={input}
                  suppliers={suppliers}
                  isEditing={editingId === input.budget_service_input_id}
                  isSaving={isSaving}
                  onChange={(field, value) => handleFieldChange(input.budget_service_input_id, field, value)}
                  onSave={() => handleSave(input)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Bulk config dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Configurar família: {filterFamily}</DialogTitle>
            <DialogDescription className="text-xs">
              Preencha apenas os campos que deseja alterar em lote.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Fornecedor</label>
              <Input
                value={bulkForm.supplier_name}
                onChange={e => setBulkForm(f => ({ ...f, supplier_name: e.target.value }))}
                placeholder="Nome do fornecedor"
                className="h-8 text-xs"
                list="bulk-suppliers"
              />
              <datalist id="bulk-suppliers">
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Preço Ref. (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={bulkForm.reference_price}
                  onChange={e => setBulkForm(f => ({ ...f, reference_price: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Lead Time (dias)</label>
                <Input
                  type="number"
                  value={bulkForm.lead_time_days}
                  onChange={e => setBulkForm(f => ({ ...f, lead_time_days: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            {[1, 2, 3].map(n => {
              const daysKey = `installment_${n}_days` as keyof BulkForm;
              const pctKey = `installment_${n}_pct` as keyof BulkForm;
              return (
                <div key={n} className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Parcela {n} — Dias</label>
                    <Input
                      type="number"
                      value={bulkForm[daysKey]}
                      onChange={e => setBulkForm(f => ({ ...f, [daysKey]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Parcela {n} — %</label>
                    <Input
                      type="number"
                      value={bulkForm[pctKey]}
                      onChange={e => setBulkForm(f => ({ ...f, [pctKey]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-amber-600 bg-amber-50 rounded p-2">
              Será aplicado a <strong>{familyCount}</strong> insumos da família <strong>{filterFamily}</strong>. Campos em branco não serão alterados.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkDialogOpen(false)} disabled={bulkApplying}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90"
              onClick={handleBulkApply}
              disabled={bulkApplying}
            >
              {bulkApplying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Aplicar a todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface InputRowProps {
  input: SimInput;
  suppliers: any[];
  isEditing: boolean;
  isSaving: boolean;
  onChange: (field: keyof SimInput, value: any) => void;
  onSave: () => void;
}

function InputConfigRow({ input, suppliers, isEditing, isSaving, onChange, onSave }: InputRowProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{input.input_name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{input.macro_name} › {input.scope_name}</p>
        </div>
        {isEditing && (
          <Button size="sm" variant="default" className="h-6 text-[10px] px-2 shrink-0" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          </Button>
        )}
      </div>

      {/* Supplier */}
      <div>
        <label className="text-[10px] text-muted-foreground">Fornecedor</label>
        <Input
          value={input.supplier_name}
          onChange={(e) => onChange("supplier_name", e.target.value)}
          placeholder="Nome do fornecedor"
          className="h-7 text-xs"
          list={`suppliers-${input.budget_service_input_id}`}
        />
        <datalist id={`suppliers-${input.budget_service_input_id}`}>
          {suppliers.map((s: any) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
      </div>

      {/* Price + Lead Time */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Preço Ref. (R$)</label>
          <Input
            type="number"
            step="0.01"
            value={input.reference_price || ""}
            onChange={(e) => onChange("reference_price", parseFloat(e.target.value) || 0)}
            className="h-7 text-xs"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Lead Time (dias)</label>
          <Input
            type="number"
            value={input.lead_time_days}
            onChange={(e) => onChange("lead_time_days", parseInt(e.target.value) || 0)}
            className="h-7 text-xs"
          />
        </div>
      </div>

      {/* Installments */}
      <div className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map(n => {
          const daysKey = `installment_${n}_days` as keyof SimInput;
          const pctKey = `installment_${n}_pct` as keyof SimInput;
          return (
            <div key={n} className="space-y-0.5">
              <label className="text-[10px] text-muted-foreground">P{n}</label>
              <Input
                type="number"
                value={(input[daysKey] as number) || ""}
                onChange={(e) => onChange(daysKey, parseInt(e.target.value) || 0)}
                placeholder="Dias"
                className="h-6 text-[10px] px-1.5"
              />
              <Input
                type="number"
                value={(input[pctKey] as number) || ""}
                onChange={(e) => onChange(pctKey, parseFloat(e.target.value) || 0)}
                placeholder="%"
                className="h-6 text-[10px] px-1.5"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
