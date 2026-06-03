export interface HouseMacroRaw {
  id: string;
  scopes?: HouseScopeRaw[];
}

export interface HouseScopeRaw {
  id: string;
  progress?: number;
}

export interface HouseWithMacros {
  macros?: HouseMacroRaw[] | unknown;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export type ProgressStatus = "nao_iniciado" | "em_andamento" | "concluido";

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const safeFiniteNumber = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const formatHouseNumber = (houseNumber: number) => {
  return String(houseNumber).padStart(2, "0");
};

const formatPercent = (percent: number) => {
  return Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(2)));
};

export function getHouseServiceProgress(
  house: HouseWithMacros | null | undefined,
  macroId: string,
  scopeId: string
): number {
  if (!house || !Array.isArray(house.macros)) return 0;

  const macro = house.macros.find((item) => item?.id === macroId);
  if (!macro || !Array.isArray(macro.scopes)) return 0;

  const scope = macro.scopes.find((item) => item?.id === scopeId);
  const progress = safeFiniteNumber(scope?.progress);

  return progress == null ? 0 : clampPercent(progress);
}

export function getAvailablePercent(
  house: HouseWithMacros | null | undefined,
  macroId: string,
  scopeId: string
): number {
  return Math.max(0, 100 - getHouseServiceProgress(house, macroId, scopeId));
}

export function isHouseServiceComplete(
  house: HouseWithMacros | null | undefined,
  macroId: string,
  scopeId: string
): boolean {
  return getHouseServiceProgress(house, macroId, scopeId) >= 100;
}

export function validateProgressLaunch(
  houseNumber: number,
  current: number,
  launch: number
): ValidationResult {
  const safeCurrent = safeFiniteNumber(current) ?? 0;
  const available = Math.max(0, 100 - clampPercent(safeCurrent));
  const label = `Casa ${formatHouseNumber(houseNumber)}`;

  if (!Number.isFinite(launch) || launch <= 0) {
    return {
      valid: false,
      message: `${label}: o percentual lançado deve ser maior que 0%.`,
    };
  }

  if (safeCurrent + launch > 100) {
    return {
      valid: false,
      message: `${label} já possui ${formatPercent(clampPercent(safeCurrent))}% executado neste serviço. Percentual disponível para lançamento: ${formatPercent(available)}%. O lançamento informado (${formatPercent(launch)}%) ultrapassa 100%.`,
    };
  }

  return { valid: true };
}

export function validateBatchLaunch(
  houses: Array<HouseWithMacros & { id?: number }>,
  houseIds: number[],
  macroId: string,
  scopeId: string,
  launchByHouse: Record<number, number | undefined>,
  defaultLaunch: number
): ValidationResult {
  for (const houseId of houseIds) {
    const house = houses.find((item) => item.id === houseId);
    const current = getHouseServiceProgress(house, macroId, scopeId);
    const launch = launchByHouse[houseId] ?? defaultLaunch;
    const validation = validateProgressLaunch(houseId, current, launch);

    if (!validation.valid) return validation;
  }

  return { valid: true };
}

export function calculateFinalProgress(current: number, launch: number): number {
  const safeCurrent = safeFiniteNumber(current) ?? 0;
  const safeLaunch = safeFiniteNumber(launch) ?? 0;

  return clampPercent(safeCurrent + safeLaunch);
}

export function buildFinalProgressMap(
  houses: Array<HouseWithMacros & { id?: number }>,
  houseIds: number[],
  macroId: string,
  scopeId: string,
  launchByHouse: Record<number, number | undefined>,
  defaultLaunch: number
): Record<number, number> {
  return houseIds.reduce<Record<number, number>>((acc, houseId) => {
    const house = houses.find((item) => item.id === houseId);
    const current = getHouseServiceProgress(house, macroId, scopeId);
    const launch = launchByHouse[houseId] ?? defaultLaunch;
    acc[houseId] = calculateFinalProgress(current, launch);
    return acc;
  }, {});
}

export function classifyProgress(progress: number): ProgressStatus {
  const safeProgress = safeFiniteNumber(progress) ?? 0;

  if (safeProgress <= 0) return "nao_iniciado";
  if (safeProgress >= 100) return "concluido";
  return "em_andamento";
}

export function safeDisplayPercent(
  percentualExplicito: number | null | undefined,
  houseProgress: number | null | undefined
): number | null {
  const explicit = safeFiniteNumber(percentualExplicito);
  if (explicit != null) return clampPercent(explicit);

  const progress = safeFiniteNumber(houseProgress);
  if (progress != null) return clampPercent(progress);

  return null;
}
