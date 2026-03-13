import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Save, Building2, Sparkles, ChevronDown, ChevronRight, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { PleImportAIDialog } from "./PleImportAIDialog";
import type { usePleData } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

export function PleContractTab(props: PleDataReturn) {
  const {
    currentProject, groups, events,
    createGroup, updateGroup, deleteGroup,
    createEvent, updateEvent, deleteEvent,
    updateProject,
  } = props;

  const [showAIImport, setShowAIImport] = useState(false);
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(groups.map(g => g.id)));

  const [projectForm, setProjectForm] = useState({
    name: currentProject?.name || "",
    location: currentProject?.location || "",
    contractor: currentProject?.contractor || "",
    contract_number: currentProject?.contract_number || "",
    program: currentProject?.program || "",
    total_houses: currentProject?.total_houses || 50,
    contract_value: currentProject?.contract_value || 0,
  });

  const [newStage, setNewStage] = useState({ code: "", name: "" });
  const [newSubstage, setNewSubstage] = useState({ code: "", name: "", parent_id: "" });
  const [addingSubstageTo, setAddingSubstageTo] = useState<string | null>(null);
  const [addingEventTo, setAddingEventTo] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({
    group_id: "", item_code: "", description: "", discrimination: "",
    sinapi_code: "", unit: "UN", quantity: 0, unit_value: 0,
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Separate etapas (top-level) and subetapas (with parent)
  const stages = useMemo(() => groups.filter(g => !g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);
  const substagesByStage = useMemo(() => {
    const map = new Map<string, typeof groups>();
    stages.forEach(s => map.set(s.id, []));
    groups.filter(g => g.parent_id).sort((a, b) => a.display_order - b.display_order).forEach(g => {
      const arr = map.get(g.parent_id!) || [];
      arr.push(g);
      map.set(g.parent_id!, arr);
    });
    return map;
  }, [groups, stages]);

  const eventsBySubstage = useMemo(() => {
    const map = new Map<string, typeof events>();
    groups.forEach(g => map.set(g.id, []));
    events.forEach(e => {
      if (e.group_id) {
        const arr = map.get(e.group_id) || [];
        arr.push(e);
        map.set(e.group_id, arr);
      }
    });
    return map;
  }, [events, groups]);

  // Stats
  const stats = useMemo(() => {
    const totalContractual = events.reduce((s, e) => s + e.quantity * e.unit_value, 0);
    return {
      totalStages: stages.length,
      totalSubstages: groups.filter(g => g.parent_id).length,
      totalEvents: events.length,
      totalContractual,
    };
  }, [groups, events, stages]);

  const toggleStage = (id: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSaveProject = async () => {
    if (!currentProject) return;
    await updateProject(currentProject.id, projectForm as any);
    setIsEditingProject(false);
    toast.success("Dados do projeto atualizados!");
  };

  const handleAddStage = async () => {
    if (!newStage.code || !newStage.name) { toast.error("Código e nome obrigatórios"); return; }
    const result = await createGroup({ ...newStage, parent_id: null });
    if (result) {
      setExpandedStages(prev => new Set(prev).add(result.id));
      setNewStage({ code: "", name: "" });
    }
  };

  const handleAddSubstage = async (stageId: string) => {
    if (!newSubstage.code || !newSubstage.name) { toast.error("Código e nome obrigatórios"); return; }
    const result = await createGroup({ ...newSubstage, parent_id: stageId });
    if (result) {
      setExpandedStages(prev => new Set(prev).add(result.id));
      setNewSubstage({ code: "", name: "", parent_id: "" });
      setAddingSubstageTo(null);
    }
  };

  const handleAddEvent = async (substageId: string) => {
    if (!newEvent.item_code || !newEvent.description) { toast.error("Item e descrição obrigatórios"); return; }
    await createEvent({ ...newEvent, group_id: substageId } as any);
    setNewEvent({ group_id: "", item_code: "", description: "", discrimination: "", sinapi_code: "", unit: "UN", quantity: 0, unit_value: 0 });
    setAddingEventTo(null);
  };

  const handleAIImport = async (
    newGroups: { code: string; name: string; parent_code?: string }[],
    importedEvents: { item_code: string; discrimination: string; sinapi_code: string; description: string; unit: string; quantity: number; unit_value: number; group_code: string; group_name: string; stage_code?: string; stage_name?: string }[]
  ) => {
    const groupIdMap = new Map<string, string>();
    groups.forEach(g => groupIdMap.set(g.code, g.id));

    // Create stages and substages
    for (const g of newGroups) {
      if (!groupIdMap.has(g.code)) {
        const parentId = g.parent_code ? groupIdMap.get(g.parent_code) || null : null;
        const result = await createGroup({ code: g.code, name: g.name, parent_id: parentId });
        if (result) groupIdMap.set(g.code, result.id);
      }
    }

    for (const ev of importedEvents) {
      const groupId = groupIdMap.get(ev.group_code) || null;
      await createEvent({
        group_id: groupId, item_code: ev.item_code, description: ev.description,
        discrimination: ev.discrimination, sinapi_code: ev.sinapi_code,
        unit: ev.unit, quantity: ev.quantity, unit_value: ev.unit_value,
      } as any);
    }
    toast.success(`${importedEvents.length} serviços importados com sucesso!`);
  };

  const getSubstageTotal = (substageId: string) => {
    return (eventsBySubstage.get(substageId) || []).reduce((s, e) => s + e.quantity * e.unit_value, 0);
  };

  const getStageTotal = (stageId: string) => {
    const substages = substagesByStage.get(stageId) || [];
    return substages.reduce((s, sub) => s + getSubstageTotal(sub.id), 0);
  };

  if (!currentProject) return null;

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Project Header Card */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Dados do Contrato</CardTitle>
                <CardDescription className="text-xs">Informações gerais do projeto e contrato</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isEditingProject ? (
                <Button variant="outline" size="sm" onClick={() => setIsEditingProject(true)} className="gap-1.5 text-xs">
                  <Edit2 className="h-3.5 w-3.5" /> Editar
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingProject(false)} className="gap-1 text-xs">
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSaveProject} className="gap-1.5 text-xs">
                    <Save className="h-3.5 w-3.5" /> Salvar
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isEditingProject ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Nome da Obra</Label><Input value={projectForm.name} onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Localização</Label><Input value={projectForm.location} onChange={e => setProjectForm(p => ({ ...p, location: e.target.value }))} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Empresa Executora</Label><Input value={projectForm.contractor} onChange={e => setProjectForm(p => ({ ...p, contractor: e.target.value }))} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Nº Contrato</Label><Input value={projectForm.contract_number} onChange={e => setProjectForm(p => ({ ...p, contract_number: e.target.value }))} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Programa</Label><Input value={projectForm.program} onChange={e => setProjectForm(p => ({ ...p, program: e.target.value }))} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Total de Casas</Label><Input type="number" value={projectForm.total_houses} onChange={e => setProjectForm(p => ({ ...p, total_houses: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
              <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Valor do Contrato (R$)</Label><Input type="number" step="0.01" value={projectForm.contract_value} onChange={e => setProjectForm(p => ({ ...p, contract_value: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
              <InfoField label="OBRA" value={currentProject.name} />
              <InfoField label="LOCALIZAÇÃO" value={currentProject.location || "—"} />
              <InfoField label="EXECUTORA" value={currentProject.contractor || "—"} />
              <InfoField label="Nº CONTRATO" value={currentProject.contract_number || "—"} />
              <InfoField label="PROGRAMA" value={currentProject.program || "—"} />
              <InfoField label="TOTAL DE CASAS" value={String(currentProject.total_houses)} />
              <InfoField label="VALOR CONTRATO" value={fmtCur(currentProject.contract_value)} highlight />
              <InfoField label="VALOR ORÇADO" value={fmtCur(stats.totalContractual)} highlight />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget Spreadsheet */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-foreground">Planilha Orçamentária</h2>
            <Badge variant="secondary" className="text-[10px]">{stats.totalStages} etapas</Badge>
            <Badge variant="outline" className="text-[10px]">{stats.totalSubstages} subetapas</Badge>
            <Badge variant="outline" className="text-[10px]">{stats.totalEvents} serviços</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAIImport(true)} className="gap-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Importar via IA
          </Button>
        </div>

        <ScrollArea className="flex-1 border rounded-lg">
          <div className="min-w-[950px]">
            {/* Table Header */}
            <div className="grid grid-cols-[36px_70px_90px_80px_1fr_50px_70px_90px_110px_36px] gap-0 bg-muted/50 border-b px-2 py-2 sticky top-0 z-10">
              <span />
              <span className="text-[10px] font-bold text-muted-foreground uppercase">ITEM</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">DISCRIM.</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">CÓD. SINAPI</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">DESCRIÇÃO SINAPI</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-center">UNID</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">QTDE</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">UNITÁRIO</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">TOTAL</span>
              <span />
            </div>

            {/* ETAPAS */}
            {stages.map(stage => {
              const stageTotal = getStageTotal(stage.id);
              const substages = substagesByStage.get(stage.id) || [];
              const isExpanded = expandedStages.has(stage.id);

              return (
                <div key={stage.id}>
                  {/* ETAPA ROW (Level 1) */}
                  <div
                    className="grid grid-cols-[36px_70px_90px_80px_1fr_50px_70px_90px_110px_36px] gap-0 bg-primary/15 border-b border-primary/25 px-2 py-2 cursor-pointer hover:bg-primary/20 transition-colors items-center"
                    onClick={() => toggleStage(stage.id)}
                  >
                    <span className="flex items-center justify-center">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                    </span>
                    <span className="text-xs font-extrabold text-primary">{stage.code}</span>
                    <span />
                    <span />
                    <span className="text-xs font-extrabold text-foreground tracking-wide">{stage.name.toUpperCase()}</span>
                    <span />
                    <span />
                    <span />
                    <span className="text-xs font-extrabold text-right font-mono text-primary">{fmtCur(stageTotal)}</span>
                    <span className="flex justify-center">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); deleteGroup(stage.id); }}>
                        <Trash2 className="h-3 w-3 text-destructive/60 hover:text-destructive" />
                      </Button>
                    </span>
                  </div>

                  {isExpanded && (
                    <>
                      {/* SUBETAPAS */}
                      {substages.map(sub => {
                        const subEvents = (eventsBySubstage.get(sub.id) || []).sort((a, b) => a.display_order - b.display_order);
                        const subTotal = getSubstageTotal(sub.id);
                        const isSubExpanded = expandedStages.has(sub.id);

                        return (
                          <div key={sub.id}>
                            {/* SUBETAPA ROW (Level 2) */}
                            <div
                              className="grid grid-cols-[36px_70px_90px_80px_1fr_50px_70px_90px_110px_36px] gap-0 bg-accent/40 border-b px-2 py-1.5 cursor-pointer hover:bg-accent/60 transition-colors items-center"
                              onClick={() => toggleStage(sub.id)}
                            >
                              <span className="flex items-center justify-center pl-3">
                                {isSubExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              </span>
                              <span className="text-[11px] font-bold text-foreground">{sub.code}</span>
                              <span />
                              <span />
                              <span className="text-[11px] font-bold text-foreground">{sub.name}</span>
                              <span />
                              <span className="text-[10px] text-muted-foreground text-right">{subEvents.length} itens</span>
                              <span />
                              <span className="text-[11px] font-bold text-right font-mono">{fmtCur(subTotal)}</span>
                              <span className="flex justify-center">
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); deleteGroup(sub.id); }}>
                                  <Trash2 className="h-3 w-3 text-destructive/60 hover:text-destructive" />
                                </Button>
                              </span>
                            </div>

                            {isSubExpanded && (
                              <>
                                {/* SERVIÇOS (Level 3) */}
                                {subEvents.map(ev => (
                                  <div key={ev.id} className="grid grid-cols-[36px_70px_90px_80px_1fr_50px_70px_90px_110px_36px] gap-0 border-b px-2 py-1.5 hover:bg-accent/20 transition-colors items-center group/row">
                                    <span />
                                    <span className="text-[11px] font-mono text-muted-foreground pl-3">{ev.item_code}</span>
                                    <span className="text-[10px] text-muted-foreground truncate">{ev.discrimination || "—"}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground">{ev.sinapi_code || "—"}</span>
                                    <span className="text-[11px] text-foreground truncate pr-2" title={ev.description}>{ev.description}</span>
                                    <span className="text-[11px] text-center text-muted-foreground">{ev.unit}</span>
                                    <span className="text-[11px] text-right font-mono">{fmt(ev.quantity)}</span>
                                    <span className="text-[11px] text-right font-mono">{fmtCur(ev.unit_value)}</span>
                                    <span className="text-[11px] text-right font-mono font-semibold">{fmtCur(ev.quantity * ev.unit_value)}</span>
                                    <span className="flex justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
                                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteEvent(ev.id)}>
                                        <Trash2 className="h-3 w-3 text-destructive/60 hover:text-destructive" />
                                      </Button>
                                    </span>
                                  </div>
                                ))}

                                {/* Add service row */}
                                {addingEventTo === sub.id ? (
                                  <div className="grid grid-cols-[36px_70px_90px_80px_1fr_50px_70px_90px_110px_36px] gap-0 border-b px-2 py-1.5 bg-accent/10 items-center">
                                    <span />
                                    <Input value={newEvent.item_code} onChange={e => setNewEvent(ev => ({ ...ev, item_code: e.target.value }))} placeholder="1.1.1" className="h-7 text-[11px] border-dashed ml-3" />
                                    <Input value={newEvent.discrimination} onChange={e => setNewEvent(ev => ({ ...ev, discrimination: e.target.value }))} placeholder="SINAPI" className="h-7 text-[11px] border-dashed" />
                                    <Input value={newEvent.sinapi_code} onChange={e => setNewEvent(ev => ({ ...ev, sinapi_code: e.target.value }))} placeholder="Código" className="h-7 text-[11px] border-dashed" />
                                    <Input value={newEvent.description} onChange={e => setNewEvent(ev => ({ ...ev, description: e.target.value }))} placeholder="Descrição do serviço" className="h-7 text-[11px] border-dashed mx-1" />
                                    <Input value={newEvent.unit} onChange={e => setNewEvent(ev => ({ ...ev, unit: e.target.value }))} className="h-7 text-[11px] border-dashed text-center" />
                                    <Input type="number" value={newEvent.quantity || ""} onChange={e => setNewEvent(ev => ({ ...ev, quantity: parseFloat(e.target.value) || 0 }))} placeholder="0" className="h-7 text-[11px] border-dashed text-right" />
                                    <Input type="number" step="0.01" value={newEvent.unit_value || ""} onChange={e => setNewEvent(ev => ({ ...ev, unit_value: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className="h-7 text-[11px] border-dashed text-right" />
                                    <span className="text-[11px] text-right font-mono text-muted-foreground">{fmtCur(newEvent.quantity * newEvent.unit_value)}</span>
                                    <span className="flex gap-0.5 justify-center">
                                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleAddEvent(sub.id)}><Check className="h-3 w-3 text-green-500" /></Button>
                                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setAddingEventTo(null)}><X className="h-3 w-3 text-muted-foreground" /></Button>
                                    </span>
                                  </div>
                                ) : (
                                  <div className="border-b px-2 py-1">
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-primary gap-1 ml-10" onClick={() => setAddingEventTo(sub.id)}>
                                      <Plus className="h-3 w-3" /> Adicionar serviço
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}

                      {/* Add substage row */}
                      {addingSubstageTo === stage.id ? (
                        <div className="px-2 py-1.5 border-b bg-accent/10 flex items-center gap-2 pl-10">
                          <Input value={newSubstage.code} onChange={e => setNewSubstage(s => ({ ...s, code: e.target.value }))} placeholder="Ex: 1.1" className="h-7 text-xs w-20 border-dashed" />
                          <Input value={newSubstage.name} onChange={e => setNewSubstage(s => ({ ...s, name: e.target.value }))} placeholder="Nome da subetapa" className="h-7 text-xs flex-1 border-dashed" />
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleAddSubstage(stage.id)}><Check className="h-3 w-3 text-green-500" /></Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddingSubstageTo(null)}><X className="h-3 w-3 text-muted-foreground" /></Button>
                        </div>
                      ) : (
                        <div className="border-b px-2 py-1">
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-primary gap-1 ml-6" onClick={() => setAddingSubstageTo(stage.id)}>
                            <Plus className="h-3 w-3" /> Adicionar subetapa
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {/* Add new stage */}
            <div className="px-2 py-2 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <Input value={newStage.code} onChange={e => setNewStage(s => ({ ...s, code: e.target.value }))} placeholder="Ex: 3.0" className="h-7 text-xs w-20 border-dashed" />
                <Input value={newStage.name} onChange={e => setNewStage(s => ({ ...s, name: e.target.value }))} placeholder="Nome da nova etapa" className="h-7 text-xs flex-1 border-dashed" />
                <Button size="sm" variant="outline" onClick={handleAddStage} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Etapa
                </Button>
              </div>
            </div>

            {/* Grand Total */}
            <div className="grid grid-cols-[36px_70px_90px_80px_1fr_50px_70px_90px_110px_36px] gap-0 bg-muted/50 px-2 py-2.5 sticky bottom-0 border-t-2 border-primary/30">
              <span /><span /><span /><span />
              <span className="text-xs font-bold text-foreground">TOTAL GERAL DA PLANILHA</span>
              <span /><span /><span />
              <span className="text-sm font-bold text-right font-mono text-primary">{fmtCur(stats.totalContractual)}</span>
              <span />
            </div>
          </div>
        </ScrollArea>
      </div>

      {showAIImport && (
        <PleImportAIDialog
          open={showAIImport}
          onClose={() => setShowAIImport(false)}
          existingGroups={groups}
          onImport={handleAIImport}
        />
      )}
    </div>
  );
}

function InfoField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] uppercase text-muted-foreground tracking-wide font-medium">{label}</span>
      <p className={`text-xs font-semibold ${highlight ? "text-primary font-bold" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
