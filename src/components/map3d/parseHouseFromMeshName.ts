/**
 * Extrai o número da casa a partir do nome do mesh do modelo 3D.
 *
 * Padrões aceitos (case-insensitive):
 *   H01_Alvenaria        → 1
 *   H_03_Cobertura       → 3
 *   Casa01_Pintura       → 1
 *   Casa_12              → 12
 *   House_5_Roof         → 5
 *   Lote07_Estrutura     → 7
 *   Unidade_2_Reboco     → 2
 *
 * Se nenhum padrão bater retorna null (camada agregada da obra).
 */
const PATTERNS: RegExp[] = [
  /(?:^|[_\-\s])(?:h|casa|house|lote|unidade|un)[_\-\s]?(\d{1,4})(?:[_\-\s]|$)/i,
  /^(\d{1,4})[_\-\s]/, // ex: "01_Alvenaria"
];

export function parseHouseNumberFromMesh(name: string): number | null {
  if (!name) return null;
  for (const re of PATTERNS) {
    const m = name.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0 && n < 10000) return n;
    }
  }
  return null;
}

/**
 * Retorna a "raiz" do nome (sem o prefixo da casa), útil para mostrar
 * "Alvenaria" em vez de "H01_Alvenaria" no painel.
 */
export function stripHousePrefix(name: string): string {
  if (!name) return name;
  return name
    .replace(/^(?:h|casa|house|lote|unidade|un)[_\-\s]?\d{1,4}[_\-\s]?/i, "")
    .replace(/^\d{1,4}[_\-\s]/, "")
    .trim() || name;
}
