import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Home, Grid3X3, Plus, Trash2, Edit2, Check, X, Settings, ImagePlus, Eye, Ruler } from "lucide-react";
import { UnitTypesPanel } from "@/components/settings/UnitTypesPanel";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { LogoUploader } from "@/components/diario/LogoUploader";
import { ProjectCoordinatorSelector } from "@/components/admin/ProjectCoordinatorSelector";

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROJECT_TYPES = [
  "Residencial Popular",
  "Residencial Médio Padrão",
  "Residencial Alto Padrão",
  "Comercial",
  "Misto",
  "Loteamento",
];

export function ProjectSettingsDialog({ open, onOpenChange }: ProjectSettingsDialogProps) {
  const { 
    currentProject, 
    updateProject, 
    addQuadra, 
    updateQuadra, 
    deleteQuadra,
    generateHousesForProject,
    completeProjectSetup 
  } = useConstruction();
  const { canEdit, company } = useAuth();
  
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [contractor, setContractor] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expectedEndDate, setExpectedEndDate] = useState("");
  const [totalHouses, setTotalHouses] = useState("");
  const [unitSize, setUnitSize] = useState("");
  const [projectType, setProjectType] = useState("");
  
  // Quadra management
  const [newQuadraName, setNewQuadraName] = useState("");
  const [newQuadraHouses, setNewQuadraHouses] = useState("");
  const [editingQuadra, setEditingQuadra] = useState<string | null>(null);
  const [editQuadraName, setEditQuadraName] = useState("");
  const [editQuadraHouses, setEditQuadraHouses] = useState("");

  useEffect(() => {
    if (currentProject && open) {
      setName(currentProject.name);
      setLocation(currentProject.location);
      setContractor(currentProject.contractor);
      setStartDate(currentProject.startDate);
      setExpectedEndDate(currentProject.expectedEndDate);
      setTotalHouses(currentProject.totalHouses.toString());
      setUnitSize(currentProject.unitSize.toString());
      setProjectType(currentProject.projectType);
    }
  }, [currentProject, open]);

  const handleSaveInfo = () => {
    if (!currentProject) return;
    
    const newTotalHouses = parseInt(totalHouses) || currentProject.totalHouses;
    const newUnitSize = parseFloat(unitSize) || 45;
    
    // updateProject now handles house regeneration automatically
    updateProject(currentProject.id, { 
      name, 
      location, 
      contractor, 
      startDate, 
      expectedEndDate,
      totalHouses: newTotalHouses,
      unitSize: newUnitSize,
      projectType,
    });
    
    toast.success("Informações da obra salvas com sucesso!", {
      description: `${name} - ${newTotalHouses} casas`
    });
  };

  const handleAddQuadra = () => {
    if (!newQuadraName.trim() || !currentProject) return;
    
    const houseIds = parseHouseRange(newQuadraHouses);
    // Filter out houses that are already assigned to other quadras
    const alreadyAssigned = currentProject.quadras.flatMap(q => q.houses);
    const validHouseIds = houseIds.filter(id => 
      !alreadyAssigned.includes(id) && id <= currentProject.totalHouses
    );
    
    if (validHouseIds.length > 0) {
      addQuadra(newQuadraName, validHouseIds);
    }
    setNewQuadraName("");
    setNewQuadraHouses("");
  };

  const handleUpdateQuadra = (quadraId: string) => {
    if (!editQuadraName.trim() || !currentProject) return;
    
    const houseIds = parseHouseRange(editQuadraHouses);
    // Filter out houses that are already assigned to OTHER quadras
    const alreadyAssigned = currentProject.quadras
      .filter(q => q.id !== quadraId)
      .flatMap(q => q.houses);
    const validHouseIds = houseIds.filter(id => 
      !alreadyAssigned.includes(id) && id <= currentProject.totalHouses
    );
    
    updateQuadra(quadraId, editQuadraName, validHouseIds);
    setEditingQuadra(null);
  };

  const parseHouseRange = (input: string): number[] => {
    const houses: number[] = [];
    const parts = input.split(",").map(p => p.trim());
    
    parts.forEach(part => {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(n => parseInt(n.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            houses.push(i);
          }
        }
      } else {
        const num = parseInt(part);
        if (!isNaN(num)) {
          houses.push(num);
        }
      }
    });
    
    return [...new Set(houses)].sort((a, b) => a - b);
  };

  const formatHouseRange = (houses: number[]): string => {
    if (houses.length === 0) return "";
    
    const sorted = [...houses].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let end = sorted[0];
    
    for (let i = 1; i <= sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    
    return ranges.join(", ");
  };

  const startEditQuadra = (quadraId: string) => {
    const quadra = currentProject?.quadras.find(q => q.id === quadraId);
    if (quadra) {
      setEditingQuadra(quadraId);
      setEditQuadraName(quadra.name);
      setEditQuadraHouses(formatHouseRange(quadra.houses));
    }
  };

  const handleFinishSetup = () => {
    if (!currentProject) return;
    handleSaveInfo();
    completeProjectSetup(currentProject.id);
    onOpenChange(false);
  };

  if (!currentProject) return null;

  const assignedHouses = currentProject.quadras.flatMap(q => q.houses);
  const unassignedCount = currentProject.totalHouses - assignedHouses.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Configurações da Obra
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
            <TabsTrigger value="info" className="gap-2">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Informações</span>
              <span className="sm:hidden">Info</span>
            </TabsTrigger>
            <TabsTrigger value="quadras" className="gap-2">
              <Grid3X3 className="h-4 w-4" />
              Quadras
            </TabsTrigger>
            <TabsTrigger value="unidades" className="gap-2">
              <Ruler className="h-4 w-4" />
              <span className="hidden sm:inline">Tipologias</span>
              <span className="sm:hidden">Tipol.</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configurações</span>
              <span className="sm:hidden">Config</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="info" className="space-y-4 mt-4">
            {!canEdit && (
              <Alert>
                <Eye className="h-4 w-4" />
                <AlertDescription>
                  Modo visualização - você pode ver as informações mas não salvar alterações
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>Nome do Empreendimento</Label>
              <Input 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Loteamento Tapejara"
                disabled={!canEdit}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Localização</Label>
                <Input 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Cidade - UF"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Construtora Responsável</Label>
                <Input 
                  value={contractor}
                  onChange={(e) => setContractor(e.target.value)}
                  placeholder="Ex: Construtora Alpha"
                  disabled={!canEdit}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Início</Label>
                <Input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Previsão de Término</Label>
                <Input 
                  type="date"
                  value={expectedEndDate}
                  onChange={(e) => setExpectedEndDate(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Total de Casas</Label>
                <Input 
                  type="number"
                  value={totalHouses}
                  onChange={(e) => setTotalHouses(e.target.value)}
                  min="1"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Tamanho (m²)</Label>
                <Input 
                  type="number"
                  value={unitSize}
                  onChange={(e) => setUnitSize(e.target.value)}
                  min="1"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={projectType} onValueChange={setProjectType} disabled={!canEdit}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleSaveInfo} className="w-full" disabled={!canEdit}>
              {!canEdit ? "Modo Visualização" : "Salvar Informações"}
            </Button>
          </TabsContent>
          
          <TabsContent value="quadras" className="space-y-4 mt-4">
            {!canEdit && (
              <Alert>
                <Eye className="h-4 w-4" />
                <AlertDescription>
                  Modo visualização - você pode ver as quadras mas não salvar alterações
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {currentProject.houses.length} casas cadastradas
              </div>
              {unassignedCount > 0 && (
                <Badge variant="outline" className="text-amber-600">
                  {unassignedCount} casas sem quadra
                </Badge>
              )}
            </div>

            {/* Add new quadra */}
            <div className="p-4 border rounded-lg space-y-3">
              <Label className="font-medium">Adicionar Nova Quadra</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input 
                  value={newQuadraName}
                  onChange={(e) => setNewQuadraName(e.target.value)}
                  placeholder="Nome da quadra (ex: Quadra A)"
                  disabled={!canEdit}
                />
                <Input 
                  value={newQuadraHouses}
                  onChange={(e) => setNewQuadraHouses(e.target.value)}
                  placeholder="Casas: 1-10, 15, 20-25"
                  disabled={!canEdit}
                />
              </div>
              <Button onClick={handleAddQuadra} size="sm" className="gap-2" disabled={!canEdit}>
                <Plus className="h-4 w-4" />
                {!canEdit ? "Modo Visualização" : "Adicionar Quadra"}
              </Button>
            </div>

            {/* List of quadras */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {currentProject.quadras.map((quadra) => (
                <div key={quadra.id} className="p-3 border rounded-lg">
                  {editingQuadra === quadra.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input 
                          value={editQuadraName}
                          onChange={(e) => setEditQuadraName(e.target.value)}
                          placeholder="Nome da quadra"
                        />
                        <Input 
                          value={editQuadraHouses}
                          onChange={(e) => setEditQuadraHouses(e.target.value)}
                          placeholder="Casas: 1-10, 15"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          onClick={() => handleUpdateQuadra(quadra.id)}
                          className="gap-1"
                        >
                          <Check className="h-3 w-3" />
                          Salvar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setEditingQuadra(null)}
                          className="gap-1"
                        >
                          <X className="h-3 w-3" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{quadra.name}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          ({quadra.houses.length} casas: {formatHouseRange(quadra.houses)})
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {canEdit && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => startEditQuadra(quadra.id)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteQuadra(quadra.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {currentProject.quadras.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma quadra cadastrada. Adicione quadras para organizar as casas.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="unidades" className="space-y-4 mt-4">
            <UnitTypesPanel
              projectId={currentProject.id}
              totalHouses={currentProject.totalHouses}
              canEdit={canEdit}
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <div className="space-y-4">
              <ProjectCoordinatorSelector projectId={currentProject.id} />

              <div className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center gap-2">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  <Label className="font-medium">Logo do projeto</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Este logo será usado no diário de obra e relatórios deste projeto.
                  Se nenhum for definido, o logo da empresa{company?.name ? ` (${company.name})` : ""} será usado.
                </p>
                <LogoUploader
                  currentLogoUrl={currentProject.logoUrl ?? null}
                  pathPrefix={`${company?.id ?? "company"}/${currentProject.id}`}
                  onChange={(url) => {
                    updateProject(currentProject.id, { logoUrl: url });
                    toast.success(url ? "Logo do projeto atualizado." : "Logo do projeto removido.");
                  }}
                />
                {company?.logo_url && !currentProject.logoUrl && (
                  <div className="flex items-center gap-3 pt-2 border-t border-border">
                    <div className="h-10 w-10 rounded border border-border bg-muted/40 flex items-center justify-center overflow-hidden">
                      <img src={company.logo_url} alt="Logo da empresa" className="w-full h-full object-contain" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Usando o logo da empresa como padrão.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {!currentProject.setupComplete && (
            <Button onClick={handleFinishSetup}>
              Concluir Configuração
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
