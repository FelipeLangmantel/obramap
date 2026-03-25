-- Remover contextos industriais de Tapejara e Santa Rosa (nao sao paredes pre-fabricadas)
-- ON DELETE CASCADE remove automaticamente todos os dados vinculados nas 17 tabelas filhas:
-- ind_zones, ind_units, ind_services, ind_periods, ind_production_batches,
-- ind_batch_units, ind_shipments, ind_shipment_units, ind_trucks,
-- ind_lifting_equipment, ind_lifting_schedule, ind_installation_schedule,
-- ind_installation_units, ind_unit_kits, ind_demand_entries,
-- ind_demand_units, ind_factory_context_rules

DELETE FROM public.ind_operation_contexts
WHERE
  name ILIKE '%tapejara%'
  OR name ILIKE '%santa%rosa%'
  OR name ILIKE '%santa_rosa%';

-- Confirmar que nenhum contexto indevido sobrou
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.ind_operation_contexts
  WHERE name ILIKE '%tapejara%' OR name ILIKE '%santa%rosa%';

  IF v_count = 0 THEN
    RAISE NOTICE 'Limpeza concluida. Nenhum contexto de Tapejara ou Santa Rosa encontrado.';
  ELSE
    RAISE WARNING 'Ainda existem % contexto(s) com esses nomes. Verificar manualmente.', v_count;
  END IF;
END $$;