import React, { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ExternalLink, Camera, Calendar, ImageOff } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useHousePhotoHistory, type HousePhotoEntry } from "@/hooks/useHousePhotoHistory";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houseId: number | null;
  projectId: string | null;
  houseLabel?: string;
}

/**
 * Drawer com histórico fotográfico da casa (apenas fotos vinculadas a serviços).
 * Toggle entre agrupamento por serviço (auditoria) e cronológico (evolução).
 */
export function HouseFotoHistoryDrawer({
  open, onOpenChange, houseId, projectId, houseLabel,
}: Props) {
  const navigate = useNavigate();
  const {
    photos,
    loading,
    loadingMore,
    hasMore,
    totalCount,
    loadAll,
  } = useHousePhotoHistory(open ? houseId : null, open ? projectId : null);
  const [view, setView] = useState<"servico" | "cronologico">("servico");
  const [preview, setPreview] = useState<HousePhotoEntry | null>(null);

  // Agrupa por serviço (macro · scope)
  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; macro: string; scope: string; color: string; photos: HousePhotoEntry[] }>();
    for (const p of photos) {
      const k = `${p.macro_id}::${p.scope_id}`;
      if (!map.has(k)) {
        map.set(k, { key: k, macro: p.macro_name, scope: p.scope_name, color: p.macro_color, photos: [] });
      }
      map.get(k)!.photos.push(p);
    }
    return Array.from(map.values());
  }, [photos]);

  const handleOpenFull = () => {
    if (houseId == null) return;
    onOpenChange(false);
    navigate(`/casa/${houseId}/historico${projectId ? `?project=${projectId}` : ""}`);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Histórico fotográfico — {houseLabel || `Casa ${String(houseId ?? "").padStart(2, "0")}`}
            </SheetTitle>
            <SheetDescription>
              Fotos vinculadas a serviços executados nesta unidade. Base para auditoria.
              {!loading && totalCount > 0 && (
                <span className="block text-xs mt-1">
                  Exibindo <strong>{photos.length}</strong> de <strong>{totalCount}</strong> fotos
                  {hasMore ? " mais recentes" : ""}.
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="servico">Por serviço</TabsTrigger>
                <TabsTrigger value="cronologico">Cronológico</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={handleOpenFull}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Completo
            </Button>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : photos.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <ImageOff className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma foto vinculada a serviços ainda.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Anexe fotos a serviços no Diário de Obras para construir o histórico.
                </p>
              </div>
            ) : view === "servico" ? (
              <div className="space-y-5">
                {grouped.map(group => (
                  <div key={group.key}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-5 rounded-full" style={{ backgroundColor: group.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{group.macro}</div>
                        <div className="text-xs text-muted-foreground truncate">{group.scope}</div>
                      </div>
                      <Badge variant="secondary" className="text-xs">{group.photos.length}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {group.photos.map(p => (
                        <PhotoThumb key={p.photo_id} p={p} onClick={() => setPreview(p)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {photos.map(p => (
                  <div key={p.photo_id} className="flex gap-3 items-start">
                    <PhotoThumb p={p} onClick={() => setPreview(p)} small />
                    <div className="flex-1 min-w-0 text-xs space-y-0.5">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(p.entry_date), "dd 'de' MMM yyyy", { locale: ptBR })}
                      </div>
                      <div className="font-medium truncate">{p.macro_name}</div>
                      <div className="text-muted-foreground truncate">{p.scope_name} · {p.percentual_executado}%</div>
                      <div className="text-muted-foreground/70 text-[10px]">{p.engineer_name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && hasMore && photos.length > 0 && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadAll()}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Carregando...
                    </>
                  ) : (
                    <>Ver todas ({totalCount} fotos)</>
                  )}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Preview ampliado */}
      {preview && (
        <Sheet open={!!preview} onOpenChange={() => setPreview(null)}>
          <SheetContent side="bottom" className="h-[90vh] flex flex-col">
            <SheetHeader>
              <SheetTitle className="text-sm">
                {preview.macro_name} · {preview.scope_name}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {format(parseISO(preview.entry_date), "dd/MM/yyyy", { locale: ptBR })} ·
                {" "}{preview.engineer_name} · {preview.percentual_executado}%
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <img src={preview.url} alt="" className="max-h-full max-w-full object-contain" />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

function PhotoThumb({ p, onClick, small }: { p: HousePhotoEntry; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-md overflow-hidden border bg-muted hover:opacity-90 transition ${small ? "w-20 h-20 shrink-0" : "w-full aspect-square"}`}
      title={`${p.macro_name} · ${p.scope_name}`}
    >
      <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
    </button>
  );
}
