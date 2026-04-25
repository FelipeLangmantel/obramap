import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUnitTypes, UnitType, UnitCapacity } from "@/hooks/useUnitTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Edit2, Ruler, Home, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

interface UnitTypesPanelProps {
  projectId: string;
  totalHouses: number;
  canEdit: boolean;
}

/**
 * Presets de unidades FÍSICAS validáveis pelo trigger no banco.
 * (verba/%/un não fazem sentido validar contra capacidade física da casa.)
 */
const PHYSICAL_UNITS = [
  { label: "Metro Quadrado", symbol: "m²" },
  { label: "Metro Cúbico", symbol: "m³" },
  { label: "Metro Linear", symbol: "m" },
];

interface HouseRow {
  id: string;
  house_number: number;
  unit_type_id: string | null;
}

export function UnitTypesPanel({ projectId, totalHouses, canEdit }: UnitTypesPanelProps) {
  const { unitTypes, loading, createType, updateType, deleteType, upsertCapacity, deleteCapacity, assignHousesToType, refresh } =
    useUnitTypes(projectId);

  const [houses, setHouses] = useState<HouseRow[]>([]);
  const [newTypeOpen, setNewTypeOpen] = useState(false);
  const [editType, setEditType] = useState<UnitType | null>(null);
  const [assignDialog, setAssignDialog] = useState<UnitType | null>(null);

  // Carrega casas para mostrar atribuição
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("houses")
        .select("id, house_number, unit_type_id")
        .eq("project_id", projectId)
        .order("house_number");
      if (!active) return;
      if (error) {
        console.error(error);
        return;
      }
      setHouses(data || []);
    })();
    return () => {
      active = false;
    };
  }, [projectId, unitTypes]);

  const housesByType = useMemo(() => {
    const map = new Map<string | "none", HouseRow[]>();
    map.set("none", []);
    for (const t of unitTypes) map.set(t.id, []);
    for (const h of houses) {
      const k = h.unit_type_id || "none";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(h);
    }
    return map;
  }, [houses, unitTypes]);

  const unassignedCount = housesByType.get("none")?.length || 0;
  const allConfigured = unitTypes.length > 0 && unitTypes.every((t) => t.capacities.length > 0) && unassignedCount === 0;

  return (
    <div className="space-y-4">
      {/* Status geral */}
      {!allConfigured ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Configuração obrigatória.</strong> O sistema bloqueará lançamentos de produção em m², m³ ou m
            linear até que cada casa esteja vinculada a uma tipologia com capacidade definida.
            {unitTypes.length === 0 && " Cadastre ao menos 1 tipologia."}
            {unitTypes.length > 0 && unassignedCount > 0 && ` Ainda há ${unassignedCount} casa(s) sem tipologia.`}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Tudo pronto: {unitTypes.length} tipologia(s) configurada(s) e {totalHouses} casa(s) vinculada(s).
          </AlertDescription>
        </Alert>
      )}

      {/* Como funciona */}
      <Card className="border-dashed">
        <CardContent className="pt-4 text-sm text-muted-foreground space-y-1">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Ruler className="h-4 w-4" /> Como funciona
          </div>
          <p>
            1) Cadastre <strong>tipologias</strong> (ex.: "Casa Padrão 100m²", "Casa Premium 120m²").
          </p>
          <p>
            2) Para cada tipologia, defina a <strong>capacidade máxima</strong> em uma ou mais unidades físicas (m², m³,
            m linear).
          </p>
          <p>
            3) Vincule as <strong>casas</strong> à tipologia correspondente.
          </p>
          <p>
            4) Ao lançar produção (ex.: 10 m² de piso na Casa 5), o sistema soma os lançamentos acumulados e{" "}
            <strong>bloqueia</strong> caso ultrapasse a capacidade da tipologia.
          </p>
        </CardContent>
      </Card>

      {/* Header com botão */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Tipologias da obra</h3>
          <p className="text-xs text-muted-foreground">{unitTypes.length} tipologia(s) cadastrada(s)</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setNewTypeOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova tipologia
          </Button>
        )}
      </div>

      {/* Lista de tipologias */}
      <div className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && unitTypes.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Nenhuma tipologia cadastrada. Comece criando uma para definir a capacidade das casas.
            </CardContent>
          </Card>
        )}
        {unitTypes.map((t) => {
          const hCount = housesByType.get(t.id)?.length || 0;
          return (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {t.name}
                      {t.is_default && <Badge variant="secondary">Padrão</Badge>}
                      <Badge variant="outline" className="gap-1">
                        <Home className="h-3 w-3" /> {hCount} casa(s)
                      </Badge>
                    </CardTitle>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => setAssignDialog(t)} className="gap-1">
                        <Home className="h-3 w-3" /> Vincular casas
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditType(t)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(`Excluir tipologia "${t.name}"? Casas vinculadas ficarão sem tipologia.`)) {
                            deleteType(t.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <CapacitiesEditor
                  type={t}
                  canEdit={canEdit}
                  onUpsert={(cap) => upsertCapacity(t.id, cap)}
                  onDelete={(id) => deleteCapacity(id)}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Casas sem tipologia */}
      {unassignedCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {unassignedCount} casa(s) ainda sem tipologia: {(housesByType.get("none") || []).map((h) => h.house_number).join(", ")}
          </AlertDescription>
        </Alert>
      )}

      {/* Dialog: nova tipologia */}
      <NewTypeDialog
        open={newTypeOpen}
        onOpenChange={setNewTypeOpen}
        onCreate={async (name, desc, isDefault) => {
          const created = await createType({ name, description: desc, is_default: isDefault });
          if (created) setNewTypeOpen(false);
        }}
      />

      {/* Dialog: editar tipologia */}
      {editType && (
        <NewTypeDialog
          open={!!editType}
          onOpenChange={(o) => !o && setEditType(null)}
          initial={editType}
          onCreate={async (name, desc, isDefault) => {
            const ok = await updateType(editType.id, { name, description: desc, is_default: isDefault });
            if (ok) setEditType(null);
          }}
        />
      )}

      {/* Dialog: atribuir casas */}
      {assignDialog && (
        <AssignHousesDialog
          unitType={assignDialog}
          allHouses={houses}
          onClose={() => setAssignDialog(null)}
          onAssign={async (selected) => {
            await assignHousesToType(assignDialog.id, selected);
            setAssignDialog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Subcomponente: editor de capacidades de uma tipologia
// =====================================================================
function CapacitiesEditor({
  type,
  canEdit,
  onUpsert,
  onDelete,
}: {
  type: UnitType;
  canEdit: boolean;
  onUpsert: (cap: UnitCapacity) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [unit, setUnit] = useState<string>(""); // formato "label|symbol"
  const [value, setValue] = useState<string>("");
  const [customLabel, setCustomLabel] = useState("");
  const [customSymbol, setCustomSymbol] = useState("");

  const isCustom = unit === "__custom__";
  const presetLabels = PHYSICAL_UNITS.map((u) => `${u.label}|${u.symbol}`);

  const handleAdd = async () => {
    let label = "";
    let symbol = "";
    if (isCustom) {
      label = customLabel.trim();
      symbol = customSymbol.trim();
    } else if (unit) {
      const [l, s] = unit.split("|");
      label = l;
      symbol = s;
    }
    if (!label || !symbol) {
      toast.error("Selecione ou informe a unidade");
      return;
    }
    const v = parseFloat(value);
    if (!v || v <= 0) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    const ok = await onUpsert({ unit_label: label, unit_symbol: symbol, capacity_value: v });
    if (ok) {
      setUnit("");
      setValue("");
      setCustomLabel("");
      setCustomSymbol("");
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Capacidades</Label>
      {type.capacities.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Nenhuma capacidade definida.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {type.capacities.map((c) => (
          <Badge key={c.id} variant="secondary" className="gap-2 text-sm py-1 px-2">
            <span>
              <strong>{c.capacity_value}</strong> {c.unit_symbol} <span className="opacity-60">({c.unit_label})</span>
            </span>
            {canEdit && c.id && (
              <button
                type="button"
                onClick={() => onDelete(c.id!)}
                className="hover:text-destructive transition-colors"
                aria-label="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>

      {canEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2 pt-2">
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger>
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              {PHYSICAL_UNITS.map((u) => (
                <SelectItem key={u.symbol} value={`${u.label}|${u.symbol}`}>
                  {u.label} ({u.symbol})
                </SelectItem>
              ))}
              <SelectItem value="__custom__">Personalizado...</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={value}
            placeholder="Capacidade"
            onChange={(e) => setValue(e.target.value)}
          />
          <Button size="sm" onClick={handleAdd} className="gap-1">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
          {isCustom && (
            <div className="grid grid-cols-2 gap-2 sm:col-span-3">
              <Input
                placeholder="Nome (ex: Metro Cúbico)"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
              <Input
                placeholder="Símbolo (ex: m³)"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Dialog: criar/editar tipologia
// =====================================================================
function NewTypeDialog({
  open,
  onOpenChange,
  initial,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: UnitType;
  onCreate: (name: string, desc: string, isDefault: boolean) => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const [isDefault, setIsDefault] = useState(initial?.is_default || false);

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setDesc(initial?.description || "");
      setIsDefault(initial?.is_default || false);
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar tipologia" : "Nova tipologia"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Casa Padrão 100m²" />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Detalhes da tipologia..." rows={3} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Marcar como tipologia padrão da obra
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!name.trim()) {
                toast.error("Informe o nome");
                return;
              }
              onCreate(name.trim(), desc.trim(), isDefault);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Dialog: vincular casas a uma tipologia
// =====================================================================
function AssignHousesDialog({
  unitType,
  allHouses,
  onClose,
  onAssign,
}: {
  unitType: UnitType;
  allHouses: HouseRow[];
  onClose: () => void;
  onAssign: (houseNumbers: number[]) => void;
}) {
  // Pré-selecionar casas já vinculadas a esta tipologia
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(allHouses.filter((h) => h.unit_type_id === unitType.id).map((h) => h.house_number))
  );
  const [rangeInput, setRangeInput] = useState("");

  const toggle = (n: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const applyRange = () => {
    const parts = rangeInput.split(",").map((p) => p.trim());
    const nums: number[] = [];
    parts.forEach((p) => {
      if (p.includes("-")) {
        const [a, b] = p.split("-").map((n) => parseInt(n.trim()));
        if (!isNaN(a) && !isNaN(b)) for (let i = a; i <= b; i++) nums.push(i);
      } else {
        const n = parseInt(p);
        if (!isNaN(n)) nums.push(n);
      }
    });
    setSelected((prev) => {
      const next = new Set(prev);
      nums.forEach((n) => next.add(n));
      return next;
    });
    setRangeInput("");
  };

  const selectAll = () => setSelected(new Set(allHouses.map((h) => h.house_number)));
  const clearAll = () => setSelected(new Set());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular casas — {unitType.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Alert>
            <AlertDescription className="text-xs">
              Casas vinculadas a outras tipologias serão <strong>realocadas</strong> a esta. Para desvincular, abra a outra
              tipologia.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Faixa rápida: 1-10, 15, 20-25"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
            />
            <Button size="sm" variant="outline" onClick={applyRange}>
              Adicionar faixa
            </Button>
          </div>

          <div className="flex gap-2 text-xs">
            <Button size="sm" variant="ghost" onClick={selectAll}>
              Selecionar todas
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAll}>
              Limpar
            </Button>
            <Badge variant="secondary" className="ml-auto">
              {selected.size} selecionada(s)
            </Badge>
          </div>

          <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 max-h-[40vh] overflow-y-auto p-2 border rounded">
            {allHouses.map((h) => {
              const isSel = selected.has(h.house_number);
              const otherType = h.unit_type_id && h.unit_type_id !== unitType.id;
              return (
                <button
                  type="button"
                  key={h.id}
                  onClick={() => toggle(h.house_number)}
                  className={`relative h-9 rounded border text-xs font-medium transition-colors ${
                    isSel
                      ? "bg-primary text-primary-foreground border-primary"
                      : otherType
                        ? "bg-amber-100 dark:bg-amber-900/30 border-amber-300 text-amber-900 dark:text-amber-100"
                        : "bg-background hover:bg-muted"
                  }`}
                  title={otherType ? "Vinculada a outra tipologia" : ""}
                >
                  {h.house_number}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onAssign(Array.from(selected))}>Salvar vínculos</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
