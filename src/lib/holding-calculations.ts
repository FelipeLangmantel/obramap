/**
 * Helpers únicos para cálculos da Holding.
 * Garante consistência entre Dashboard, Analytics, PRD, Receitas e Relatórios.
 *
 * REGRAS DE DOMÍNIO:
 * - "Saldo Inicial" é registro de governança imutável → excluído de somatórios.
 * - valor_acatado (quando informado) tem prioridade sobre valor_medicao.
 * - valor_medido_inicial é receita real anterior ao sistema → soma ao total.
 * - Valor de contrato e prazo incluem aditivos.
 */

export interface MedicaoLike {
  status_medicao?: string | null;
  num_medicao?: string | null;
  valor_acatado?: number | string | null;
  valor_medicao?: number | string | null;
}

export interface ObraLike {
  valor_contrato?: number | null;
  aditivo_valor_total?: number | null;
  prazo_dias?: number | null;
  aditivo_prazo_dias?: number | null;
}

/**
 * Total medido aprovado, excluindo "Saldo Inicial" (registro de governança).
 * Soma valor_acatado (preferencial) ou valor_medicao + valor_medido_inicial.
 */
export function getTotalMedidoAprovado(
  medicoes: MedicaoLike[],
  valorMedidoInicial: number = 0
): number {
  const aprovadas = (medicoes || [])
    .filter(
      (m) =>
        m.status_medicao === "aprovada" &&
        m.num_medicao !== "Saldo Inicial"
    )
    .reduce(
      (s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0),
      0
    );
  return aprovadas + (Number(valorMedidoInicial) || 0);
}

/**
 * Valor total do contrato incluindo aditivos.
 */
export function getValorContratoTotal(obra: ObraLike): number {
  return (Number(obra.valor_contrato) || 0) + (Number(obra.aditivo_valor_total) || 0);
}

/**
 * Prazo total em dias incluindo aditivos.
 */
export function getPrazoTotal(obra: ObraLike): number {
  return (Number(obra.prazo_dias) || 0) + (Number(obra.aditivo_prazo_dias) || 0);
}

/**
 * Glosa acumulada — diferença entre valor_medicao e valor_acatado quando ambos > 0.
 */
export function getTotalGlosa(medicoes: MedicaoLike[]): number {
  return (medicoes || [])
    .filter(
      (m) =>
        Number(m.valor_acatado) > 0 &&
        Number(m.valor_medicao) > 0 &&
        m.num_medicao !== "Saldo Inicial"
    )
    .reduce(
      (s, m) =>
        s + Math.max(0, Number(m.valor_medicao) - Number(m.valor_acatado)),
      0
    );
}
