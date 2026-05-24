import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type MacroflowPackageType = 'service' | 'work_group';
export type MacroflowRelationType = 'FS' | 'SS';

export interface MacroflowPackageOption {
  key: string;
  type: MacroflowPackageType;
  label: string;
  hasProductivity: boolean;
}

export interface PlanningMacroflow {
  id: string;
  projectId: string;
  companyId: string;
  name: string;
  active: boolean;
}

export interface PlanningMacroflowDependency {
  id: string;
  macroflowId: string;
  projectId: string;
  companyId: string;
  predecessorType: MacroflowPackageType;
  predecessorKey: string;
  predecessorLabel: string;
  successorType: MacroflowPackageType;
  successorKey: string;
  successorLabel: string;
  relationType: MacroflowRelationType;
  lagDays: number;
}

export interface MacroflowDependencyInput {
  predecessorType: MacroflowPackageType;
  predecessorKey: string;
  predecessorLabel: string;
  successorType: MacroflowPackageType;
  successorKey: string;
  successorLabel: string;
  relationType: MacroflowRelationType;
  lagDays: number;
}

const normalizeDependency = (row: any): PlanningMacroflowDependency => ({
  id: String(row.id),
  macroflowId: String(row.macroflow_id),
  projectId: String(row.project_id),
  companyId: String(row.company_id),
  predecessorType: row.predecessor_type === 'work_group' ? 'work_group' : 'service',
  predecessorKey: String(row.predecessor_key),
  predecessorLabel: String(row.predecessor_label ?? 'Pacote sem nome'),
  successorType: row.successor_type === 'work_group' ? 'work_group' : 'service',
  successorKey: String(row.successor_key),
  successorLabel: String(row.successor_label ?? 'Pacote sem nome'),
  relationType: row.relation_type === 'SS' ? 'SS' : 'FS',
  lagDays: Number(row.lag_days) || 0,
});

export const hasMacroflowCycle = (
  packageKeys: string[],
  dependencies: Array<Pick<PlanningMacroflowDependency, 'predecessorKey' | 'successorKey'>>,
) => {
  const nodes = new Set(packageKeys);
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  nodes.forEach((key) => indegree.set(key, 0));
  dependencies.forEach((dependency) => {
    if (!nodes.has(dependency.predecessorKey) || !nodes.has(dependency.successorKey)) return;
    outgoing.set(dependency.predecessorKey, [...(outgoing.get(dependency.predecessorKey) ?? []), dependency.successorKey]);
    indegree.set(dependency.successorKey, (indegree.get(dependency.successorKey) ?? 0) + 1);
  });

  const queue = Array.from(indegree.entries())
    .filter(([, count]) => count === 0)
    .map(([key]) => key);
  let visited = 0;

  while (queue.length) {
    const current = queue.shift()!;
    visited += 1;
    (outgoing.get(current) ?? []).forEach((next) => {
      const count = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, count);
      if (count === 0) queue.push(next);
    });
  }

  return visited < nodes.size;
};

