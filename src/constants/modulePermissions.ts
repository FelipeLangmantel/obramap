/**
 * FONTE ÚNICA DE VERDADE para todos os módulos de menu e seções de gerenciamento.
 * 
 * Ao adicionar um novo módulo ao sistema:
 * 1. Adicione uma entrada aqui em MENU_MODULES ou MANAGEMENT_MODULES
 * 2. Adicione o item no mainMenuItems do AppSidebar.tsx com o mesmo permissionId
 * 
 * O painel de permissões (UserPermissionsPanel) lê automaticamente daqui,
 * garantindo que novos módulos apareçam imediatamente para configuração de acesso.
 */

export interface MenuModule {
  /** ID único usado como chave de permissão (visible_menus) */
  id: string;
  /** Rótulo exibido no painel de permissões */
  label: string;
  /** Chave correspondente em company_modules (se houver controle por empresa) */
  moduleKey?: string;
}

export interface ManagementModule {
  /** ID único usado como chave de permissão (visible_management_sections) */
  id: string;
  /** Rótulo exibido no painel de permissões */
  label: string;
}

/**
 * Módulos de menu do sistema — cada entrada gera uma opção no painel de permissões.
 * A ordem aqui define a ordem de exibição no painel.
 */
export const MENU_MODULES: MenuModule[] = [
  { id: "painel_inicial", label: "Painel Inicial" },
  { id: "mapa", label: "Mapa de Obras", moduleKey: "map" },
  { id: "mapa_interativo", label: "Mapa Interativo" },
  { id: "mapa_3d", label: "Mapa 3D" },
  { id: "graficos", label: "Gráficos" },
  { id: "producao", label: "Produção Semanal", moduleKey: "production" },
  { id: "planejamento_semanal", label: "Planej. Semanal" },
  { id: "planejamento_periodo", label: "Planej. Período" },
  { id: "planejamento_estrategico", label: "Planej. Estratégico" },
  { id: "contrato", label: "Contrato da Obra" },
  { id: "ple_medicoes", label: "Medições PLE" },
  { id: "custos", label: "Custos da Obra", moduleKey: "costs" },
  { id: "suprimentos", label: "Suprimentos", moduleKey: "supplies" },
  { id: "financeiro", label: "Fluxo Financeiro", moduleKey: "financial-flow" },
  { id: "diretoria", label: "Painel Diretoria", moduleKey: "board-decisions" },
  { id: "entrega", label: "Entrega & Pós-Obra", moduleKey: "delivery" },
  { id: "smart_planning", label: "Planej. Inteligente", moduleKey: "smart-planning" },
  { id: "productivity", label: "Produtividade e Equipes" },
  { id: "empreiteiros", label: "Empreiteiros", moduleKey: "contractors" },
  { id: "industrializacao", label: "Industrialização & Logística", moduleKey: "industrialization" },
  { id: "holding", label: "Holding — Painel Principal", moduleKey: "holding-dashboard" },
  { id: "holding_receitas", label: "Holding — Receitas & Medições" },
  { id: "holding_despesas", label: "Holding — Despesas & Custos" },
  { id: "holding_documentos", label: "Holding — Documentação" },
  { id: "holding_prd", label: "Holding — PRD Cronograma" },
  { id: "holding_insights", label: "Holding — IA Insights" },
  { id: "holding_config", label: "Holding — Configurações" },
];

/**
 * Seções de gerenciamento — aparecem como opções de permissão separadas.
 */
export const MANAGEMENT_MODULES: ManagementModule[] = [
  { id: "projetos", label: "Cadastro de Obras" },
  { id: "quadras", label: "Cadastro de Quadras" },
  { id: "macros", label: "Etapas e Serviços" },
  { id: "insumos", label: "Cadastro de Insumos" },
  { id: "fornecedores", label: "Cadastro de Fornecedores" },
  { id: "usuarios", label: "Gerenciar Usuários" },
  { id: "configuracoes", label: "Configurações" },
];

/**
 * Mapeamento de permissionId do menu para module_key da company_modules.
 * Gerado automaticamente a partir de MENU_MODULES.
 */
export const MENU_TO_MODULE_KEY: Record<string, string> = MENU_MODULES.reduce((acc, m) => {
  if (m.moduleKey) acc[m.id] = m.moduleKey;
  return acc;
}, {} as Record<string, string>);

/**
 * Permissoes padrao por perfil.
 * Usadas ao criar novo usuario e ao resetar permissoes.
 */
export const DEFAULT_MENUS_BY_ROLE: Record<string, string[]> = {
  admin: [
    'painel_inicial','mapa','mapa_interativo','mapa_3d','graficos','diretoria',
    'producao','planejamento_semanal','planejamento_periodo','planejamento_estrategico',
    'smart_planning','productivity','entrega',
    'contrato','ple_medicoes','custos','suprimentos','financeiro','empreiteiros',
    'industrializacao',
    'holding','holding_receitas','holding_despesas','holding_documentos',
    'holding_prd','holding_insights','holding_config',
  ],
  editor: [
    'painel_inicial','mapa','mapa_interativo','graficos',
    'producao','planejamento_semanal','planejamento_periodo',
    'contrato','custos','suprimentos','empreiteiros','industrializacao',
  ],
  viewer: [
    'painel_inicial','graficos','mapa',
  ],
};

export const DEFAULT_MANAGEMENT_BY_ROLE: Record<string, string[]> = {
  admin: ['projetos','quadras','macros','insumos','fornecedores','usuarios','configuracoes'],
  editor: ['projetos','quadras','macros','insumos','fornecedores'],
  viewer: [],
};

/**
 * Retorna as permissoes padrao para um perfil.
 * Usar ao criar usuario ou ao clicar em 'Restaurar Padrao' no painel.
 */
export function getDefaultPermissions(role: 'admin' | 'editor' | 'viewer') {
  return {
    visible_menus: DEFAULT_MENUS_BY_ROLE[role] || DEFAULT_MENUS_BY_ROLE.viewer,
    visible_management_sections: DEFAULT_MANAGEMENT_BY_ROLE[role] || [],
  };
}
