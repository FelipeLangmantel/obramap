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

export interface PlanningMacroflowPackage {
  id: string;
  macroflowId: string;
  projectId: string;
  companyId: string;
  packageType: MacroflowPackageType;
  packageKey: string;
  packageLabel: string;
  sortOrder: number;
  inferred?: boolean;
}

export interface PlanningMacroflowPackageUsage {
  macroflowId: string;
  macroflowName: string;
  packageKey: string;
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

const normalizeMacroflow = (row: any): PlanningMacroflow => ({
  id: String(row.id),
  projectId: String(row.project_id),
  companyId: String(row.company_id),
  name: String(row.name ?? 'Macrofluxo principal'),
  active: row.active !== false,
});

const normalizeMacroflowPackage = (row: any): PlanningMacroflowPackage => ({
  id: String(row.id),
  macroflowId: String(row.macroflow_id),
  projectId: String(row.project_id),
  companyId: String(row.company_id),
  packageType: row.package_type === 'work_group' ? 'work_group' : 'service',
  packageKey: String(row.package_key),
  packageLabel: String(row.package_label ?? 'Pacote sem nome'),
  sortOrder: Number(row.sort_order) || 0,
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
  const [macroflows, setMacroflows] = useState<PlanningMacroflow[]>([]);
  const [macroflow, setMacroflow] = useState<PlanningMacroflow | null>(null);
  const [selectedMacroflowId, setSelectedMacroflowId] = useState<string | null>(null);
  const [dependencies, setDependencies] = useState<PlanningMacroflowDependency[]>([]);
  const [includedPackages, setIncludedPackages] = useState<PlanningMacroflowPackage[]>([]);
  const [packageUsageByKey, setPackageUsageByKey] = useState<Record<string, PlanningMacroflowPackageUsage>>({});
  const [loading, setLoading] = useState(false);

  const packageOptionByKey = useMemo(() => new Map(packageOptions.map((option) => [option.key, option])), [packageOptions]);
  const includedPackageKeys = useMemo(() => includedPackages.map((item) => item.packageKey), [includedPackages]);
  const packageKeys = includedPackageKeys;

  const load = useCallback(async () => {
    if (!projectId || !company?.id) {
      setMacroflows([]);
      setMacroflow(null);
      setSelectedMacroflowId(null);
      setDependencies([]);
      setIncludedPackages([]);
      setPackageUsageByKey({});
      return;
    }

    setLoading(true);
    try {
      const { data: flowRows, error: flowError } = await supabase
        .from('planning_macroflows' as any)
        .select('*')
        .eq('project_id', projectId)
        .eq('company_id', company.id)
        .order('created_at', { ascending: true })
        .order('name', { ascending: true });

      if (flowError) throw flowError;
      const flows = (flowRows ?? []).map(normalizeMacroflow);
      setMacroflows(flows);
      const flowNameById = new Map(flows.map((item) => [item.id, item.name]));

      const { data: allPackageRows, error: allPackageError } = await supabase
        .from('planning_macroflow_packages' as any)
        .select('*')
        .eq('project_id', projectId)
        .eq('company_id', company.id);

      if (allPackageError) throw allPackageError;

      const usage = new Map<string, PlanningMacroflowPackageUsage>();
      (allPackageRows ?? []).forEach((row: any) => {
        const normalized = normalizeMacroflowPackage(row);
        usage.set(normalized.packageKey, {
          macroflowId: normalized.macroflowId,
          macroflowName: flowNameById.get(normalized.macroflowId) || 'Outro macrofluxo',
          packageKey: normalized.packageKey,
        });
      });

      const { data: allDependencyRows, error: allDependencyError } = await supabase
        .from('planning_macroflow_dependencies' as any)
        .select('*')
        .eq('project_id', projectId)
        .eq('company_id', company.id);

      if (allDependencyError) throw allDependencyError;

      (allDependencyRows ?? []).map(normalizeDependency).forEach((dependency) => {
        [
          { key: dependency.predecessorKey, macroflowId: dependency.macroflowId },
          { key: dependency.successorKey, macroflowId: dependency.macroflowId },
        ].forEach((item) => {
          if (usage.has(item.key)) return;
          usage.set(item.key, {
            macroflowId: item.macroflowId,
            macroflowName: flowNameById.get(item.macroflowId) || 'Macrofluxo antigo',
            packageKey: item.key,
          });
        });
      });

      setPackageUsageByKey(Object.fromEntries(usage.entries()));

      const flow = flows.find((item) => item.id === selectedMacroflowId)
        ?? flows.find((item) => item.active)
        ?? flows[0]
        ?? null;

      if (!flow) {
        setMacroflow(null);
        setSelectedMacroflowId(null);
        setDependencies([]);
        setIncludedPackages([]);
        return;
      }

      setMacroflow(flow);
      setSelectedMacroflowId(flow.id);

      const { data: dependencyRows, error: dependencyError } = await supabase
        .from('planning_macroflow_dependencies' as any)
        .select('*')
        .eq('macroflow_id', flow.id)
        .order('created_at', { ascending: true });

      if (dependencyError) throw dependencyError;
      const loadedDependencies = (dependencyRows ?? []).map(normalizeDependency);
      setDependencies(loadedDependencies);

      const { data: packageRows, error: packageError } = await supabase
        .from('planning_macroflow_packages' as any)
        .select('*')
        .eq('macroflow_id', flow.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (packageError) throw packageError;
      const loadedPackages = (packageRows ?? []).map(normalizeMacroflowPackage);
      if (loadedPackages.length > 0) {
        setIncludedPackages(loadedPackages);
      } else {
        const inferred = new Map<string, PlanningMacroflowPackage>();
        loadedDependencies.forEach((dependency, index) => {
          [
            {
              type: dependency.predecessorType,
              key: dependency.predecessorKey,
              label: dependency.predecessorLabel,
            },
            {
              type: dependency.successorType,
              key: dependency.successorKey,
              label: dependency.successorLabel,
            },
          ].forEach((item) => {
            if (inferred.has(item.key)) return;
            inferred.set(item.key, {
              id: `inferred-${item.key}`,
              macroflowId: flow.id,
              projectId: flow.projectId,
              companyId: flow.companyId,
              packageType: item.type,
              packageKey: item.key,
              packageLabel: item.label,
              sortOrder: index,
              inferred: true,
            });
          });
        });
        setIncludedPackages(Array.from(inferred.values()));
      }
    } catch (error: any) {
      console.error('Erro ao carregar macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível carregar o macrofluxo.');
    } finally {
      setLoading(false);
    }
  }, [company?.id, projectId, selectedMacroflowId]);

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
      const existing = normalizeMacroflow(existingRows[0]);
      setMacroflow(existing);
      setSelectedMacroflowId(existing.id);
      return existing;
    }

    const created = normalizeMacroflow(data);
    setMacroflow(created);
    setSelectedMacroflowId(created.id);
    return created;
  }, [company?.id, macroflow, projectId, user?.id]);

