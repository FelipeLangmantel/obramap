export interface Scope {
  id: string;
  name: string;
  weight: number;
  progress: number;
  startDate: string | null;
  endDate: string | null;
}

export interface Macro {
  id: string;
  name: string;
  color: string;
  scopes: Scope[];
}

export interface House {
  id: number;
  quadra: string;
  area: number;
  type: string;
  constructorName: string;
  expectedDate: string;
  lastUpdate: string;
  macros: Macro[];
}

export interface Quadra {
  id: string;
  name: string;
  houses: number[];
}

// Default colors for macros
export const DEFAULT_MACRO_COLORS = [
  "#9ca3af", // gray - Não Iniciado
  "#ef4444", // red - Fundação
  "#f59e0b", // amber - Estrutura
  "#3b82f6", // blue - Acabamento
  "#22c55e", // green - Concluído
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
];

export const MACROS_TEMPLATE: Macro[] = [
  {
    id: "macro1",
    name: "Estrutura",
    color: "#ef4444",
    scopes: [
      { id: "radier", name: "Radier", weight: 8, progress: 0, startDate: null, endDate: null },
      { id: "paredes", name: "Paredes", weight: 12, progress: 0, startDate: null, endDate: null },
      { id: "mad_telhado", name: "Mad. Telhado", weight: 6, progress: 0, startDate: null, endDate: null },
      { id: "cobertura_metalica", name: "Cob. Metálica", weight: 5, progress: 0, startDate: null, endDate: null },
    ],
  },
  {
    id: "macro2",
    name: "Cobertura / Fechamento",
    color: "#f59e0b",
    scopes: [
      { id: "telha", name: "Telha", weight: 5, progress: 0, startDate: null, endDate: null },
      { id: "calha_rufo", name: "Calha + Rufo", weight: 3, progress: 0, startDate: null, endDate: null },
      { id: "esquadria_aluminio", name: "Esq. Alumínio", weight: 6, progress: 0, startDate: null, endDate: null },
      { id: "portas", name: "Portas", weight: 4, progress: 0, startDate: null, endDate: null },
    ],
  },
  {
    id: "macro3",
    name: "Instalações Hidrossanitárias",
    color: "#3b82f6",
    scopes: [
      { id: "agua_fria", name: "Água Fria", weight: 4, progress: 0, startDate: null, endDate: null },
      { id: "barrilete", name: "Barrilete", weight: 2, progress: 0, startDate: null, endDate: null },
      { id: "fossa_filtro", name: "Fossa + Filtro + Sumidouro", weight: 5, progress: 0, startDate: null, endDate: null },
      { id: "esgoto_externo", name: "Esgoto Externo", weight: 3, progress: 0, startDate: null, endDate: null },
      { id: "entrada_agua", name: "Entrada de Água", weight: 2, progress: 0, startDate: null, endDate: null },
    ],
  },
  {
    id: "macro4",
    name: "Instalações Elétricas",
    color: "#22c55e",
    scopes: [
      { id: "afiacao_tomadas", name: "Afiação + Tomadas", weight: 5, progress: 0, startDate: null, endDate: null },
      { id: "entrada_energia", name: "Entrada de Energia", weight: 3, progress: 0, startDate: null, endDate: null },
    ],
  },
  {
    id: "macro5",
    name: "Impermeabilizações",
    color: "#8b5cf6",
    scopes: [
      { id: "imp_banheiro", name: "Imp. Banheiro", weight: 3, progress: 0, startDate: null, endDate: null },
      { id: "imp_laje", name: "Imp. Laje", weight: 3, progress: 0, startDate: null, endDate: null },
    ],
  },
  {
    id: "macro6",
    name: "Acabamentos Internos",
    color: "#ec4899",
    scopes: [
      { id: "nivelamento", name: "Niv. Interna", weight: 4, progress: 0, startDate: null, endDate: null },
      { id: "contrapiso", name: "Contrapiso", weight: 4, progress: 0, startDate: null, endDate: null },
      { id: "piso_azulejo", name: "Piso + Azulejo", weight: 6, progress: 0, startDate: null, endDate: null },
      { id: "selador", name: "Selador", weight: 2, progress: 0, startDate: null, endDate: null },
      { id: "textura", name: "Textura", weight: 3, progress: 0, startDate: null, endDate: null },
      { id: "pintura", name: "Pintura", weight: 4, progress: 0, startDate: null, endDate: null },
      { id: "loucas_metais", name: "Louças e Metais", weight: 3, progress: 0, startDate: null, endDate: null },
    ],
  },
  {
    id: "macro7",
    name: "Entrega e Finalização",
    color: "#14b8a6",
    scopes: [
      { id: "limpeza_final", name: "Limpeza Final", weight: 1, progress: 0, startDate: null, endDate: null },
    ],
  },
];

