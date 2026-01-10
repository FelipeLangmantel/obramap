-- =============================================
-- FASE 3: MEASUREMENT_HOUSES (Casas por Medição)
-- =============================================

-- 1. Criar tabela measurement_houses
CREATE TABLE public.measurement_houses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  measurement_id uuid NOT NULL REFERENCES public.measurements(id) ON DELETE CASCADE,
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Constraint: Uma casa só pode estar em uma medição (por vez)
  CONSTRAINT measurement_houses_unique UNIQUE (measurement_id, house_id)
);

-- 2. Comentários explicativos
COMMENT ON TABLE public.measurement_houses IS 'Vínculo de casas às medições para planejamento físico-financeiro';
COMMENT ON COLUMN public.measurement_houses.house_id IS 'Casa vinculada à medição';

-- 3. Índices para performance multi-tenant
CREATE INDEX idx_measurement_houses_company ON public.measurement_houses(company_id);
CREATE INDEX idx_measurement_houses_project ON public.measurement_houses(project_id);
CREATE INDEX idx_measurement_houses_measurement ON public.measurement_houses(measurement_id);
CREATE INDEX idx_measurement_houses_house ON public.measurement_houses(house_id);
CREATE INDEX idx_measurement_houses_company_project ON public.measurement_houses(company_id, project_id);

-- 4. Função para validar sobreposição de casas em medições ativas
CREATE OR REPLACE FUNCTION public.validate_measurement_house_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_measurement_id uuid;
  v_existing_measurement_number integer;
  v_new_measurement_status text;
BEGIN
  -- Buscar status da medição sendo vinculada
  SELECT status INTO v_new_measurement_status
  FROM measurements
  WHERE id = NEW.measurement_id;

  -- Se a medição nova está fechada, permitir (vínculo histórico)
  IF v_new_measurement_status = 'closed' THEN
    RETURN NEW;
  END IF;

  -- Verificar se a casa já está vinculada a outra medição ATIVA no mesmo projeto
  SELECT mh.measurement_id, m.measurement_number
  INTO v_existing_measurement_id, v_existing_measurement_number
  FROM measurement_houses mh
  JOIN measurements m ON m.id = mh.measurement_id
  WHERE mh.house_id = NEW.house_id
    AND mh.project_id = NEW.project_id
    AND mh.company_id = NEW.company_id
    AND m.status IN ('planned', 'in_progress')
    AND mh.measurement_id != NEW.measurement_id
  LIMIT 1;

  IF v_existing_measurement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Casa já está vinculada à Medição % (ativa). Não é permitido vincular a mesma casa a duas medições ativas.', v_existing_measurement_number;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Trigger para validar sobreposição
DROP TRIGGER IF EXISTS trigger_validate_measurement_house_overlap ON public.measurement_houses;
CREATE TRIGGER trigger_validate_measurement_house_overlap
  BEFORE INSERT OR UPDATE ON public.measurement_houses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_measurement_house_overlap();

-- 6. Função para proteger casas de medições fechadas
CREATE OR REPLACE FUNCTION public.protect_closed_measurement_houses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_measurement_status text;
BEGIN
  -- Para INSERT, verificar via NEW
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO v_measurement_status
    FROM measurements
    WHERE id = NEW.measurement_id;
    
    IF v_measurement_status = 'closed' THEN
      RAISE EXCEPTION 'Não é permitido adicionar casas a uma medição fechada.';
    END IF;
  END IF;

  -- Para UPDATE, verificar via OLD (medição original)
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO v_measurement_status
    FROM measurements
    WHERE id = OLD.measurement_id;
    
    IF v_measurement_status = 'closed' THEN
      RAISE EXCEPTION 'Não é permitido alterar vínculo de casas de uma medição fechada.';
    END IF;
  END IF;

  -- Para DELETE, verificar via OLD
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_measurement_status
    FROM measurements
    WHERE id = OLD.measurement_id;
    
    IF v_measurement_status = 'closed' THEN
      RAISE EXCEPTION 'Não é permitido remover casas de uma medição fechada.';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- 7. Trigger para proteger casas de medições fechadas
DROP TRIGGER IF EXISTS trigger_protect_closed_measurement_houses ON public.measurement_houses;
CREATE TRIGGER trigger_protect_closed_measurement_houses
  BEFORE INSERT OR UPDATE OR DELETE ON public.measurement_houses
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_closed_measurement_houses();

