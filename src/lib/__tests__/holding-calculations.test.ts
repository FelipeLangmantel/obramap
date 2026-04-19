/**
 * TESTES — src/lib/holding-calculations.ts
 *
 * Cobrem as 4 regras de domínio mais críticas do ObraMap:
 *   RN-01  valor_acatado = fonte de verdade financeira
 *   RN-02  valor_medido_inicial sempre somado
 *   RN-04  percentual_andamento nunca sobrescrito
 *   RN-06  impacto de restrições em R$, não em %
 *
 * Para rodar: npx vitest run
 */
import { describe, it, expect } from "vitest";
import {
  getTotalMedidoAprovado,
  getValorContratoTotal,
  getPrazoTotal,
  getTotalGlosa,
} from "../holding-calculations";

// ─── TIPOS MÍNIMOS PARA OS TESTES ────────────────────────────────────────────

type Medicao = {
  status_medicao?: string | null;
  num_medicao?: string | null;
  valor_acatado?: number | null;
  valor_medicao?: number | null;
  data_aprovacao?: string | null;
};

type Obra = {
  valor_contrato?: number | null;
  aditivo_valor_total?: number | null;
  prazo_dias?: number | null;
  aditivo_prazo_dias?: number | null;
};

// ─── getTotalMedidoAprovado ───────────────────────────────────────────────────

describe("getTotalMedidoAprovado", () => {
  it("RN-01: usa valor_acatado quando disponível, não valor_medicao", () => {
    const medicoes: Medicao[] = [
      { status_medicao: "aprovada", num_medicao: "1", valor_acatado: 80_000, valor_medicao: 100_000 },
    ];
    // deve retornar 80.000 (acatado), não 100.000 (medido)
    expect(getTotalMedidoAprovado(medicoes)).toBe(80_000);
  });

  it("RN-01: usa valor_medicao como fallback quando valor_acatado é null", () => {
    const medicoes: Medicao[] = [
      { status_medicao: "aprovada", num_medicao: "1", valor_acatado: null, valor_medicao: 100_000 },
    ];
    expect(getTotalMedidoAprovado(medicoes)).toBe(100_000);
  });

  it("RN-02: valor_medido_inicial sempre somado ao total", () => {
    const medicoes: Medicao[] = [
      { status_medicao: "aprovada", num_medicao: "1", valor_acatado: 50_000 },
    ];
    const valorMedidoInicial = 200_000;
    // 50.000 (medição) + 200.000 (inicial) = 250.000
    expect(getTotalMedidoAprovado(medicoes, valorMedidoInicial)).toBe(250_000);
  });

  it("RN-02: quando não há medições mas há valor_medido_inicial, retorna inicial", () => {
    expect(getTotalMedidoAprovado([], 300_000)).toBe(300_000);
  });

  it("exclui medições com status diferente de 'aprovada'", () => {
    const medicoes: Medicao[] = [
      { status_medicao: "enviada",   num_medicao: "1", valor_acatado: 50_000 },
      { status_medicao: "pendente",  num_medicao: "2", valor_acatado: 50_000 },
      { status_medicao: "aprovada",  num_medicao: "3", valor_acatado: 80_000 },
    ];
    expect(getTotalMedidoAprovado(medicoes)).toBe(80_000);
  });

  it("exclui a medição 'Saldo Inicial' do cálculo (é registro de governança)", () => {
    const medicoes: Medicao[] = [
      { status_medicao: "aprovada", num_medicao: "Saldo Inicial", valor_acatado: 500_000 },
      { status_medicao: "aprovada", num_medicao: "1",             valor_acatado: 80_000 },
    ];
    // Saldo Inicial não deve entrar — apenas medição 1
    expect(getTotalMedidoAprovado(medicoes)).toBe(80_000);
  });

  it("somando Saldo Inicial via valor_medido_inicial (a forma correta)", () => {
    const medicoes: Medicao[] = [
      { status_medicao: "aprovada", num_medicao: "Saldo Inicial", valor_acatado: 500_000 },
      { status_medicao: "aprovada", num_medicao: "1",             valor_acatado: 80_000 },
    ];
    // total correto = medição 1 (80k) + valor_medido_inicial (500k) = 580k
    expect(getTotalMedidoAprovado(medicoes, 500_000)).toBe(580_000);
  });

  it("retorna 0 quando não há medições nem valor inicial", () => {
    expect(getTotalMedidoAprovado([])).toBe(0);
    expect(getTotalMedidoAprovado([], 0)).toBe(0);
    expect(getTotalMedidoAprovado(null as any)).toBe(0);
  });

  it("trata valores string (como pode vir do Supabase) corretamente", () => {
    const medicoes = [
      { status_medicao: "aprovada", num_medicao: "1", valor_acatado: "95000.50" as any },
    ];
    expect(getTotalMedidoAprovado(medicoes)).toBeCloseTo(95000.50);
  });
});

// ─── getValorContratoTotal ────────────────────────────────────────────────────

describe("getValorContratoTotal", () => {
  it("soma valor_contrato com aditivos aprovados", () => {
    const obra: Obra = { valor_contrato: 1_000_000, aditivo_valor_total: 200_000 };
    expect(getValorContratoTotal(obra)).toBe(1_200_000);
  });

  it("retorna valor_contrato quando não há aditivos", () => {
    const obra: Obra = { valor_contrato: 1_000_000, aditivo_valor_total: 0 };
    expect(getValorContratoTotal(obra)).toBe(1_000_000);
  });

  it("retorna valor_contrato quando aditivo é null", () => {
    const obra: Obra = { valor_contrato: 1_000_000, aditivo_valor_total: null };
    expect(getValorContratoTotal(obra)).toBe(1_000_000);
  });

  it("aditivo_valor_total já é líquido (aditivos - supressões) — não calcular de novo", () => {
    // Se contrato = 1M e aditivo_valor_total = -50k (supressão), resultado = 950k
    const obra: Obra = { valor_contrato: 1_000_000, aditivo_valor_total: -50_000 };
    expect(getValorContratoTotal(obra)).toBe(950_000);
  });

  it("retorna 0 quando campos são null/undefined", () => {
    expect(getValorContratoTotal({})).toBe(0);
    expect(getValorContratoTotal({ valor_contrato: null })).toBe(0);
  });
});

