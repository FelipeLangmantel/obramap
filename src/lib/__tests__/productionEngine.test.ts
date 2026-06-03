import { describe, expect, it } from "vitest";
import {
  buildFinalProgressMap,
  calculateFinalProgress,
  classifyProgress,
  getAvailablePercent,
  getHouseServiceProgress,
  safeDisplayPercent,
  validateProgressLaunch,
  type HouseWithMacros,
} from "../productionEngine";

const macroId = "macro-cobertura";
const scopeId = "scope-telhamento";

const makeHouse = (progress: number): HouseWithMacros => ({
  macros: [
    {
      id: macroId,
      scopes: [{ id: scopeId, progress }],
    },
  ],
});

describe("getHouseServiceProgress", () => {
  it("retorna o progresso da casa quando existe", () => {
    expect(getHouseServiceProgress(makeHouse(50), macroId, scopeId)).toBe(50);
  });

  it("retorna 0 para house null", () => {
    expect(getHouseServiceProgress(null, macroId, scopeId)).toBe(0);
  });

  it("retorna 0 para macro inexistente", () => {
    expect(getHouseServiceProgress(makeHouse(50), "macro-inexistente", scopeId)).toBe(0);
  });

  it("retorna 0 para scope inexistente", () => {
    expect(getHouseServiceProgress(makeHouse(50), macroId, "scope-inexistente")).toBe(0);
  });

  it("retorna 0 quando macros está undefined", () => {
    expect(getHouseServiceProgress({}, macroId, scopeId)).toBe(0);
  });

  it("clipa progress acima de 100", () => {
    expect(getHouseServiceProgress(makeHouse(150), macroId, scopeId)).toBe(100);
  });

  it("clipa progress abaixo de 0", () => {
    expect(getHouseServiceProgress(makeHouse(-10), macroId, scopeId)).toBe(0);
  });

  it("retorna 0 para progress NaN", () => {
    expect(getHouseServiceProgress(makeHouse(Number.NaN), macroId, scopeId)).toBe(0);
  });
});

describe("getAvailablePercent", () => {
  it("retorna 50 quando casa tem 50%", () => {
    expect(getAvailablePercent(makeHouse(50), macroId, scopeId)).toBe(50);
  });

  it("retorna 100 quando casa tem 0%", () => {
    expect(getAvailablePercent(makeHouse(0), macroId, scopeId)).toBe(100);
  });

  it("retorna 0 quando casa tem 100%", () => {
    expect(getAvailablePercent(makeHouse(100), macroId, scopeId)).toBe(0);
  });
});

describe("validateProgressLaunch", () => {
  it("aceita 0% atual + lançamento de 50%", () => {
    expect(validateProgressLaunch(3, 0, 50)).toEqual({ valid: true });
  });

  it("aceita 50% atual + lançamento de 50%", () => {
    expect(validateProgressLaunch(3, 50, 50)).toEqual({ valid: true });
  });

  it("bloqueia quando ultrapassa 100%", () => {
    const result = validateProgressLaunch(7, 50, 70);

    expect(result.valid).toBe(false);
    expect(result.message).toContain("Casa 07");
    expect(result.message).toContain("50%");
    expect(result.message).toContain("70%");
    expect(result.message).toContain("100%");
  });

  it("bloqueia lançamento de 0%", () => {
    expect(validateProgressLaunch(3, 0, 0).valid).toBe(false);
  });

  it("formata houseNumber com dois dígitos na mensagem", () => {
    const result = validateProgressLaunch(3, 50, 70);

    expect(result.message).toContain("Casa 03");
  });
});

describe("calculateFinalProgress", () => {
  it("soma progressos dentro do limite", () => {
    expect(calculateFinalProgress(50, 30)).toBe(80);
  });

  it("limita progresso final a 100", () => {
    expect(calculateFinalProgress(50, 70)).toBe(100);
  });

  it("não deixa progresso final abaixo de 0", () => {
    expect(calculateFinalProgress(0, -10)).toBe(0);
  });

  it("retorna 100 para 45 + 55", () => {
    expect(calculateFinalProgress(45, 55)).toBe(100);
  });
});

describe("buildFinalProgressMap", () => {
  it("monta mapa para 3 casas com progressos diferentes", () => {
    const houses = [
      { id: 1, ...makeHouse(0) },
      { id: 2, ...makeHouse(40) },
      { id: 3, ...makeHouse(90) },
    ];

    expect(buildFinalProgressMap(houses, [1, 2, 3], macroId, scopeId, {}, 10)).toEqual({
      1: 10,
      2: 50,
      3: 100,
    });
  });

  it("respeita launchByHouse individual", () => {
    const houses = [
      { id: 1, ...makeHouse(0) },
      { id: 2, ...makeHouse(40) },
      { id: 3, ...makeHouse(90) },
    ];

    expect(buildFinalProgressMap(houses, [1, 2, 3], macroId, scopeId, { 1: 50, 2: 20 }, 5)).toEqual({
      1: 50,
      2: 60,
      3: 95,
    });
  });
});

describe("classifyProgress", () => {
  it("classifica 0 como não iniciado", () => {
    expect(classifyProgress(0)).toBe("nao_iniciado");
  });

  it("classifica 1 como em andamento", () => {
    expect(classifyProgress(1)).toBe("em_andamento");
  });

  it("classifica 99 como em andamento", () => {
    expect(classifyProgress(99)).toBe("em_andamento");
  });

  it("classifica 100 como concluído", () => {
    expect(classifyProgress(100)).toBe("concluido");
  });
});

describe("safeDisplayPercent", () => {
  it("prioriza percentual explícito", () => {
    expect(safeDisplayPercent(50, 80)).toBe(50);
  });

  it("usa progresso da casa quando percentual explícito é null", () => {
    expect(safeDisplayPercent(null, 70)).toBe(70);
  });

  it("retorna null quando ambos são null", () => {
    expect(safeDisplayPercent(null, null)).toBeNull();
  });

  it("retorna null quando ambos são undefined", () => {
    expect(safeDisplayPercent(undefined, undefined)).toBeNull();
  });

  it("retorna null quando percentual explícito é NaN e progresso é null", () => {
    expect(safeDisplayPercent(Number.NaN, null)).toBeNull();
  });

  it("clipa percentual explícito acima de 100", () => {
    expect(safeDisplayPercent(150, null)).toBe(100);
  });
});
