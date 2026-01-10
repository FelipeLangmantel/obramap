import { useCallback, useRef, useState, KeyboardEvent } from "react";
import { PlanningTarget } from "@/hooks/useMeasurementPlanning";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface MeasurementPlanningTableProps {
  targets: PlanningTarget[];
  canEdit: boolean;
  onUpdateTarget: (targetId: string, updates: Partial<PlanningTarget>) => void;
  contractTargetMargin: number;
}

export function MeasurementPlanningTable({
  targets,
  canEdit,
  onUpdateTarget,
  contractTargetMargin,
}: MeasurementPlanningTableProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const getCellId = (targetId: string, field: string) => `${targetId}-${field}`;

  const handleCellClick = (targetId: string, field: string) => {
    if (!canEdit) return;
    const cellId = getCellId(targetId, field);
    setEditingCell(cellId);
    setTimeout(() => {
      inputRefs.current[cellId]?.focus();
      inputRefs.current[cellId]?.select();
    }, 0);
  };

  const handleCellBlur = (targetId: string, field: string, value: string) => {
    setEditingCell(null);
    const numValue = parseFloat(value.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
    onUpdateTarget(targetId, { [field]: numValue });
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    targetId: string,
    field: string,
    currentIndex: number
  ) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const currentValue = (e.target as HTMLInputElement).value;
      handleCellBlur(targetId, field, currentValue);

      // Move to next editable cell
      const editableFields = ["planned_houses", "productivity_planned", "teams_planned", "unit_revenue_value"];
      const currentFieldIndex = editableFields.indexOf(field);
      
      if (currentFieldIndex < editableFields.length - 1) {
        // Move to next field in same row
        handleCellClick(targetId, editableFields[currentFieldIndex + 1]);
      } else if (currentIndex < targets.length - 1) {
        // Move to first field in next row
        handleCellClick(targets[currentIndex + 1].id, editableFields[0]);
      }
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  const getStatusBadge = (status?: 'success' | 'warning' | 'danger') => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            OK
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 gap-1">
            <AlertTriangle className="h-3 w-3" />
            Atenção
          </Badge>
        );
      case 'danger':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
            <XCircle className="h-3 w-3" />
            Prejuízo
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderEditableCell = (
    target: PlanningTarget,
    field: keyof PlanningTarget,
    value: number,
    index: number,
    formatFn?: (v: number) => string
  ) => {
    const cellId = getCellId(target.id, field);
    const isEditing = editingCell === cellId;
    const displayValue = formatFn ? formatFn(value) : formatNumber(value);

    if (!canEdit) {
      return <span className="text-sm">{displayValue}</span>;
    }

    if (isEditing) {
      return (
        <Input
          ref={(el) => { inputRefs.current[cellId] = el; }}
          type="text"
          defaultValue={value.toString()}
          className="h-8 w-24 text-right text-sm"
          onBlur={(e) => handleCellBlur(target.id, field, e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, target.id, field, index)}
        />
      );
    }

    return (
      <button
        onClick={() => handleCellClick(target.id, field)}
        className={cn(
          "w-full text-right px-2 py-1 rounded transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        )}
      >
        <span className="text-sm">{displayValue}</span>
      </button>
    );
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0">
            <TableRow>
              <TableHead className="min-w-[250px] font-semibold">Serviço</TableHead>
              <TableHead className="text-right min-w-[100px] font-semibold">
                Casas
                {canEdit && <span className="text-xs text-primary ml-1">✎</span>}
              </TableHead>
              <TableHead className="text-right min-w-[120px] font-semibold">
                Produtividade
                {canEdit && <span className="text-xs text-primary ml-1">✎</span>}
              </TableHead>
              <TableHead className="text-right min-w-[80px] font-semibold">
                Equipes
                {canEdit && <span className="text-xs text-primary ml-1">✎</span>}
              </TableHead>
              <TableHead className="text-right min-w-[120px] font-semibold">Custo Unit.</TableHead>
              <TableHead className="text-right min-w-[130px] font-semibold">Custo Plan.</TableHead>
              <TableHead className="text-right min-w-[120px] font-semibold">
                Valor Unit.
                {canEdit && <span className="text-xs text-primary ml-1">✎</span>}
              </TableHead>
              <TableHead className="text-right min-w-[130px] font-semibold">Receita Plan.</TableHead>
              <TableHead className="text-right min-w-[120px] font-semibold">Lucro Plan.</TableHead>
              <TableHead className="text-right min-w-[90px] font-semibold">Margem %</TableHead>
              <TableHead className="text-center min-w-[100px] font-semibold">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.map((target, index) => (
              <TableRow 
                key={target.id}
                className={cn(
                  "hover:bg-muted/50 transition-colors",
                  index % 2 === 0 ? "bg-background" : "bg-muted/20"
                )}
              >
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    <span className="text-sm">{target.macro_name}</span>
                    <span className="text-xs text-muted-foreground">{target.scope_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right p-1">
                  {renderEditableCell(target, "planned_houses", target.planned_houses, index, (v) => v.toString())}
                </TableCell>
                <TableCell className="text-right p-1">
                  {renderEditableCell(target, "productivity_planned", target.productivity_planned, index)}
                </TableCell>
                <TableCell className="text-right p-1">
                  {renderEditableCell(target, "teams_planned", target.teams_planned, index, (v) => v.toString())}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {formatCurrency(target.unit_cost_value)}
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {formatCurrency(target.calculatedCost || 0)}
                </TableCell>
                <TableCell className="text-right p-1">
                  {renderEditableCell(target, "unit_revenue_value", target.unit_revenue_value, index, formatCurrency)}
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {formatCurrency(target.calculatedRevenue || 0)}
                </TableCell>
                <TableCell className={cn(
                  "text-right text-sm font-medium",
                  (target.calculatedProfit || 0) >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {formatCurrency(target.calculatedProfit || 0)}
                </TableCell>
                <TableCell className={cn(
                  "text-right text-sm font-medium",
                  (target.calculatedMargin || 0) >= contractTargetMargin ? "text-green-600" : 
                  (target.calculatedMargin || 0) >= 0 ? "text-yellow-600" : "text-red-600"
                )}>
                  {formatNumber(target.calculatedMargin || 0, 1)}%
                </TableCell>
                <TableCell className="text-center">
                  {getStatusBadge(target.status)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
