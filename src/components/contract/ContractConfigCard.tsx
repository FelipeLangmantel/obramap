import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Settings2, Building2, Calendar, Hash, Percent } from "lucide-react";
import { ProjectContract } from "@/hooks/useProjectContract";

interface ContractConfigCardProps {
  contract: ProjectContract | null;
  setContract: React.Dispatch<React.SetStateAction<ProjectContract | null>>;
  updateCostTarget: (percent: number) => void;
  isEditing: boolean;
}

export function ContractConfigCard({
  contract,
  setContract,
  updateCostTarget,
  isEditing,
}: ContractConfigCardProps) {
  const { currentProject } = useConstruction();

  if (!contract) return null;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings2 className="h-5 w-5 text-primary" />
          Configurações do Contrato
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Project Name */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              Projeto
            </Label>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm font-medium">
                {currentProject?.name || "—"}
              </Badge>
            </div>
          </div>

          {/* Contract Number */}
          <div className="space-y-2">
            <Label htmlFor="contract_number" className="flex items-center gap-2 text-muted-foreground">
              <Hash className="h-4 w-4" />
              Número do Contrato
            </Label>
            <Input
              id="contract_number"
              value={contract.contract_number || ""}
              onChange={(e) => setContract(prev => prev ? { ...prev, contract_number: e.target.value } : null)}
              placeholder="Ex: CONT-2024-001"
              disabled={!isEditing}
              className="bg-background"
            />
          </div>

          {/* Contract Date */}
          <div className="space-y-2">
            <Label htmlFor="contract_date" className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Data do Contrato
            </Label>
            <Input
              id="contract_date"
              type="date"
              value={contract.contract_date || ""}
              onChange={(e) => setContract(prev => prev ? { ...prev, contract_date: e.target.value } : null)}
              disabled={!isEditing}
              className="bg-background"
            />
          </div>

          {/* Cost Target Percent */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-muted-foreground">
              <Percent className="h-4 w-4" />
              Meta de Custo do Projeto
            </Label>
            <div className="flex items-center gap-3">
              <Slider
                value={[contract.cost_target_percent]}
                onValueChange={([value]) => updateCostTarget(value)}
                min={50}
                max={95}
                step={1}
                disabled={!isEditing}
                className="flex-1"
              />
              <Badge 
                variant="outline" 
                className="min-w-[50px] justify-center text-primary font-bold"
              >
                {contract.cost_target_percent}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Margem projetada: {100 - contract.cost_target_percent}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
