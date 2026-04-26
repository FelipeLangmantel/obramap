// Catálogo de profissões da construção civil usado em
// Produtividade & Equipes (composição da equipe).
// O usuário pode escolher rapidamente uma profissão da lista
// ou digitar um nome customizado.

export interface ProfessionOption {
  name: string;
  type: 'professional' | 'helper';
  /** Profissões agrupadas por categoria para o seletor */
  category: string;
}

export const PROFESSIONS_CATALOG: ProfessionOption[] = [
  // === Estrutura / Alvenaria ===
  { name: 'Pedreiro', type: 'professional', category: 'Estrutura / Alvenaria' },
  { name: 'Auxiliar de Pedreiro', type: 'helper', category: 'Estrutura / Alvenaria' },
  { name: 'Servente', type: 'helper', category: 'Estrutura / Alvenaria' },
  { name: 'Auxiliar de Servente', type: 'helper', category: 'Estrutura / Alvenaria' },
  { name: 'Armador', type: 'professional', category: 'Estrutura / Alvenaria' },
  { name: 'Auxiliar de Armador', type: 'helper', category: 'Estrutura / Alvenaria' },
  { name: 'Carpinteiro', type: 'professional', category: 'Estrutura / Alvenaria' },
  { name: 'Auxiliar de Carpinteiro', type: 'helper', category: 'Estrutura / Alvenaria' },
  { name: 'Operador de Betoneira', type: 'professional', category: 'Estrutura / Alvenaria' },

  // === Instalações ===
  { name: 'Eletricista', type: 'professional', category: 'Instalações' },
  { name: 'Auxiliar de Eletricista', type: 'helper', category: 'Instalações' },
  { name: 'Encanador', type: 'professional', category: 'Instalações' },
  { name: 'Auxiliar de Encanador', type: 'helper', category: 'Instalações' },
  { name: 'Instalador de Gás', type: 'professional', category: 'Instalações' },
  { name: 'Bombeiro Hidráulico', type: 'professional', category: 'Instalações' },

  // === Acabamentos ===
  { name: 'Azulejista', type: 'professional', category: 'Acabamentos' },
  { name: 'Auxiliar de Azulejista', type: 'helper', category: 'Acabamentos' },
  { name: 'Pintor', type: 'professional', category: 'Acabamentos' },
  { name: 'Auxiliar de Pintor', type: 'helper', category: 'Acabamentos' },
  { name: 'Gesseiro', type: 'professional', category: 'Acabamentos' },
  { name: 'Auxiliar de Gesseiro', type: 'helper', category: 'Acabamentos' },
  { name: 'Marmorista', type: 'professional', category: 'Acabamentos' },
  { name: 'Marceneiro', type: 'professional', category: 'Acabamentos' },
  { name: 'Vidraceiro', type: 'professional', category: 'Acabamentos' },

  // === Cobertura ===
  { name: 'Telhadista', type: 'professional', category: 'Cobertura' },
  { name: 'Auxiliar de Telhadista', type: 'helper', category: 'Cobertura' },
  { name: 'Calheiro', type: 'professional', category: 'Cobertura' },
  { name: 'Impermeabilizador', type: 'professional', category: 'Cobertura' },

  // === Externos / Apoio ===
  { name: 'Pavimentador', type: 'professional', category: 'Externos / Apoio' },
  { name: 'Jardineiro', type: 'professional', category: 'Externos / Apoio' },
  { name: 'Operador de Máquinas', type: 'professional', category: 'Externos / Apoio' },
  { name: 'Sinalizador', type: 'helper', category: 'Externos / Apoio' },
  { name: 'Apontador', type: 'professional', category: 'Externos / Apoio' },
  { name: 'Encarregado', type: 'professional', category: 'Externos / Apoio' },
  { name: 'Mestre de Obras', type: 'professional', category: 'Externos / Apoio' },
];

export function groupProfessionsByCategory() {
  const groups = new Map<string, ProfessionOption[]>();
  PROFESSIONS_CATALOG.forEach((p) => {
    const arr = groups.get(p.category) || [];
    arr.push(p);
    groups.set(p.category, arr);
  });
  return Array.from(groups.entries());
}

export function findProfession(name: string): ProfessionOption | undefined {
  const norm = name.trim().toLowerCase();
  return PROFESSIONS_CATALOG.find((p) => p.name.toLowerCase() === norm);
}
