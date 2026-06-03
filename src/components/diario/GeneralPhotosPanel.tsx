import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, ImageIcon, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface PhotoRow {
  id: string;
  storage_path: string;
  legenda: string | null;
  house_number: number | null;
  created_at: string | null;
  diary_entry_id: string;
  diary_item_id: string | null;
  entry_date?: string;
  item_macro_name?: string | null;
  item_scope_name?: string | null;
  item_house_ids?: number[];
  url?: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const formatDateBR = (value?: string | null) => {
  if (!value) return "—";
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const formatHouseLabel = (photo: PhotoRow) => {
  if (photo.house_number != null) return `Casa ${String(photo.house_number).padStart(2, "0")}`;
  const houses = photo.item_house_ids || [];
  if (houses.length === 1) return `Casa ${String(houses[0]).padStart(2, "0")}`;
  if (houses.length > 1) return `Casas ${houses.map((h) => String(h).padStart(2, "0")).join(", ")}`;
  return "Geral / sem casa";
};

const getPhotoType = (photo: PhotoRow) => {
  if (photo.diary_item_id) return "Foto vinculada ao serviço";
  if (photo.house_number != null) return "Foto vinculada à casa";
  return "Foto geral";
};

/**
 * Painel de "Fotos Gerais" — fotos sem casa vinculada (house_number IS NULL).
 * Permite filtrar por data, vincular foto a uma casa, e excluir em lote.
 */
export function GeneralPhotosPanel() {
  const { currentProject } = useConstruction();
  const [from, setFrom] = useState<string>(daysAgoISO(30));
  const [to, setTo] = useState<string>(todayISO());
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [bulkHouse, setBulkHouse] = useState<string>("none");

  const houseIds = useMemo(() => {
    return (currentProject?.houses || [])
      .map((h: any) => Number(h.numero ?? h.number))
      .filter((n: number) => Number.isFinite(n))
      .sort((a: number, b: number) => a - b);
  }, [currentProject]);

  const load = useCallback(async () => {
    if (!currentProject?.id) {
      setPhotos([]);
      return;
    }
    setLoading(true);
    setSelected(new Set());

    // Pega entradas do diário do projeto no intervalo
    const { data: entries, error: entErr } = await supabase
      .from("diary_entries")
      .select("id, entry_date")
      .eq("project_id", currentProject.id)
      .gte("entry_date", from)
      .lte("entry_date", to);

    if (entErr) {
      toast.error("Erro ao carregar diários: " + entErr.message);
      setLoading(false);
      return;
    }
    const entryMap = new Map((entries || []).map((e: any) => [e.id, e.entry_date]));
    const entryIds = Array.from(entryMap.keys());
    if (entryIds.length === 0) {
      setPhotos([]);
      setLoading(false);
      return;
    }

    const { data: rows, error } = await supabase
      .from("diary_photos")
      .select("id, storage_path, legenda, house_number, created_at, diary_entry_id, diary_item_id")
      .in("diary_entry_id", entryIds)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      toast.error("Erro ao carregar fotos: " + error.message);
      setLoading(false);
      return;
    }

    const itemIds = Array.from(new Set((rows || []).map((r: any) => r.diary_item_id).filter(Boolean)));
    let itemMap = new Map<string, { macro_name: string | null; scope_name: string | null; house_ids: number[] }>();

    if (itemIds.length > 0) {
      const { data: items, error: itemError } = await supabase
        .from("diary_items")
        .select("id, macro_name, scope_name, house_ids")
        .in("id", itemIds);

      if (itemError) {
        toast.error("Erro ao carregar vínculos das fotos: " + itemError.message);
      } else {
        itemMap = new Map(
          (items || []).map((item: any) => [
            item.id,
            {
              macro_name: item.macro_name,
              scope_name: item.scope_name,
              house_ids: item.house_ids || [],
            },
          ])
        );
      }
    }

    const withUrls = await Promise.all(
      (rows || []).map(async (r: any) => {
        const { data: signed } = await (supabase.storage.from("diary-photos") as any)
          .createSignedUrl(r.storage_path, 60 * 60, {
            transform: { width: 500, resize: "contain", quality: 65 },
          });
        const item = r.diary_item_id ? itemMap.get(r.diary_item_id) : null;
        return {
          ...r,
          entry_date: entryMap.get(r.diary_entry_id),
          item_macro_name: item?.macro_name || null,
          item_scope_name: item?.scope_name || null,
          item_house_ids: item?.house_ids || [],
          url: signed?.signedUrl || "",
        } as PhotoRow;
      })
    );
    setPhotos(withUrls);
    setLoading(false);
  }, [currentProject?.id, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === photos.length) setSelected(new Set());
    else setSelected(new Set(photos.map((p) => p.id)));
  };

  const handleRelinkOne = async (photo: PhotoRow, value: string) => {
    const newHouse = value === "none" ? null : Number(value);
    if (newHouse === photo.house_number) return;
    const { error } = await supabase
      .from("diary_photos")
      .update({ house_number: newHouse })
      .eq("id", photo.id);
    if (error) {
      toast.error("Falha ao vincular: " + error.message);
      return;
    }
    toast.success(newHouse != null ? `Vinculada à Casa ${newHouse}` : "Marcada como geral");
    // Se ganhou casa, sai da lista (esta lista é só de "sem casa")
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, house_number: newHouse } : p)));
  };

  const handleBulkLink = async () => {
    if (selected.size === 0 || bulkHouse === "none") return;
    const newHouse = Number(bulkHouse);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("diary_photos")
      .update({ house_number: newHouse })
      .in("id", ids);
    if (error) {
      toast.error("Falha ao vincular em lote: " + error.message);
      return;
    }
    toast.success(`${ids.length} foto(s) vinculada(s) à Casa ${newHouse}`);
    setPhotos((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, house_number: newHouse } : p)));
    setSelected(new Set());
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selected);
    const paths = photos.filter((p) => selected.has(p.id)).map((p) => p.storage_path);

    // Deleta storage (não bloqueia se algum falhar)
    if (paths.length > 0) {
      await supabase.storage.from("diary-photos").remove(paths);
    }
    const { error } = await supabase.from("diary_photos").delete().in("id", ids);
    setDeleting(false);
    if (error) {
      toast.error("Falha ao excluir: " + error.message);
      return;
    }
    toast.success(`${ids.length} foto(s) excluída(s)`);
    setPhotos((prev) => prev.filter((p) => !selected.has(p.id)));
    setSelected(new Set());
  };

  const grouped = useMemo(() => {
    const m = new Map<string, PhotoRow[]>();
    for (const p of photos) {
      const key = p.entry_date || "—";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return Array.from(m.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [photos]);

  if (!currentProject) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Selecione um projeto para visualizar as fotos gerais.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Fotos Gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-3 items-end">
            <div>
              <Label htmlFor="from" className="text-xs">De</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs">Até</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Atualizar
            </Button>
          </div>

          {photos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-md border bg-muted/30">
              <Checkbox
                checked={selected.size === photos.length && photos.length > 0}
                onCheckedChange={toggleAll}
                aria-label="Selecionar todas"
              />
              <span className="text-sm">
                {selected.size > 0 ? `${selected.size} selecionada(s)` : "Selecionar todas"}
              </span>

              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <Select value={bulkHouse} onValueChange={setBulkHouse}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Vincular casa..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione casa</SelectItem>
                    {houseIds.map((n) => (
                      <SelectItem key={n} value={String(n)}>Casa {n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkLink}
                  disabled={selected.size === 0 || bulkHouse === "none"}
                  className="gap-1"
                >
                  <Link2 className="h-4 w-4" /> Vincular
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={selected.size === 0 || deleting}
                      className="gap-1"
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir fotos selecionadas?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {selected.size} foto(s) serão excluídas permanentemente. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkDelete}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando fotos...
        </div>
      ) : photos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma foto no período selecionado.
          </CardContent>
        </Card>
      ) : (
        grouped.map(([date, items]) => (
          <Card key={date}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="outline">{formatDateBR(date)}</Badge>
                <span className="text-muted-foreground font-normal">{items.length} foto(s)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {items.map((p) => {
                  const isSel = selected.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`relative rounded-md border overflow-hidden bg-muted ${isSel ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="absolute top-1 left-1 z-10 bg-background/80 rounded p-0.5">
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggle(p.id)}
                          aria-label="Selecionar foto"
                        />
                      </div>
                      {p.url ? (
                        <img
                          src={p.url}
                          alt={p.legenda || "foto"}
                          loading="lazy"
                          className="w-full h-32 object-cover"
                        />
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                      <div className="p-1.5 space-y-1">
                        <div className="space-y-0.5 text-[11px]">
                          <p><span className="font-medium">Data:</span> {formatDateBR(p.entry_date)}</p>
                          <p><span className="font-medium">Casa:</span> {formatHouseLabel(p)}</p>
                          <p><span className="font-medium">Serviço:</span> {p.item_scope_name || "Geral"}</p>
                          {p.item_macro_name && (
                            <p className="text-muted-foreground">{p.item_macro_name}</p>
                          )}
                          <p className="text-muted-foreground">{getPhotoType(p)}</p>
                        </div>
                        {p.legenda && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{p.legenda}</p>
                        )}
                        <Select
                          value={p.house_number == null ? "none" : String(p.house_number)}
                          onValueChange={(v) => handleRelinkOne(p, v)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Geral (sem casa)</SelectItem>
                            {houseIds.map((n) => (
                              <SelectItem key={n} value={String(n)}>Casa {n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
