import { useEffect, useState } from 'react';
import { ServiceProductivity } from '@/hooks/useServiceProductivity';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Users, Calculator, Ruler, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useConstruction } from '@/contexts/ConstructionContext';
import { isPhysicalUnit } from '@/hooks/useServiceCapacities';

interface Props {
  service: {
    macroId: string;
    scopeId: string;
    macroName: string;
    scopeName: string;
    macroColor: string;
  };
  existingProductivity?: ServiceProductivity;
  onClose: () => void;
  onSave: (input: {
    macro_id: string;
    scope_id: string;
    productivity_value: number;
    productivity_unit: string;
    working_days_per_week?: number;
    default_team_count?: number;
    professionals_per_team?: number;
    helpers_per_team?: number;
    notes?: string;
  }) => Promise<any>;
}

/**
 * Resolve a unidade base de produtividade para um serviço.
 * Prioridade:
 *   1. Unidade definida no serviço (project_contract_services.unit_symbol)
 *   2. Unidade default da obra (projects.default_unit_symbol)
 *   3. Fallback "casa" (sistema legado: 1 unidade = 1 casa)
 */
function buildProductivityUnit(symbol: string | null | undefined, label: string | null | undefined) {
  const sym = (symbol || '').trim();
  const lbl = (label || '').trim();

  if (!sym) {
    // Sem unidade configurada → usa modelo "casa" (legado)
    return {
      symbol: 'casa',
      label: 'Casa',
      perDay: 'casas/dia',
      perWeek: 'casas/semana',
      isPhysical: false,
    };
  }

  // Unidade física → produtividade diária faz mais sentido
  if (isPhysicalUnit(sym)) {
    return {
      symbol: sym,
      label: lbl || sym,
      perDay: `${sym}/dia`,
      perWeek: `${sym}/semana`,
      isPhysical: true,
    };
  }

  // Unidade discreta (un, peça, etc.)
  return {
    symbol: sym,
    label: lbl || sym,
    perDay: `${sym}/dia`,
    perWeek: `${sym}/semana`,
    isPhysical: false,
  };
}

export function ServiceProductivityDialog({ service, existingProductivity, onClose, onSave }: Props) {
  const { currentProject } = useConstruction();
  const [isSaving, setIsSaving] = useState(false);
  const [unitInfo, setUnitInfo] = useState(buildProductivityUnit(null, null));
  const [unitLoaded, setUnitLoaded] = useState(false);

  const [formData, setFormData] = useState({
    productivity_value: existingProductivity?.productivity_value || 1,
    productivity_unit: existingProductivity?.productivity_unit || '',
    working_days_per_week: existingProductivity?.working_days_per_week || 5,
    default_team_count: existingProductivity?.default_team_count || 1,
    professionals_per_team: existingProductivity?.professionals_per_team || 1,
    helpers_per_team: existingProductivity?.helpers_per_team || 0,
    notes: existingProductivity?.notes || '',
  });

  // Resolve unidade do serviço (contrato → projeto → fallback)
  useEffect(() => {
    let cancelled = false;
    const resolveUnit = async () => {
      if (!currentProject?.id) return;
      try {
        // 1) Unidade do serviço no contrato
        const { data: contractRow } = await supabase
          .from('project_contract_services')
          .select('unit_label, unit_symbol')
          .eq('project_id', currentProject.id)
          .eq('scope_id', service.scopeId)
          .maybeSingle();

        let symbol = contractRow?.unit_symbol || null;
        let label = contractRow?.unit_label || null;

        // 2) Fallback: unidade default da obra
        if (!symbol) {
          const { data: projRow } = await supabase
            .from('projects')
            .select('default_unit_label, default_unit_symbol')
            .eq('id', currentProject.id)
            .maybeSingle();
          symbol = projRow?.default_unit_symbol || null;
          label = projRow?.default_unit_label || null;
        }

        if (cancelled) return;
        const info = buildProductivityUnit(symbol, label);
        setUnitInfo(info);

        // Se ainda não há produtividade configurada, sugere unidade base "perWeek"
        if (!existingProductivity) {
          setFormData((prev) => ({
            ...prev,
            productivity_unit: prev.productivity_unit || info.perWeek,
          }));
        }
        setUnitLoaded(true);
      } catch (err) {
        console.error('[ServiceProductivityDialog] resolveUnit', err);
        setUnitLoaded(true);
      }
    };
    resolveUnit();
    return () => {
      cancelled = true;
    };
  }, [currentProject?.id, service.scopeId, existingProductivity]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        macro_id: service.macroId,
        scope_id: service.scopeId,
        ...formData,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const totalPeople =
    formData.default_team_count * (formData.professionals_per_team + formData.helpers_per_team);
  const totalCapacity = formData.default_team_count * formData.productivity_value;

  // Opções de unidade derivadas da unidade-base do serviço
  const unitOptions = [
    { value: unitInfo.perWeek, label: unitInfo.perWeek },
    { value: unitInfo.perDay, label: unitInfo.perDay },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: service.macroColor }} />
            {service.scopeName}
          </DialogTitle>
          <DialogDescription>
            Configure produtividade e equipe para {service.macroName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Unidade base do serviço */}
          <div className="rounded-lg border bg-muted/40 p-3 flex items-center gap-2">
            <Ruler className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 text-sm">
              <span className="text-muted-foreground">Unidade base do serviço:</span>{' '}
              <Badge variant="secondary" className="font-mono ml-1">
                {unitInfo.symbol}
              </Badge>
              {unitInfo.symbol === 'casa' && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  Esta obra não tem tipologia/unidade cadastrada — o sistema adota{' '}
                  <strong>1 casa</strong> como unidade padrão.
                </p>
              )}
            </div>
          </div>

          {/* Produtividade */}
          <div className="space-y-3 rounded-lg border border-border p-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Produtividade Base
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Valor *</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0.01}
                  value={formData.productivity_value}
                  onChange={(e) =>
                    setFormData({ ...formData, productivity_value: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade *</Label>
                <Select
                  value={formData.productivity_unit}
                  onValueChange={(value) => setFormData({ ...formData, productivity_unit: value })}
                  disabled={!unitLoaded}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={unitLoaded ? 'Selecione...' : 'Carregando...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dias úteis por semana</Label>
              <Input
                type="number"
                min={1}
                max={7}
                value={formData.working_days_per_week}
                onChange={(e) =>
                  setFormData({ ...formData, working_days_per_week: parseInt(e.target.value) || 5 })
                }
              />
            </div>
          </div>

          {/* Composição da equipe */}
          <div className="space-y-3 rounded-lg border border-border p-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Composição da Equipe
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Equipes</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.default_team_count}
                  onChange={(e) =>
                    setFormData({ ...formData, default_team_count: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prof./equipe</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.professionals_per_team}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      professionals_per_team: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Aux./equipe</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.helpers_per_team}
                  onChange={(e) =>
                    setFormData({ ...formData, helpers_per_team: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          </div>

          {/* Resumo */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <h4 className="font-semibold text-sm">Resumo</h4>
            <p className="text-sm text-muted-foreground">
              {formData.default_team_count} equipe(s) com{' '}
              {formData.professionals_per_team + formData.helpers_per_team} pessoa(s) cada ={' '}
              <span className="font-semibold text-foreground">{totalPeople} pessoa(s) total</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Capacidade estimada:{' '}
              <span className="font-semibold text-foreground">
                {totalCapacity} {formData.productivity_unit}
              </span>
            </p>
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Textarea
              placeholder="Notas opcionais..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !unitLoaded}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
