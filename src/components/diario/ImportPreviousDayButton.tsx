import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyPlus, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, subDays } from "date-fns";

interface Props {
  projectId: string;
  currentEntryId: string | null;
  currentEntryDate: string;       // YYYY-MM-DD
  isLocked: boolean;
  onImported: () => Promise<void> | void;     // recarrega dados após importar
  ensureEntryExists: () => Promise<string | null>;
}

/**
 * Importa o RDO do dia útil imediatamente anterior para o dia atual.
 *
 * Lógica de engenharia de planejamento:
 * - Equipe (mão de obra) e equipamentos costumam ser estáveis dia a dia.
 * - Atividades programadas seguem o cronograma da semana.
 * - Os SERVIÇOS (diary_items) são copiados SEM percentuais para forçar a
 *   leitura nova do residente: evita "carry-over" de produção fictícia.
 * - Clima é REINICIADO a partir da API Open-Meteo (não copiado).
 *
 * O destino só recebe registros se ainda estiver vazio nessas seções, evitando
 * duplicidade caso o usuário clique novamente por engano.
 */
export function ImportPreviousDayButton({
  projectId, currentEntryId, currentEntryDate, isLocked,
  onImported, ensureEntryExists,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (isLocked) return null;

  const handleImport = async () => {
    setLoading(true);
    try {
      // 1. Resolve o entry alvo (cria se ainda não existir)
      const targetId = currentEntryId || (await ensureEntryExists());
      if (!targetId) { toast.error("Não foi possível inicializar o diário do dia."); return; }

      // 2. Localiza o RDO anterior mais próximo (até 14 dias atrás)
      const dateLimit = format(subDays(parseISO(currentEntryDate), 14), "yyyy-MM-dd");
      const { data: prev, error: prevErr } = await supabase
        .from("diary_entries")
        .select("id, entry_date, equipe_presente, observacao_geral")
        .eq("project_id", projectId)
        .lt("entry_date", currentEntryDate)
        .gte("entry_date", dateLimit)
        .order("entry_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevErr) throw prevErr;
      if (!prev) {
        toast.info("Nenhum diário recente encontrado para importar (últimos 14 dias).");
        return;
      }

      // 3. Carrega coleções do dia anterior
      const [labRes, equipRes, actRes, itemsRes] = await Promise.all([
        supabase.from("diary_labor").select("nome, categoria, quantidade")
          .eq("diary_entry_id", prev.id).is("deleted_at", null),
        supabase.from("diary_equipment").select("nome, quantidade")
          .eq("diary_entry_id", prev.id).is("deleted_at", null),
        supabase.from("diary_activities").select("descricao, localizacao")
          .eq("diary_entry_id", prev.id).is("deleted_at", null),
        supabase.from("diary_items")
          .select("macro_id, macro_name, macro_color, scope_id, scope_name")
          .eq("diary_entry_id", prev.id),
      ]);

      // 4. Verifica seções já preenchidas no destino para evitar duplicar
      const [destLab, destEquip, destAct, destItems] = await Promise.all([
        supabase.from("diary_labor").select("id", { count: "exact", head: true })
          .eq("diary_entry_id", targetId).is("deleted_at", null),
        supabase.from("diary_equipment").select("id", { count: "exact", head: true })
          .eq("diary_entry_id", targetId).is("deleted_at", null),
        supabase.from("diary_activities").select("id", { count: "exact", head: true })
          .eq("diary_entry_id", targetId).is("deleted_at", null),
        supabase.from("diary_items").select("id", { count: "exact", head: true })
          .eq("diary_entry_id", targetId),
      ]);

      const inserts: Promise<any>[] = [];
      let copiedLab = 0, copiedEq = 0, copiedAct = 0, copiedItems = 0;

      if ((destLab.count ?? 0) === 0 && labRes.data?.length) {
        inserts.push(supabase.from("diary_labor").insert(
          labRes.data.map(r => ({ diary_entry_id: targetId, ...r }))
        ));
        copiedLab = labRes.data.length;
      }
      if ((destEquip.count ?? 0) === 0 && equipRes.data?.length) {
        inserts.push(supabase.from("diary_equipment").insert(
          equipRes.data.map(r => ({ diary_entry_id: targetId, ...r }))
        ));
        copiedEq = equipRes.data.length;
      }
      if ((destAct.count ?? 0) === 0 && actRes.data?.length) {
        inserts.push(supabase.from("diary_activities").insert(
          actRes.data.map(r => ({ diary_entry_id: targetId, ...r }))
        ));
        copiedAct = actRes.data.length;
      }
      // Serviços do dia: SEM percentuais e SEM houses para forçar nova leitura
      if ((destItems.count ?? 0) === 0 && itemsRes.data?.length) {
        // dedupe por (macro_id, scope_id) — não faz sentido importar duplicado
        const uniq = new Map<string, any>();
        itemsRes.data.forEach(r => uniq.set(`${r.macro_id}::${r.scope_id}`, r));
        inserts.push(supabase.from("diary_items").insert(
          Array.from(uniq.values()).map(r => ({
            diary_entry_id: targetId,
            macro_id: r.macro_id,
            macro_name: r.macro_name,
            macro_color: r.macro_color,
            scope_id: r.scope_id,
            scope_name: r.scope_name,
            house_ids: [],
            houses_count: 0,
            percentual_executado: 0,
            observacao: null,
            production_id: null,
          }))
        ));
        copiedItems = uniq.size;
      }

      const results = await Promise.all(inserts);
      const firstErr = results.find(r => r.error);
      if (firstErr?.error) throw firstErr.error;

      const total = copiedLab + copiedEq + copiedAct + copiedItems;
      if (total === 0) {
        toast.info("As seções do dia já estão preenchidas — nada foi importado para evitar duplicidade.");
      } else {
        toast.success(
          `Importado de ${format(parseISO(prev.entry_date), "dd/MM/yyyy")}: ` +
          `${copiedLab} mão de obra · ${copiedEq} equipamentos · ${copiedAct} atividades · ${copiedItems} serviços (sem percentuais).`
        );
      }
      await onImported();
    } catch (e: any) {
      console.error("[ImportPreviousDay]", e);
      toast.error("Erro ao importar dia anterior: " + (e.message || ""));
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="min-h-[40px]"
        title="Pré-preenche mão de obra, equipamentos, atividades e serviços do dia anterior. Percentuais ficam zerados."
      >
        <CopyPlus className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Importar dia anterior</span>
        <span className="sm:hidden">Importar</span>
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar dados do dia anterior?</AlertDialogTitle>
            <AlertDialogDescription>
              O sistema vai copiar do último diário (até 14 dias atrás):
              <ul className="list-disc list-inside mt-2 space-y-0.5 text-sm">
                <li>Mão de obra (equipe presente)</li>
                <li>Equipamentos</li>
                <li>Atividades programadas</li>
                <li>Lista de serviços <strong>sem percentuais executados</strong></li>
              </ul>
              <p className="mt-2 text-xs">
                O clima do dia continuará sendo lido automaticamente pela API meteorológica.
                Seções já preenchidas hoje não serão sobrescritas.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Importar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
