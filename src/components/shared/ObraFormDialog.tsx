import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface UnlinkedObra {
  id: string;
  nome: string;
  empresa: string | null;
  municipio: string | null;
  estado: string | null;
  uh: number | null;
  data_inicio: string | null;
  prazo_dias: number | null;
  tipo_contrato: string | null;
}

interface ObraFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (obraId: string, projectId?: string) => void;
}

const STATUS_OPTIONS = [
  { value: "nao_iniciada", label: "Não Iniciada" },
  { value: "em_andamento", label: "Em Andamento" },
  { value: "paralisada", label: "Paralisada" },
  { value: "concluida", label: "Concluída" },
];

const PERIODOS = [
  "Mensal",
  "Quinzenal",
  "Semanal",
  "Por Etapa",
];

const PRAZOS_PAGAMENTO = ["7 dias", "15 dias", "30 dias", "45 dias", "60 dias"];

const initialForm = {
  nome: "",
  empresa: "",
  num_contrato: "",
  parceria_scp: "",
  valor_contrato: "",
  data_inicio: "",
  prazo_dias: "",
  status: "nao_iniciada",
  periodo_medicao: "",
  prazo_pagamento: "",
  municipio: "",
  estado: "RS",
  uh: "",
  tipo_contrato: "",
  responsavel_nome: "",
  responsavel_telefone: "",
  coordenador_nome: "",
  coordenador_telefone: "",
  planejador_nome: "",
  planejador_telefone: "",
};

