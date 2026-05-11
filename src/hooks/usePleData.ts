import { useState, useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { PleGloss } from "@/components/ple/PleAuditDialog";

export interface PleAuditLogEntry {
  id: string;
  ple_project_id: string;
  measurement_id: string | null;
  action: string;
  details: any;
  performed_by: string | null;
  performed_by_name: string | null;
  performed_at: string;
}

export interface PleProject {
  id: string;
  company_id: string;
  name: string;
  location: string | null;
  contractor: string | null;
  contract_number: string | null;
  program: string | null;
  total_houses: number;
  contract_value: number;
  start_date: string | null;
  created_at: string;
  unit_value: number | null;
  executor_company: string | null;
  responsible_engineer: string | null;
  inspector_name: string | null;
  bdi_percentage: number | null;
  address_street: string | null;
  address_number: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  cnpj: string | null;
  contract_type: string | null;
  funding_source: string | null;
  contract_sign_date: string | null;
  contract_end_date: string | null;
  art_rrt_number: string | null;
  notes: string | null;
  updated_by: string | null;
  obramap_project_id: string | null;
  mode: 'standalone' | 'integrated';
  obras_portfolio_id: string | null;
}

export interface PleEventGroup {
  id: string;
  ple_project_id: string;
  code: string;
  name: string;
  display_order: number;
  parent_id: string | null;
}

export interface PleEvent {
  id: string;
  ple_project_id: string;
  group_id: string | null;
  item_code: string;
  discrimination: string | null;
  sinapi_code: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_value: number;
  mat_unit_value: number;
  mo_unit_value: number;
  display_order: number;
  obramap_macro_id: string | null;
  obramap_macro_name: string | null;
  obramap_scope_id: string | null;
  obramap_scope_name: string | null;
  billing_type: 'per_house' | 'fixed';
}

export interface PleMeasurement {
  id: string;
  ple_project_id: string;
  measurement_number: number;
  period_label: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  registered_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface PleEntry {
  id: string;
  ple_project_id: string;
  event_id: string;
  house_number: number;
  measurement_id: string;
  created_at?: string;
  created_by?: string | null;
  created_by_name?: string | null;
}

export function usePleData() {
  const { company, profile, canEdit } = useAuth();
  const [projects, setProjects] = useState<PleProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [groups, setGroups] = useState<PleEventGroup[]>([]);
  const [events, setEvents] = useState<PleEvent[]>([]);
  const [measurements, setMeasurements] = useState<PleMeasurement[]>([]);
  const [entries, setEntries] = useState<PleEntry[]>([]);
  const [glosses, setGlosses] = useState<PleGloss[]>([]);
  const [auditLogs, setAuditLogs] = useState<PleAuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const getUserName = useCallback(() => profile?.display_name || "Usuário", [profile]);

  const logAudit = useCallback(async (action: string, details: any = {}, measurementId?: string | null) => {
    if (!currentProjectId) return;
    const { data: userData } = await supabase.auth.getUser();
    const entry = {
      ple_project_id: currentProjectId,
      measurement_id: measurementId || null,
      action,
      details,
      performed_by: userData?.user?.id,
      performed_by_name: getUserName(),
    };
    const { data } = await supabase.from("ple_audit_log").insert(entry as any).select().single();
    if (data) setAuditLogs(prev => [data as any, ...prev]);
  }, [currentProjectId, getUserName]);

  const currentProject = useMemo(() =>
    projects.find(p => p.id === currentProjectId) || null,
    [projects, currentProjectId]
  );

  const loadProjects = useCallback(async () => {
    if (!company?.id) return;
    const { data, error } = await supabase
      .from("ple_projects")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if (!error && data) setProjects(data as any);
  }, [company?.id]);

  const loadProjectData = useCallback(async (projectId: string) => {
    setIsLoading(true);
    try {
      const [groupsRes, eventsRes, measurementsRes, entriesRes, glossesRes, auditRes] = await Promise.all([
        supabase.from("ple_event_groups").select("*").eq("ple_project_id", projectId).order("display_order"),
        supabase.from("ple_events").select("*").eq("ple_project_id", projectId).order("display_order"),
        supabase.from("ple_measurements").select("*").eq("ple_project_id", projectId).order("measurement_number"),
        supabase.from("ple_entries").select("*").eq("ple_project_id", projectId),
        supabase.from("ple_glosses").select("*").eq("ple_project_id", projectId),
        supabase.from("ple_audit_log").select("*").eq("ple_project_id", projectId).order("performed_at", { ascending: false }).limit(500),
      ]);
      if (!groupsRes.error) setGroups(groupsRes.data as any);
      if (!eventsRes.error) setEvents(eventsRes.data as any);
      if (!measurementsRes.error) setMeasurements(measurementsRes.data as any);
      if (!entriesRes.error) setEntries(entriesRes.data as any);
      if (!glossesRes.error) setGlosses(glossesRes.data as any);
      if (!auditRes.error) setAuditLogs(auditRes.data as any);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { if (currentProjectId) loadProjectData(currentProjectId); }, [currentProjectId, loadProjectData]);

  // ✅ Realtime: mantém groups/events/projects sincronizados entre abas/dispositivos.
  // Importante para os KPIs (MAT, MO, Total) refletirem exclusões/edições em tempo real.
  useEffect(() => {
    if (!currentProjectId) return;
    const channel = supabase
      .channel(`ple-data-${currentProjectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ple_events', filter: `ple_project_id=eq.${currentProjectId}` },
        () => { void loadProjectData(currentProjectId); })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ple_event_groups', filter: `ple_project_id=eq.${currentProjectId}` },
        () => { void loadProjectData(currentProjectId); })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ple_projects', filter: `id=eq.${currentProjectId}` },
        (payload: any) => {
          const updated = payload.new;
          if (updated) setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentProjectId, loadProjectData]);

  // ✅ Auto-sincroniza contract_value de ple_projects com a soma do orçamento (events).
  // Garante que o card "Suas Obras" mostre o valor atualizado em tempo real.
  // ⚠️ Multiplica por total_houses quando billing_type='per_house' (cada item por casa).
  useEffect(() => {
    if (!currentProjectId || !canEdit) return;
    const proj = projects.find(p => p.id === currentProjectId);
    if (!proj) return;
    const houses = Math.max(1, Number(proj.total_houses) || 1);
    const budgetTotal = events.reduce((s, e) => {
      const lineUnit = (Number(e.quantity) || 0) * (Number(e.unit_value) || 0);
      const factor = (e.billing_type || 'per_house') === 'per_house' ? houses : 1;
      return s + lineUnit * factor;
    }, 0);
    const stored = Number(proj.contract_value) || 0;
    if (Math.abs(budgetTotal - stored) < 0.01) return;
    const t = setTimeout(async () => {
      const { error } = await supabase
        .from("ple_projects")
        .update({ contract_value: budgetTotal } as any)
        .eq("id", currentProjectId);
      if (!error) {
        setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, contract_value: budgetTotal } : p));
      }
    }, 600);
    return () => clearTimeout(t);
  }, [events, currentProjectId, canEdit, projects]);


  // Create project
  const createProject = useCallback(async (data: Partial<PleProject>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return null; }
    if (!company?.id) return null;
    const { data: userData } = await supabase.auth.getUser();
    const { data: result, error } = await supabase
      .from("ple_projects")
      .insert({ ...data, company_id: company.id, created_by: userData?.user?.id } as any)
      .select()
      .single();
    if (error) { toast.error("Erro ao criar projeto"); return null; }
    setProjects(prev => [result as any, ...prev]);
    setCurrentProjectId((result as any).id);
    toast.success("Projeto PLE criado!");
    return result as any;
  }, [company?.id]);

  // Create measurement
  const createMeasurement = useCallback(async (data: { measurement_number: number; period_label: string; start_date?: string; end_date?: string }) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return null; }
    if (!currentProjectId) return null;
    const { data: userData } = await supabase.auth.getUser();
    const userName = getUserName();
    const { data: result, error } = await supabase
      .from("ple_measurements")
      .insert({ ...data, ple_project_id: currentProjectId, registered_by: userData?.user?.id, registered_by_name: userName } as any)
      .select()
      .single();
    if (error) { toast.error(error.code === "23505" ? "Medição já existe" : "Erro ao criar medição"); return null; }
    setMeasurements(prev => [...prev, result as any]);
    logAudit("measurement_created", { measurement_number: data.measurement_number, period_label: data.period_label }, (result as any).id);
    toast.success(`Medição ${data.measurement_number} criada!`);
    return result as any;
  }, [currentProjectId, getUserName, logAudit]);

  // Approve measurement (with or without glosses)
  const approveMeasurement = useCallback(async (id: string, hasGlosses?: boolean) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    const newStatus = hasGlosses ? "approved_with_glosses" : "approved";
    const { data: userData } = await supabase.auth.getUser();
    const userName = getUserName();
    const { error } = await supabase.from("ple_measurements").update({ 
      status: newStatus, approved_at: new Date().toISOString(), approved_by: userData?.user?.id, approved_by_name: userName 
    } as any).eq("id", id);
    if (error) { toast.error("Erro ao aprovar"); return; }

    if (hasGlosses) {
      const measGlosses = glosses.filter(g => g.measurement_id === id && !g.resolved);
      for (const g of measGlosses) {
        await supabase.from("ple_entries").delete().eq("event_id", g.event_id).eq("house_number", g.house_number).eq("measurement_id", id);
      }
      const glossKeys = new Set(measGlosses.map(g => `${g.event_id}:${g.house_number}:${id}`));
      setEntries(prev => prev.filter(e => !glossKeys.has(`${e.event_id}:${e.house_number}:${e.measurement_id}`)));
    }

    setMeasurements(prev => prev.map(m => m.id === id ? { ...m, status: newStatus } : m));
    logAudit("measurement_approved", { status: newStatus, glosses_count: hasGlosses ? glosses.filter(g => g.measurement_id === id && !g.resolved).length : 0 }, id);
    toast.success(hasGlosses ? "Medição aprovada com glossas!" : "Medição aprovada!");
  }, [canEdit, glosses, getUserName, logAudit]);

  // Undo measurement approval (temporary for testing)
  const undoMeasurementApproval = useCallback(async (id: string) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    const { error } = await supabase.from("ple_measurements").update({ status: "draft", approved_at: null, approved_by: null, approved_by_name: null } as any).eq("id", id);
    if (error) { toast.error("Erro ao desfazer aprovação"); return; }
    setMeasurements(prev => prev.map(m => m.id === id ? { ...m, status: "draft" } : m));
    logAudit("measurement_undo_approval", {}, id);
    toast.success("Aprovação desfeita! Medição voltou ao status rascunho.");
  }, [canEdit, logAudit]);

  // Toggle gloss on a cell
  const toggleGloss = useCallback(async (eventId: string, houseNumber: number, measurementId: string) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    if (!currentProjectId) return;
    const existing = glosses.find(g => g.measurement_id === measurementId && g.event_id === eventId && g.house_number === houseNumber && !g.resolved);
    if (existing) {
      await supabase.from("ple_glosses").delete().eq("id", existing.id);
      setGlosses(prev => prev.filter(g => g.id !== existing.id));
      logAudit("gloss_removed", { event_id: eventId, house_number: houseNumber }, measurementId);
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("ple_glosses")
        .insert({
          ple_project_id: currentProjectId,
          measurement_id: measurementId,
          event_id: eventId,
          house_number: houseNumber,
          glossed_by: userData?.user?.id,
        } as any)
        .select()
        .single();
      if (!error && data) {
        setGlosses(prev => [...prev, data as any]);
        logAudit("gloss_added", { event_id: eventId, house_number: houseNumber }, measurementId);
      }
    }
  }, [currentProjectId, glosses, logAudit]);

  // Create event group
  const createGroup = useCallback(async (data: { code: string; name: string; parent_id?: string | null }) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return null; }
    if (!currentProjectId) return null;
    const maxOrder = groups.length > 0 ? Math.max(...groups.map(g => g.display_order)) + 1 : 0;
    const { data: result, error } = await supabase
      .from("ple_event_groups")
      .insert({ ...data, ple_project_id: currentProjectId, display_order: maxOrder, parent_id: data.parent_id || null } as any)
      .select()
      .single();
    if (error) { toast.error("Erro ao criar grupo"); return null; }
    setGroups(prev => [...prev, result as any]);
    return result as any;
  }, [currentProjectId, groups]);

  // Create event
  const createEvent = useCallback(async (data: Partial<PleEvent>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return null; }
    if (!currentProjectId) return null;
    const maxOrder = events.length > 0 ? Math.max(...events.map(e => e.display_order)) + 1 : 0;
    const { data: result, error } = await supabase
      .from("ple_events")
      .insert({ ...data, ple_project_id: currentProjectId, display_order: maxOrder } as any)
      .select()
      .single();
    if (error) { toast.error("Erro ao criar evento"); return null; }
    setEvents(prev => [...prev, result as any]);
    return result as any;
  }, [currentProjectId, events]);

  // Update event
  const updateEvent = useCallback(async (id: string, data: Partial<PleEvent>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    const { error } = await supabase.from("ple_events").update(data as any).eq("id", id);
    if (error) { toast.error("Erro ao atualizar evento"); return; }
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
  }, [canEdit]);

  // Delete event
  const deleteEvent = useCallback(async (id: string) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    const { error } = await supabase.from("ple_events").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir evento"); return; }
    setEvents(prev => prev.filter(e => e.id !== id));
    setEntries(prev => prev.filter(e => e.event_id !== id));
  }, [canEdit]);

  // Set PLE entry
  const setEntry = useCallback(async (eventId: string, houseNumber: number, measurementId: string | null) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    if (!currentProjectId) return;
    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userName = getUserName();
      if (!measurementId) {
        const { error } = await supabase
          .from("ple_entries")
          .delete()
          .eq("ple_project_id", currentProjectId)
          .eq("event_id", eventId)
          .eq("house_number", houseNumber);
        if (error) {
          toast.error("Erro ao apagar lancamento da medicao");
          throw error;
        }
        setEntries(prev => prev.filter(e => !(e.event_id === eventId && e.house_number === houseNumber)));
      } else {
        const { data, error } = await supabase
          .from("ple_entries")
          .upsert({
            ple_project_id: currentProjectId, event_id: eventId, house_number: houseNumber,
            measurement_id: measurementId, created_by: userData?.user?.id, created_by_name: userName
          } as any, { onConflict: "event_id,house_number" })
          .select()
          .single();
        if (error || !data) {
          toast.error("Erro ao salvar lancamento da medicao");
          throw error || new Error("PLE entry upsert returned no data");
        }
        setEntries(prev => {
          const withoutCell = prev.filter(e => !(e.event_id === eventId && e.house_number === houseNumber));
          return [...withoutCell, data as any];
        });
      }
    } finally {
      setIsSaving(false);
    }
  }, [canEdit, currentProjectId, getUserName]);

  // Delete group + cascading deletion of child substages and events under them
  const deleteGroup = useCallback(async (id: string) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    // Coletar IDs de subgrupos (filhos diretos) e todos os grupos afetados
    const childGroupIds = groups.filter(g => g.parent_id === id).map(g => g.id);
    const allGroupIds = [id, ...childGroupIds];
    // Excluir todos os eventos vinculados a esses grupos
    const eventsToDelete = events.filter(e => e.group_id && allGroupIds.includes(e.group_id)).map(e => e.id);
    if (eventsToDelete.length > 0) {
      await supabase.from("ple_events").delete().in("id", eventsToDelete);
    }
    // Excluir subgrupos primeiro (FK)
    if (childGroupIds.length > 0) {
      await supabase.from("ple_event_groups").delete().in("id", childGroupIds);
    }
    const { error } = await supabase.from("ple_event_groups").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir grupo"); return; }
    // Atualizar estado local imediatamente para refletir nos KPIs
    setGroups(prev => prev.filter(g => !allGroupIds.includes(g.id)));
    setEvents(prev => prev.filter(e => !eventsToDelete.includes(e.id)));
    setEntries(prev => prev.filter(e => !eventsToDelete.includes(e.event_id)));
    toast.success(
      childGroupIds.length > 0 || eventsToDelete.length > 0
        ? `Grupo excluído (${childGroupIds.length} subetapa(s), ${eventsToDelete.length} serviço(s))`
        : "Grupo excluído"
    );
  }, [canEdit, groups, events]);

  // Update group
  const updateGroup = useCallback(async (id: string, data: Partial<PleEventGroup>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    const { error } = await supabase.from("ple_event_groups").update(data as any).eq("id", id);
    if (error) { toast.error("Erro ao atualizar grupo"); return; }
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...data } : g));
  }, [canEdit]);

  // Update project
  const updateProject = useCallback(async (id: string, data: Partial<PleProject>) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de edição tentou salvar"); return; }
    const { error } = await supabase.from("ple_projects").update(data as any).eq("id", id);
    if (error) { toast.error("Erro ao atualizar projeto"); return; }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
  }, [canEdit]);

  // Delete project (cascades via FK to events/measurements/entries/etc.)
  const deleteProject = useCallback(async (id: string) => {
    if (!canEdit) { console.warn("[PermissãoNegada] Usuário sem permissão de exclusão"); return false; }
    const { error } = await supabase.from("ple_projects").delete().eq("id", id);
    if (error) {
      console.error("Erro ao excluir obra PLE:", error);
      toast.error("Erro ao excluir obra: " + error.message);
      return false;
    }
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProjectId === id) setCurrentProjectId(null as any);
    toast.success("Obra excluída com sucesso");
    return true;
  }, [canEdit, currentProjectId]);

  // Computed: get measurement number for an entry
  const getMeasurementNumber = useCallback((eventId: string, houseNumber: number): number | null => {
    const entry = entries.find(e => e.event_id === eventId && e.house_number === houseNumber);
    if (!entry) return null;
    const measurement = measurements.find(m => m.id === entry.measurement_id);
    return measurement?.measurement_number || null;
  }, [entries, measurements]);

  // Computed: measured quantity per event per measurement
  const getMeasuredQty = useCallback((eventId: string, measurementNumber?: number): number => {
    if (measurementNumber !== undefined) {
      const measurement = measurements.find(m => m.measurement_number === measurementNumber);
      if (!measurement) return 0;
      return entries.filter(e => e.event_id === eventId && e.measurement_id === measurement.id).length;
    }
    return entries.filter(e => e.event_id === eventId).length;
  }, [entries, measurements]);

  // Next measurement number
  const nextMeasurementNumber = useMemo(() => {
    if (measurements.length === 0) return 1;
    return Math.max(...measurements.map(m => m.measurement_number)) + 1;
  }, [measurements]);

  // Computed totals – considera billing_type ('per_house' multiplica por total_houses; 'fixed' = total único).
  const totals = useMemo(() => {
    const houses = Math.max(1, Number(currentProject?.total_houses) || 1);
    const factor = (e: PleEvent) => (e.billing_type || 'per_house') === 'per_house' ? houses : 1;
    const budgetTotal = events.reduce((s, e) => s + (e.quantity || 0) * (e.unit_value || 0) * factor(e), 0);
    const totalMat = events.reduce((s, e) => s + (e.quantity || 0) * (e.mat_unit_value || 0) * factor(e), 0);
    const totalMo = events.reduce((s, e) => s + (e.quantity || 0) * (e.mo_unit_value || 0) * factor(e), 0);
    const contractValue = budgetTotal > 0 ? budgetTotal : Number(currentProject?.contract_value) || 0;
    let totalMeasured = 0;
    events.forEach(event => {
      const measuredQty = entries.filter(e => e.event_id === event.id).length;
      // medição: cada entry = 1 casa medida; valor medido = qty * unit_value (1 casa).
      totalMeasured += measuredQty * (event.quantity * event.unit_value);
    });
    const balance = contractValue - totalMeasured;
    const progress = contractValue > 0 ? (totalMeasured / contractValue) * 100 : 0;
    return { contractValue, totalMeasured, balance, progress, budgetTotal, totalMat, totalMo };
  }, [currentProject, events, entries]);

  return {
    projects, currentProject, currentProjectId, setCurrentProjectId,
    groups, events, measurements, entries, glosses, auditLogs,
    isLoading, isSaving,
    totals, nextMeasurementNumber,
    loadProjects, createProject, updateProject, deleteProject,
    createGroup, updateGroup, deleteGroup,
    createEvent, updateEvent, deleteEvent,
    createMeasurement, approveMeasurement, undoMeasurementApproval,
    setEntry, getMeasurementNumber, getMeasuredQty,
    toggleGloss,
    reload: () => currentProjectId && loadProjectData(currentProjectId),
  };
}
