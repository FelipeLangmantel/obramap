import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type IfcSuggestionStatus = "suggested" | "confirmed" | "ignored";
type StatusFilter = IfcSuggestionStatus | "all";
type CategoryFilter = "production" | "text_annotation" | "unknown" | "all";

interface IfcSuggestionRow {
  id: string;
  model_id: string;
  ifc_global_id: string | null;
  ifc_entity_id: string | null;
  ifc_type: string | null;
  ifc_layer_name: string | null;
  name: string | null;
  detected_service_key: string | null;
  detected_service_label: string | null;
  detected_house_number: number | null;
  category: string | null;
  confidence: string | null;
  needs_review: boolean | null;
  status: IfcSuggestionStatus;
}

interface IfcModelIdRow {
  id: string;
}

interface ConfirmedIfcElementRow {
  id: string;
  company_id: string;
  project_id: string;
  model_id: string;
  detected_house_number: number | null;
  detected_service_key: string | null;
  detected_service_label: string | null;
}

interface IfcElementLinkRow {
  ifc_element_id: string;
  house_id: string | null;
  house_number: number | null;
  trigger_service_key: string;
}

interface HouseLookupRow {
  id?: string | null;
  houseNumber?: number | null;
  house_number?: number | null;
  number?: number | null;
}

interface LinkSyncResult {
  totalConfirmed: number;
  valid: number;
  created: number;
  existing: number;
  ignored: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
  modelUrl?: string | null;
  houses?: HouseLookupRow[];
}

const statusLabels: Record<IfcSuggestionStatus, string> = {
  suggested: "Sugerido",
  confirmed: "Confirmado",
  ignored: "Ignorado",
};

const categoryLabels: Record<string, string> = {
  production: "Produtivo",
  text_annotation: "Texto/anotação",
  unknown: "Desconhecido",
};

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSuggestionStatus(value: unknown): IfcSuggestionStatus {
  return value === "confirmed" || value === "ignored" ? value : "suggested";
}

function asIfcModelIdRow(data: unknown): IfcModelIdRow | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return typeof row.id === "string" ? { id: row.id } : null;
}

function asIfcSuggestionRows(data: unknown): IfcSuggestionRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      id: normalizeNullableString(item.id) || "",
      model_id: normalizeNullableString(item.model_id) || "",
      ifc_global_id: normalizeNullableString(item.ifc_global_id),
      ifc_entity_id: normalizeNullableString(item.ifc_entity_id),
      ifc_type: normalizeNullableString(item.ifc_type),
      ifc_layer_name: normalizeNullableString(item.ifc_layer_name),
      name: normalizeNullableString(item.name),
      detected_service_key: normalizeNullableString(item.detected_service_key),
      detected_service_label: normalizeNullableString(item.detected_service_label),
      detected_house_number: normalizeNullableNumber(item.detected_house_number),
      category: normalizeNullableString(item.category),
      confidence: normalizeNullableString(item.confidence),
      needs_review: typeof item.needs_review === "boolean" ? item.needs_review : null,
      status: normalizeSuggestionStatus(item.status),
    }))
    .filter(item => item.id);
}

function asConfirmedIfcElementRows(data: unknown): ConfirmedIfcElementRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      id: normalizeNullableString(item.id) || "",
      company_id: normalizeNullableString(item.company_id) || "",
      project_id: normalizeNullableString(item.project_id) || "",
      model_id: normalizeNullableString(item.model_id) || "",
      detected_house_number: normalizeNullableNumber(item.detected_house_number),
      detected_service_key: normalizeNullableString(item.detected_service_key),
      detected_service_label: normalizeNullableString(item.detected_service_label),
    }))
    .filter(item => item.id && item.company_id && item.project_id && item.model_id);
}

function asIfcElementLinkRows(data: unknown): IfcElementLinkRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      ifc_element_id: normalizeNullableString(item.ifc_element_id) || "",
      house_id: normalizeNullableString(item.house_id),
      house_number: normalizeNullableNumber(item.house_number),
      trigger_service_key: normalizeNullableString(item.trigger_service_key) || "",
    }))
    .filter(item => item.ifc_element_id && item.trigger_service_key);
}

