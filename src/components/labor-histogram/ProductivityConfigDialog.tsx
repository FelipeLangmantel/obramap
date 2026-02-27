import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Plus, Trash2, Save, Calculator } from "lucide-react";

interface TeamMember {
  role: string;
  quantity: number;
  unit: "profissional" | "auxiliar";
}

const COMMON_ROLES = [
  "Pedreiro",
  "Servente",
  "Carpinteiro",
  "Armador",
  "Eletricista",
  "Encanador",
  "Azulejista",
  "Pintor",
  "Gesseiro",
  "Telhadista",
];

interface ProductivityConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  service: {
    macro_id: string;
    scope_id: string;
    macro_name: string;
    scope_name: string;
  };
  onSaved?: () => void;
}

export function ProductivityConfigDialog({
  open,
  onOpenChange,
  companyId,
  service,
  onSaved,
}: ProductivityConfigDialogProps) {
  const [existingId, setExistingId] = useState<string | null>(null);
  const [productivityType, setProductivityType] = useState("casa_por_dia");
  const [baseProductivity, setBaseProductivity] = useState(1.0);
  const [teamComposition, setTeamComposition] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);

  const [newRole, setNewRole] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newUnit, setNewUnit] = useState<"profissional" | "auxiliar">("profissional");

  useEffect(() => {
    if (open) loadProductivity();
  }, [open]);

  const loadProductivity = async () => {
    const { data } = await supabase
      .from("service_productivities")
      .select("*")
      .eq("company_id", companyId)
      .eq("macro_id", service.macro_id)
      .eq("scope_id", service.scope_id)
      .maybeSingle();

    if (data) {
      setExistingId(data.id);
      setProductivityType(data.productivity_type);
      setBaseProductivity(Number(data.base_productivity));
      setTeamComposition((data.team_composition as any) || []);
    } else {
      setExistingId(null);
      setProductivityType("casa_por_dia");
      setBaseProductivity(1.0);
      setTeamComposition([]);
    }
  };

  const addMember = () => {
    if (!newRole) {
      toast.error("Selecione uma função");
      return;
    }
    setTeamComposition((prev) => [
      ...prev,
      { role: newRole, quantity: newQty, unit: newUnit },
    ]);
    setNewRole("");
    setNewQty(1);
  };

  const removeMember = (idx: number) => {
    setTeamComposition((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!teamComposition.length) {
      toast.error("Adicione pelo menos um membro à equipe");
      return;
    }
    setSaving(true);
    const payload = {
      company_id: companyId,
      macro_id: service.macro_id,
      scope_id: service.scope_id,
      macro_name: service.macro_name,
      scope_name: service.scope_name,
      productivity_type: productivityType,
      base_productivity: baseProductivity,
      team_composition: teamComposition as any,
    };

    const { error } = existingId
      ? await supabase.from("service_productivities").update(payload).eq("id", existingId)
      : await supabase.from("service_productivities").insert(payload);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Produtividade configurada!");
    onSaved?.();
    onOpenChange(false);
  };

  // Example calculation
  const exampleHouses = 10;
  const days =
    productivityType === "casa_por_dia"
      ? Math.ceil(exampleHouses / Math.max(baseProductivity, 0.01))
      : Math.ceil(exampleHouses * baseProductivity);

  const totalProfs = teamComposition
    .filter((m) => m.unit === "profissional")
    .reduce((s, m) => s + m.quantity, 0);
  const totalHelpers = teamComposition
    .filter((m) => m.unit === "auxiliar")
    .reduce((s, m) => s + m.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Produtividade — {service.scope_name}
          </DialogTitle>
          <DialogDescription>
            Configure produtividade e composição de equipe para este serviço
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Productivity */}
          <div className="space-y-3 rounded-lg border p-4">
            <h4 className="font-semibold text-sm">Produtividade Base</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={productivityType} onValueChange={setProductivityType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casa_por_dia">Casas/Dia</SelectItem>
                    <SelectItem value="dias_por_casa">Dias/Casa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {productivityType === "casa_por_dia" ? "Casas/Dia" : "Dias/Casa"}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0.01}
                  value={baseProductivity}
                  onChange={(e) => setBaseProductivity(parseFloat(e.target.value) || 1)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              <Calculator className="h-3.5 w-3.5" />
              <span>Exemplo ({exampleHouses} casas): <strong className="text-foreground">{days} dias</strong></span>
            </div>
          </div>

          {/* Team */}
          <div className="space-y-3 rounded-lg border p-4">
            <h4 className="font-semibold text-sm">Composição da Equipe</h4>

            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Função</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {COMMON_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-16 space-y-1">
                <Label className="text-xs">Qtd</Label>
                <Input
                  type="number"
                  min={1}
                  value={newQty}
                  onChange={(e) => setNewQty(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={newUnit} onValueChange={(v) => setNewUnit(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profissional">Profissional</SelectItem>
                    <SelectItem value="auxiliar">Auxiliar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="icon" variant="outline" onClick={addMember} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {teamComposition.length > 0 && (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Função</TableHead>
                      <TableHead className="text-xs text-center">Qtd</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamComposition.map((m, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm py-1.5">{m.role}</TableCell>
                        <TableCell className="text-sm text-center py-1.5">{m.quantity}</TableCell>
                        <TableCell className="py-1.5">
                          <Badge variant="outline" className="text-xs">
                            {m.unit === "profissional" ? "Prof." : "Aux."}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeMember(idx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex gap-3 text-xs">
                  <Badge variant="secondary">{totalProfs} profissionais</Badge>
                  <Badge variant="outline">{totalHelpers} auxiliares</Badge>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
