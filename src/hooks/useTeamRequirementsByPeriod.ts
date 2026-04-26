import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RoleBreakdown {
  role_name: string;
  role_type: 'professional' | 'helper';
  qty_per_team: number;
  total: number;
}

export interface PeriodTeamRow {
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  macro_color?: string | null;
  team_count: number;
  productivity_per_team: number;
  productivity_unit: string;
  professionals_per_team: number;
  helpers_per_team: number;
  total_professionals: number;
  total_helpers: number;
  total_people: number;
  has_productivity_config: boolean;
  has_team_composition: boolean;
  /** Quebra por profissão (já multiplicada pelo nº de equipes) */
  role_breakdown: RoleBreakdown[];
}

export interface PeriodTeamRequirements {
  period_id: string;
  period_name: string;
  period_number: number;
  start_date: string;
  end_date: string;
  status: string;
  rows: PeriodTeamRow[];
  totals: {
    professionals: number;
    helpers: number;
    people: number;
    services: number;
    services_missing_productivity: number;
    services_missing_team: number;
  };
  by_macro: Array<{
    macro_id: string;
    macro_name: string;
    macro_color?: string | null;
    professionals: number;
    helpers: number;
    people: number;
  }>;
  /** Pico por profissão neste período (somatório de todos os serviços) */
  by_role: Array<{
    role_name: string;
    role_type: 'professional' | 'helper';
    total: number;
  }>;
}

interface RpcRow {
  period_id: string;
  period_number: number;
  period_start: string;
  period_end: string;
  period_name: string | null;
  macro_id: string;
  scope_id: string;
  macro_name: string;
  scope_name: string;
  planned_houses: number;
  team_count: number;
  productivity_value: number | null;
  productivity_unit: string | null;
  working_days_per_week: number | null;
  professionals_per_team: number | null;
  helpers_per_team: number | null;
  team_breakdown: RoleBreakdown[];
  total_professionals: number;
  total_helpers: number;
  has_productivity_config: boolean;
  has_team_composition: boolean;
}

interface RawPeriod {
  id: string;
  name: string | null;
  period_number: number;
  start_date: string;
  end_date: string;
  status: string | null;
}

