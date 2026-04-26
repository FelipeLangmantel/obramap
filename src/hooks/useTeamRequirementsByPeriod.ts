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
  /** Quebra detalhada por profissão (já multiplicada pelo nº de equipes) */
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
  };
  /** Agrega profissionais por etapa (macro) — proxy de "profissão" no modelo atual */
  by_macro: Array<{
    macro_id: string;
    macro_name: string;
    macro_color?: string | null;
    professionals: number;
    helpers: number;
    people: number;
  }>;
}

interface RawService {
  id: string;
  planning_period_id: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  team_count: number | null;
  productivity_per_team: number | null;
  unit_symbol: string | null;
  target_houses: number | null;
}

interface RawProductivity {
  scope_id: string;
  productivity_value: number;
  productivity_unit: string;
  default_team_count: number;
  professionals_per_team: number;
  helpers_per_team: number;
}

interface RawPeriod {
  id: string;
  name: string | null;
  period_number: number;
  start_date: string;
  end_date: string;
  status: string | null;
}

/**
 * Calcula a equipe necessária por período de medição:
 *   pessoas = team_count(período) × (professionals_per_team + helpers_per_team)(produtividade)
 *
 * Quando o serviço não tem produtividade cadastrada, marca a linha como
 * `has_productivity_config = false` para o usuário saber o que ainda falta.
 */
export function useTeamRequirementsByPeriod(projectId: string | null | undefined) {
  const [periods, setPeriods] = useState<RawPeriod[]>([]);
  const [services, setServices] = useState<RawService[]>([]);
  const [productivity, setProductivity] = useState<RawProductivity[]>([]);
  const [macroColors, setMacroColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setPeriods([]);
      setServices([]);
      setProductivity([]);
      return;
    }
    setLoading(true);
    try {
      const [periodsRes, servicesRes, productivityRes, macrosRes] = await Promise.all([
        supabase
          .from("planning_periods")
          .select("id, name, period_number, start_date, end_date, status")
          .eq("project_id", projectId)
          .order("period_number", { ascending: true }),
        supabase
          .from("service_planning_by_period")
          .select(
            "id, planning_period_id, scope_id, scope_name, macro_id, macro_name, team_count, productivity_per_team, unit_symbol, target_houses"
          )
          .eq("project_id", projectId),
        supabase
          .from("project_service_productivity" as any)
          .select(
            "scope_id, productivity_value, productivity_unit, default_team_count, professionals_per_team, helpers_per_team"
          )
          .eq("project_id", projectId)
          .eq("is_active", true),
        supabase
          .from("project_contract_services")
          .select("macro_id")
          .eq("project_id", projectId),
      ]);

      if (periodsRes.error) throw periodsRes.error;
      if (servicesRes.error) throw servicesRes.error;
      if (productivityRes.error) throw productivityRes.error;

      setPeriods((periodsRes.data || []) as RawPeriod[]);
      setServices((servicesRes.data || []) as RawService[]);
      setProductivity(((productivityRes.data as any[]) || []) as RawProductivity[]);

      // Cores por macro (busca em macros_template do projeto)
      const { data: projRow } = await supabase
        .from("projects")
        .select("macros_template")
        .eq("id", projectId)
        .maybeSingle();
      const colors: Record<string, string> = {};
      const tmpl = (projRow?.macros_template as any[]) || [];
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

  const productivityByScope = useMemo(() => {
    const map = new Map<string, RawProductivity>();
    productivity.forEach((p) => map.set(p.scope_id, p));
    return map;
  }, [productivity]);

  const requirements = useMemo<PeriodTeamRequirements[]>(() => {
    return periods.map((period) => {
      const periodServices = services.filter(
        (s) => s.planning_period_id === period.id && (s.target_houses ?? 0) > 0
      );

      const rows: PeriodTeamRow[] = periodServices.map((s) => {
        const prod = productivityByScope.get(s.scope_id);
        const teamCount = Number(s.team_count) || 0;
        const productivityPerTeam = Number(s.productivity_per_team) || 0;
        const profPerTeam = prod ? Number(prod.professionals_per_team) || 0 : 0;
        const helpPerTeam = prod ? Number(prod.helpers_per_team) || 0 : 0;
        const totalProf = teamCount * profPerTeam;
        const totalHelp = teamCount * helpPerTeam;

        return {
          scope_id: s.scope_id,
          scope_name: s.scope_name,
          macro_id: s.macro_id,
          macro_name: s.macro_name,
          macro_color: macroColors[s.macro_id] || null,
          team_count: teamCount,
          productivity_per_team: productivityPerTeam,
          productivity_unit: prod?.productivity_unit || s.unit_symbol || "un",
          professionals_per_team: profPerTeam,
          helpers_per_team: helpPerTeam,
          total_professionals: totalProf,
          total_helpers: totalHelp,
          total_people: totalProf + totalHelp,
          has_productivity_config: !!prod,
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
        }),
        { professionals: 0, helpers: 0, people: 0, services: 0, services_missing_productivity: 0 }
      );

      // Agregação por etapa (macro)
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
      };
    });
  }, [periods, services, productivityByScope, macroColors]);

  /** Visão consolidada: profissionais por etapa, somando todos os períodos */
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

  return {
    requirements,
    consolidatedByMacro,
    loading,
    refresh,
  };
}
