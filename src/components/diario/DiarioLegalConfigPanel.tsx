import { useEffect, useMemo, useState } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCoordenadorAccess } from "@/hooks/useCoordenadorAccess";
import {
  useDiaryLegalConfig,
  DiaryLegalConfig,
} from "@/hooks/useDiaryLegalConfig";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileSignature, Save, Loader2, Building2, FileText,
  ScrollText, UserCheck, Palette, Info, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** Quando true, oculta o cabeçalho com título — útil quando embutido em uma aba */
  embedded?: boolean;
}

/**
 * Painel completo de configuração legal do Diário/RDO.
 * Pode ser usado como página standalone ou embutido em uma aba do módulo Diário.
 */
export function DiarioLegalConfigPanel({ embedded = false }: Props) {
  const { currentProject } = useConstruction();
  const { company } = useAuth();
  const { canApprove } = useCoordenadorAccess(currentProject?.id);
  const { config, loading, reload } = useDiaryLegalConfig(currentProject?.id);

  const [draft, setDraft] = useState<DiaryLegalConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (config) setDraft(config); }, [config]);

  const dirty = useMemo(() => {
    if (!draft || !config) return false;
    return JSON.stringify(draft) !== JSON.stringify(config);
  }, [draft, config]);

  const update = <K extends keyof DiaryLegalConfig>(key: K, value: DiaryLegalConfig[K]) => {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const prefillFromCompany = async () => {
    if (!company?.id || !draft) return;
    const { data } = await supabase
      .from("companies")
      .select("razao_social, nome_fantasia, name, cnpj, endereco_rua, endereco_numero, endereco_cidade, endereco_estado")
      .eq("id", company.id)
      .maybeSingle();
    if (!data) return;
    const enderecoCompleto = [data.endereco_rua, data.endereco_numero].filter(Boolean).join(", ");
    setDraft({
      ...draft,
      contratada_razao_social: data.razao_social || data.nome_fantasia || data.name || draft.contratada_razao_social,
      contratada_cnpj: data.cnpj || draft.contratada_cnpj,
      contratada_endereco: enderecoCompleto || draft.contratada_endereco,
      contratada_municipio: data.endereco_cidade || draft.contratada_municipio,
      contratada_estado: data.endereco_estado || draft.contratada_estado,
    });
    toast.success("Dados da contratada preenchidos a partir do cadastro da empresa.");
  };

  const handleSave = async () => {
    if (!draft || !currentProject?.id) return;
    if (!canApprove) {
      toast.error("Apenas administrador ou coordenador pode salvar.");
      return;
    }
    setSaving(true);
    try {
      const { data: existing } = await (supabase as any)
        .from("diary_legal_config").select("id")
        .eq("project_id", currentProject.id).maybeSingle();

      const payload: any = {
        ...draft,
        project_id: currentProject.id,
        company_id: company?.id,
        updated_by: (await supabase.auth.getUser()).data.user?.id,
      };
      delete payload.id;

      if (existing?.id) {
        const { error } = await (supabase as any)
          .from("diary_legal_config").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        payload.created_by = payload.updated_by;
        const { error } = await (supabase as any)
          .from("diary_legal_config").insert(payload);
        if (error) throw error;
      }
      toast.success("Documentação legal do RDO salva.");
      await reload();
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  if (!currentProject) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>Selecione uma obra para configurar a documentação legal.</AlertDescription>
      </Alert>
    );
  }

  if (loading || !draft) {
    return (
      <div className="py-12 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {!embedded && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10">
              <FileSignature className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Documentação Legal do RDO</h2>
              <p className="text-sm text-muted-foreground">
                {currentProject.name} — Dados jurídicos para o Relatório Diário de Obra
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={!dirty || saving || !canApprove} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      )}

      {!canApprove && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Apenas administrador ou coordenador da obra pode editar esta página.
            Você pode visualizar, mas não salvar alterações.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          O RDO é um <strong>documento de comprovação jurídica</strong> da execução da obra.
          Esta configuração se aplica a <strong>toda a obra</strong> e aparece automaticamente em
          todos os relatórios diários e no PDF oficial. Imprescindível em contratos públicos
          (NBR 12.722, Lei 14.133/21).
        </AlertDescription>
      </Alert>

      {/* ── Contratante ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Building2 className="h-5 w-5 text-primary" />
            Contratante (Cliente / Órgão)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={draft.contratante_tipo} onValueChange={v => update("contratante_tipo", v as any)} disabled={!canApprove}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="publico">Público</SelectItem>
                  <SelectItem value="privado">Privado</SelectItem>
                  <SelectItem value="misto">Misto / PPP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Nome / Razão Social</Label>
              <Input value={draft.contratante_nome || ""} onChange={e => update("contratante_nome", e.target.value)} placeholder="Ex.: Município de São Paulo" disabled={!canApprove} />
            </div>
            <div className="space-y-2">
              <Label>CNPJ / CPF</Label>
              <Input value={draft.contratante_cnpj_cpf || ""} onChange={e => update("contratante_cnpj_cpf", e.target.value)} placeholder="00.000.000/0000-00" disabled={!canApprove} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Órgão / Secretaria</Label>
              <Input value={draft.contratante_orgao || ""} onChange={e => update("contratante_orgao", e.target.value)} placeholder="Ex.: Secretaria Municipal de Habitação" disabled={!canApprove} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Endereço</Label>
              <Input value={draft.contratante_endereco || ""} onChange={e => update("contratante_endereco", e.target.value)} disabled={!canApprove} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Município</Label>
              <Input value={draft.contratante_municipio || ""} onChange={e => update("contratante_municipio", e.target.value)} disabled={!canApprove} />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Input maxLength={2} value={draft.contratante_estado || ""} onChange={e => update("contratante_estado", e.target.value.toUpperCase())} disabled={!canApprove} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Contratada ── */}
      <Card>
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Building2 className="h-5 w-5 text-primary" />
            Contratada (Empresa Executora)
          </CardTitle>
          <Button variant="outline" size="sm" onClick={prefillFromCompany} disabled={!canApprove} className="self-start sm:self-auto">
            Pré-preencher do cadastro da empresa
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Razão Social *</Label>
              <Input value={draft.contratada_razao_social || ""} onChange={e => update("contratada_razao_social", e.target.value)} disabled={!canApprove} />
            </div>
            <div className="space-y-2">
              <Label>CNPJ *</Label>
              <Input value={draft.contratada_cnpj || ""} onChange={e => update("contratada_cnpj", e.target.value)} disabled={!canApprove} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Endereço</Label>
              <Input value={draft.contratada_endereco || ""} onChange={e => update("contratada_endereco", e.target.value)} disabled={!canApprove} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Município</Label>
              <Input value={draft.contratada_municipio || ""} onChange={e => update("contratada_municipio", e.target.value)} disabled={!canApprove} />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Input maxLength={2} value={draft.contratada_estado || ""} onChange={e => update("contratada_estado", e.target.value.toUpperCase())} disabled={!canApprove} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Contrato ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <ScrollText className="h-5 w-5 text-primary" />
            Contrato
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Nº do Contrato *</Label>
              <Input value={draft.contrato_numero || ""} onChange={e => update("contrato_numero", e.target.value)} placeholder="Ex.: CT-012/2024" disabled={!canApprove} />
            </div>
            <div className="space-y-2">
              <Label>Data de Assinatura</Label>
              <Input type="date" value={draft.contrato_data_assinatura || ""} onChange={e => update("contrato_data_assinatura", e.target.value || null)} disabled={!canApprove} />
            </div>
            <div className="space-y-2">
              <Label>Prazo (dias)</Label>
              <Input type="number" value={draft.contrato_prazo_dias ?? ""} onChange={e => update("contrato_prazo_dias", e.target.value ? Number(e.target.value) : null)} disabled={!canApprove} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Objeto do Contrato</Label>
              <Textarea rows={2} value={draft.contrato_objeto || ""} onChange={e => update("contrato_objeto", e.target.value)} placeholder="Ex.: Construção de 70 unidades habitacionais no Loteamento X" disabled={!canApprove} />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={draft.contrato_valor ?? ""} onChange={e => update("contrato_valor", e.target.value ? Number(e.target.value) : null)} disabled={!canApprove} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Modalidade Licitatória</Label>
              <Input value={draft.contrato_modalidade || ""} onChange={e => update("contrato_modalidade", e.target.value)} placeholder="Ex.: Pregão Eletrônico, Concorrência, Dispensa, Contratação Direta" disabled={!canApprove} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Processo Licitatório / Administrativo</Label>
              <Input value={draft.processo_licitatorio || ""} onChange={e => update("processo_licitatorio", e.target.value)} placeholder="Ex.: Processo nº 2024.001.0001234" disabled={!canApprove} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Responsável Técnico ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <UserCheck className="h-5 w-5 text-primary" />
            Responsável Técnico
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Nome</Label>
              <Input value={draft.responsavel_tecnico_nome || ""} onChange={e => update("responsavel_tecnico_nome", e.target.value)} placeholder="Engenheiro responsável pela obra" disabled={!canApprove} />
            </div>
            <div className="space-y-2">
              <Label>CREA / CAU / CFT</Label>
              <Input value={draft.responsavel_tecnico_crea || ""} onChange={e => update("responsavel_tecnico_crea", e.target.value)} placeholder="Ex.: CREA-SP 0123456" disabled={!canApprove} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Nº ART / RRT / TRT</Label>
              <Input value={draft.responsavel_tecnico_art || ""} onChange={e => update("responsavel_tecnico_art", e.target.value)} placeholder="Anotação de Responsabilidade Técnica" disabled={!canApprove} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Template do PDF ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Palette className="h-5 w-5 text-primary" />
            Template do PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={draft.pdf_template} onValueChange={v => update("pdf_template", v as any)} disabled={!canApprove} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className={`flex flex-col gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors ${draft.pdf_template === "orgao_publico" ? "border-primary bg-primary/5" : "border-border"}`}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="orgao_publico" />
                <span className="font-semibold">Órgão Público (Formal)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Cabeçalho institucional com logos lado a lado, fonte serifada,
                tabelas com bordas, rodapé com nº processo. Ideal para fiscalização.
              </p>
            </label>
            <label className={`flex flex-col gap-2 p-4 rounded-lg border-2 cursor-pointer transition-colors ${draft.pdf_template === "corporativo_moderno" ? "border-primary bg-primary/5" : "border-border"}`}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="corporativo_moderno" />
                <span className="font-semibold">Corporativo Moderno</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Faixa colorida, tipografia sans-serif elegante, cards de KPI,
                galeria de fotos em grid. Para reportes internos / privados.
              </p>
            </label>
          </RadioGroup>

          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Observações de Rodapé (opcional)
            </Label>
            <Textarea rows={3} value={draft.rodape_observacoes || ""} onChange={e => update("rodape_observacoes", e.target.value)} placeholder="Texto livre para rodapé do RDO (ex.: cláusulas contratuais relevantes)" disabled={!canApprove} />
          </div>
        </CardContent>
      </Card>

      {/* Footer salvar fixo */}
      <div className="sticky bottom-0 left-0 right-0 -mx-1 sm:mx-0 bg-background/95 backdrop-blur border-t p-3 flex justify-end z-10">
        <Button onClick={handleSave} disabled={!dirty || saving || !canApprove} size="lg" className="gap-2 w-full sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Documentação Legal
        </Button>
      </div>
    </div>
  );
}
