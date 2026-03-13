import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Edit2, Check, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PleImportAIDialog } from "./PleImportAIDialog";
import type { usePleData } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;
interface Props extends PleDataReturn {
  onCreated: (id: string) => void;
  isDialog?: boolean;
  open?: boolean;
  onClose?: () => void;
}

function SetupContent({ onCreated, ...props }: Props) {
  const { currentProject, groups, events, createProject, createGroup, updateGroup, deleteGroup, createEvent, updateEvent, deleteEvent, updateProject } = props;

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
  const [newEvent, setNewEvent] = useState({ group_id: "", item_code: "", description: "", discrimination: "", sinapi_code: "", unit: "UN", quantity: 0, unit_value: 0 });
  const [editingEvent, setEditingEvent] = useState<string | null>(null);

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

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto">
      {/* Project Info */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Dados do Projeto</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Nome da Obra</Label><Input value={projectForm.name} onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))} className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Localização</Label><Input value={projectForm.location} onChange={e => setProjectForm(p => ({ ...p, location: e.target.value }))} className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Empresa Executora</Label><Input value={projectForm.contractor} onChange={e => setProjectForm(p => ({ ...p, contractor: e.target.value }))} className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Nº Contrato</Label><Input value={projectForm.contract_number} onChange={e => setProjectForm(p => ({ ...p, contract_number: e.target.value }))} className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Programa</Label><Input value={projectForm.program} onChange={e => setProjectForm(p => ({ ...p, program: e.target.value }))} className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Total de Casas</Label><Input type="number" value={projectForm.total_houses} onChange={e => setProjectForm(p => ({ ...p, total_houses: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Valor do Contrato (R$)</Label><Input type="number" step="0.01" value={projectForm.contract_value} onChange={e => setProjectForm(p => ({ ...p, contract_value: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
          <div className="flex items-end">
            <Button size="sm" onClick={currentProject ? handleSaveProject : handleCreateProject}>
              {currentProject ? "Salvar" : "Criar Projeto"}
            </Button>
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
            <CardHeader><CardTitle className="text-sm">Serviços / Eventos</CardTitle></CardHeader>
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
              <Button key={p.id} variant="outline" className="w-full justify-start" onClick={() => props.setCurrentProjectId(p.id)}>
                {p.name} — {p.total_houses} casas
              </Button>
            ))}
          </div>
        )}
        <SetupContent {...props} />
      </div>
    </div>
  );
}
