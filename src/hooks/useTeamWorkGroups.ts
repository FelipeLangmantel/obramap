import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TeamWorkGroup {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  description: string | null;
  base_unit: string | null;
  productivity_value: number | null;
  productivity_unit: string | null;
  working_days_per_week: number | null;
  simultaneous_team_count: number | null;
  professional_count: number | null;
  auxiliary_count: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamWorkGroupService {
  id: string;
  company_id: string;
  project_id: string;
  group_id: string;
  macro_id: string | null;
  scope_id: string | null;
  service_name: string | null;
  sequence_order: number | null;
  lag_days: number | null;
  productivity_override: number | null;
  productivity_unit_override: string | null;
  active: boolean;
}

export interface TeamWorkGroupInput {
  name: string;
  description?: string | null;
  base_unit?: string | null;
  productivity_value?: number | null;
  productivity_unit?: string | null;
  working_days_per_week?: number | null;
  simultaneous_team_count?: number | null;
  professional_count?: number | null;
  auxiliary_count?: number | null;
}

export interface GroupServiceInput {
  macro_id?: string | null;
  scope_id?: string | null;
  service_name?: string | null;
  sequence_order?: number | null;
  lag_days?: number | null;
  productivity_override?: number | null;
  productivity_unit_override?: string | null;
}

export function useTeamWorkGroups(projectId: string | undefined) {
  const { canEdit, profile } = useAuth();
  const [groups, setGroups] = useState<TeamWorkGroup[]>([]);
  const [groupServices, setGroupServices] = useState<TeamWorkGroupService[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const guard = useCallback(() => {
    if (!canEdit) {
      toast.error('Voce nao tem permissao para editar');
      return false;
    }
    return true;
  }, [canEdit]);

  const load = useCallback(async () => {
    if (!projectId) {
      setGroups([]);
      setGroupServices([]);
      return;
    }
    setIsLoading(true);
    try {
      const [{ data: gs, error: e1 }, { data: ss, error: e2 }] = await Promise.all([
        supabase
          .from('project_team_work_groups' as any)
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_team_work_group_services' as any)
          .select('*')
          .eq('project_id', projectId),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setGroups((gs as any[]) || []);
      setGroupServices((ss as any[]) || []);
    } catch (err: any) {
      console.error('useTeamWorkGroups load:', err);
      toast.error('Erro ao carregar frentes compartilhadas');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const createGroup = useCallback(
    async (input: TeamWorkGroupInput, services: GroupServiceInput[] = []) => {
      if (!guard() || !projectId || !profile?.company_id) return null;
      try {
        const { data, error } = await supabase
          .from('project_team_work_groups' as any)
          .insert({
            company_id: profile.company_id,
            project_id: projectId,
            name: input.name.trim(),
            description: input.description ?? null,
            base_unit: input.base_unit ?? null,
            productivity_value: input.productivity_value ?? null,
            productivity_unit: input.productivity_unit ?? null,
            working_days_per_week: input.working_days_per_week ?? 5,
            simultaneous_team_count: input.simultaneous_team_count ?? 1,
            professional_count: input.professional_count ?? 0,
            auxiliary_count: input.auxiliary_count ?? 0,
            created_by: profile.user_id,
            updated_by: profile.user_id,
          })
          .select()
          .single();
        if (error) throw error;
        const newId = (data as any).id as string;
        if (services.length) {
          const payload = services.map((s, idx) => ({
            company_id: profile.company_id,
            project_id: projectId,
            group_id: newId,
            macro_id: s.macro_id ?? null,
            scope_id: s.scope_id ?? null,
            service_name: s.service_name ?? null,
            sequence_order: s.sequence_order ?? idx,
            lag_days: s.lag_days ?? 0,
            productivity_override: s.productivity_override ?? null,
            productivity_unit_override: s.productivity_unit_override ?? null,
            created_by: profile.user_id,
            updated_by: profile.user_id,
          }));
          const { error: sErr } = await supabase
            .from('project_team_work_group_services' as any)
            .insert(payload);
          if (sErr) throw sErr;
        }
        toast.success('Frente criada');
        await load();
        return newId;
      } catch (err: any) {
        console.error(err);
        toast.error('Erro ao criar frente: ' + (err?.message || ''));
        return null;
      }
    },
    [guard, projectId, profile, load],
  );

  const updateGroup = useCallback(
    async (id: string, patch: Partial<TeamWorkGroupInput> & { active?: boolean }) => {
      if (!guard()) return false;
      try {
        const { error } = await supabase
          .from('project_team_work_groups' as any)
          .update({ ...patch, updated_by: profile?.user_id })
          .eq('id', id);
        if (error) throw error;
        await load();
        return true;
      } catch (err: any) {
        toast.error('Erro ao atualizar frente: ' + (err?.message || ''));
        return false;
      }
    },
    [guard, profile, load],
  );

  const toggleActive = useCallback(
    async (id: string, active: boolean) => updateGroup(id, { active }),
    [updateGroup],
  );

  const deleteGroup = useCallback(
    async (id: string) => {
      if (!guard()) return false;
      try {
        const { error } = await supabase
          .from('project_team_work_groups' as any)
          .delete()
          .eq('id', id);
        if (error) throw error;
        toast.success('Frente removida');
        await load();
        return true;
      } catch (err: any) {
        toast.error('Erro ao excluir frente: ' + (err?.message || ''));
        return false;
      }
    },
    [guard, load],
  );

  const addServiceToGroup = useCallback(
    async (groupId: string, svc: GroupServiceInput) => {
      if (!guard() || !projectId || !profile?.company_id) return false;
      try {
        const { error } = await supabase
          .from('project_team_work_group_services' as any)
          .insert({
            company_id: profile.company_id,
            project_id: projectId,
            group_id: groupId,
            macro_id: svc.macro_id ?? null,
            scope_id: svc.scope_id ?? null,
            service_name: svc.service_name ?? null,
            sequence_order: svc.sequence_order ?? 0,
            lag_days: svc.lag_days ?? 0,
            productivity_override: svc.productivity_override ?? null,
            productivity_unit_override: svc.productivity_unit_override ?? null,
            created_by: profile.user_id,
            updated_by: profile.user_id,
          });
        if (error) throw error;
        await load();
        return true;
      } catch (err: any) {
        toast.error('Erro ao vincular servico: ' + (err?.message || ''));
        return false;
      }
    },
    [guard, projectId, profile, load],
  );

  const removeServiceFromGroup = useCallback(
    async (linkId: string) => {
      if (!guard()) return false;
      try {
        const { error } = await supabase
          .from('project_team_work_group_services' as any)
          .delete()
          .eq('id', linkId);
        if (error) throw error;
        await load();
        return true;
      } catch (err: any) {
        toast.error('Erro ao remover servico: ' + (err?.message || ''));
        return false;
      }
    },
    [guard, load],
  );

  return {
    groups,
    groupServices,
    isLoading,
    canEdit,
    load,
    createGroup,
    updateGroup,
    toggleActive,
    deleteGroup,
    addServiceToGroup,
    removeServiceFromGroup,
  };
}
