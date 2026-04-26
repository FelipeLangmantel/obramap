import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Pencil, Trash2, Info, Ruler } from "lucide-react";
import {
  isPhysicalUnit,
  useServiceCapacities,
} from "@/hooks/useServiceCapacities";
import { toast } from "sonner";

interface Props {
  projectId: string;
  scopeId: string;
  scopeName: string;
  unitLabel: string;
  unitSymbol: string;
  totalHouses: number;
}

/**
 * Editor de capacidade de produção por serviço.
 * Aparece apenas para unidades físicas (m², m³, m linear).
 * Define um valor padrão + ajustes finos por casa.
 */
export function ServiceCapacityEditor({
  projectId,
  scopeId,
  scopeName,
  unitLabel,
  unitSymbol,
  totalHouses,
}: Props) {
  const {
    defaultCap,
    houseCaps,
    upsertDefault,
    removeDefault,
    upsertHouseCap,
    removeHouseCap,
    loading,
  } = useServiceCapacities(projectId, scopeId);

  const [defaultValue, setDefaultValue] = useState<string>("");
  const [houseNumber, setHouseNumber] = useState<string>("");
  const [houseValue, setHouseValue] = useState<string>("");

  useEffect(() => {
    setDefaultValue(defaultCap ? String(defaultCap.capacity_value) : "");
  }, [defaultCap]);

  const isPhysical = isPhysicalUnit(unitSymbol);

  const sortedHouseCaps = useMemo(
    () => [...houseCaps].sort((a, b) => a.house_number - b.house_number),
    [houseCaps]
  );

  if (!isPhysical) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Capacidade por casa só se aplica a unidades físicas (m², m³, m linear).
          Para a unidade atual ({unitSymbol || "—"}), o sistema lança 100% por
          casa selecionada.
        </AlertDescription>
      </Alert>
    );
  }

  const handleSaveDefault = async () => {
    const v = parseFloat(defaultValue);
    if (!v || v <= 0) {
      toast.error("Informe um valor de capacidade válido");
      return;
    }
    await upsertDefault({
      project_id: projectId,
      scope_id: scopeId,
      scope_name: scopeName,
      unit_label: unitLabel,
      unit_symbol: unitSymbol,
      capacity_value: v,
    });
  };

  const handleAddHouse = async () => {
    const num = parseInt(houseNumber);
    const v = parseFloat(houseValue);
    if (!num || num < 1 || num > totalHouses) {
      toast.error(`Nº da casa deve estar entre 1 e ${totalHouses}`);
      return;
    }
    if (!v || v <= 0) {
      toast.error("Informe um valor de capacidade válido");
      return;
    }
    const ok = await upsertHouseCap({
      project_id: projectId,
      scope_id: scopeId,
      house_number: num,
      unit_label: unitLabel,
      unit_symbol: unitSymbol,
      capacity_value: v,
    });
    if (ok) {
      setHouseNumber("");
      setHouseValue("");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Ruler className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <Label className="text-sm font-medium">
            Capacidade por casa ({unitSymbol})
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Define quanto cada casa comporta. O sistema bloqueia lançamentos que
            ultrapassem este limite.
          </p>
        </div>
      </div>

      {/* Default */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Valor padrão (vale para todas as casas)
        </Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder={`Ex: 50 ${unitSymbol} por casa`}
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSaveDefault}
            disabled={loading}
          >
            Salvar
          </Button>
          {defaultCap && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => removeDefault()}
              disabled={loading}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Per-house overrides */}
      <div className="space-y-1.5 pt-2 border-t">
        <Label className="text-xs text-muted-foreground">
          Ajuste fino por casa (opcional)
        </Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            max={totalHouses}
            placeholder="Casa"
            value={houseNumber}
            onChange={(e) => setHouseNumber(e.target.value)}
            className="w-20"
          />
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder={`${unitSymbol}`}
            value={houseValue}
            onChange={(e) => setHouseValue(e.target.value)}
          />
          <Button type="button" size="sm" onClick={handleAddHouse}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {sortedHouseCaps.length > 0 && (
          <ScrollArea className="h-[120px] mt-2 border rounded-md p-2 bg-background">
            <div className="space-y-1">
              {sortedHouseCaps.map((h) => (
                <div
                  key={h.house_number}
                  className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-muted/50"
                >
                  <Badge variant="outline" className="font-mono">
                    Casa {h.house_number}
                  </Badge>
                  <span className="font-medium">
                    {h.capacity_value} {h.unit_symbol}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => removeHouseCap(h.house_number)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