export function useTeamRequirementsByPeriod(projectId: string | null | undefined) {
  const [periods, setPeriods] = useState<RawPeriod[]>([]);
  const [rpcRows, setRpcRows] = useState<RpcRow[]>([]);
  const [macroColors, setMacroColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setPeriods([]);
      setRpcRows([]);
      return;
    }
    setLoading(true);
    try {
      const [periodsRes, rpcRes, projRes] = await Promise.all([
        supabase
          .from("planning_periods")
          .select("id, name, period_number, start_date, end_date, status")
          .eq("project_id", projectId)
          .order("period_number", { ascending: true }),
        supabase.rpc("calculate_labor_needs_v2" as any, { p_project_id: projectId }),
        supabase
          .from("projects")
          .select("macros_template")
          .eq("id", projectId)
          .maybeSingle(),
      ]);

      if (periodsRes.error) throw periodsRes.error;
      if (rpcRes.error) throw rpcRes.error;

      setPeriods((periodsRes.data || []) as RawPeriod[]);
      setRpcRows(((rpcRes.data as any[]) || []) as RpcRow[]);

      const colors: Record<string, string> = {};
      const tmpl = (projRes.data?.macros_template as any[]) || [];
      tmpl.forEach((m) => {
        if (m?.id && m?.color) colors[m.id] = m.color;
      });
      setMacroColors(colors);
    } catch (err) {
      console.error("[useTeamRequirementsByPeriod]", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requirements = useMemo<PeriodTeamRequirements[]>(() => {
    return periods.map((period) => {
      const periodRows = rpcRows.filter((r) => r.period_id === period.id);

      const rows: PeriodTeamRow[] = periodRows.map((r) => {
        const profPerTeam = Number(r.professionals_per_team) || 0;
        const helpPerTeam = Number(r.helpers_per_team) || 0;
        const totalProf = Number(r.total_professionals) || 0;
        const totalHelp = Number(r.total_helpers) || 0;
        const breakdown = (r.team_breakdown || []).map((b) => ({
          role_name: b.role_name,
          role_type: b.role_type,
          qty_per_team: Number(b.qty_per_team) || 0,
          total: Number(b.total) || 0,
        }));

        return {
          scope_id: r.scope_id,
          scope_name: r.scope_name,
          macro_id: r.macro_id,
          macro_name: r.macro_name,
          macro_color: macroColors[r.macro_id] || null,
          team_count: Number(r.team_count) || 0,
          productivity_per_team: Number(r.productivity_value) || 0,
          productivity_unit: r.productivity_unit || "un",
          professionals_per_team: profPerTeam,
          helpers_per_team: helpPerTeam,
          total_professionals: totalProf,
          total_helpers: totalHelp,
          total_people: totalProf + totalHelp,
          has_productivity_config: !!r.has_productivity_config,
          has_team_composition: !!r.has_team_composition,
          role_breakdown: breakdown,
        };
      });

      const totals = rows.reduce(
        (acc, r) => ({
          professionals: acc.professionals + r.total_professionals,
          helpers: acc.helpers + r.total_helpers,
          people: acc.people + r.total_people,
          services: acc.services + 1,
          services_missing_productivity:
            acc.services_missing_productivity + (r.has_productivity_config ? 0 : 1),
          services_missing_team:
            acc.services_missing_team +
            (r.has_productivity_config && !r.has_team_composition ? 1 : 0),
        }),
        {
          professionals: 0,
          helpers: 0,
          people: 0,
          services: 0,
          services_missing_productivity: 0,
          services_missing_team: 0,
        }
      );

      // Agregação por etapa
      const byMacroMap = new Map<
        string,
        { macro_id: string; macro_name: string; macro_color?: string | null; professionals: number; helpers: number }
      >();
      rows.forEach((r) => {
        const existing = byMacroMap.get(r.macro_id);
        if (existing) {
          existing.professionals += r.total_professionals;
          existing.helpers += r.total_helpers;
        } else {
          byMacroMap.set(r.macro_id, {
            macro_id: r.macro_id,
            macro_name: r.macro_name,
            macro_color: r.macro_color,
            professionals: r.total_professionals,
            helpers: r.total_helpers,
          });
        }
      });
      const by_macro = Array.from(byMacroMap.values()).map((m) => ({
        ...m,
        people: m.professionals + m.helpers,
      }));

      // Agregação por profissão (somatório do período)
      const byRoleMap = new Map<string, { role_name: string; role_type: 'professional' | 'helper'; total: number }>();
      rows.forEach((r) => {
        r.role_breakdown.forEach((b) => {
          const key = b.role_name.toLowerCase();
          const existing = byRoleMap.get(key);
          if (existing) existing.total += b.total;
          else
            byRoleMap.set(key, {
              role_name: b.role_name,
              role_type: b.role_type,
              total: b.total,
            });
        });
      });
      const by_role = Array.from(byRoleMap.values()).sort((a, b) => b.total - a.total);

      return {
        period_id: period.id,
        period_name: period.name || `Medição ${period.period_number}`,
        period_number: period.period_number,
        start_date: period.start_date,
        end_date: period.end_date,
        status: period.status || "draft",
        rows,
        totals,
        by_macro,
        by_role,
      };
    });
  }, [periods, rpcRows, macroColors]);

  /** Pico de pessoas por etapa em qualquer período */
  const consolidatedByMacro = useMemo(() => {
    const map = new Map<
      string,
      { macro_id: string; macro_name: string; macro_color?: string | null; professionals: number; helpers: number }
    >();
    requirements.forEach((p) => {
      p.by_macro.forEach((m) => {
        const existing = map.get(m.macro_id);
        if (existing) {
          existing.professionals = Math.max(existing.professionals, m.professionals);
          existing.helpers = Math.max(existing.helpers, m.helpers);
        } else {
          map.set(m.macro_id, { ...m });
        }
      });
    });
    return Array.from(map.values()).map((m) => ({
      ...m,
      people: m.professionals + m.helpers,
    }));
  }, [requirements]);

  /** Pico por profissão em qualquer período (útil para histograma) */
  const consolidatedByRole = useMemo(() => {
    const map = new Map<string, { role_name: string; role_type: 'professional' | 'helper'; total: number }>();
    requirements.forEach((p) => {
      p.by_role.forEach((r) => {
        const key = r.role_name.toLowerCase();
        const existing = map.get(key);
        if (existing) existing.total = Math.max(existing.total, r.total);
        else map.set(key, { ...r });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [requirements]);

  return {
    requirements,
    consolidatedByMacro,
    consolidatedByRole,
    loading,
    refresh,
  };
}
