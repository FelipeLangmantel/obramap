export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

// Family color palette
const FAMILY_COLORS = [
  "hsl(210, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(0, 65%, 55%)",
  "hsl(180, 55%, 45%)",
  "hsl(60, 70%, 50%)",
  "hsl(330, 60%, 55%)",
  "hsl(120, 50%, 40%)",
  "hsl(240, 60%, 60%)",
];

// Hash determinístico: mesma família sempre recebe a mesma cor
// independente da ordem em que aparece ou dos filtros ativos
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getFamilyColor(family: string): string {
  const idx = hashString(family) % FAMILY_COLORS.length;
  return FAMILY_COLORS[idx];
}
