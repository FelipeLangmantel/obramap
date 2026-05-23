import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type ServicePlanningType =
  | 'physical_repetitive'
  | 'physical_one_time'
  | 'administrative_cost'
  | 'support_service'
  | 'milestone'
  | 'hidden_from_planning'
  | 'undefined';

export interface ServicePlanningSetting {
  id: string;
  company_id: string;
  project_id: string;
  macro_id: string | null;
  scope_id: string | null;
  service_name: string | null;
  service_planning_type: ServicePlanningType;
  include_in_gantt: boolean;
  include_in_line_of_balance: boolean;
  include_in_weekly_planning: boolean;
  notes: string | null;
}

export interface SettingInput {
  macro_id?: string | null;
  scope_id?: string | null;
  service_name?: string | null;
  service_planning_type?: ServicePlanningType;
  include_in_gantt?: boolean;
  include_in_line_of_balance?: boolean;
  include_in_weekly_planning?: boolean;
  notes?: string | null;
}

export function useServicePlanningSettings(projectId: string | undefined) {
  const { canEdit, profile } = useAuth();
  const [settings, setSettings] = useState<ServicePlanningSetting[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) {
      setSettings([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_service_planning_settings' as any)
        .select('*')
        .eq('project_id', projectId);
      if (error) throw error;
      setSettings((data as any[]) || []);
    } catch (err: any) {
      console.error('useServicePlanningSettings load:', err);
      toast.error('Erro ao carregar configuracoes de planejamento');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const getSettingFor = useCallback(
    (macro_id: string | null | undefined, scope_id: string | null | undefined) => {
      const m = macro_id ?? null;
      const s = scope_id ?? null;
      return settings.find(
        (x) => (x.macro_id ?? null) === m && (x.scope_id ?? null) === s,
      );
    },
    [settings],
  );

  const upsertSetting = useCallback(
    async (input: SettingInput) => {
      if (!canEdit) {
        toast.error('Voce nao tem permissao para editar');
        return false;
      }
      if (!projectId || !profile?.company_id) return false;

      try {
        const existing = getSettingFor(input.macro_id, input.scope_id);
        if (existing) {
          const { error } = await supabase
            .from('project_service_planning_settings' as any)
            .update({
              service_name: input.service_name ?? existing.service_name,
              service_planning_type: input.service_planning_type ?? existing.service_planning_type,
              include_in_gantt: input.include_in_gantt ?? existing.include_in_gantt,
              include_in_line_of_balance: input.include_in_line_of_balance ?? existing.include_in_line_of_balance,
              include_in_weekly_planning: input.include_in_weekly_planning ?? existing.include_in_weekly_planning,
              notes: input.notes ?? existing.notes,
              updated_by: profile.user_id,
            })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('project_service_planning_settings' as any)
            .insert({
              company_id: profile.company_id,
              project_id: projectId,
              macro_id: input.macro_id ?? null,
              scope_id: input.scope_id ?? null,
              service_name: input.service_name ?? null,
              service_planning_type: input.service_planning_type ?? 'physical_repetitive',
              include_in_gantt: input.include_in_gantt ?? true,
              include_in_line_of_balance: input.include_in_line_of_balance ?? true,
              include_in_weekly_planning: input.include_in_weekly_planning ?? true,
              notes: input.notes ?? null,
              created_by: profile.user_id,
              updated_by: profile.user_id,
            });
          if (error) throw error;
        }
        await load();
        return true;
      } catch (err: any) {
        console.error(err);
        toast.error('Erro ao salvar configuracao: ' + (err?.message || ''));
        return false;
      }
    },
    [canEdit, projectId, profile, getSettingFor, load],
  );

  return { settings, isLoading, canEdit, load, getSettingFor, upsertSetting };
}
