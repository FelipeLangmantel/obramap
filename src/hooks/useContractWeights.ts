import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ContractServiceWeight {
  macro_id: string;
  scope_id: string;
  /** Valor unitário (R$ por casa/unidade). */
  unit_revenue_value: number;
}

export interface ContractWeights {
  /** Mapa scope_id -> valor por unidade (R$). */
  unitValueByScope: Map<string, number>;
  /** Valor total do contrato (R$), incluindo aditivos quando disponíveis. */
  contractTotalValue: number;
  loading: boolean;
}

/**
 * Carrega os valores unitários dos serviços do contrato (PLE) e o valor
 * total do contrato (de obras_portfolio, quando vinculada). Permite que o
 * Diário calcule o "% do contrato" lançado em cada dia / semana.
 */
export function useContractWeights(projectId?: string | null): ContractWeights {
  const [unitValueByScope, setMap] = useState<Map<string, number>>(new Map());
  const [contractTotalValue, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setMap(new Map());
      setTotal(0);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const [{ data: services }, { data: obra }, { count: housesCount }] = await Promise.all([
          (supabase as any)
            .from("project_contract_services")
            .select("scope_id, unit_revenue_value")
            .eq("project_id", projectId),
          (supabase as any)
            .from("obras_portfolio")
            .select("valor_contrato, aditivo_valor_total")
            .eq("obramap_project_id", projectId)
            .maybeSingle(),
          (supabase as any)
            .from("houses")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId),
        ]);

        if (cancelled) return;

        const m = new Map<string, number>();
        let sumUnitValues = 0;
        (services || []).forEach((s: any) => {
          if (s.scope_id) {
            const v = Number(s.unit_revenue_value) || 0;
            m.set(s.scope_id, v);
            sumUnitValues += v;
          }
        });
        setMap(m);

        const portfolioTotal =
          (Number(obra?.valor_contrato) || 0) +
          (Number(obra?.aditivo_valor_total) || 0);

        // Fallback (obra sem vínculo a holding): total = soma(unit_revenue) × nº casas.
        // Cada serviço tem valor unitário POR casa, então o contrato vale
        // sumUnitValues × housesCount.
        const fallbackTotal = sumUnitValues * (Number(housesCount) || 0);

        setTotal(portfolioTotal > 0 ? portfolioTotal : fallbackTotal);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { unitValueByScope, contractTotalValue, loading };
}
