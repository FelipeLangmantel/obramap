import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ContractService } from "@/hooks/useProjectContract";
import { useConstruction } from "@/contexts/ConstructionContext";
import { cn } from "@/lib/utils";
import { Layers, Check, AlertTriangle, Link2 } from "lucide-react";
import { LinkPleItemsDialog } from "./LinkPleItemsDialog";

interface ContractServicesTableProps {
  services: ContractService[];
  updateServiceValue: (macroId: string, scopeId: string, value: number) => void;
  isEditing: boolean;
  costPercent: number;
}

// Cores suaves para macros
const MACRO_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  "bg-blue-500/10 border-l-blue-400 dark:bg-blue-500/15",
  "bg-emerald-500/10 border-l-emerald-400 dark:bg-emerald-500/15",
  "bg-purple-500/10 border-l-purple-400 dark:bg-purple-500/15",
  "bg-orange-500/10 border-l-orange-400 dark:bg-orange-500/15",
  "bg-pink-500/10 border-l-pink-400 dark:bg-pink-500/15",
  "bg-cyan-500/10 border-l-cyan-400 dark:bg-cyan-500/15",
  "bg-yellow-500/10 border-l-yellow-400 dark:bg-yellow-500/15",
  "bg-indigo-500/10 border-l-indigo-400 dark:bg-indigo-500/15",
];

function getMacroColor(macroId: string): string {
  if (!MACRO_COLORS[macroId]) {
    const index = Object.keys(MACRO_COLORS).length % COLOR_PALETTE.length;
    MACRO_COLORS[macroId] = COLOR_PALETTE[index];
  }
  return MACRO_COLORS[macroId];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function parseCurrencyInput(value: string): number {
  // Remove currency symbol and formatting
  const cleaned = value.replace(/[R$\s.]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

interface EditableCellProps {
  value: number;
  onSave: (value: number) => void;
  isEditing: boolean;
}

function EditableCell({ value, onSave, isEditing }: EditableCellProps) {
  const [localValue, setLocalValue] = useState(value.toString());
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value.toFixed(2));
    }
  }, [value, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseCurrencyInput(localValue);
    if (parsed !== value) {
      onSave(parsed);
    }
    setLocalValue(parsed.toFixed(2));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
    if (e.key === "Tab") {
      // Allow natural tab behavior
    }
  };

  if (!isEditing) {
    return (
      <span className={cn(
        "font-mono text-right block",
        value === 0 ? "text-muted-foreground" : "text-foreground"
      )}>
        {formatCurrency(value)}
      </span>
    );
  }

  return (
    <Input
      ref={inputRef}
      type="text"
      value={isFocused ? localValue : formatCurrency(value)}
      onChange={(e) => setLocalValue(e.target.value)}
      onFocus={() => {
        setIsFocused(true);
        setLocalValue(value.toString());
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn(
        "w-28 text-right font-mono h-8 px-2",
        value === 0 && "border-yellow-400 bg-yellow-500/10"
      )}
    />
  );
}

export function ContractServicesTable({
  services,
  updateServiceValue,
  isEditing,
  costPercent,
}: ContractServicesTableProps) {
  const { currentProject } = useConstruction();
  const [linkDialog, setLinkDialog] = useState<{ macroId: string; macroName: string; scopeId: string; scopeName: string } | null>(null);
  const [hasPleProject, setHasPleProject] = useState(false);

  // Check if there is a PLE project linked to current obramap project
  useEffect(() => {
    if (!currentProject?.id) { setHasPleProject(false); return; }
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("ple_projects")
        .select("id")
        .eq("obramap_project_id", currentProject.id)
        .maybeSingle();
      if (!cancelled) setHasPleProject(!!data);
    })();
    return () => { cancelled = true; };
  }, [currentProject?.id]);

  // Group services by macro
  const groupedServices = services.reduce((acc, service) => {
    const key = service.macro_id;
    if (!acc[key]) {
      acc[key] = {
        macro_name: service.macro_name,
        services: [],
      };
    }
    acc[key].services.push(service);
    return acc;
  }, {} as Record<string, { macro_name: string; services: ContractService[] }>);

  // Receita total (soma de todos os preços de contrato)
  const totalRevenue = services.reduce((s, sv) => s + (sv.unit_revenue_value || 0), 0);

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Layers className="h-5 w-5 text-primary" />
          Matriz de Serviços do Contrato
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[180px] font-semibold">Etapa (Macro)</TableHead>
                <TableHead className="w-[230px] font-semibold">Serviço (Scope)</TableHead>
                <TableHead className="w-[150px] text-right font-semibold">
                  Preço Contrato (R$)
                </TableHead>
                <TableHead className="w-[90px] text-center font-semibold" title="Participação deste serviço na receita total do contrato">
                  % Receita
                </TableHead>
                <TableHead className="w-[150px] text-right font-semibold">
                  Custo Máx. (R$)
                </TableHead>
                <TableHead className="w-[80px] text-center font-semibold">% Custo</TableHead>
                <TableHead className="w-[100px] text-center font-semibold">Status</TableHead>
                {hasPleProject && (
                  <TableHead className="w-[140px] text-center font-semibold">PLE</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(groupedServices).map(([macroId, group]) => (
                group.services.map((service, idx) => (
                  <TableRow
                    key={`${service.macro_id}-${service.scope_id}`}
                    className={cn(
                      "border-l-4 transition-colors hover:bg-accent/30",
                      getMacroColor(macroId)
                    )}
                  >
                    <TableCell className="font-medium">
                      {idx === 0 ? group.macro_name : ""}
                    </TableCell>
                    <TableCell>{service.scope_name}</TableCell>
                    <TableCell className="text-right">
                      <EditableCell
                        value={service.unit_revenue_value}
                        onSave={(value) => updateServiceValue(service.macro_id, service.scope_id, value)}
                        isEditing={isEditing}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {service.unit_revenue_value > 0 && totalRevenue > 0 ? (
                        <Badge variant="secondary" className="font-mono text-xs">
                          {((service.unit_revenue_value / totalRevenue) * 100).toFixed(2)}%
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(service.max_cost_value)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono">
                        {service.unit_revenue_value > 0 ? `${costPercent}%` : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {service.unit_revenue_value > 0 ? (
                        <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                          <Check className="h-3 w-3 mr-1" />
                          OK
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Pendente
                        </Badge>
                      )}
                    </TableCell>
                    {hasPleProject && (
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1.5"
                          disabled={!isEditing}
                          onClick={() => setLinkDialog({
                            macroId: service.macro_id,
                            macroName: service.macro_name,
                            scopeId: service.scope_id,
                            scopeName: service.scope_name,
                          })}
                        >
                          <Link2 className="h-3 w-3" />
                          Vincular PLE
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ))}
              {services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={hasPleProject ? 8 : 7} className="text-center py-8 text-muted-foreground">
                    Nenhum serviço encontrado. Cadastre serviços em "Etapas e Serviços" primeiro.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {linkDialog && currentProject && (
        <LinkPleItemsDialog
          open={!!linkDialog}
          onClose={() => setLinkDialog(null)}
          projectId={currentProject.id}
          totalHouses={currentProject.totalHouses || (currentProject.houses?.length ?? 1)}
          macroId={linkDialog.macroId}
          macroName={linkDialog.macroName}
          scopeId={linkDialog.scopeId}
          scopeName={linkDialog.scopeName}
          onConfirm={(totalRevenueCalc) => {
            updateServiceValue(linkDialog.macroId, linkDialog.scopeId, totalRevenueCalc);
          }}
        />
      )}
    </Card>
  );
}