export function ObraFormDialog({ open, onOpenChange, onSaved }: ObraFormDialogProps) {
  const { company, isCompanyAdmin, isSystemAdmin, canEdit, requireEdit } = useAuth();
  const { addProject, setCurrentProject } = useConstruction();
  const allowed = canEdit;

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [contractTypes, setContractTypes] = useState<{ id: string; nome: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Modo: criar nova obra OU vincular obra existente do Painel
  const [mode, setMode] = useState<"new" | "link">("new");
  const [unlinkedObras, setUnlinkedObras] = useState<UnlinkedObra[]>([]);
  const [selectedObraId, setSelectedObraId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setForm(initialForm);
    setErrors({});
    setMode("new");
    setSelectedObraId("");
    if (company?.id) {
      supabase
        .from("company_contract_types" as any)
        .select("id, nome")
        .eq("company_id", company.id)
        .eq("ativo", true)
        .order("nome")
        .then(({ data }) => setContractTypes((data as any[]) || []));
      // Obras do Painel ainda não vinculadas — base do modo "linkar existente"
      supabase
        .from("obras_portfolio")
        .select("id, nome, empresa, municipio, estado, uh, data_inicio, prazo_dias, tipo_contrato")
        .eq("company_id", company.id)
        .is("obramap_project_id", null)
        .order("nome")
        .then(({ data }) => setUnlinkedObras((data as any[]) || []));
    }
    // System admin pode escolher empresa; normal usa a sua
    if (isSystemAdmin) {
      supabase.from("companies").select("id, name").order("name").then(({ data }) => {
        setCompanies((data as any[]) || []);
      });
    } else if (company?.id) {
      setCompanies([{ id: company.id, name: company.name }]);
      setForm((f) => ({ ...f, empresa: company.name || "" }));
    }
  }, [open, company?.id, company?.name, isSystemAdmin]);

  const selectedObra = useMemo(
    () => unlinkedObras.find((o) => o.id === selectedObraId) || null,
    [unlinkedObras, selectedObraId]
  );

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Nome é obrigatório";
    if (!form.empresa.trim()) e.empresa = "Empresa é obrigatória";
    if (!form.num_contrato.trim()) e.num_contrato = "Nº Contrato é obrigatório";
    if (!form.data_inicio) e.data_inicio = "Data Início é obrigatória";
    if (!form.prazo_dias || Number(form.prazo_dias) <= 0) e.prazo_dias = "Prazo deve ser > 0";
    if (!form.municipio.trim()) e.municipio = "Município é obrigatório";
    if (!form.estado.trim()) e.estado = "Estado é obrigatório";
    if (!form.uh || Number(form.uh) <= 0) e.uh = "UH deve ser > 0";
    if (!form.periodo_medicao.trim()) e.periodo_medicao = "Período de Medição é obrigatório";
    if (!form.prazo_pagamento.trim()) e.prazo_pagamento = "Prazo de Pagamento é obrigatório";
    if (!form.tipo_contrato) e.tipo_contrato = "Tipo de Contrato é obrigatório";
    if (!form.responsavel_nome.trim()) e.responsavel_nome = "Eng. Residente é obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Cria APENAS um projeto operacional no ObraMap e amarra a uma obra
  // já existente no Painel de Obras (obras_portfolio).
  const handleLinkExisting = async () => {
    if (!requireEdit()) return;
    if (!company?.id) return;
    if (!selectedObra) {
      toast.error("Selecione uma obra do Painel.");
      return;
    }
    setSaving(true);
    try {
      const projectId = await addProject({
        name: selectedObra.nome,
        location: `${selectedObra.municipio || ""} - ${selectedObra.estado || ""}`.trim(),
        contractor: selectedObra.empresa || "",
        startDate: selectedObra.data_inicio || "",
        expectedEndDate: "",
        totalHouses: Number(selectedObra.uh) || 0,
        unitSize: 45,
        projectType: selectedObra.tipo_contrato || "Residencial Popular",
      });
      if (!projectId) throw new Error("Falha ao criar projeto ObraMap");

      const { error: linkErr } = await supabase
        .from("obras_portfolio")
        .update({ obramap_project_id: projectId } as any)
        .eq("id", selectedObra.id);
      if (linkErr) throw linkErr;

      await setCurrentProject(projectId);
      toast.success(`Obra "${selectedObra.nome}" vinculada ao ObraMap!`);
      onOpenChange(false);
      onSaved?.(selectedObra.id, projectId);
    } catch (e: any) {
      toast.error("Erro ao vincular obra: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!requireEdit()) return;
    if (!company?.id) return;
    if (!validate()) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        company_id: company.id,
        nome: form.nome.trim(),
        empresa: form.empresa || null,
        num_contrato: form.num_contrato || null,
        parceria_scp: form.parceria_scp || null,
        valor_contrato: Number(form.valor_contrato) || 0,
        data_inicio: form.data_inicio || null,
        prazo_dias: Number(form.prazo_dias) || 0,
        status: form.status,
        percentual_andamento: 0,
        periodo_medicao: form.periodo_medicao || null,
        prazo_pagamento: form.prazo_pagamento || null,
        municipio: form.municipio || null,
        estado: form.estado || "RS",
        uh: Number(form.uh) || null,
        tipo_contrato: form.tipo_contrato || null,
        responsavel_nome: form.responsavel_nome || null,
        responsavel_telefone: form.responsavel_telefone?.replace(/\D/g, "") || null,
        responsavel: [form.responsavel_nome, form.responsavel_telefone].filter(Boolean).join(" - ") || null,
        coordenador_nome: form.coordenador_nome || null,
        coordenador_telefone: form.coordenador_telefone?.replace(/\D/g, "") || null,
        planejador_nome: form.planejador_nome || null,
        planejador_telefone: form.planejador_telefone?.replace(/\D/g, "") || null,
      };

      // 1) Criar obra no portfolio (Holding)
      const { data: obra, error: errObra } = await supabase
        .from("obras_portfolio")
        .insert(payload)
        .select("id")
        .single();
      if (errObra || !obra) {
        toast.error("Erro ao cadastrar obra: " + (errObra?.message || ""));
        return;
      }

      // 2) Criar também o projeto operacional (mapa, produção etc.)
      let projectId: string | undefined;
      try {
        projectId = await addProject({
          name: form.nome.trim(),
          location: `${form.municipio} - ${form.estado}`,
          contractor: form.empresa,
          startDate: form.data_inicio,
          expectedEndDate: "",
          totalHouses: Number(form.uh) || 0,
          unitSize: 45,
          projectType: form.tipo_contrato || "Residencial Popular",
        });
        if (projectId) {
          // 3) Vincular obra portfolio ao projeto
          await supabase
            .from("obras_portfolio")
            .update({ obramap_project_id: projectId } as any)
            .eq("id", obra.id);
          await setCurrentProject(projectId);
        }
      } catch (e) {
        // Não bloqueia se a criação do projects falhar
        console.warn("[ObraFormDialog] project creation skipped:", e);
      }

      toast.success("Obra cadastrada com sucesso!");
      onOpenChange(false);
      onSaved?.(obra.id, projectId);
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k] && <p className="text-[11px] text-destructive mt-0.5">{errors[k]}</p>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Cadastrar Nova Obra
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Seletor de modo: Nova obra OU vincular existente */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as "new" | "link")}
              className="grid grid-cols-1 md:grid-cols-2 gap-2"
            >
              <label
                className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer transition-colors ${
                  mode === "new" ? "border-primary bg-primary/5" : "border-border bg-background"
                }`}
              >
                <RadioGroupItem value="new" className="mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> Cadastrar nova obra
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Cria a obra no Painel e no ObraMap simultaneamente.
                  </div>
                </div>
              </label>
              <label
                className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer transition-colors ${
                  mode === "link" ? "border-primary bg-primary/5" : "border-border bg-background"
                } ${unlinkedObras.length === 0 ? "opacity-50" : ""}`}
              >
                <RadioGroupItem value="link" className="mt-0.5" disabled={unlinkedObras.length === 0} />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" /> Vincular obra do Painel
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {unlinkedObras.length > 0
                      ? `${unlinkedObras.length} obra(s) do painel sem ObraMap.`
                      : "Nenhuma obra pendente no painel."}
                  </div>
                </div>
              </label>
            </RadioGroup>

            {mode === "link" && (
              <div className="space-y-2">
                <Label>Obra do Painel *</Label>
                <Select value={selectedObraId} onValueChange={setSelectedObraId} disabled={!allowed}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha uma obra já cadastrada..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedObras.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome} {o.municipio ? `— ${o.municipio}/${o.estado}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedObra && (
                  <div className="text-[11px] text-muted-foreground bg-background rounded p-2 border">
                    <strong>{selectedObra.nome}</strong> • {selectedObra.empresa} •{" "}
                    {selectedObra.municipio}/{selectedObra.estado} • {selectedObra.uh ?? "?"} UH
                    <br />
                    Ao confirmar, será criado um projeto operacional no ObraMap (mapa,
                    diários, produção) vinculado a esta obra.
                  </div>
                )}
              </div>
            )}
          </div>

          {mode === "new" && (
          <>
          {/* Identificação */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground/80">Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Nome do Empreendimento *</Label>
                <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} disabled={!allowed} />
                {err("nome")}
              </div>
              <div>
                <Label>Empresa *</Label>
                {isSystemAdmin ? (
                  <Select value={form.empresa} onValueChange={(v) => set("empresa", v)} disabled={!allowed}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.empresa} onChange={(e) => set("empresa", e.target.value)} disabled={!allowed} />
                )}
                {err("empresa")}
              </div>
              <div>
                <Label>Nº Contrato *</Label>
                <Input value={form.num_contrato} onChange={(e) => set("num_contrato", e.target.value)} disabled={!allowed} />
                {err("num_contrato")}
              </div>
              <div>
                <Label>Parceria SCP</Label>
                <Input value={form.parceria_scp} onChange={(e) => set("parceria_scp", e.target.value)} disabled={!allowed} />
              </div>
              <div>
                <Label>Tipo de Contrato *</Label>
                <Select value={form.tipo_contrato} onValueChange={(v) => set("tipo_contrato", v)} disabled={!allowed}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {contractTypes.map((t) => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {err("tipo_contrato")}
              </div>
              <div>
                <Label>Status *</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)} disabled={!allowed}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Financeiro & Prazos */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground/80">Financeiro & Prazos</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Valor Contrato (R$)</Label>
                <Input type="number" step="0.01" value={form.valor_contrato} onChange={(e) => set("valor_contrato", e.target.value)} disabled={!allowed} />
              </div>
              <div>
                <Label>Data Início *</Label>
                <Input type="date" value={form.data_inicio} onChange={(e) => set("data_inicio", e.target.value)} disabled={!allowed} />
                {err("data_inicio")}
              </div>
              <div>
                <Label>Prazo (dias) *</Label>
                <Input type="number" value={form.prazo_dias} onChange={(e) => set("prazo_dias", e.target.value)} disabled={!allowed} />
                {err("prazo_dias")}
              </div>
              <div>
                <Label>Período Medição *</Label>
                <Select value={form.periodo_medicao} onValueChange={(v) => set("periodo_medicao", v)} disabled={!allowed}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {PERIODOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                {err("periodo_medicao")}
              </div>
              <div>
                <Label>Prazo Pagamento *</Label>
                <Select value={form.prazo_pagamento} onValueChange={(v) => set("prazo_pagamento", v)} disabled={!allowed}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {PRAZOS_PAGAMENTO.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
                {err("prazo_pagamento")}
              </div>
            </div>
          </div>

          {/* Localização */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground/80">Localização</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Município *</Label>
                <Input value={form.municipio} onChange={(e) => set("municipio", e.target.value)} disabled={!allowed} />
                {err("municipio")}
              </div>
              <div>
                <Label>Estado (UF) *</Label>
                <Input maxLength={2} value={form.estado} onChange={(e) => set("estado", e.target.value.toUpperCase())} disabled={!allowed} />
                {err("estado")}
              </div>
              <div>
                <Label>UH (Unidades) *</Label>
                <Input type="number" value={form.uh} onChange={(e) => set("uh", e.target.value)} disabled={!allowed} />
                {err("uh")}
              </div>
            </div>
          </div>

          {/* Responsáveis */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground/80">Responsáveis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Eng. Residente *</Label>
                <Input value={form.responsavel_nome} onChange={(e) => set("responsavel_nome", e.target.value)} disabled={!allowed} />
                {err("responsavel_nome")}
              </div>
              <div>
                <Label>Telefone Eng. Residente</Label>
                <Input value={form.responsavel_telefone} onChange={(e) => set("responsavel_telefone", e.target.value)} disabled={!allowed} />
              </div>
              <div>
                <Label>Coordenador</Label>
                <Input value={form.coordenador_nome} onChange={(e) => set("coordenador_nome", e.target.value)} disabled={!allowed} />
              </div>
              <div>
                <Label>Telefone Coordenador</Label>
                <Input value={form.coordenador_telefone} onChange={(e) => set("coordenador_telefone", e.target.value)} disabled={!allowed} />
              </div>
              <div>
                <Label>Planejador</Label>
                <Input value={form.planejador_nome} onChange={(e) => set("planejador_nome", e.target.value)} disabled={!allowed} />
              </div>
              <div>
                <Label>Telefone Planejador</Label>
                <Input value={form.planejador_telefone} onChange={(e) => set("planejador_telefone", e.target.value)} disabled={!allowed} />
              </div>
            </div>
          </div>
          </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {mode === "link" ? (
            <Button
              onClick={handleLinkExisting}
              disabled={!allowed || saving || !selectedObraId}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Vincular ao ObraMap
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!allowed || saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Obra
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ObraFormDialog;
