import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Save, Edit2, X, Building2, MapPin, FileText, User, Calculator, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { usePleData } from "@/hooks/usePleData";
import type { PleProject } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

const BRAZILIAN_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const CONTRACT_TYPES = [
  "Empreitada Global",
  "Empreitada por Preço Unitário",
  "Tarefa",
  "Empreitada Integral",
  "Administração",
];

export function PleContractInfoTab(props: PleDataReturn) {
  const { currentProject, updateProject } = props;
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Partial<PleProject>>({});
  const [showChangeAlert, setShowChangeAlert] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<{ field: string; oldValue: any; newValue: any }[]>([]);
  const originalRef = useRef<Partial<PleProject>>({});

  useEffect(() => {
    if (currentProject) {
      const copy = { ...currentProject };
      setForm(copy);
      originalRef.current = copy;
    }
  }, [currentProject]);

  if (!currentProject) return null;

  const criticalFields: (keyof PleProject)[] = ["total_houses", "contract_value", "unit_value", "bdi_percentage"];

  const fieldLabels: Record<string, string> = {
    total_houses: "Quantidade de Casas",
    contract_value: "Valor Global do Contrato",
    unit_value: "Valor Unitário por UH",
    bdi_percentage: "BDI do Orçamento",
  };

  const fmtValue = (field: string, val: any) => {
    if (val == null || val === "") return "Não informado";
    if (field === "contract_value" || field === "unit_value")
      return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (field === "bdi_percentage") return `${val}%`;
    return String(val);
  };

  const handleSave = async () => {
    // Check for critical field changes
    const changes: { field: string; oldValue: any; newValue: any }[] = [];
    for (const f of criticalFields) {
      const oldVal = originalRef.current[f];
      const newVal = form[f];
      if (oldVal !== newVal && (oldVal || newVal)) {
        changes.push({ field: f, oldValue: oldVal, newValue: newVal });
      }
    }

    if (changes.length > 0) {
      setPendingChanges(changes);
      setShowChangeAlert(true);
      return;
    }

    await doSave();
  };

  const doSave = async () => {
    const { id: _id, company_id: _cid, created_at: _ca, ...rest } = form as any;
    await updateProject(currentProject.id, rest);
    originalRef.current = { ...form };
    setIsEditing(false);
    toast.success("Informações do contrato salvas com sucesso");
  };

  const handleConfirmCriticalChanges = async () => {
    setShowChangeAlert(false);
    await doSave();
    toast.info("Dados críticos alterados — medições, grades e fórmulas foram atualizados automaticamente.");
  };

  const update = (field: keyof PleProject, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const Field = ({ label, field, type = "text", placeholder = "", icon: Icon }: {
    label: string; field: keyof PleProject; type?: string; placeholder?: string; icon?: any;
  }) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </Label>
      {isEditing ? (
        <Input
          type={type}
          value={(form[field] as string | number) ?? ""}
          onChange={e => update(field, type === "number" ? Number(e.target.value) : e.target.value)}
          placeholder={placeholder}
          className="h-9 text-sm"
        />
      ) : (
        <p className="text-sm font-medium min-h-[36px] flex items-center px-3 py-2 rounded-md bg-muted/50">
          {(currentProject[field] as string | number) || <span className="text-muted-foreground italic">Não informado</span>}
        </p>
      )}
    </div>
  );

  return (
    <>
      <ScrollArea className="h-full">
        <div className="space-y-3 sm:space-y-4 p-0.5 sm:p-1">
          {/* Actions */}
          <div className="flex justify-end gap-1.5 sm:gap-2">
            {isEditing ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => { setForm({ ...currentProject }); setIsEditing(false); }} className="h-7 sm:h-9 text-xs sm:text-sm">
                  <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" /> Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} className="h-7 sm:h-9 text-xs sm:text-sm">
                  <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" /> Salvar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="h-7 sm:h-9 text-xs sm:text-sm">
                <Edit2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" /> Editar
              </Button>
            )}
          </div>

          {/* Dados do Contrato */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Dados do Contrato
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Nome da Obra" field="name" placeholder="Ex: Residencial Vista Alegre" icon={Building2} />
              <Field label="Localização" field="location" placeholder="Ex: Cidade / UF" icon={MapPin} />
              <Field label="Número do Contrato" field="contract_number" placeholder="Ex: CT-2026/001" icon={FileText} />
              {isEditing ? (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Regime de Contratação</Label>
                  <Select value={form.contract_type ?? ""} onValueChange={v => update("contract_type", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Field label="Regime de Contratação" field="contract_type" />
              )}
              <Field label="Programa / Convênio" field="program" placeholder="Ex: Minha Casa Minha Vida" />
              <Field label="Fonte de Recurso" field="funding_source" placeholder="Ex: FGTS / FAR" />
              <Field label="CNPJ da Contratante" field="cnpj" placeholder="XX.XXX.XXX/XXXX-XX" />
            </CardContent>
          </Card>

          {/* Valores */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                Valores e Quantitativos
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Valor Global do Contrato (R$)" field="contract_value" type="number" placeholder="0,00" />
              <Field label="Valor Unitário por UH (R$)" field="unit_value" type="number" placeholder="0,00" />
              <Field label="Quantidade de Casas" field="total_houses" type="number" placeholder="0" />
              <Field label="BDI do Orçamento (%)" field="bdi_percentage" type="number" placeholder="0" />
              <Field label="Nº ART / RRT" field="art_rrt_number" placeholder="Ex: 123456789" />
            </CardContent>
          </Card>

          {/* Responsáveis */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Responsáveis
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Empresa Executora" field="executor_company" placeholder="Nome da construtora" icon={Building2} />
              <Field label="Contratante (Órgão)" field="contractor" placeholder="Prefeitura, CDHU, etc." />
              <Field label="Engenheiro / Arquiteto Responsável" field="responsible_engineer" placeholder="Nome completo" />
              <Field label="Fiscal da Obra" field="inspector_name" placeholder="Nome do fiscal" />
            </CardContent>
          </Card>

          {/* Datas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Datas
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Data de Assinatura" field="contract_sign_date" type="date" />
              <Field label="Data de Início" field="start_date" type="date" />
              <Field label="Data de Término Prevista" field="contract_end_date" type="date" />
            </CardContent>
          </Card>

          {/* Endereço */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Endereço da Obra
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Field label="Logradouro" field="address_street" placeholder="Rua, Avenida..." />
              </div>
              <Field label="Número" field="address_number" placeholder="S/N" />
              <Field label="Bairro" field="address_neighborhood" placeholder="Bairro" />
              <Field label="Cidade" field="address_city" placeholder="Cidade" />
              {isEditing ? (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Estado (UF)</Label>
                  <Select value={form.address_state ?? ""} onValueChange={v => update("address_state", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
                    <SelectContent>
                      {BRAZILIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Field label="Estado (UF)" field="address_state" />
              )}
              <Field label="CEP" field="address_zip" placeholder="00000-000" />
            </CardContent>
          </Card>

          {/* Observações */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Observações Gerais</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={form.notes ?? ""}
                  onChange={e => update("notes", e.target.value)}
                  placeholder="Anotações adicionais sobre o contrato..."
                  rows={4}
                />
              ) : (
                <p className="text-sm min-h-[80px] p-3 rounded-md bg-muted/50 whitespace-pre-wrap">
                  {currentProject.notes || <span className="text-muted-foreground italic">Nenhuma observação registrada</span>}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Critical Changes Confirmation Dialog */}
      <AlertDialog open={showChangeAlert} onOpenChange={setShowChangeAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Alteração de Dados Críticos
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Você está alterando dados que impactam diretamente as medições, grade de lançamento, fórmulas e coeficientes do projeto:</p>
                <div className="space-y-2 rounded-md border p-3 bg-muted/50">
                  {pendingChanges.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{fieldLabels[c.field] || c.field}</span>
                      <span>
                        <span className="text-destructive line-through mr-2">{fmtValue(c.field, c.oldValue)}</span>
                        →
                        <span className="text-green-600 ml-2 font-semibold">{fmtValue(c.field, c.newValue)}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Esta ação atualizará automaticamente todos os cálculos derivados. Confirme para prosseguir.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCriticalChanges} className="bg-amber-600 hover:bg-amber-700">
              Confirmar Alteração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
