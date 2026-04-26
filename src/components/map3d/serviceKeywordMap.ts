/**
 * Dicionário de palavras-chave para inferir o serviço (macro/escopo)
 * a partir do nome de uma malha do modelo 3D.
 *
 * Cobre os termos mais comuns no canteiro brasileiro. Comparação é
 * case-insensitive e ignora acentos.
 */

const NORMALIZE = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Lista ordenada por especificidade — palavras mais específicas vêm antes. */
const KEYWORDS: { keys: string[]; canonical: string }[] = [
  { keys: ["fundacao", "sapata", "radier", "baldrame", "estaca"], canonical: "Fundação" },
  { keys: ["estrutura", "viga", "pilar", "laje"], canonical: "Estrutura" },
  { keys: ["alvenaria", "parede", "tijolo", "bloco"], canonical: "Alvenaria" },
  { keys: ["cobertura", "telhado", "telha", "trama", "madeiramento"], canonical: "Cobertura" },
  { keys: ["esquadria", "porta", "janela", "batente"], canonical: "Esquadrias" },
  { keys: ["reboco", "chapisco", "emboco", "massa"], canonical: "Reboco" },
  { keys: ["pintura", "tinta"], canonical: "Pintura" },
  { keys: ["piso", "contrapiso", "ceramica", "porcelanato"], canonical: "Piso" },
  { keys: ["forro", "gesso"], canonical: "Forro" },
  { keys: ["hidraulica", "hidro", "agua", "esgoto", "tubulacao"], canonical: "Hidráulica" },
  { keys: ["eletrica", "eletrico", "fiacao", "cabo", "tomada"], canonical: "Elétrica" },
  { keys: ["impermeabilizacao", "manta"], canonical: "Impermeabilização" },
  { keys: ["revestimento", "azulejo"], canonical: "Revestimento" },
  { keys: ["acabamento", "louca", "metal"], canonical: "Acabamento" },
];

/**
 * Devolve o "rótulo canônico" de serviço inferido pelo nome da malha,
 * ou null se nenhuma palavra-chave bater.
 */
export function inferServiceKeyword(meshName: string): string | null {
  if (!meshName) return null;
  const norm = NORMALIZE(meshName);
  for (const { keys, canonical } of KEYWORDS) {
    if (keys.some(k => norm.includes(k))) return canonical;
  }
  return null;
}

/**
 * Tenta encontrar o melhor serviço (macro/escopo) do contrato dada uma
 * lista de opções, comparando palavras-chave com o nome do mesh.
 *
 * Estratégia:
 *  1) Se o mesh tem palavra-chave reconhecida (ex.: "telhado") e existir
 *     macro OU escopo cujo nome contenha essa palavra → match.
 *  2) Senão, comparação direta: alguma palavra do mesh aparece
 *     no nome do macro ou do escopo.
 */
export function matchServiceForMesh<T extends { macro_name: string; scope_name: string }>(
  meshName: string,
  options: T[],
): T | null {
  if (!meshName || options.length === 0) return null;
  const meshNorm = NORMALIZE(meshName);
  const keyword = inferServiceKeyword(meshName);

  if (keyword) {
    const keyNorm = NORMALIZE(keyword);
    const hit = options.find(o =>
      NORMALIZE(o.scope_name).includes(keyNorm) ||
      NORMALIZE(o.macro_name).includes(keyNorm)
    );
    if (hit) return hit;
  }

  // Fallback: qualquer token >=4 chars do mesh que apareça num escopo/macro
  const tokens = meshNorm.split(/[^a-z0-9]+/).filter(t => t.length >= 4);
  for (const t of tokens) {
    const hit = options.find(o =>
      NORMALIZE(o.scope_name).includes(t) ||
      NORMALIZE(o.macro_name).includes(t)
    );
    if (hit) return hit;
  }
  return null;
}