export function usePlanningMacroflow(projectId: string | undefined, packageOptions: MacroflowPackageOption[] = []) {
  const { company, user, canEdit } = useAuth();
  const [macroflow, setMacroflow] = useState<PlanningMacroflow | null>(null);
  const [dependencies, setDependencies] = useState<PlanningMacroflowDependency[]>([]);
  const [loading, setLoading] = useState(false);

  const packageKeys = useMemo(() => packageOptions.map((option) => option.key), [packageOptions]);

  const load = useCallback(async () => {
    if (!projectId || !company?.id) {
      setMacroflow(null);
      setDependencies([]);
      return;
    }

    setLoading(true);
    try {
      const { data: flowRows, error: flowError } = await supabase
        .from('planning_macroflows' as any)
        .select('*')
        .eq('project_id', projectId)
        .eq('company_id', company.id)
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1);

      if (flowError) throw flowError;
      const flow = flowRows?.[0] ?? null;

      if (!flow) {
        setMacroflow(null);
        setDependencies([]);
        return;
      }

      setMacroflow({
        id: String(flow.id),
        projectId: String(flow.project_id),
        companyId: String(flow.company_id),
        name: String(flow.name ?? 'Macrofluxo principal'),
        active: flow.active !== false,
      });

      const { data: dependencyRows, error: dependencyError } = await supabase
        .from('planning_macroflow_dependencies' as any)
        .select('*')
        .eq('macroflow_id', flow.id)
        .order('created_at', { ascending: true });

      if (dependencyError) throw dependencyError;
      setDependencies((dependencyRows ?? []).map(normalizeDependency));
    } catch (error: any) {
      console.error('Erro ao carregar macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível carregar o macrofluxo.');
    } finally {
      setLoading(false);
    }
  }, [company?.id, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const ensureMacroflow = useCallback(async () => {
    if (!projectId || !company?.id) throw new Error('Projeto ou empresa não informado.');

    if (macroflow) return macroflow;

    const { data, error } = await supabase
      .from('planning_macroflows' as any)
      .insert({
        project_id: projectId,
        company_id: company.id,
        name: 'Macrofluxo principal',
        active: true,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code !== '23505') throw error;

      const { data: existingRows, error: existingError } = await supabase
        .from('planning_macroflows' as any)
        .select('*')
        .eq('project_id', projectId)
        .eq('company_id', company.id)
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1);

      if (existingError || !existingRows?.[0]) throw existingError || error;
      const existing = {
        id: String(existingRows[0].id),
        projectId: String(existingRows[0].project_id),
        companyId: String(existingRows[0].company_id),
        name: String(existingRows[0].name ?? 'Macrofluxo principal'),
        active: existingRows[0].active !== false,
      };
      setMacroflow(existing);
      return existing;
    }

    const created = {
      id: String(data.id),
      projectId: String(data.project_id),
      companyId: String(data.company_id),
      name: String(data.name ?? 'Macrofluxo principal'),
      active: data.active !== false,
    };
    setMacroflow(created);
    return created;
  }, [company?.id, macroflow, projectId, user?.id]);

  const addDependency = useCallback(async (input: MacroflowDependencyInput) => {
    if (!canEdit) {
      toast.error('Você não tem permissão para editar o macrofluxo.');
      return false;
    }
    if (input.predecessorKey === input.successorKey && input.predecessorType === input.successorType) {
      toast.error('Predecessor e sucessor precisam ser diferentes.');
      return false;
    }

    const duplicate = dependencies.some((dependency) =>
      dependency.predecessorType === input.predecessorType
      && dependency.predecessorKey === input.predecessorKey
      && dependency.successorType === input.successorType
      && dependency.successorKey === input.successorKey
    );
    if (duplicate) {
      toast.error('Esta relação já existe no macrofluxo.');
      return false;
    }

    const nextDependencies = [
      ...dependencies,
      {
        predecessorKey: input.predecessorKey,
        successorKey: input.successorKey,
      },
    ];
    if (hasMacroflowCycle(packageKeys, nextDependencies)) {
      toast.error('Macrofluxo possui ciclo. Revise predecessoras.');
      return false;
    }

    try {
      const flow = await ensureMacroflow();
      const { error } = await supabase
        .from('planning_macroflow_dependencies' as any)
        .insert({
          macroflow_id: flow.id,
          project_id: flow.projectId,
          company_id: flow.companyId,
          predecessor_type: input.predecessorType,
          predecessor_key: input.predecessorKey,
          predecessor_label: input.predecessorLabel,
          successor_type: input.successorType,
          successor_key: input.successorKey,
          successor_label: input.successorLabel,
          relation_type: input.relationType,
          lag_days: input.lagDays,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

      if (error) throw error;
      await load();
      toast.success('Relação adicionada ao macrofluxo.');
      return true;
    } catch (error: any) {
      console.error('Erro ao salvar relação do macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível salvar a relação.');
      return false;
    }
  }, [canEdit, dependencies, ensureMacroflow, load, packageKeys, user?.id]);

  const updateDependency = useCallback(async (dependencyId: string, input: MacroflowDependencyInput) => {
    if (!canEdit) {
      toast.error('Você não tem permissão para editar o macrofluxo.');
      return false;
    }
    if (input.predecessorKey === input.successorKey && input.predecessorType === input.successorType) {
      toast.error('Predecessor e sucessor precisam ser diferentes.');
      return false;
    }

    const duplicate = dependencies.some((dependency) =>
      dependency.id !== dependencyId
      && dependency.predecessorType === input.predecessorType
      && dependency.predecessorKey === input.predecessorKey
      && dependency.successorType === input.successorType
      && dependency.successorKey === input.successorKey
    );
    if (duplicate) {
      toast.error('Esta relação já existe no macrofluxo.');
      return false;
    }

    const nextDependencies = dependencies.map((dependency) => (
      dependency.id === dependencyId
        ? {
          ...dependency,
          predecessorType: input.predecessorType,
          predecessorKey: input.predecessorKey,
          predecessorLabel: input.predecessorLabel,
          successorType: input.successorType,
          successorKey: input.successorKey,
          successorLabel: input.successorLabel,
          relationType: input.relationType,
          lagDays: input.lagDays,
        }
        : dependency
    ));
    if (hasMacroflowCycle(packageKeys, nextDependencies)) {
      toast.error('Macrofluxo possui ciclo. Revise predecessoras.');
      return false;
    }

    try {
      const { error } = await supabase
        .from('planning_macroflow_dependencies' as any)
        .update({
          predecessor_type: input.predecessorType,
          predecessor_key: input.predecessorKey,
          predecessor_label: input.predecessorLabel,
          successor_type: input.successorType,
          successor_key: input.successorKey,
          successor_label: input.successorLabel,
          relation_type: input.relationType,
          lag_days: input.lagDays,
          updated_by: user?.id ?? null,
        })
        .eq('id', dependencyId);

      if (error) throw error;
      await load();
      toast.success('Relação atualizada.');
      return true;
    } catch (error: any) {
      console.error('Erro ao atualizar relação do macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível atualizar a relação.');
      return false;
    }
  }, [canEdit, dependencies, load, packageKeys, user?.id]);

  const removeDependency = useCallback(async (dependencyId: string) => {
    if (!canEdit) {
      toast.error('Você não tem permissão para editar o macrofluxo.');
      return false;
    }

    try {
      const { error } = await supabase
        .from('planning_macroflow_dependencies' as any)
        .delete()
        .eq('id', dependencyId);

      if (error) throw error;
      await load();
      toast.success('Relação removida.');
      return true;
    } catch (error: any) {
      console.error('Erro ao remover relação do macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível remover a relação.');
      return false;
    }
  }, [canEdit, load]);

  const hasCycle = useMemo(() => hasMacroflowCycle(packageKeys, dependencies), [dependencies, packageKeys]);

  return {
    macroflow,
    dependencies,
    loading,
    hasCycle,
    load,
    addDependency,
    updateDependency,
    removeDependency,
  };
}
