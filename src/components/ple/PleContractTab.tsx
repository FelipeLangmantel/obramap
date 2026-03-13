import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(groups.map(g => g.id)));

  const [projectForm, setProjectForm] = useState({
    name: currentProject?.name || "",
    location: currentProject?.location || "",
    contractor: currentProject?.contractor || "",
    contract_number: currentProject?.contract_number || "",
    program: currentProject?.program || "",
    total_houses: currentProject?.total_houses || 50,
    contract_value: currentProject?.contract_value || 0,
  });

  const [newGroup, setNewGroup] = useState({ code: "", name: "" });
  const [newEvent, setNewEvent] = useState({
    group_id: "", item_code: "", description: "", discrimination: "",
    sinapi_code: "", unit: "UN", quantity: 0, unit_value: 0,
  });
  const [addingEventToGroup, setAddingEventToGroup] = useState<string | null>(null);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Stats
  const stats = useMemo(() => {
    const totalContractual = events.reduce((s, e) => s + e.quantity * e.unit_value, 0);
    return {
      totalGroups: groups.length,
      totalEvents: events.length,
      totalContractual,
    };
  }, [groups, events]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
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

  const handleAddGroup = async () => {
    if (!newGroup.code || !newGroup.name) { toast.error("Código e nome obrigatórios"); return; }
    const result = await createGroup(newGroup);
    if (result) {
      setExpandedGroups(prev => new Set(prev).add(result.id));
      setNewGroup({ code: "", name: "" });
      toast.success("Grupo adicionado!");
    }
  };

  const handleAddEvent = async (groupId: string) => {
    if (!newEvent.item_code || !newEvent.description) { toast.error("Item e descrição obrigatórios"); return; }
    await createEvent({ ...newEvent, group_id: groupId } as any);
    setNewEvent({ group_id: "", item_code: "", description: "", discrimination: "", sinapi_code: "", unit: "UN", quantity: 0, unit_value: 0 });
    setAddingEventToGroup(null);
    toast.success("Serviço adicionado!");
  };

  const handleAIImport = async (
    newGroups: { code: string; name: string }[],
    importedEvents: { item_code: string; discrimination: string; sinapi_code: string; description: string; unit: string; quantity: number; unit_value: number; group_code: string; group_name: string }[]
  ) => {
    const groupIdMap = new Map<string, string>();
    groups.forEach(g => groupIdMap.set(g.code, g.id));
    for (const g of newGroups) {
      const result = await createGroup(g);
      if (result) groupIdMap.set(g.code, result.id);
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

  // Group events by group
  const eventsByGroup = useMemo(() => {
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
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Nome da Obra</Label>
                <Input value={projectForm.name} onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Localização</Label>
                <Input value={projectForm.location} onChange={e => setProjectForm(p => ({ ...p, location: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Empresa Executora</Label>
                <Input value={projectForm.contractor} onChange={e => setProjectForm(p => ({ ...p, contractor: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Nº Contrato</Label>
                <Input value={projectForm.contract_number} onChange={e => setProjectForm(p => ({ ...p, contract_number: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Programa</Label>
                <Input value={projectForm.program} onChange={e => setProjectForm(p => ({ ...p, program: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Total de Casas</Label>
                <Input type="number" value={projectForm.total_houses} onChange={e => setProjectForm(p => ({ ...p, total_houses: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">Valor do Contrato (R$)</Label>
                <Input type="number" step="0.01" value={projectForm.contract_value} onChange={e => setProjectForm(p => ({ ...p, contract_value: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" />
              </div>
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

      {/* Services Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-foreground">Planilha Orçamentária</h2>
            <Badge variant="secondary" className="text-[10px]">{stats.totalGroups} grupos</Badge>
            <Badge variant="outline" className="text-[10px]">{stats.totalEvents} serviços</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAIImport(true)} className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Importar via IA
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 border rounded-lg">
          <div className="min-w-[900px]">
            {/* Table Header */}
            <div className="grid grid-cols-[40px_80px_1fr_100px_60px_80px_100px_120px_40px] gap-0 bg-muted/50 border-b px-2 py-2 sticky top-0 z-10">
              <span className="text-[10px] font-bold text-muted-foreground uppercase"></span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">ITEM</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">DESCRIÇÃO</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">CÓD. SINAPI</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-center">UNID</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">QTDE</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">VLR UNIT.</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">TOTAL</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase"></span>
            </div>

            {/* Groups */}
            {groups.map(group => {
              const groupEvents = eventsByGroup.get(group.id) || [];
              const groupTotal = groupEvents.reduce((s, e) => s + e.quantity * e.unit_value, 0);
              const isExpanded = expandedGroups.has(group.id);

              return (
                <div key={group.id}>
                  {/* Group Header */}
                  <div
                    className="grid grid-cols-[40px_80px_1fr_100px_60px_80px_100px_120px_40px] gap-0 bg-primary/8 border-b px-2 py-1.5 cursor-pointer hover:bg-primary/12 transition-colors items-center"
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span className="flex items-center justify-center">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-primary" />}
                    </span>
                    <span className="text-xs font-bold text-primary">{group.code}</span>
                    <span className="text-xs font-bold text-foreground">{group.name.toUpperCase()}</span>
                    <span />
                    <span />
                    <span />
                    <span className="text-[10px] text-muted-foreground text-right">{groupEvents.length} itens</span>
                    <span className="text-xs font-bold text-right font-mono">{fmtCur(groupTotal)}</span>
                    <span className="flex justify-center">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={e => { e.stopPropagation(); deleteGroup(group.id); }}>
                        <Trash2 className="h-3 w-3 text-destructive/60 hover:text-destructive" />
                      </Button>
                    </span>
                  </div>

                  {/* Events */}
                  {isExpanded && (
                    <>
                      {groupEvents
                        .sort((a, b) => a.display_order - b.display_order)
                        .map(ev => (
                          <div key={ev.id} className="grid grid-cols-[40px_80px_1fr_100px_60px_80px_100px_120px_40px] gap-0 border-b px-2 py-1.5 hover:bg-accent/30 transition-colors items-center group/row">
                            <span />
                            <span className="text-[11px] font-mono text-muted-foreground">{ev.item_code}</span>
                            <span className="text-[11px] text-foreground truncate pr-2" title={ev.description}>{ev.description}</span>
                            <span className="text-[11px] font-mono text-muted-foreground">{ev.sinapi_code || "—"}</span>
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

                      {/* Add event row */}
                      {addingEventToGroup === group.id ? (
                        <div className="grid grid-cols-[40px_80px_1fr_100px_60px_80px_100px_120px_40px] gap-0 border-b px-2 py-1.5 bg-accent/10 items-center">
                          <span />
                          <Input value={newEvent.item_code} onChange={e => setNewEvent(ev => ({ ...ev, item_code: e.target.value }))} placeholder="1.1.1" className="h-7 text-[11px] border-dashed" />
                          <Input value={newEvent.description} onChange={e => setNewEvent(ev => ({ ...ev, description: e.target.value }))} placeholder="Descrição do serviço" className="h-7 text-[11px] border-dashed mx-1" />
                          <Input value={newEvent.sinapi_code} onChange={e => setNewEvent(ev => ({ ...ev, sinapi_code: e.target.value }))} placeholder="SINAPI" className="h-7 text-[11px] border-dashed" />
                          <Input value={newEvent.unit} onChange={e => setNewEvent(ev => ({ ...ev, unit: e.target.value }))} className="h-7 text-[11px] border-dashed text-center" />
                          <Input type="number" value={newEvent.quantity || ""} onChange={e => setNewEvent(ev => ({ ...ev, quantity: parseFloat(e.target.value) || 0 }))} placeholder="0" className="h-7 text-[11px] border-dashed text-right" />
                          <Input type="number" step="0.01" value={newEvent.unit_value || ""} onChange={e => setNewEvent(ev => ({ ...ev, unit_value: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className="h-7 text-[11px] border-dashed text-right" />
                          <span className="text-[11px] text-right font-mono text-muted-foreground">{fmtCur(newEvent.quantity * newEvent.unit_value)}</span>
                          <span className="flex gap-0.5 justify-center">
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleAddEvent(group.id)}>
                              <Check className="h-3 w-3 text-green-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setAddingEventToGroup(null)}>
                              <X className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </span>
                        </div>
                      ) : (
                        <div className="border-b px-2 py-1">
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 text-[10px] text-muted-foreground hover:text-primary gap-1 ml-10"
                            onClick={() => {
                              setAddingEventToGroup(group.id);
                              setNewEvent(ev => ({ ...ev, group_id: group.id }));
                            }}
                          >
                            <Plus className="h-3 w-3" /> Adicionar serviço
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {/* Add new group */}
            <div className="px-2 py-2 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <Input value={newGroup.code} onChange={e => setNewGroup(g => ({ ...g, code: e.target.value }))} placeholder="Ex: 3.0" className="h-7 text-xs w-20 border-dashed" />
                <Input value={newGroup.name} onChange={e => setNewGroup(g => ({ ...g, name: e.target.value }))} placeholder="Nome do novo grupo (macro)" className="h-7 text-xs flex-1 border-dashed" />
                <Button size="sm" variant="outline" onClick={handleAddGroup} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Grupo
                </Button>
              </div>
            </div>

            {/* Grand Total */}
            <div className="grid grid-cols-[40px_80px_1fr_100px_60px_80px_100px_120px_40px] gap-0 bg-muted/50 px-2 py-2.5 sticky bottom-0 border-t-2 border-primary/30">
              <span />
              <span />
              <span className="text-xs font-bold text-foreground">TOTAL GERAL DA PLANILHA</span>
              <span />
              <span />
              <span />
              <span />
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
