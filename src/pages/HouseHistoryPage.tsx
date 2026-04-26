import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useHousePhotoHistory, type HousePhotoEntry } from "@/hooks/useHousePhotoHistory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Camera, Download, Loader2, ImageOff, Calendar, Search } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function HouseHistoryPage() {
  const { houseId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentProject } = useConstruction();
  const projectId = searchParams.get("project") || currentProject?.id || null;
  const houseIdNum = houseId ? Number(houseId) : null;

  const { photos, loading } = useHousePhotoHistory(houseIdNum, projectId, { initialLimit: null });
  const [view, setView] = useState<"servico" | "cronologico">("servico");
  const [filterMacro, setFilterMacro] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<HousePhotoEntry | null>(null);

  const macros = useMemo(() => {
    const set = new Map<string, { id: string; name: string; color: string }>();
    photos.forEach(p => set.set(p.macro_id, { id: p.macro_id, name: p.macro_name, color: p.macro_color }));
    return Array.from(set.values());
  }, [photos]);

  const filtered = useMemo(() => {
    return photos.filter(p => {
      if (filterMacro !== "all" && p.macro_id !== filterMacro) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.macro_name.toLowerCase().includes(q) &&
            !p.scope_name.toLowerCase().includes(q) &&
            !(p.observacao || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [photos, filterMacro, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; macro: string; scope: string; color: string; photos: HousePhotoEntry[] }>();
    for (const p of filtered) {
      const k = `${p.macro_id}::${p.scope_id}`;
      if (!map.has(k)) {
        map.set(k, { key: k, macro: p.macro_name, scope: p.scope_name, color: p.macro_color, photos: [] });
      }
      map.get(k)!.photos.push(p);
    }
    return Array.from(map.values());
  }, [filtered]);

  const houseLabel = `Casa ${String(houseIdNum ?? "").padStart(2, "0")}`;

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Camera className="h-6 w-6 text-primary" />
            Histórico Fotográfico — {houseLabel}
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentProject?.name || "Obra"} · Registro de auditoria por unidade habitacional
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">{filtered.length} fotos</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <Tabs value={view} onValueChange={(v) => setView(v as any)}>
              <TabsList>
                <TabsTrigger value="servico">Por serviço</TabsTrigger>
                <TabsTrigger value="cronologico">Cronológico</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex gap-2 flex-1 md:max-w-md">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar serviço, etapa, observação..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={filterMacro} onValueChange={setFilterMacro}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas etapas</SelectItem>
                  {macros.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-lg">
              <ImageOff className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {photos.length === 0
                  ? "Nenhuma foto vinculada a serviços para esta casa ainda."
                  : "Nenhuma foto corresponde aos filtros."}
              </p>
              {photos.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Anexe fotos a serviços no Diário de Obras para construir o histórico.
                </p>
              )}
            </div>
          ) : view === "servico" ? (
            <div className="space-y-8">
              {grouped.map(group => (
                <div key={group.key}>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                    <span className="w-3 h-6 rounded-full" style={{ backgroundColor: group.color }} />
                    <div className="flex-1">
                      <h3 className="font-semibold">{group.macro}</h3>
                      <p className="text-xs text-muted-foreground">{group.scope}</p>
                    </div>
                    <Badge variant="outline">{group.photos.length} fotos</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {group.photos.map(p => (
                      <PhotoCard key={p.photo_id} p={p} onClick={() => setPreview(p)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(p => (
                <PhotoCard key={p.photo_id} p={p} onClick={() => setPreview(p)} showDate />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview modal simples */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div className="max-w-5xl max-h-full flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={preview.url} alt="" className="max-h-[80vh] object-contain rounded-md" />
            <div className="bg-background rounded-md p-4 flex items-center gap-3">
              <span className="w-2 h-10 rounded-full" style={{ backgroundColor: preview.macro_color }} />
              <div className="flex-1 text-sm">
                <div className="font-semibold">{preview.macro_name} · {preview.scope_name}</div>
                <div className="text-xs text-muted-foreground">
                  {format(parseISO(preview.entry_date), "dd 'de' MMMM yyyy", { locale: ptBR })} ·
                  {" "}{preview.engineer_name} · {preview.percentual_executado}%
                </div>
                {preview.observacao && (
                  <div className="text-xs text-muted-foreground mt-1 italic">"{preview.observacao}"</div>
                )}
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={preview.url} download target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4 mr-1" /> Baixar
                </a>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoCard({ p, onClick, showDate }: { p: HousePhotoEntry; onClick: () => void; showDate?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="group relative rounded-md overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition aspect-square"
      title={`${p.macro_name} · ${p.scope_name}`}
    >
      <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
      {showDate && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[10px] text-white text-left">
          <div className="flex items-center gap-1">
            <Calendar className="h-2.5 w-2.5" />
            {format(parseISO(p.entry_date), "dd/MM/yy", { locale: ptBR })}
          </div>
          <div className="truncate font-medium">{p.macro_name}</div>
        </div>
      )}
    </button>
  );
}
