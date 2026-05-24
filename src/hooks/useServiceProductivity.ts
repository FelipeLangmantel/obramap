import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type TeamRoleType = 'professional' | 'helper';

export interface TeamMemberRow {
  id?: string;
  role_name: string;
  role_type: TeamRoleType;
  quantity: number;
}

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
  team_composition?: TeamMemberRow[];
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
  team_composition?: TeamMemberRow[];
}

const normalizeProfessionName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const aggregateCounts = (rows: TeamMemberRow[] | undefined) => {
  const prof = (rows || [])
    .filter((r) => r.role_type === 'professional')
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const help = (rows || [])
    .filter((r) => r.role_type === 'helper')
    .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  return { prof, help };
};

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

      const list = (data as any[]) || [];

      // Carregar composição de equipe (project_service_team_composition)
      const ids = list.map((p) => p.id);
      let compositionByProd: Record<string, TeamMemberRow[]> = {};
      if (ids.length) {
        const { data: comp } = await supabase
          .from('project_service_team_composition' as any)
          .select('id, productivity_id, role_name, role_type, quantity')
          .in('productivity_id', ids);
        ((comp as any[]) || []).forEach((c) => {
          const arr = compositionByProd[c.productivity_id] || [];
          arr.push({
            id: c.id,
            role_name: c.role_name,
            role_type: (c.role_type as TeamRoleType) || 'professional',
            quantity: Number(c.quantity) || 0,
          });
          compositionByProd[c.productivity_id] = arr;
        });
      }

      setProductivities(
        list.map((p) => ({ ...p, team_composition: compositionByProd[p.id] || [] }))
      );
    } catch (error) {
      console.error('Error loading productivities:', error);
      toast.error('Erro ao carregar produtividades');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const replaceComposition = async (productivityId: string, rows: TeamMemberRow[]) => {
    // Estratégia simples e atômica: apaga tudo e reinsere o que veio.
    await supabase
      .from('project_service_team_composition' as any)
      .delete()
      .eq('productivity_id', productivityId);

    if (rows.length) {
      const payload = rows
        .filter((r) => r.role_name?.trim() && r.quantity > 0)
        .map((r) => ({
          productivity_id: productivityId,
          role_name: r.role_name.trim(),
          role_type: r.role_type,
          quantity: r.quantity,
        }));
      if (payload.length) {
        const { error } = await supabase
          .from('project_service_team_composition' as any)
          .insert(payload);
        if (error) throw error;
      }
    }
  };

  const ensureProfessions = useCallback(async (companyId: string, rows: TeamMemberRow[] | undefined) => {
    const candidates = (rows || [])
      .map((row) => ({
        name: row.role_name?.trim(),
        worker_type: row.role_type === 'helper' ? 'helper' : 'professional',
      }))
      .filter((row) => row.name);
    if (!candidates.length) return;

    const { data: existing } = await (supabase as any)
      .from('professions')
      .select('name')
      .eq('company_id', companyId);
    const existingNames = new Set(((existing as any[]) || []).map((item) => normalizeProfessionName(item.name || '')));
    const seen = new Set<string>();
    const payload = candidates
      .filter((row) => {
        const normalized = normalizeProfessionName(row.name || '');
        if (!normalized || existingNames.has(normalized) || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .map((row) => ({
        company_id: companyId,
        name: row.name,
        category: 'Outros',
        worker_type: row.worker_type,
        active: true,
      }));

    if (!payload.length) return;
    const { error } = await (supabase as any)
      .from('professions')
      .insert(payload);
    if (error && error.code !== '23505') {
      console.warn('[useServiceProductivity] profissao nao cadastrada automaticamente', error);
    }
  }, []);

  const saveProductivity = useCallback(
    async (input: ServiceProductivityInput) => {
      if (!projectId) return null;

      try {
        const { data: project } = await supabase
          .from('projects')
          .select('company_id')
          .eq('id', projectId)
          .single();

        if (!project) throw new Error('Projeto não encontrado');

        await ensureProfessions(project.company_id, input.team_composition);

        const { data: existing } = await supabase
          .from('project_service_productivity' as any)
          .select('id, version')
          .eq('project_id', projectId)
          .eq('scope_id', input.scope_id)
          .eq('is_active', true)
          .maybeSingle();

        // Calcula totais a partir da composição quando ela é fornecida.
        const agg = input.team_composition
          ? aggregateCounts(input.team_composition)
          : {
              prof: input.professionals_per_team ?? 1,
              help: input.helpers_per_team ?? 0,
            };

        let savedId: string | null = null;

        if (existing) {
          const { data, error } = await supabase
            .from('project_service_productivity' as any)
            .update({
              productivity_value: input.productivity_value,
              productivity_unit: input.productivity_unit,
              working_days_per_week: input.working_days_per_week || 5,
              default_team_count: input.default_team_count || 1,
              professionals_per_team: agg.prof,
              helpers_per_team: agg.help,
              notes: input.notes,
            })
            .eq('id', (existing as any).id)
            .select()
            .single();
          if (error) throw error;
          savedId = (data as any).id;
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
              professionals_per_team: agg.prof,
              helpers_per_team: agg.help,
              notes: input.notes,
            })
            .select()
            .single();
          if (error) throw error;
          savedId = (data as any).id;
        }

        // Persistir composição detalhada (sempre, mesmo vazio)
        if (savedId && input.team_composition) {
          await replaceComposition(savedId, input.team_composition);
        }

        toast.success(existing ? 'Produtividade atualizada' : 'Produtividade cadastrada');
        await loadProductivities();
        return { id: savedId };
      } catch (error: any) {
        console.error('Error saving productivity:', error);
        toast.error('Erro ao salvar produtividade: ' + (error?.message || ''));
        return null;
      }
    },
    [ensureProfessions, projectId, loadProductivities]
  );

  const deleteProductivity = useCallback(
    async (id: string) => {
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
    },
    [loadProductivities]
  );

  const getProductivityForService = useCallback(
    (scopeId: string) => {
      return productivities.find((p) => p.scope_id === scopeId && p.is_active);
    },
    [productivities]
  );

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
