import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Save, Filter, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { useCashflowSimulator } from "@/hooks/useCashflowSimulator";
import type { SimInput } from "@/hooks/useCashflowSimulator";

interface Props {
  simulator: ReturnType<typeof useCashflowSimulator>;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function CashflowConfigPanel({ simulator, collapsed, onToggleCollapse }: Props) {
  const { simInputs, isLoading, isSaving, periods, selectedPeriodIds, setSelectedPeriodIds, suppliers, updateSimInput, saveSimInput } = simulator;
  const [filterFamily, setFilterFamily] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const families = [...new Set(simInputs.map(i => i.macro_name || "—"))].sort();
  const filtered = filterFamily === "all" ? simInputs : simInputs.filter(i => i.macro_name === filterFamily);

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
    await saveSimInput(input);
    setEditingId(null);
  };

  const handleFieldChange = (budgetId: string, field: keyof SimInput, value: any) => {
    updateSimInput(budgetId, field, value);
    setEditingId(budgetId);
  };

  return (
    <Card className="h-full flex flex-col border-border">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">Configuração de Insumos</CardTitle>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-7 w-7">
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 p-3 pt-0 min-h-0">
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

        {/* Family filter */}
        <Select value={filterFamily} onValueChange={setFilterFamily}>
          <SelectTrigger className="h-8 text-xs">
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