-- 8. RLS
ALTER TABLE public.measurement_houses ENABLE ROW LEVEL SECURITY;

-- Policy: System admin pode tudo
CREATE POLICY "System admin full access on measurement_houses"
  ON public.measurement_houses
  FOR ALL
  USING (public.is_system_admin(auth.uid()));

-- Policy: Usuários da empresa podem ver
CREATE POLICY "Company users can view measurement_houses"
  ON public.measurement_houses
  FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

-- Policy: Admins da empresa podem gerenciar
CREATE POLICY "Company admins can manage measurement_houses"
  ON public.measurement_houses
  FOR ALL
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

-- 9. Função helper para obter casas de uma medição
CREATE OR REPLACE FUNCTION public.get_measurement_houses(p_measurement_id uuid)
RETURNS TABLE(house_id uuid, house_number integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT mh.house_id, h.house_number
  FROM measurement_houses mh
  JOIN houses h ON h.id = mh.house_id
  WHERE mh.measurement_id = p_measurement_id
  ORDER BY h.house_number;
$$;

-- 10. Função helper para verificar se casa está em medição ativa
CREATE OR REPLACE FUNCTION public.is_house_in_active_measurement(
  p_house_id uuid,
  p_project_id uuid,
  p_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM measurement_houses mh
    JOIN measurements m ON m.id = mh.measurement_id
    WHERE mh.house_id = p_house_id
      AND mh.project_id = p_project_id
      AND mh.company_id = p_company_id
      AND m.status IN ('planned', 'in_progress')
  );
$$;

-- 11. Função helper para contar casas por medição
CREATE OR REPLACE FUNCTION public.get_measurement_house_count(p_measurement_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(COUNT(*)::integer, 0)
  FROM measurement_houses
  WHERE measurement_id = p_measurement_id;
$$;

-- 12. Função para vincular múltiplas casas a uma medição (batch)
CREATE OR REPLACE FUNCTION public.link_houses_to_measurement(
  p_company_id uuid,
  p_project_id uuid,
  p_measurement_id uuid,
  p_house_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_house_id uuid;
  v_linked_count integer := 0;
  v_errors text[] := '{}';
BEGIN
  -- Validar que a medição pertence ao projeto/empresa
  IF NOT EXISTS (
    SELECT 1 FROM measurements
    WHERE id = p_measurement_id
      AND project_id = p_project_id
      AND company_id = p_company_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Medição não encontrada ou não pertence ao projeto/empresa informado'
    );
  END IF;

  -- Vincular cada casa
  FOREACH v_house_id IN ARRAY p_house_ids
  LOOP
    BEGIN
      INSERT INTO measurement_houses (company_id, project_id, measurement_id, house_id)
      VALUES (p_company_id, p_project_id, p_measurement_id, v_house_id)
      ON CONFLICT (measurement_id, house_id) DO NOTHING;
      
      IF FOUND THEN
        v_linked_count := v_linked_count + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := array_append(v_errors, 'Casa ' || v_house_id || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'linked_count', v_linked_count,
    'total_requested', array_length(p_house_ids, 1),
    'errors', v_errors
  );
END;
$$;

-- 13. Função para desvincular casas de uma medição (batch)
CREATE OR REPLACE FUNCTION public.unlink_houses_from_measurement(
  p_company_id uuid,
  p_project_id uuid,
  p_measurement_id uuid,
  p_house_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_unlinked_count integer := 0;
  v_measurement_status text;
BEGIN
  -- Verificar status da medição
  SELECT status INTO v_measurement_status
  FROM measurements
  WHERE id = p_measurement_id
    AND project_id = p_project_id
    AND company_id = p_company_id;

  IF v_measurement_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Medição não encontrada'
    );
  END IF;

  IF v_measurement_status = 'closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Não é permitido desvincular casas de uma medição fechada'
    );
  END IF;

  -- Desvincular casas
  DELETE FROM measurement_houses
  WHERE company_id = p_company_id
    AND project_id = p_project_id
    AND measurement_id = p_measurement_id
    AND house_id = ANY(p_house_ids);

  GET DIAGNOSTICS v_unlinked_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'unlinked_count', v_unlinked_count
  );
END;
$$;