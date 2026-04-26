-- ============================================================
-- Vínculo de camadas 3D POR CASA
-- ============================================================
-- Estende map_layer_stage_links com house_number (nullable):
--   • NULL  → vínculo agregado (média da obra inteira) — comportamento atual
--   • 1..N  → vínculo daquela casa específica
-- A unicidade passa a ser (project_id, layer_name, house_number_key),
-- onde -1 representa NULL para permitir múltiplas linhas com mesma layer.

ALTER TABLE public.map_layer_stage_links
  ADD COLUMN IF NOT EXISTS house_number integer;

-- Índice de leitura rápido por casa
CREATE INDEX IF NOT EXISTS idx_map_layer_links_project_house
  ON public.map_layer_stage_links (project_id, house_number)
  WHERE house_number IS NOT NULL;

-- Substituir constraint única antiga por uma que considere house_number
ALTER TABLE public.map_layer_stage_links
  DROP CONSTRAINT IF EXISTS map_layer_stage_links_project_id_layer_name_key;

-- Unicidade composta usando COALESCE para tratar NULL como -1
CREATE UNIQUE INDEX IF NOT EXISTS map_layer_links_unique_per_house
  ON public.map_layer_stage_links
  (project_id, layer_name, COALESCE(house_number, -1));

COMMENT ON COLUMN public.map_layer_stage_links.house_number IS
  'Número da casa (1..N) quando o mesh representa apenas uma casa específica. NULL = vínculo agregado para toda a obra.';