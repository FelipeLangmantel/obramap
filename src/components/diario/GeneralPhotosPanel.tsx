import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, ImageIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getCachedPhotoSignedUrl } from "@/lib/photoSignedUrlCache";

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

const isLinkedPhoto = (photo: PhotoRow) => {
  return Boolean(photo.diary_item_id || photo.house_number != null || (photo.item_house_ids || []).length > 0);
};

export function GeneralPhotosPanel() {
  const { currentProject } = useConstruction();
  const [from, setFrom] = useState<string>(daysAgoISO(30));
  const [to, setTo] = useState<string>(todayISO());
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [houseFilter, setHouseFilter] = useState("all");
  const [previewPhoto, setPreviewPhoto] = useState<PhotoRow | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<PhotoRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [captionDraft, setCaptionDraft] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);

  const houseIds = useMemo(() => {
    const ids = new Set<number>();
    for (const h of currentProject?.houses || []) {
      const n = Number((h as any).numero ?? (h as any).number ?? (h as any).house_number);
      if (Number.isFinite(n)) ids.add(n);
    }
    for (const photo of photos) {
      if (photo.house_number != null && Number.isFinite(photo.house_number)) ids.add(photo.house_number);
      for (const n of photo.item_house_ids || []) {
        if (Number.isFinite(n)) ids.add(n);
      }
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [currentProject, photos]);

  const load = useCallback(async () => {
    if (!currentProject?.id) {
      setPhotos([]);
      return;
    }
    setLoading(true);

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
        const signedUrl = await getCachedPhotoSignedUrl({
          bucket: "diary-photos",
          path: r.storage_path,
          transform: { width: 500, resize: "contain", quality: 65 },
        });
        const item = r.diary_item_id ? itemMap.get(r.diary_item_id) : null;
        return {
          ...r,
          entry_date: entryMap.get(r.diary_entry_id),
          item_macro_name: item?.macro_name || null,
          item_scope_name: item?.scope_name || null,
          item_house_ids: item?.house_ids || [],
          url: signedUrl || "",
        } as PhotoRow;
      })
    );

    setPhotos(withUrls);
    setLoading(false);
  }, [currentProject?.id, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredPhotos = useMemo(() => {
    if (houseFilter === "all") return photos;
    if (houseFilter === "general") return photos.filter((p) => !isLinkedPhoto(p));
    const houseNumber = Number(houseFilter);
    return photos.filter((p) => {
      if (p.house_number === houseNumber) return true;
      return (p.item_house_ids || []).includes(houseNumber);
    });
  }, [houseFilter, photos]);

  const grouped = useMemo(() => {
    const m = new Map<string, PhotoRow[]>();
    for (const p of filteredPhotos) {
      const key = p.entry_date || "—";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return Array.from(m.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filteredPhotos]);

  const openPreview = (photo: PhotoRow) => {
    setPreviewPhoto(photo);
    setCaptionDraft(photo.legenda || "");
  };

  const handleDeletePhoto = async () => {
    if (!photoToDelete) return;
    if (deleteConfirmText !== "excluir") return;
    setDeleting(true);
    await supabase.storage.from("diary-photos").remove([photoToDelete.storage_path]);
    const { error } = await supabase.from("diary_photos").delete().eq("id", photoToDelete.id);
    setDeleting(false);
    if (error) {
      toast.error("Falha ao excluir: " + error.message);
      return;
    }
    toast.success("Foto excluída.");
    setPhotos((prev) => prev.filter((p) => p.id !== photoToDelete.id));
    if (previewPhoto?.id === photoToDelete.id) setPreviewPhoto(null);
    setPhotoToDelete(null);
    setDeleteConfirmText("");
  };

  const handleSaveCaption = async () => {
    if (!previewPhoto || isLinkedPhoto(previewPhoto)) return;
    setSavingCaption(true);
    try {
      const legenda = captionDraft.trim() || null;
      const { error } = await supabase
        .from("diary_photos")
        .update({ legenda } as any)
        .eq("id", previewPhoto.id);
      if (error) throw error;
      setPreviewPhoto({ ...previewPhoto, legenda });
      setPhotos((prev) => prev.map((p) => (p.id === previewPhoto.id ? { ...p, legenda } : p)));
      toast.success("Legenda salva.");
    } catch (err: any) {
      toast.error("Erro ao salvar legenda: " + (err.message || ""));
    } finally {
      setSavingCaption(false);
    }
  };

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
          <div className="grid grid-cols-1 gap-3 items-end sm:grid-cols-2 lg:grid-cols-[1fr,1fr,220px,auto]">
            <div>
              <Label htmlFor="from" className="text-xs">De</Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs">Até</Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Filtrar por casa</Label>
              <Select value={houseFilter} onValueChange={setHouseFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">Todas as fotos</SelectItem>
                  <SelectItem value="general">Geral / sem casa</SelectItem>
                  {houseIds.map((n) => (
                    <SelectItem key={n} value={String(n)}>Casa {String(n).padStart(2, "0")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Atualizar
            </Button>
          </div>

          {photos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Exibindo {filteredPhotos.length} de {photos.length} foto(s). Fotos vinculadas mostram casa, serviço e etapa;
              fotos gerais mantêm legenda editável.
            </p>
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
      ) : filteredPhotos.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Nenhuma foto encontrada para o filtro selecionado.
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {items.map((p) => {
                  const linked = isLinkedPhoto(p);
                  return (
                    <div key={p.id} className="overflow-hidden rounded-lg border bg-card shadow-sm">
                      <div className="relative bg-muted/50">
                        <button
                          type="button"
                          className="flex h-28 w-full items-center justify-center sm:h-32"
                          onClick={() => openPreview(p)}
                        >
                          {p.url ? (
                            <img
                              src={p.url}
                              alt={p.legenda || "Foto do diário"}
                              loading="lazy"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </button>
                        <Badge className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-3rem)] truncate bg-background/90 text-foreground">
                          {formatHouseLabel(p)}
                        </Badge>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="absolute right-1 top-1 h-6 w-6 rounded-full opacity-90 shadow-sm"
                          onClick={() => {
                            setDeleteConfirmText("");
                            setPhotoToDelete(p);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="space-y-1.5 p-2 text-[11px]">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={linked ? "secondary" : "outline"} className="text-[10px]">
                            {getPhotoType(p)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">{formatDateBR(p.entry_date)}</Badge>
                        </div>
                        {linked ? (
                          <div className="space-y-0.5 text-muted-foreground">
                            {p.item_scope_name && <p className="line-clamp-1">Serviço: {p.item_scope_name}</p>}
                            {p.item_macro_name && <p className="line-clamp-1">Etapa: {p.item_macro_name}</p>}
                            {p.legenda && <p className="line-clamp-2 text-foreground">{p.legenda}</p>}
                          </div>
                        ) : (
                          <div className="rounded-md border bg-muted/30 p-2">
                            <p className="font-medium text-muted-foreground">Legenda/descrição</p>
                            {p.legenda ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-snug text-foreground">{p.legenda}</p>
                            ) : (
                              <p className="mt-1 text-xs italic text-muted-foreground">Sem legenda adicionada.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={!!previewPhoto} onOpenChange={(open) => {
        if (!open) setPreviewPhoto(null);
      }}>
        <DialogContent className="max-h-[92vh] max-w-[95vw] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewPhoto ? formatHouseLabel(previewPhoto) : "Foto"}</DialogTitle>
            <DialogDescription>
              {previewPhoto ? getPhotoType(previewPhoto) : "Visualização da foto"}
            </DialogDescription>
          </DialogHeader>
          {previewPhoto && (
            <div className="space-y-3">
              <div className="flex max-h-[70vh] min-h-[220px] items-center justify-center rounded-lg bg-muted/50">
                {previewPhoto.url ? (
                  <img
                    src={previewPhoto.url}
                    alt={previewPhoto.legenda || "Foto do diário"}
                    className="max-h-[70vh] max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Data: {formatDateBR(previewPhoto.entry_date)}</Badge>
                <Badge variant="outline">{formatHouseLabel(previewPhoto)}</Badge>
                {previewPhoto.item_scope_name && <Badge variant="secondary">Serviço: {previewPhoto.item_scope_name}</Badge>}
                {previewPhoto.item_macro_name && <Badge variant="secondary">Etapa: {previewPhoto.item_macro_name}</Badge>}
              </div>

              {isLinkedPhoto(previewPhoto) ? (
                previewPhoto.legenda ? (
                  <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">{previewPhoto.legenda}</p>
                ) : null
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Legenda/descrição</Label>
                  <Textarea
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    placeholder="Escreva uma legenda para esta foto..."
                    className="min-h-[80px]"
                  />
                  <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={handleSaveCaption} disabled={savingCaption}>
                      {savingCaption && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Salvar legenda
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!photoToDelete} onOpenChange={(open) => {
        if (!open) {
          setPhotoToDelete(null);
          setDeleteConfirmText("");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir foto?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. Para confirmar, digite excluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {photoToDelete && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{formatHouseLabel(photoToDelete)}</p>
                <p>{getPhotoType(photoToDelete)}</p>
                {photoToDelete.item_scope_name && <p>Serviço: {photoToDelete.item_scope_name}</p>}
                {photoToDelete.item_macro_name && <p>Etapa: {photoToDelete.item_macro_name}</p>}
                <p>Data: {formatDateBR(photoToDelete.entry_date)}</p>
              </div>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Digite excluir"
                autoComplete="off"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePhoto} disabled={deleting || deleteConfirmText !== "excluir"}>
              {deleting ? "Excluindo..." : "Excluir foto"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
