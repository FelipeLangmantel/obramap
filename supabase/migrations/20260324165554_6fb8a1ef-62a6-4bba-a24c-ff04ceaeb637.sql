
DO $$
DECLARE
  comp_id UUID;
BEGIN
  FOR comp_id IN
    SELECT DISTINCT company_id FROM public.obras_portfolio
  LOOP

    INSERT INTO public.holding_empresas (company_id, nome, ativo)
    VALUES
      (comp_id, 'PreviBras', true),
      (comp_id, 'Binotto',   true),
      (comp_id, 'DFRAGA',    true),
      (comp_id, 'ARPROS',    true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.holding_doc_tipos
      (company_id, nome, categoria, obrigatorio, ordem, ativo)
    VALUES
      (comp_id, 'Ata',         'doc_obra', true,  1, true),
      (comp_id, 'OIS',         'doc_obra', true,  2, true),
      (comp_id, 'ART',         'doc_obra', true,  3, true),
      (comp_id, 'CNO',         'doc_obra', true,  4, true),
      (comp_id, 'Implantação', 'doc_obra', true,  5, true),
      (comp_id, 'SCP',         'doc_obra', false, 6, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.holding_doc_tipos
      (company_id, nome, categoria, obrigatorio, ordem, ativo)
    VALUES
      (comp_id, 'Sondagem e SPT',      'ensaios_projetos', true,  1, true),
      (comp_id, 'Planta Localização',  'ensaios_projetos', true,  2, true),
      (comp_id, 'Plano Altimétrico',   'ensaios_projetos', true,  3, true),
      (comp_id, 'Painel de Bordo',     'ensaios_projetos', false, 4, true),
      (comp_id, 'Checklist Segurança', 'ensaios_projetos', true,  5, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.holding_obra_docs (obra_id, doc_tipo_id, checked)
    SELECT o.id, t.id, false
    FROM public.obras_portfolio o
    CROSS JOIN public.holding_doc_tipos t
    WHERE o.company_id = comp_id
      AND t.company_id = comp_id
    ON CONFLICT (obra_id, doc_tipo_id) DO NOTHING;

  END LOOP;
END $$;