function buildLinkKey(ifcElementId: string, houseId: string | null, houseNumber: number | null, serviceKey: string) {
  return `${ifcElementId}::${houseId || ""}::${houseNumber ?? ""}::${serviceKey}`;
}

function getHouseNumber(house: HouseLookupRow) {
  const value = house.houseNumber ?? house.house_number ?? house.number;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statusBadgeClass(status: IfcSuggestionStatus) {
  if (status === "confirmed") return "bg-emerald-100 text-emerald-800";
  if (status === "ignored") return "bg-slate-100 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

export function IfcSuggestionsPanel({ open, onOpenChange, projectId, modelUrl, houses = [] }: Props) {
  const [items, setItems] = useState<IfcSuggestionRow[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("suggested");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncingLinks, setSyncingLinks] = useState(false);
  const [linkSyncResult, setLinkSyncResult] = useState<LinkSyncResult | null>(null);

  const houseIdByNumber = useMemo(() => {
    const map = new Map<number, string>();
    houses.forEach(house => {
      const houseNumber = getHouseNumber(house);
      if (houseNumber != null && typeof house.id === "string") map.set(houseNumber, house.id);
    });
    return map;
  }, [houses]);

  const loadSuggestions = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      setModelId(null);
      return;
    }

    setLoading(true);
    try {
      let resolvedModelId: string | null = null;
      const modelTable = supabase.from("project_3d_models" as any) as any;
      const elementsTable = supabase.from("project_ifc_elements" as any) as any;

      if (modelUrl) {
        const { data: modelData, error: modelError } = await modelTable
          .select("id")
          .eq("project_id", projectId)
          .eq("storage_path", modelUrl)
          .eq("model_type", "ifc")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (modelError) throw modelError;
        resolvedModelId = asIfcModelIdRow(modelData as unknown)?.id || null;
      }

      setModelId(resolvedModelId);

      let query = elementsTable
        .select(`
          id,
          model_id,
          ifc_global_id,
          ifc_entity_id,
          ifc_type,
          ifc_layer_name,
          name,
          detected_service_key,
          detected_service_label,
          detected_house_number,
          category,
          confidence,
          needs_review,
          status
        `)
        .eq("project_id", projectId)
        .order("ifc_layer_name", { ascending: true })
        .order("ifc_entity_id", { ascending: true });

      if (resolvedModelId) query = query.eq("model_id", resolvedModelId);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (categoryFilter !== "all") query = query.eq("category", categoryFilter);

      const { data, error } = await query;
      if (error) throw error;
      setItems(asIfcSuggestionRows(data as unknown));
    } catch (err: any) {
      console.error("[IFC] Falha ao carregar sugestões", err);
      toast.error("Falha ao carregar sugestões IFC");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, modelUrl, projectId, statusFilter]);

  useEffect(() => {
    if (!open) return;
    void loadSuggestions();
  }, [loadSuggestions, open]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;

    return items.filter(item => {
      const haystack = [
        item.ifc_layer_name,
        item.ifc_global_id,
        item.ifc_entity_id,
        item.ifc_type,
        item.detected_service_key,
        item.detected_service_label,
        item.detected_house_number != null ? String(item.detected_house_number) : "",
        item.category,
        item.status,
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [items, search]);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "suggested") acc.suggested += 1;
        if (item.status === "confirmed") acc.confirmed += 1;
        if (item.status === "ignored") acc.ignored += 1;
        if (item.needs_review) acc.needsReview += 1;
        return acc;
      },
      { total: 0, suggested: 0, confirmed: 0, ignored: 0, needsReview: 0 }
    );
  }, [items]);

  const updateStatus = async (item: IfcSuggestionRow, status: IfcSuggestionStatus) => {
    setSavingId(item.id);
    if (!projectId) {
      toast.error("Projeto não identificado para atualizar sugestão IFC");
      setSavingId(null);
      return;
    }

    try {
      const updatePayload: Record<string, unknown> = { status };
      if (status === "confirmed") updatePayload.needs_review = false;
      const elementsTable = supabase.from("project_ifc_elements" as any) as any;

      const { error } = await elementsTable
        .update(updatePayload)
        .eq("id", item.id)
        .eq("project_id", projectId);

      if (error) throw error;

      setItems(prev => prev.map(row => (
        row.id === item.id
          ? { ...row, status, needs_review: status === "confirmed" ? false : row.needs_review }
          : row
      )));
      toast.success(`Sugestão marcada como ${statusLabels[status].toLowerCase()}`);
    } catch (err: any) {
      console.error("[IFC] Falha ao atualizar sugestão", err);
      toast.error("Falha ao atualizar sugestão IFC");
    } finally {
      setSavingId(null);
    }
  };

  const syncConfirmedLinks = async () => {
    if (!projectId) {
      toast.error("Projeto não identificado para gerar vínculos IFC");
      return;
    }

    setSyncingLinks(true);
    try {
      const elementsTable = supabase.from("project_ifc_elements" as any) as any;
      const linksTable = supabase.from("project_ifc_element_links" as any) as any;

      let confirmedQuery = elementsTable
        .select(`
          id,
          company_id,
          project_id,
          model_id,
          detected_house_number,
          detected_service_key,
          detected_service_label
        `)
        .eq("project_id", projectId)
        .eq("status", "confirmed")
        .eq("category", "production");

      if (modelId) confirmedQuery = confirmedQuery.eq("model_id", modelId);

      const { data: confirmedData, error: confirmedError } = await confirmedQuery;
      if (confirmedError) throw confirmedError;

      const confirmedElements = asConfirmedIfcElementRows(confirmedData as unknown);
      const validElements = confirmedElements.filter(item => (
        item.detected_house_number != null && !!item.detected_service_key
      ));
      const ignored = confirmedElements.length - validElements.length;

      let existingQuery = linksTable
        .select("ifc_element_id, house_id, house_number, trigger_service_key")
        .eq("project_id", projectId);

      if (modelId) existingQuery = existingQuery.eq("model_id", modelId);

      const { data: existingData, error: existingError } = await existingQuery;
      if (existingError) throw existingError;

      const existingLinks = asIfcElementLinkRows(existingData as unknown);
      const existingKeys = new Set(
        existingLinks.map(link => buildLinkKey(link.ifc_element_id, link.house_id, link.house_number, link.trigger_service_key))
      );
      const rowsToInsert = validElements
        .map(item => {
          const houseId = item.detected_house_number != null ? houseIdByNumber.get(item.detected_house_number) || null : null;
          return { item, houseId };
        })
        .filter(({ item, houseId }) => !existingKeys.has(buildLinkKey(item.id, houseId, item.detected_house_number, item.detected_service_key!)))
        .map(({ item, houseId }) => ({
          company_id: item.company_id,
          project_id: item.project_id,
          model_id: item.model_id,
          ifc_element_id: item.id,
          house_id: houseId,
          house_number: item.detected_house_number,
          trigger_service_key: item.detected_service_key,
          trigger_service_label: item.detected_service_label || item.detected_service_key,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        }));

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await linksTable.insert(rowsToInsert);
        if (insertError) throw insertError;
      }

      const result = {
        totalConfirmed: confirmedElements.length,
        valid: validElements.length,
        created: rowsToInsert.length,
        existing: validElements.length - rowsToInsert.length,
        ignored,
      };
      setLinkSyncResult(result);
      toast.success(`${result.created} vínculo(s) IFC criado(s)`);
    } catch (err: any) {
      console.error("[IFC] Falha ao gerar vínculos confirmados", err);
      toast.error("Falha ao gerar vínculos IFC confirmados");
    } finally {
      setSyncingLinks(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-shrink-0 border-b border-border px-5 py-4">
          <DialogTitle>Sugestões IFC</DialogTitle>
          <DialogDescription>
            Revise sugestões persistidas do inventário IFC. Confirmar aqui não cria vínculo definitivo do 3D Real.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-shrink-0 space-y-3 border-b border-border bg-muted/20 p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-5">
            <Counter label="Total" value={counts.total} />
            <Counter label="Sugeridos" value={counts.suggested} />
            <Counter label="Confirmados" value={counts.confirmed} />
            <Counter label="Ignorados" value={counts.ignored} />
            <Counter label="Revisão" value={counts.needsReview} />
          </div>

          <div className="grid gap-2 md:grid-cols-[180px_220px_1fr_auto_auto]">
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as StatusFilter)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">Todos os status</option>
              <option value="suggested">Sugeridos</option>
              <option value="confirmed">Confirmados</option>
              <option value="ignored">Ignorados</option>
            </select>
            <select
              value={categoryFilter}
              onChange={event => setCategoryFilter(event.target.value as CategoryFilter)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">Todas as categorias</option>
              <option value="production">Produtivo</option>
              <option value="text_annotation">Texto/anotação</option>
              <option value="unknown">Desconhecido</option>
            </select>
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por camada, casa, serviço, GlobalId ou entity id..."
              className="h-9"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void loadSuggestions()} disabled={loading}>
              Atualizar
            </Button>
            <Button type="button" size="sm" onClick={() => void syncConfirmedLinks()} disabled={loading || syncingLinks}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              {syncingLinks ? "Gerando..." : "Gerar vínculos confirmados"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Este vínculo ainda não ativa o 3D Real automaticamente. A ativação será feita em etapa futura.
          </p>
          {linkSyncResult && (
            <div className="grid gap-2 text-xs sm:grid-cols-5">
              <Counter label="Confirmados" value={linkSyncResult.totalConfirmed} />
              <Counter label="Válidos" value={linkSyncResult.valid} />
              <Counter label="Criados" value={linkSyncResult.created} />
              <Counter label="Já existiam" value={linkSyncResult.existing} />
              <Counter label="Ignorados" value={linkSyncResult.ignored} />
            </div>
          )}
          {!modelId && modelUrl && (
            <p className="text-xs text-muted-foreground">
              Modelo IFC persistido ainda não localizado; exibindo sugestões do projeto.
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Carregando sugestões...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma sugestão IFC encontrada.</div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map(item => (
                <SuggestionCard
                  key={item.id}
                  item={item}
                  saving={savingId === item.id}
                  onConfirm={() => updateStatus(item, "confirmed")}
                  onIgnore={() => updateStatus(item, "ignored")}
                  onSuggest={() => updateStatus(item, "suggested")}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
    </div>
  );
}

function SuggestionCard({
  item,
  saving,
  onConfirm,
  onIgnore,
  onSuggest,
}: {
  item: IfcSuggestionRow;
  saving: boolean;
  onConfirm: () => void;
  onIgnore: () => void;
  onSuggest: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="max-w-full truncate text-sm font-semibold">
              {item.ifc_layer_name || item.name || item.ifc_type || "Elemento IFC"}
            </h4>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(item.status)}`}>
              {statusLabels[item.status]}
            </span>
            {item.needs_review && (
              <Badge variant="outline" className="text-[10px]">needs_review</Badge>
            )}
          </div>

          <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
            <p className="truncate"><span className="font-medium text-foreground">GlobalId: </span>{item.ifc_global_id || "-"}</p>
            <p><span className="font-medium text-foreground">Entity: </span>{item.ifc_entity_id || "-"}</p>
            <p><span className="font-medium text-foreground">Tipo: </span>{item.ifc_type || "-"}</p>
            <p><span className="font-medium text-foreground">Categoria: </span>{categoryLabels[item.category || ""] || item.category || "-"}</p>
            <p className="truncate"><span className="font-medium text-foreground">Serviço: </span>{item.detected_service_label || item.detected_service_key || "-"}</p>
            <p><span className="font-medium text-foreground">Casa: </span>{item.detected_house_number ?? "-"}</p>
            <p><span className="font-medium text-foreground">Confiança: </span>{item.confidence || "-"}</p>
            <p className="truncate"><span className="font-medium text-foreground">Nome IFC: </span>{item.name || "-"}</p>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onConfirm} disabled={saving || item.status === "confirmed"}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Confirmar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onIgnore} disabled={saving || item.status === "ignored"}>
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Ignorar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onSuggest} disabled={saving || item.status === "suggested"}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Sugerido
          </Button>
        </div>
      </div>
    </div>
  );
}
