import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Save, 
  CheckCircle2, 
  AlertTriangle, 
  Settings2, 
  Target,
  Home
} from "lucide-react";
import { toast } from "sonner";

interface House {
  id: number;
  macros: any[];
}

interface PlannedPeriod {
  planned_house_ids: number[];
  planned_houses: number;
  scope_name: string;
  measurement_number: number | null;
}

interface ProductionSummaryProps {
  selectedHouses: number[];
  selectedPeriod: PlannedPeriod | null;
  selectedMacro: string;
  selectedScope: string;
  scopeName: string;
  macroColor: string;
  houses: House[];
  customPercentMode: boolean;
  onCustomPercentModeChange: (value: boolean) => void;
  massPercentage: number;
  onMassPercentageChange: (value: number) => void;
  housePercentages: Record<number, number>;
  onHousePercentagesChange: (percentages: Record<number, number>) => void;
  onSave: () => void;
  isSaving: boolean;
  canEdit: boolean;
}

export function ProductionSummary({
  selectedHouses,
  selectedPeriod,
  selectedMacro,
  selectedScope,
  scopeName,
  macroColor,
  houses,
  customPercentMode,
  onCustomPercentModeChange,
  massPercentage,
  onMassPercentageChange,
  housePercentages,
  onHousePercentagesChange,
  onSave,
  isSaving,
  canEdit
}: ProductionSummaryProps) {
  // Get progress for a house
  const getHouseProgress = (houseId: number): number => {
    const house = houses.find(h => h.id === houseId);
    if (!house) return 0;
    const houseMacros = (house.macros as any[]) || [];
    const houseMacro = houseMacros.find(m => m.id === selectedMacro);
    const houseScope = houseMacro?.scopes?.find((s: any) => s.id === selectedScope);
    return houseScope?.progress || 0;
  };

  // Validation status
  const plannedCount = selectedPeriod?.planned_houses || 0;
  const selectedCount = selectedHouses.length;
  const difference = selectedCount - plannedCount;
  const isMatch = selectedPeriod && difference === 0;
  const isBelowTarget = selectedPeriod && difference < 0;
  const isAboveTarget = selectedPeriod && difference > 0;

  // Apply mass percentage to all selected houses
  const applyMassPercentage = () => {
    const newPercentages: Record<number, number> = {};
    selectedHouses.forEach(houseId => {
      const currentProgress = getHouseProgress(houseId);
      const maxAllowed = 100 - currentProgress;
      newPercentages[houseId] = Math.min(massPercentage, maxAllowed);
    });
    onHousePercentagesChange(newPercentages);
    toast.success(`Aplicado ${massPercentage}% a ${selectedHouses.length} casas`);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-4 flex flex-col h-full gap-4">
        {/* Service Info */}
        {scopeName && (
          <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: macroColor + '15', borderLeft: `4px solid ${macroColor}` }}>
            <Home className="w-5 h-5" style={{ color: macroColor }} />
            <div className="flex-1">
              <span className="font-semibold">{scopeName}</span>
              {selectedPeriod?.measurement_number && (
                <Badge variant="outline" className="ml-2 text-xs">
                  Medição {selectedPeriod.measurement_number}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Validation vs Planning */}
        {selectedPeriod && (
          <div className={`p-3 rounded-lg border-2 ${
            isMatch ? 'bg-green-50 dark:bg-green-900/20 border-green-300' :
            isBelowTarget ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300' :
            'bg-blue-50 dark:bg-blue-900/20 border-blue-300'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                <span className="font-medium text-sm">Meta de Produção</span>
              </div>
              {isMatch && <CheckCircle2 className="w-5 h-5 text-green-600" />}
              {isBelowTarget && <AlertTriangle className="w-5 h-5 text-amber-600" />}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-2xl font-bold">{plannedCount}</span>
                <p className="text-xs text-muted-foreground">Previsto</p>
              </div>
              <div>
                <span className={`text-2xl font-bold ${
                  isMatch ? 'text-green-600' : isBelowTarget ? 'text-amber-600' : 'text-blue-600'
                }`}>{selectedCount}</span>
                <p className="text-xs text-muted-foreground">Selecionado</p>
              </div>
              <div>
                <span className={`text-2xl font-bold ${
                  difference === 0 ? 'text-green-600' : difference < 0 ? 'text-amber-600' : 'text-blue-600'
                }`}>
                  {difference > 0 ? `+${difference}` : difference}
                </span>
                <p className="text-xs text-muted-foreground">Diferença</p>
              </div>
            </div>
          </div>
        )}

        {/* Summary when no planned period */}
        {!selectedPeriod && selectedHouses.length > 0 && (
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <span className="text-3xl font-bold">{selectedHouses.length}</span>
            <p className="text-sm text-muted-foreground">casas selecionadas</p>
            <Badge variant="outline" className="mt-2 text-xs">
              Serviço adicional (não planejado)
            </Badge>
          </div>
        )}

        {/* Percentage Mode */}
        {selectedHouses.length > 0 && (
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                <Label className="text-sm font-medium">Percentual personalizado</Label>
              </div>
              <Switch
                checked={customPercentMode}
                onCheckedChange={onCustomPercentModeChange}
              />
            </div>

            {customPercentMode && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">% para todas</Label>
                      <Badge variant="outline">{massPercentage}%</Badge>
                    </div>
                    <Slider
                      value={[massPercentage]}
                      onValueChange={(v) => onMassPercentageChange(v[0])}
                      max={100}
                      min={0}
                      step={5}
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={applyMassPercentage}>
                    Aplicar
                  </Button>
                </div>

                {Object.keys(housePercentages).length > 0 && (
                  <ScrollArea className="h-[120px]">
                    <div className="space-y-1.5 pr-2">
                      {selectedHouses.slice(0, 20).map(houseId => {
                        const currentProgress = getHouseProgress(houseId);
                        const maxAllowed = 100 - currentProgress;
                        const currentValue = housePercentages[houseId] ?? Math.min(massPercentage, maxAllowed);
                        
                        return (
                          <div key={houseId} className="flex items-center gap-2 text-xs">
                            <span className="w-12 font-medium">Casa {houseId}</span>
                            {currentProgress > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1">
                                {currentProgress}%
                              </Badge>
                            )}
                            <Slider
                              value={[currentValue]}
                              onValueChange={(v) => {
                                const limitedValue = Math.min(v[0], maxAllowed);
                                onHousePercentagesChange({
                                  ...housePercentages,
                                  [houseId]: limitedValue
                                });
                              }}
                              max={maxAllowed}
                              min={0}
                              step={5}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              value={currentValue}
                              onChange={(e) => {
                                const val = Math.min(maxAllowed, Math.max(0, parseInt(e.target.value) || 0));
                                onHousePercentagesChange({
                                  ...housePercentages,
                                  [houseId]: val
                                });
                              }}
                              className="w-12 h-6 text-xs text-center px-1"
                              min={0}
                              max={maxAllowed}
                            />
                          </div>
                        );
                      })}
                      {selectedHouses.length > 20 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          +{selectedHouses.length - 20} casas...
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>
        )}

        {/* Save Button */}
        <div className="mt-auto pt-4 border-t">
          <Button 
            className="w-full gap-2 h-12 text-base" 
            onClick={onSave}
            disabled={selectedHouses.length === 0 || isSaving || !canEdit}
            title={!canEdit ? "Você pode simular, mas não tem permissão para salvar" : ""}
          >
            <Save className="w-5 h-5" />
            {!canEdit ? "Modo Visualização" : isSaving ? "Salvando..." : (
              <>
                Registrar {selectedHouses.length} {selectedHouses.length === 1 ? 'casa' : 'casas'}
              </>
            )}
          </Button>
          {!canEdit && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Modo simulação - você pode interagir mas não salvar
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
