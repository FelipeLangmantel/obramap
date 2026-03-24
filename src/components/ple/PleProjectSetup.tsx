import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Sparkles, Link2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PleImportAIDialog } from "./PleImportAIDialog";
import type { usePleData } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;
interface Props extends PleDataReturn {
  onCreated: (id: string) => void;
  isDialog?: boolean;
  open?: boolean;
  onClose?: () => void;
}

interface ObraMapProject {
  id: string;
  name: string;
  total_houses: number;
}

interface HoldingObra {
  id: string;
  nome: string;
  num_contrato: string | null;
  empresa: string | null;
  valor_contrato: number;
  total_houses: number;
  data_inicio: string | null;
  obramap_project_id: string | null;
}

function SetupContent({ onCreated, ...props }: Props) {
  const { currentProject, groups, events, createProject, createGroup, deleteGroup, createEvent, deleteEvent, updateProject } = props;
  const { company } = useAuth();

  const [showAIImport, setShowAIImport] = useState(false);
  const [obraMapProjects, setObraMapProjects] = useState<ObraMapProject[]>([]);
  const [holdingObras, setHoldingObras] = useState<HoldingObra[]>([]);
  const [isIntegrated, setIsIntegrated] = useState(currentProject?.mode === "integrated");

  const [projectForm, setProjectForm] = useState({
    name: currentProject?.name || "",
    location: currentProject?.location || "",
    contractor: currentProject?.contractor || "",
    contract_number: currentProject?.contract_number || "",
    program: currentProject?.program || "",
    total_houses: currentProject?.total_houses || 50,
    contract_value: currentProject?.contract_value || 0,
    obramap_project_id: currentProject?.obramap_project_id || null as string | null,
    mode: currentProject?.mode || "standalone" as "standalone" | "integrated",
    obras_portfolio_id: currentProject?.obras_portfolio_id || null as string | null,
  });

  const [newGroup, setNewGroup] = useState({ code: "", name: "" });
  const [newEvent, setNewEvent] = useState({ group_id: "", item_code: "", description: "", discrimination: "", sinapi_code: "", unit: "UN", quantity: 0, unit_value: 0 });

  // Load Holding obras
  useEffect(() => {
    const load = async () => {
      if (!company?.id) return;
      const { data } = await supabase
        .from("obras_portfolio")
        .select("id, nome, num_contrato, empresa, valor_contrato, total_houses, data_inicio, obramap_project_id")
        .eq("company_id", company.id)
        .order("nome");
      if (data) setHoldingObras(data as HoldingObra[]);
    };
    load();
  }, [company?.id]);

  // Load ObraMap projects
  useEffect(() => {
    const loadProjects = async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, total_houses")
        .order("name");
      if (data) setObraMapProjects(data as ObraMapProject[]);
    };
    if (isIntegrated) loadProjects();
  }, [isIntegrated]);

  const handleToggleMode = (integrated: boolean) => {
    setIsIntegrated(integrated);
    if (!integrated) {
      setProjectForm(p => ({ ...p, obramap_project_id: null, mode: "standalone" }));
    } else {
      setProjectForm(p => ({ ...p, mode: "integrated" }));
    }
  };

  const handleSelectHoldingObra = async (obraId: string) => {
    if (obraId === "__none__") {
      setProjectForm(p => ({ ...p, obras_portfolio_id: null }));
      return;
    }
    const obra = holdingObras.find(o => o.id === obraId);
    if (!obra) return;

    setProjectForm(p => ({
      ...p,
      obras_portfolio_id: obraId,
      name: obra.nome || p.name,
      contract_number: obra.num_contrato || p.contract_number,
      contractor: obra.empresa || p.contractor,
      contract_value: obra.valor_contrato || p.contract_value,
      total_houses: obra.total_houses || p.total_houses,
      // Auto-enable integrated mode if Holding obra links to ObraMap
      ...(obra.obramap_project_id ? {
        obramap_project_id: obra.obramap_project_id,
        mode: "integrated" as const,
      } : {}),
    }));

    if (obra.obramap_project_id) {
      setIsIntegrated(true);
    }

    toast.success("Dados importados da Holding!");
  };

  const handleSelectObraMap = (projectId: string) => {
    const selected = obraMapProjects.find(p => p.id === projectId);
    if (selected) {
      setProjectForm(p => ({
        ...p,
        obramap_project_id: projectId,
        total_houses: selected.total_houses,
      }));
    }
  };

  const handleCreateProject = async () => {
    if (!projectForm.name) { toast.error("Nome obrigatório"); return; }
    const result = await createProject(projectForm as any);
    if (result) onCreated(result.id);
  };

  const handleSaveProject = async () => {
    if (!currentProject) return;
    await updateProject(currentProject.id, projectForm as any);
    toast.success("Projeto atualizado!");
  };

  const handleLinkExisting = async () => {
    if (!currentProject || !projectForm.obramap_project_id) return;
    await updateProject(currentProject.id, {
      obramap_project_id: projectForm.obramap_project_id,
      mode: "integrated",
      total_houses: projectForm.total_houses,
    } as any);
    toast.success("Projeto PLE vinculado à obra!");
  };

  const handleAddGroup = async () => {
    if (!newGroup.code || !newGroup.name) return;
    await createGroup(newGroup);
    setNewGroup({ code: "", name: "" });
  };

  const handleAddEvent = async () => {
    if (!newEvent.item_code || !newEvent.description) return;
    await createEvent({ ...newEvent, group_id: newEvent.group_id || null } as any);
    setNewEvent({ group_id: "", item_code: "", description: "", discrimination: "", sinapi_code: "", unit: "UN", quantity: 0, unit_value: 0 });
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
  };

  const selectedObraName = obraMapProjects.find(p => p.id === projectForm.obramap_project_id)?.name;
  const selectedHoldingObra = holdingObras.find(o => o.id === projectForm.obras_portfolio_id);

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pb-4">
      {/* Step 0: Link to Holding */}
      {!currentProject && holdingObras.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Vincular à Holding (opcional)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Selecione uma obra da Holding para importar automaticamente os dados do contrato.
            </p>
            <Select
              value={projectForm.obras_portfolio_id || "__none__"}
              onValueChange={handleSelectHoldingObra}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione uma obra da Holding..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma (criar independente)</SelectItem>
                {holdingObras.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome} {o.num_contrato ? `— ${o.num_contrato}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedHoldingObra && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                  <Building2 className="h-2.5 w-2.5 mr-1" /> {selectedHoldingObra.nome}
                </Badge>
                {selectedHoldingObra.obramap_project_id && (
                  <Badge variant="secondary" className="text-[10px]">
                    <Link2 className="h-2.5 w-2.5 mr-1" /> Integrado ao ObraMap
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Project Info */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Dados do Projeto</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Integration Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Vincular à Obra ObraMap</Label>
              <p className="text-[10px] text-muted-foreground">
                {isIntegrated ? "Integrado — dados sincronizados com a obra" : "Standalone — projeto PLE independente"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{isIntegrated ? "Integrado" : "Standalone"}</span>
              <Switch checked={isIntegrated} onCheckedChange={handleToggleMode} />
            </div>
          </div>

          {isIntegrated && (
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Link2 className="h-3 w-3 text-primary" /> Selecionar Obra
              </Label>
              <Select
                value={projectForm.obramap_project_id || ""}
                onValueChange={handleSelectObraMap}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione uma obra..." />
                </SelectTrigger>
                <SelectContent>
                  {obraMapProjects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.total_houses} casas
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedObraName && (
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                  Vinculado: {selectedObraName}
                </Badge>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Nome da Obra</Label><Input value={projectForm.name} onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Localização</Label><Input value={projectForm.location} onChange={e => setProjectForm(p => ({ ...p, location: e.target.value }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Empresa Executora</Label><Input value={projectForm.contractor} onChange={e => setProjectForm(p => ({ ...p, contractor: e.target.value }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Nº Contrato</Label><Input value={projectForm.contract_number} onChange={e => setProjectForm(p => ({ ...p, contract_number: e.target.value }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Programa</Label><Input value={projectForm.program} onChange={e => setProjectForm(p => ({ ...p, program: e.target.value }))} className="h-8 text-xs" /></div>
            <div>
              <Label className="text-xs">Total de Casas</Label>
              <Input
                type="number"
                value={projectForm.total_houses}
                onChange={e => setProjectForm(p => ({ ...p, total_houses: parseInt(e.target.value) || 0 }))}
                className="h-8 text-xs"
                disabled={isIntegrated && !!projectForm.obramap_project_id}
              />
            </div>
            <div><Label className="text-xs">Valor do Contrato (R$)</Label><Input type="number" step="0.01" value={projectForm.contract_value} onChange={e => setProjectForm(p => ({ ...p, contract_value: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" onClick={currentProject ? handleSaveProject : handleCreateProject} className="w-full sm:w-auto">
              {currentProject ? "Salvar" : "Criar Projeto"}
            </Button>
            {currentProject && !currentProject.obramap_project_id && isIntegrated && projectForm.obramap_project_id && (
              <Button size="sm" variant="outline" onClick={handleLinkExisting} className="gap-1">
                <Link2 className="h-3 w-3" /> Vincular
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {currentProject && (
        <>
          {/* Groups */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Grupos (Macros)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {groups.map(g => (
                <div key={g.id} className="flex items-center gap-2 text-xs bg-accent/30 px-3 py-2 rounded">
                  <span className="font-bold text-primary">{g.code}</span>
                  <span className="flex-1">{g.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteGroup(g.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input value={newGroup.code} onChange={e => setNewGroup(g => ({ ...g, code: e.target.value }))} placeholder="Ex: 1.0" className="h-8 text-xs w-20" />
                <Input value={newGroup.name} onChange={e => setNewGroup(g => ({ ...g, name: e.target.value }))} placeholder="Nome do grupo" className="h-8 text-xs flex-1" />
                <Button size="sm" variant="outline" onClick={handleAddGroup}><Plus className="h-3 w-3" /></Button>
              </div>
            </CardContent>
          </Card>

          {/* Events */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Serviços / Eventos</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowAIImport(true)} className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Importar via IA
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {events.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 text-xs bg-accent/20 px-3 py-2 rounded">
                  <span className="font-mono text-primary w-12">{ev.item_code}</span>
                  <span className="flex-1 truncate">{ev.description}</span>
                  <span className="text-muted-foreground w-8">{ev.unit}</span>
                  <span className="text-muted-foreground w-12 text-right">{ev.quantity}</span>
                  <span className="text-muted-foreground w-20 text-right">R$ {ev.unit_value.toFixed(2)}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteEvent(ev.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="grid grid-cols-8 gap-1 items-end">
                <div>
                  <Label className="text-[10px]">Grupo</Label>
                  <select value={newEvent.group_id} onChange={e => setNewEvent(ev => ({ ...ev, group_id: e.target.value }))} className="w-full h-8 text-xs rounded border border-border bg-background px-1">
                    <option value="">Nenhum</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.code}</option>)}
                  </select>
                </div>
                <div><Label className="text-[10px]">Item</Label><Input value={newEvent.item_code} onChange={e => setNewEvent(ev => ({ ...ev, item_code: e.target.value }))} placeholder="1.1.1" className="h-8 text-xs" /></div>
                <div className="col-span-2"><Label className="text-[10px]">Descrição</Label><Input value={newEvent.description} onChange={e => setNewEvent(ev => ({ ...ev, description: e.target.value }))} className="h-8 text-xs" /></div>
                <div><Label className="text-[10px]">Cód. SINAPI</Label><Input value={newEvent.sinapi_code} onChange={e => setNewEvent(ev => ({ ...ev, sinapi_code: e.target.value }))} className="h-8 text-xs" /></div>
                <div><Label className="text-[10px]">Unid</Label><Input value={newEvent.unit} onChange={e => setNewEvent(ev => ({ ...ev, unit: e.target.value }))} className="h-8 text-xs" /></div>
                <div><Label className="text-[10px]">Qtde</Label><Input type="number" value={newEvent.quantity} onChange={e => setNewEvent(ev => ({ ...ev, quantity: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
                <div className="flex gap-1 items-end">
                  <div className="flex-1"><Label className="text-[10px]">Valor Unit.</Label><Input type="number" step="0.01" value={newEvent.unit_value} onChange={e => setNewEvent(ev => ({ ...ev, unit_value: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
                  <Button size="sm" variant="outline" onClick={handleAddEvent} className="h-8"><Plus className="h-3 w-3" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {showAIImport && (
            <PleImportAIDialog
              open={showAIImport}
              onClose={() => setShowAIImport(false)}
              existingGroups={groups}
              onImport={handleAIImport}
            />
          )}
        </>
      )}
    </div>
  );
}

export function PleProjectSetup(props: Props) {
  if (props.isDialog) {
    return (
      <Dialog open={props.open} onOpenChange={v => !v && props.onClose?.()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Configurar Projeto PLE</DialogTitle></DialogHeader>
          <SetupContent {...props} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <h1 className="text-2xl font-bold mb-2 text-foreground">Módulo de Medições PLE</h1>
        <p className="text-muted-foreground mb-6">Crie um novo projeto para começar a lançar medições.</p>
        {props.projects.length > 0 && (
          <div className="mb-6 space-y-2">
            <Label className="text-sm">Ou selecione um projeto existente:</Label>
            {props.projects.map(p => (
              <Button key={p.id} variant="outline" className="w-full justify-start gap-2" onClick={() => props.setCurrentProjectId(p.id)}>
                {p.name} — {p.total_houses} casas
                {p.mode === "integrated" && <Badge variant="secondary" className="text-[9px]">Integrado</Badge>}
                {(p as any).obras_portfolio_id && <Badge className="text-[9px] bg-amber-500/90 hover:bg-amber-500">Holding</Badge>}
              </Button>
            ))}
          </div>
        )}
        <SetupContent {...props} />
      </div>
    </div>
  );
}
