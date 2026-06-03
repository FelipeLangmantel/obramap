import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getGlbSmartLinkCandidateApplyState,
  type GlbMeshRuntimeInfo,
  type GlbSmartLinkCandidate,
} from "./glbSmartLink";

interface Props {
  open: boolean;
  base: GlbMeshRuntimeInfo | null;
  candidates: GlbSmartLinkCandidate[];
  selectedKeys: Set<string>;
  applying: boolean;
  serviceLabel: string;
  onOpenChange: (open: boolean) => void;
  onToggle: (layerKey: string, checked: boolean) => void;
  onSelectAllApplicable: () => void;
  onClearSelection: () => void;
  onShowCandidates: () => void;
  onIsolateCandidates: () => void;
  onClearPreview: () => void;
  onApply: () => void;
}

const statusLabel: Record<GlbSmartLinkCandidate["status"], string> = {
  applicable: "aplicavel",
  missing_house: "sem casa",
  linked: "ja vinculada",
  context: "contexto",
  ignored: "ignorada",
  self: "mesh base",
};

type CandidateListFilter = "applicable" | "all" | "context" | "missing_house" | "medium" | "linked";

const filterLabels: Record<CandidateListFilter, string> = {
  applicable: "Aplicaveis",
  all: "Todas",
  context: "Contexto/revisao",
  missing_house: "Sem casa",
  medium: "Confianca media",
  linked: "Ja vinculadas",
};