export const QUADRAS: Quadra[] = [
  { id: "A", name: "Quadra A", houses: [1, 2, 3, 4, 5, 6] },
  { id: "B", name: "Quadra B", houses: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27] },
  { id: "C", name: "Quadra C", houses: [28, 29, 30, 31, 32, 33, 34, 35] },
  { id: "D", name: "Quadra D", houses: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45] },
  { id: "E", name: "Quadra E", houses: [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57] },
  { id: "F", name: "Quadra F", houses: [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74] },
  { id: "G", name: "Quadra G", houses: [75, 76, 77, 78, 79, 80, 81, 82] },
  { id: "H", name: "Quadra H", houses: [83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102] },
  { id: "I", name: "Quadra I", houses: [103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123] },
];

const CONSTRUCTORS = ["Construtora Alpha", "Engenharia Beta", "Construções Delta", "Edificações Gama"];

function generateRandomProgress(): number {
  const rand = Math.random();
  if (rand < 0.1) return 0;
  if (rand < 0.3) return Math.floor(Math.random() * 30);
  if (rand < 0.7) return Math.floor(Math.random() * 40) + 30;
  return Math.floor(Math.random() * 30) + 70;
}

function deepCloneMacros(): Macro[] {
  return MACROS_TEMPLATE.map(macro => ({
    ...macro,
    scopes: macro.scopes.map(scope => ({
      ...scope,
      progress: generateRandomProgress(),
      startDate: Math.random() > 0.3 ? "2024-06-15" : null,
      endDate: null,
    })),
  }));
}

export function generateInitialHouses(): House[] {
  const houses: House[] = [];
  
  QUADRAS.forEach(quadra => {
    quadra.houses.forEach(houseNum => {
      houses.push({
        id: houseNum,
        quadra: quadra.id,
        area: Math.floor(Math.random() * 100) + 150,
        type: "Residencial",
        constructorName: CONSTRUCTORS[Math.floor(Math.random() * CONSTRUCTORS.length)],
        expectedDate: "29/06/2025",
        lastUpdate: new Date().toLocaleDateString("pt-BR"),
        macros: deepCloneMacros(),
      });
    });
  });
  
  return houses;
}

export function calculateHouseProgress(house: House): number {
  let totalWeight = 0;
  let weightedProgress = 0;
  
  house.macros.forEach(macro => {
    macro.scopes.forEach(scope => {
      totalWeight += scope.weight;
      weightedProgress += (scope.progress * scope.weight) / 100;
    });
  });
  
  return totalWeight > 0 ? Math.round((weightedProgress / totalWeight) * 100) : 0;
}

export function getStatusFromProgress(progress: number): "not-started" | "foundation" | "structure" | "finishing" | "completed" {
  if (progress === 0) return "not-started";
  if (progress < 30) return "foundation";
  if (progress < 60) return "structure";
  if (progress < 100) return "finishing";
  return "completed";
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    "not-started": "Não Iniciado",
    "foundation": "Fundação",
    "structure": "Estrutura",
    "finishing": "Acabamento",
    "completed": "Concluído",
  };
  return labels[status] || status;
}
