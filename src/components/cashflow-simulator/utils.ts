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

const familyColorCache = new Map<string, string>();

export function getFamilyColor(family: string): string {
  if (familyColorCache.has(family)) return familyColorCache.get(family)!;
  const idx = familyColorCache.size % FAMILY_COLORS.length;
  const color = FAMILY_COLORS[idx];
  familyColorCache.set(family, color);
  return color;
}
