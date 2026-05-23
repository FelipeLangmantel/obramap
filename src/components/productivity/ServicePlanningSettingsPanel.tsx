import { Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useServicePlanningSettings, type ServicePlanningType } from '@/hooks/useServicePlanningSettings';
import type { ServiceRef } from './TeamWorkGroupDialog';

interface Props {
  projectId: string | undefined;
  allServices: ServiceRef[];
}

const TYPE_OPTIONS: { value: ServicePlanningType; label: string }[] = [
  { value: 'physical_repetitive', label: 'Fisico repetitivo' },
  { value: 'physical_one_time', label: 'Fisico pontual' },
  { value: 'administrative_cost', label: 'Administrativo/custo' },
  { value: 'support_service', label: 'Apoio/controle' },
  { value: 'milestone', label: 'Marco' },
  { value: 'hidden_from_planning', label: 'Ocultar do planejamento' },
  { value: 'undefined', label: 'Indefinido' },
];

export function ServicePlanningSettingsPanel({ projectId, allServices }: Props) {
  const { getSettingFor, upsertSetting, canEdit, isLoading } = useServicePlanningSettings(projectId);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Configuracao de planejamento fisico por servico</p>
            <p className="mt-1 text-xs">
              Esta configuracao sera usada nas proximas fases para filtrar Gantt, Linha de Balanco e Planejamento
              Semanal. Por enquanto ela apenas e salva.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <ScrollArea className="h-[480px] rounded-lg border">
          <div className="divide-y">
            {allServices.map((svc) => {
              const setting = getSettingFor(svc.macroId, svc.scopeId);
              const type = setting?.service_planning_type ?? 'physical_repetitive';
              const gantt = setting?.include_in_gantt ?? true;
              const lob = setting?.include_in_line_of_balance ?? true;
              const wp = setting?.include_in_weekly_planning ?? true;

              const update = (patch: Partial<{
                service_planning_type: ServicePlanningType;
                include_in_gantt: boolean;
                include_in_line_of_balance: boolean;
                include_in_weekly_planning: boolean;
              }>) =>
                upsertSetting({
                  macro_id: svc.macroId,
                  scope_id: svc.scopeId,
                  service_name: svc.scopeName,
                  ...patch,
                });

              return (
                <div
                  key={svc.scopeId}
                  className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.5fr)_minmax(180px,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{svc.scopeName}</p>
                    <p className="truncate text-xs text-muted-foreground">{svc.macroName}</p>
                  </div>

                  <Select
                    value={type}
                    onValueChange={(v) => update({ service_planning_type: v as ServicePlanningType })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={gantt}
                        onCheckedChange={(v) => update({ include_in_gantt: v })}
                        disabled={!canEdit}
                      />
                      Gantt
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={lob}
                        onCheckedChange={(v) => update({ include_in_line_of_balance: v })}
                        disabled={!canEdit}
                      />
                      Linha
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={wp}
                        onCheckedChange={(v) => update({ include_in_weekly_planning: v })}
                        disabled={!canEdit}
                      />
                      Semanal
                    </label>
                  </div>
                </div>
              );
            })}

            {allServices.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nenhum servico cadastrado neste projeto.
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
