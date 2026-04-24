import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Presets de unidade compartilhados em todo o sistema.
 * Mantenha sincronizado com src/components/shared/ObraFormDialog.tsx.
 */
export const UNIT_PRESETS: Array<{ label: string; value: string }> = [
  { label: "Casa / Unidade", value: "Casa|un" },
  { label: "Metro Quadrado", value: "Metro Quadrado|m²" },
  { label: "Metro Cúbico", value: "Metro Cúbico|m³" },
  { label: "Metro Linear", value: "Metro Linear|m" },
  { label: "Verba (R$)", value: "Verba|R$" },
  { label: "Percentual (%)", value: "Percentual|%" },
  { label: "Tonelada", value: "Tonelada|ton" },
  { label: "Quilograma", value: "Quilograma|kg" },
  { label: "Personalizado...", value: "__custom__" },
];

export interface UnitValue {
  unit_label: string;
  unit_symbol: string;
}

interface UnitPresetSelectorProps {
  value: UnitValue;
  onChange: (next: UnitValue) => void;
  /** Texto exibido acima do select (default: "Unidade de medida") */
  label?: string;
  /** Mostra hint de fallback (ex.: "Herdada da obra") quando vazio */
  fallbackHint?: string;
  /** Compacto: usa 1 coluna ao invés de grid */
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Seletor reutilizável de unidade de produção.
 * - Lê/escreve via {unit_label, unit_symbol}.
 * - Permite preset OU personalizado (label + símbolo livre).
 */
export function UnitPresetSelector({
  value,
  onChange,
  label = "Unidade de medida",
  fallbackHint,
  compact = false,
  disabled = false,
}: UnitPresetSelectorProps) {
  const currentValue = `${value.unit_label || ""}|${value.unit_symbol || ""}`;
  const isPreset = UNIT_PRESETS.some(
    (u) => u.value === currentValue && u.value !== "__custom__"
  );
  const isEmpty = !value.unit_label && !value.unit_symbol;
  // Sentinela para "sem seleção" — Radix Select NÃO aceita string vazia em <Select value>
  const NONE = "__none__";

  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <Select
        disabled={disabled}
        value={isEmpty ? NONE : isPreset ? currentValue : "__custom__"}
        onValueChange={(v) => {
          if (v === NONE) return;
          if (v === "__custom__") {
            // Mantém valores se já houver, senão limpa para usuário digitar
            if (isPreset) onChange({ unit_label: "", unit_symbol: "" });
            return;
          }
          const [lbl, sym] = v.split("|");
          onChange({ unit_label: lbl, unit_symbol: sym });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={fallbackHint || "Selecione a unidade"} />
        </SelectTrigger>
        <SelectContent>
          {UNIT_PRESETS.map((u) => (
            <SelectItem key={u.value} value={u.value}>
              {u.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!isPreset && !isEmpty && (
        <div className={compact ? "space-y-2" : "grid grid-cols-2 gap-2"}>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Nome da unidade
            </Label>
            <Input
              disabled={disabled}
              placeholder="Ex: Apartamento"
              value={value.unit_label}
              onChange={(e) =>
                onChange({ ...value, unit_label: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Símbolo</Label>
            <Input
              disabled={disabled}
              placeholder="Ex: apt"
              value={value.unit_symbol}
              onChange={(e) =>
                onChange({ ...value, unit_symbol: e.target.value })
              }
            />
          </div>
        </div>
      )}

      {fallbackHint && isEmpty && (
        <p className="text-xs text-muted-foreground">{fallbackHint}</p>
      )}
    </div>
  );
}
