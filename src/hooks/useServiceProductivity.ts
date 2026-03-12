import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ServiceProductivity {
  id: string;
  company_id: string;
  project_id: string;
  macro_id: string;
  scope_id: string;
  productivity_value: number;
  productivity_unit: string;
  working_days_per_week: number;
  default_team_count: number;
  professionals_per_team: number;
  helpers_per_team: number;
  version: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceProductivityInput {
  macro_id: string;
  scope_id: string;
  productivity_value: number;
  productivity_unit: string;
  working_days_per_week?: number;
  default_team_count?: number;
  professionals_per_team?: number;
  helpers_per_team?: number;
  notes?: string;
}

export function useServiceProductivity(projectId: string | undefined) {
  const [productivities, setProductivities] = useState<ServiceProductivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadProductivities = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_service_productivity' as any)
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProductivities((data as any) || []);
    } catch (error) {
      console.error('Error loading productivities:', error);
      toast.error('Erro ao carregar produtividades');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const saveProductivity = useCallback(async (input: ServiceProductivityInput) => {
    if (!projectId) return null;

    try {
      const { data: project } = await supabase
        .from('projects')
        .select('company_id')
        .eq('id', projectId)
        .single();

      if (!project) throw new Error('Projeto não encontrado');

      const { data: existing } = await supabase
        .from('project_service_productivity' as any)
        .select('id, version')
        .eq('project_id', projectId)
        .eq('scope_id', input.scope_id)
        .eq('is_active', true)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('project_service_productivity' as any)
          .update({
            productivity_value: input.productivity_value,
            productivity_unit: input.productivity_unit,
            working_days_per_week: input.working_days_per_week || 5,
            default_team_count: input.default_team_count || 1,
            professionals_per_team: input.professionals_per_team || 1,
            helpers_per_team: input.helpers_per_team || 0,
            notes: input.notes,
          })
          .eq('id', (existing as any).id)
          .select()
          .single();

        if (error) throw error;

        toast.success('Produtividade atualizada com sucesso');
        await loadProductivities();
        return data;
      } else {
        const { data, error } = await supabase
          .from('project_service_productivity' as any)
          .insert({
            company_id: project.company_id,
            project_id: projectId,
            macro_id: input.macro_id,
            scope_id: input.scope_id,
            productivity_value: input.productivity_value,
            productivity_unit: input.productivity_unit,
            working_days_per_week: input.working_days_per_week || 5,
            default_team_count: input.default_team_count || 1,
            professionals_per_team: input.professionals_per_team || 1,
            helpers_per_team: input.helpers_per_team || 0,
            notes: input.notes,
          })
          .select()
          .single();

        if (error) throw error;

        toast.success('Produtividade cadastrada com sucesso');
        await loadProductivities();
        return data;
      }
    } catch (error) {
      console.error('Error saving productivity:', error);
      toast.error('Erro ao salvar produtividade');
      return null;
    }
  }, [projectId, loadProductivities]);

  const deleteProductivity = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('project_service_productivity' as any)
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      toast.success('Produtividade removida com sucesso');
      await loadProductivities();
      return true;
    } catch (error) {
      console.error('Error deleting productivity:', error);
      toast.error('Erro ao remover produtividade');
      return false;
    }
  }, [loadProductivities]);

  const getProductivityForService = useCallback((scopeId: string) => {
    return productivities.find(p => p.scope_id === scopeId && p.is_active);
  }, [productivities]);

  useEffect(() => {
    if (projectId) {
      loadProductivities();
    }
  }, [projectId, loadProductivities]);

  return {
    productivities,
    isLoading,
    loadProductivities,
    saveProductivity,
    deleteProductivity,
    getProductivityForService,
  };
}
