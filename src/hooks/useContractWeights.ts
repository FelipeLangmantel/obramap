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
        const [{ data: services }, { data: obra }] = await Promise.all([
          (supabase as any)
            .from("project_contract_services")
            .select("scope_id, unit_revenue_value")
            .eq("project_id", projectId),
          (supabase as any)
            .from("obras_portfolio")
            .select("valor_contrato, aditivo_valor_total")
            .eq("obramap_project_id", projectId)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const m = new Map<string, number>();
        (services || []).forEach((s: any) => {
          if (s.scope_id) m.set(s.scope_id, Number(s.unit_revenue_value) || 0);
        });
        setMap(m);

        const total =
          (Number(obra?.valor_contrato) || 0) +
          (Number(obra?.aditivo_valor_total) || 0);

        // Fallback: se obra não vinculada, usa soma de serviços × num casas
        // (não temos num_houses aqui — usamos só os serviços × 1 como heurística)
        // — preferimos 0 e o componente exibe "—".
        setTotal(total);
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