export function GlbSmartLinkDialog({
  open,
  base,
  candidates,
  selectedKeys,
  applying,
  serviceLabel,
  onOpenChange,
  onToggle,
  onSelectAllApplicable,
  onClearSelection,
  onShowCandidates,
  onIsolateCandidates,
  onClearPreview,
  onApply,
}: Props) {
  const [listFilter, setListFilter] = useState<CandidateListFilter>("applicable");
  const counts = useMemo(() => {
    return candidates.reduce(
      (acc, item) => {
        const applyState = getGlbSmartLinkCandidateApplyState(item, base);
        acc[item.status] += 1;
        if (applyState.selectable) acc.selectable += 1;
        if (applyState.autoSelectable) acc.autoSelectable += 1;
        if (
          item.suggestedHouseNumber != null
          && item.currentAssignedHouseNumber == null
          && (item.suggestionConfidence === "alta" || item.suggestionConfidence === "media")
        ) {
          acc.suggested += 1;
        }
        return acc;
      },
      { applicable: 0, missing_house: 0, linked: 0, context: 0, ignored: 0, self: 0, suggested: 0, selectable: 0, autoSelectable: 0 },
    );
  }, [base, candidates]);
  const isPartScoped = base?.layerKey.startsWith("glbpart:") ?? false;
  const visibleCandidates = useMemo(() => (
    candidates.filter((item) => {
      if (listFilter === "all") return true;
      if (listFilter === "applicable") return getGlbSmartLinkCandidateApplyState(item, base).selectable;
      if (listFilter === "context") return item.status === "context" || item.status === "ignored";
      if (listFilter === "missing_house") return item.status === "missing_house";
      if (listFilter === "medium") return item.suggestionConfidence === "media";
      if (listFilter === "linked") return item.status === "linked";
      return true;
    })
  ), [base, candidates, listFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[90vh]">
        <DialogHeader className="shrink-0 px-6 pb-3 pt-6">
          <DialogTitle>Encontrar similares GLB</DialogTitle>
          <DialogDescription>
            Revise antes de aplicar. O servico sera copiado da mesh base e vinculos existentes nao serao sobrescritos.
            {isPartScoped && (
              <span className="mt-1 block">
                SmartLink limitado a mesma parte GLB para evitar conflitos entre arquivos.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-3">
          {base && (
            <div className="shrink-0 rounded-md border bg-muted/30 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Base</Badge>
                <span className="font-mono">{base.layerKey}</span>
                <span>{base.meshName || "sem nome"}</span>
                <span className="text-muted-foreground">{base.materialName || "sem material"}</span>
              </div>
              <p className="mt-1 text-muted-foreground">
                Servico: {serviceLabel} | Dimensoes: {base.size.x.toFixed(2)} x {base.size.y.toFixed(2)} x {base.size.z.toFixed(2)}
              </p>
            </div>
          )}

          <div className="grid shrink-0 grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
            <div className="rounded-md border p-2"><p className="text-muted-foreground">Candidatas</p><p className="text-base font-semibold">{candidates.length}</p></div>
            <div className="rounded-md border p-2"><p className="text-muted-foreground">Aplicaveis</p><p className="text-base font-semibold">{counts.selectable}</p></div>
            <div className="rounded-md border p-2"><p className="text-muted-foreground">Selecionadas</p><p className="text-base font-semibold">{selectedKeys.size}</p></div>
            <div className="rounded-md border p-2"><p className="text-muted-foreground">Sugeridas</p><p className="text-base font-semibold">{counts.suggested}</p></div>
            <div className="rounded-md border p-2"><p className="text-muted-foreground">Sem casa</p><p className="text-base font-semibold">{counts.missing_house}</p></div>
            <div className="rounded-md border p-2"><p className="text-muted-foreground">Ja vinculadas</p><p className="text-base font-semibold">{counts.linked}</p></div>
            <div className="rounded-md border p-2"><p className="text-muted-foreground">Ign./contexto</p><p className="text-base font-semibold">{counts.ignored + counts.context}</p></div>
          </div>

          <div className="shrink-0 rounded-md border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Aplicaveis: candidatas com casa sugerida e sem vinculo conflitante.</span>{" "}
            Itens de contexto/revisao podem ser selecionados manualmente quando forem seguros; vinculos existentes nao sao sobrescritos.
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onSelectAllApplicable} disabled={applying || counts.autoSelectable === 0}>
              Selecionar todas aplicaveis
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClearSelection} disabled={applying || selectedKeys.size === 0}>
              Limpar selecao
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onShowCandidates}>
              Mostrar aplicaveis no mapa
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onIsolateCandidates}>
              Isolar todas
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClearPreview}>
              Limpar destaque
            </Button>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {(Object.keys(filterLabels) as CandidateListFilter[]).map((filter) => (
              <Button
                key={filter}
                type="button"
                variant={listFilter === filter ? "default" : "outline"}
                size="sm"
                onClick={() => setListFilter(filter)}
              >
                {filterLabels[filter]}
              </Button>
            ))}
          </div>

          <div className="min-h-0 flex-1 rounded-md border">
            <ScrollArea className="h-full">
              <div className="divide-y">
                {candidates.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {isPartScoped ? "Nenhuma candidata compativel encontrada nesta parte GLB." : "Nenhuma similar encontrada."}
                  </p>
                ) : visibleCandidates.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nenhuma candidata neste filtro.
                  </p>
                ) : visibleCandidates.map((item) => {
                  const applyState = getGlbSmartLinkCandidateApplyState(item, base);
                  return (
                    <div key={item.layerKey} className="grid grid-cols-[32px_1fr] gap-3 p-3 text-xs md:grid-cols-[32px_minmax(0,1fr)_92px_112px_96px]">
                      <Checkbox
                        checked={selectedKeys.has(item.layerKey)}
                        disabled={applying || !applyState.selectable}
                        onCheckedChange={(checked) => onToggle(item.layerKey, checked === true)}
                        aria-label={`Selecionar ${item.layerKey}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-mono">{item.layerKey}</p>
                        <p className="truncate">{item.meshName || "sem nome"} | {item.materialName || "sem material"}</p>
                        <p className="text-muted-foreground">
                          {item.size.x.toFixed(2)} x {item.size.y.toFixed(2)} x {item.size.z.toFixed(2)} | {item.reasons.join(" | ")}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Score</p>
                        <p className="font-semibold">{item.score}% | {item.confidence}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Casa</p>
                        <p className="font-semibold">{item.suggestedHouseNumber != null ? `Casa ${item.suggestedHouseNumber}` : "-"}</p>
                        <p className="text-[10px] text-muted-foreground">{item.suggestionReason}</p>
                        <p className="text-[10px] text-muted-foreground">
                          confianca {item.suggestionConfidence}
                          {item.suggestionDistance != null ? ` | ${item.suggestionDistance.toFixed(1)}m` : ""}
                        </p>
                        {item.secondSuggestionDistance != null && (
                          <p className="text-[10px] text-muted-foreground">
                            2a ancora {item.secondSuggestionDistance.toFixed(1)}m
                            {item.suggestionDistanceGap != null ? ` | gap ${item.suggestionDistanceGap.toFixed(1)}m` : ""}
                            {item.suggestionDistanceRatio != null ? ` | ratio ${item.suggestionDistanceRatio.toFixed(2)}` : ""}
                          </p>
                        )}
                        {item.suggestionSource !== "none" && (
                          <p className="text-[10px] text-muted-foreground">fonte: {item.suggestionSource}</p>
                        )}
                        {item.houseSuggestionRejectReason && (
                          <p className="text-[10px] text-amber-600">motivo: {item.houseSuggestionRejectReason}</p>
                        )}
                        {item.currentAssignedHouseNumber != null && (
                          <p className="text-[10px] text-muted-foreground">atual: {item.currentAssignedHouseNumber}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <Badge variant={applyState.selectable ? "default" : "outline"} className="text-[10px]">
                          {statusLabel[item.status]}
                        </Badge>
                        <p className={applyState.selectable ? "mt-1 text-[10px] text-muted-foreground" : "mt-1 text-[10px] text-amber-600"}>
                          {applyState.reason}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancelar
          </Button>
          <Button type="button" onClick={onApply} disabled={applying || selectedKeys.size === 0}>
            {applying ? "Aplicando..." : `Aplicar selecionadas (${selectedKeys.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