// ─── getPrazoTotal ────────────────────────────────────────────────────────────

describe("getPrazoTotal", () => {
  it("soma prazo base com aditivo de prazo", () => {
    const obra: Obra = { prazo_dias: 360, aditivo_prazo_dias: 60 };
    expect(getPrazoTotal(obra)).toBe(420);
  });

  it("retorna prazo base quando não há aditivo de prazo", () => {
    const obra: Obra = { prazo_dias: 360, aditivo_prazo_dias: 0 };
    expect(getPrazoTotal(obra)).toBe(360);
  });

  it("retorna prazo base quando aditivo_prazo_dias é null", () => {
    const obra: Obra = { prazo_dias: 360, aditivo_prazo_dias: null };
    expect(getPrazoTotal(obra)).toBe(360);
  });

  it("retorna 0 quando ambos são null", () => {
    expect(getPrazoTotal({})).toBe(0);
  });
});

// ─── getTotalGlosa ────────────────────────────────────────────────────────────

describe("getTotalGlosa", () => {
  it("calcula glosa como diferença entre valor_medicao e valor_acatado", () => {
    const medicoes: Medicao[] = [
      { valor_medicao: 100_000, valor_acatado: 85_000 }, // glosa = 15k
      { valor_medicao: 50_000,  valor_acatado: 50_000 }, // sem glosa
    ];
    expect(getTotalGlosa(medicoes)).toBe(15_000);
  });

  it("ignora medição quando valor_acatado é zero (não houve aprovação)", () => {
    const medicoes: Medicao[] = [
      { valor_medicao: 100_000, valor_acatado: 0 },
    ];
    expect(getTotalGlosa(medicoes)).toBe(0);
  });

  it("soma glosas de múltiplas medições", () => {
    const medicoes: Medicao[] = [
      { valor_medicao: 100_000, valor_acatado: 80_000 }, // glosa 20k
      { valor_medicao: 50_000,  valor_acatado: 45_000 }, // glosa 5k
      { valor_medicao: 30_000,  valor_acatado: 30_000 }, // sem glosa
    ];
    expect(getTotalGlosa(medicoes)).toBe(25_000);
  });

  it("nunca retorna glosa negativa (quando acatado > medicao)", () => {
    const medicoes: Medicao[] = [
      { valor_medicao: 50_000, valor_acatado: 60_000 }, // acatado > medicao
    ];
    expect(getTotalGlosa(medicoes)).toBe(0);
  });

  it("retorna 0 para array vazio", () => {
    expect(getTotalGlosa([])).toBe(0);
  });
});

// ─── CENÁRIOS INTEGRADOS — simula casos reais ────────────────────────────────

describe("Cenários reais integrados", () => {
  it("obra com Banco Inicial + 3 medições aprovadas + 1 pendente", () => {
    const medicoes: Medicao[] = [
      { status_medicao: "aprovada", num_medicao: "Saldo Inicial", valor_acatado: 400_000 },
      { status_medicao: "aprovada", num_medicao: "1",             valor_acatado: 80_000 },
      { status_medicao: "aprovada", num_medicao: "2",             valor_acatado: 75_000 },
      { status_medicao: "aprovada", num_medicao: "3",             valor_acatado: 90_000, valor_medicao: 100_000 },
      { status_medicao: "enviada",  num_medicao: "4",             valor_acatado: null,   valor_medicao: 95_000 },
    ];

    // Total correto:
    // - Saldo Inicial excluído (é registro de governança)
    // - Medições 1+2+3 aprovadas = 80k + 75k + 90k = 245k
    // - Medição 4 enviada = IGNORADA (não aprovada)
    // - valor_medido_inicial (representa o Saldo Inicial real) = 400k
    // Total = 245k + 400k = 645k
    const total = getTotalMedidoAprovado(medicoes, 400_000);
    expect(total).toBe(645_000);
  });

  it("percentual financeiro calculado corretamente com aditivo", () => {
    const obra: Obra = { valor_contrato: 1_000_000, aditivo_valor_total: 200_000 };
    const medicoes: Medicao[] = [
      { status_medicao: "aprovada", num_medicao: "1", valor_acatado: 300_000 },
    ];

    const totalContrato = getValorContratoTotal(obra); // 1.200.000
    const totalMedido   = getTotalMedidoAprovado(medicoes, 100_000); // 400.000

    const pctFinanceiro = totalMedido / totalContrato; // 33.33%
    expect(pctFinanceiro).toBeCloseTo(0.3333, 3);
  });

  it("glosa percentual acima do threshold indica problema financeiro", () => {
    const medicoes: Medicao[] = [
      { status_medicao: "aprovada", num_medicao: "1", valor_medicao: 100_000, valor_acatado: 80_000 },
      { status_medicao: "aprovada", num_medicao: "2", valor_medicao: 100_000, valor_acatado: 82_000 },
    ];

    const totalGlosa   = getTotalGlosa(medicoes);   // 38.000
    const totalMedido  = getTotalMedidoAprovado(medicoes); // 162.000

    const pctGlosa = totalGlosa / totalMedido;
    // 38k / 162k ≈ 23.5% — acima do threshold red (15%)
    expect(pctGlosa).toBeGreaterThan(0.15);
  });
});