  const createMacroflow = useCallback(async (name: string) => {
    if (!canEdit) {
      toast.error('Você não tem permissão para criar macrofluxo.');
      return null;
    }
    if (!projectId || !company?.id) {
      toast.error('Projeto ou empresa não informado.');
      return null;
    }

    const cleanName = name.trim() || 'Novo macrofluxo';

    try {
      const { data, error } = await supabase
        .from('planning_macroflows' as any)
        .insert({
          project_id: projectId,
          company_id: company.id,
          name: cleanName,
          active: false,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .select('*')
        .single();

      if (error) throw error;

      const created = normalizeMacroflow(data);
      setMacroflow(created);
      setSelectedMacroflowId(created.id);
      await load();
      toast.success('Macrofluxo criado.');
      return created;
    } catch (error: any) {
      console.error('Erro ao criar macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível criar o macrofluxo.');
      return null;
    }
  }, [canEdit, company?.id, load, projectId, user?.id]);

  const selectMacroflow = useCallback((macroflowId: string) => {
    setSelectedMacroflowId(macroflowId);
  }, []);

  const renameMacroflow = useCallback(async (name: string) => {
    if (!canEdit || !macroflow) return false;
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Informe um nome para o macrofluxo.');
      return false;
    }

    try {
      const { error } = await supabase
        .from('planning_macroflows' as any)
        .update({ name: cleanName, updated_by: user?.id ?? null })
        .eq('id', macroflow.id);

      if (error) throw error;
      await load();
      toast.success('Macrofluxo renomeado.');
      return true;
    } catch (error: any) {
      console.error('Erro ao renomear macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível renomear o macrofluxo.');
      return false;
    }
  }, [canEdit, load, macroflow, user?.id]);

  const activateMacroflow = useCallback(async (macroflowId: string) => {
    if (!canEdit) {
      toast.error('Você não tem permissão para ativar macrofluxo.');
      return false;
    }
    if (!projectId || !company?.id) return false;

    try {
      await supabase
        .from('planning_macroflows' as any)
        .update({ active: false, updated_by: user?.id ?? null })
        .eq('project_id', projectId)
        .eq('company_id', company.id)
        .eq('active', true);

      const { error } = await supabase
        .from('planning_macroflows' as any)
        .update({ active: true, updated_by: user?.id ?? null })
        .eq('id', macroflowId)
        .eq('project_id', projectId)
        .eq('company_id', company.id);

      if (error) throw error;
      setSelectedMacroflowId(macroflowId);
      await load();
      toast.success('Macrofluxo definido como principal.');
      return true;
    } catch (error: any) {
      console.error('Erro ao ativar macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível ativar o macrofluxo.');
      return false;
    }
  }, [canEdit, company?.id, load, projectId, user?.id]);

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

  const addPackageToMacroflow = useCallback(async (packageKey: string) => {
    if (!canEdit) {
      toast.error('Você não tem permissão para editar o macrofluxo.');
      return false;
    }
    const option = packageOptionByKey.get(packageKey);
    if (!option) {
      toast.error('Pacote não encontrado.');
      return false;
    }
    const usage = packageUsageByKey[packageKey];
    if (usage && usage.macroflowId !== macroflow?.id) {
      toast.error(`Este pacote já pertence ao macrofluxo ${usage.macroflowName}. Remova de lá antes de adicionar aqui.`);
      return false;
    }

    try {
      const flow = await ensureMacroflow();
      const { error } = await supabase
        .from('planning_macroflow_packages' as any)
        .upsert({
          macroflow_id: flow.id,
          project_id: flow.projectId,
          company_id: flow.companyId,
          package_type: option.type,
          package_key: option.key,
          package_label: option.label,
          sort_order: includedPackages.length,
        }, { onConflict: 'macroflow_id,package_key' });

      if (error) throw error;
      await load();
      toast.success('Pacote adicionado ao macrofluxo.');
      return true;
    } catch (error: any) {
      console.error('Erro ao adicionar pacote ao macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível adicionar o pacote.');
      return false;
    }
  }, [canEdit, ensureMacroflow, includedPackages.length, load, macroflow?.id, packageOptionByKey, packageUsageByKey]);

  const setPackagesForMacroflow = useCallback(async (packageKeysToSet: string[]) => {
    if (!canEdit) {
      toast.error('Você não tem permissão para editar o macrofluxo.');
      return false;
    }

    const blockedKeys = packageKeysToSet.filter((key) => {
      const usage = packageUsageByKey[key];
      return Boolean(usage && usage.macroflowId !== macroflow?.id);
    });
    const uniqueKeys = Array.from(new Set(packageKeysToSet.filter((key) => !blockedKeys.includes(key))));
    const options = uniqueKeys
      .map((key) => packageOptionByKey.get(key))
      .filter((option): option is MacroflowPackageOption => Boolean(option));

    try {
      const flow = await ensureMacroflow();
      const existingKeys = new Set(includedPackages.filter((item) => !item.inferred).map((item) => item.packageKey));
      const nextKeys = new Set(options.map((item) => item.key));
      const toRemove = Array.from(existingKeys).filter((key) => !nextKeys.has(key));

      if (toRemove.length > 0) {
        await supabase
          .from('planning_macroflow_dependencies' as any)
          .delete()
          .eq('macroflow_id', flow.id)
          .or(`predecessor_key.in.(${toRemove.join(',')}),successor_key.in.(${toRemove.join(',')})`);

        await supabase
          .from('planning_macroflow_packages' as any)
          .delete()
          .eq('macroflow_id', flow.id)
          .in('package_key', toRemove);
      }

      if (options.length > 0) {
        const { error } = await supabase
          .from('planning_macroflow_packages' as any)
          .upsert(options.map((option, index) => ({
            macroflow_id: flow.id,
            project_id: flow.projectId,
            company_id: flow.companyId,
            package_type: option.type,
            package_key: option.key,
            package_label: option.label,
            sort_order: index,
          })), { onConflict: 'macroflow_id,package_key' });
        if (error) throw error;
      }

      await load();
      toast.success(blockedKeys.length
        ? `Pacotes atualizados. ${blockedKeys.length} pacote(s) já usados em outro macrofluxo foram ignorados.`
        : 'Pacotes do macrofluxo atualizados.');
      return true;
    } catch (error: any) {
      console.error('Erro ao salvar pacotes do macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível salvar os pacotes.');
      return false;
    }
  }, [canEdit, ensureMacroflow, includedPackages, load, macroflow?.id, packageOptionByKey, packageUsageByKey]);

  const removePackageFromMacroflow = useCallback(async (packageKey: string) => {
    if (!canEdit) {
      toast.error('Você não tem permissão para editar o macrofluxo.');
      return false;
    }
    if (!macroflow) return false;

    try {
      await supabase
        .from('planning_macroflow_dependencies' as any)
        .delete()
        .eq('macroflow_id', macroflow.id)
        .or(`predecessor_key.eq.${packageKey},successor_key.eq.${packageKey}`);

      const { error } = await supabase
        .from('planning_macroflow_packages' as any)
        .delete()
        .eq('macroflow_id', macroflow.id)
        .eq('package_key', packageKey);

      if (error) throw error;
      await load();
      toast.success('Pacote removido do macrofluxo.');
      return true;
    } catch (error: any) {
      console.error('Erro ao remover pacote do macrofluxo:', error);
      toast.error(error?.message || 'Não foi possível remover o pacote.');
      return false;
    }
  }, [canEdit, load, macroflow]);

  const hasCycle = useMemo(() => hasMacroflowCycle(packageKeys, dependencies), [dependencies, packageKeys]);

  return {
    macroflows,
    macroflow,
    selectedMacroflowId,
    dependencies,
    includedPackages,
    packageUsageByKey,
    loading,
    hasCycle,
    load,
    createMacroflow,
    selectMacroflow,
    renameMacroflow,
    activateMacroflow,
    addPackageToMacroflow,
    removePackageFromMacroflow,
    setPackagesForMacroflow,
    addDependency,
    updateDependency,
    removeDependency,
  };
}
