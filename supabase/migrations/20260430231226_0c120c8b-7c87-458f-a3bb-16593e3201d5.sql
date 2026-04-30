
INSERT INTO public.system_modules (key, name, description, is_enabled, is_beta, display_order) VALUES
  ('diario-obra',         'Diário de Obra',           'Registro diário de produção, fotos e ocorrências', true, false, 5),
  ('relatorio-obra',      'Relatório de Obra',        'Relatórios consolidados da obra', true, false, 5),
  ('ple-measurements',    'Medições PLE',             'Planilhas PLE de medição contratual', true, false, 9),
  ('cashflow-simulator',  'Simulador de Desembolsos', 'Projeção de fluxo de caixa e desembolsos', true, true, 12),
  ('purchase-panel',      'Painel de Compras',        'Consolidação de pedidos de compra e fornecedores', true, false, 11),
  ('contractors',         'Empreiteiros',             'Gestão de empreiteiros, retenções e medições', true, false, 11),
  ('productivity',        'Produtividade & Equipes',  'Configurações globais de produtividade e dimensionamento de equipe', true, false, 6),
  ('holding-dashboard',   'Painel de Obras (Holding)','Cockpit consolidado das obras da holding', true, false, 0),
  ('holding-config',      'Configurações Gerenciais (Holding)','Configurações gerenciais da holding', true, false, 0)
ON CONFLICT (key) DO NOTHING;
