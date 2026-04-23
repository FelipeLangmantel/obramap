-- Adicionar project_id em audit_log
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_project
  ON public.audit_log(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

-- Atualizar fn_audit_log para capturar project_id
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id UUID;
  v_user_name  TEXT;
BEGIN
  BEGIN
    v_project_id := COALESCE(
      (to_jsonb(NEW) ->> 'project_id')::UUID,
      (to_jsonb(OLD) ->> 'project_id')::UUID
    );
  EXCEPTION WHEN OTHERS THEN
    v_project_id := NULL;
  END;

  SELECT display_name INTO v_user_name FROM profiles WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO audit_log(tabela, registro_id, acao, dados_anteriores, dados_novos, user_id, user_name, project_id)
  VALUES (
    TG_TABLE_NAME,
    COALESCE((to_jsonb(NEW) ->> 'id')::UUID, (to_jsonb(OLD) ->> 'id')::UUID),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid(),
    v_user_name,
    v_project_id
  );
  RETURN COALESCE(NEW, OLD);
END; $$;

-- Triggers nas tabelas de produção e planejamento
DROP TRIGGER IF EXISTS audit_productions ON public.productions;
CREATE TRIGGER audit_productions
  AFTER INSERT OR UPDATE OR DELETE ON public.productions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

DROP TRIGGER IF EXISTS audit_weekly_productions ON public.weekly_productions;
CREATE TRIGGER audit_weekly_productions
  AFTER INSERT OR UPDATE OR DELETE ON public.weekly_productions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

DROP TRIGGER IF EXISTS audit_diary_entries ON public.diary_entries;
CREATE TRIGGER audit_diary_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

DROP TRIGGER IF EXISTS audit_service_planning ON public.service_planning_by_period;
CREATE TRIGGER audit_service_planning
  AFTER INSERT OR UPDATE OR DELETE ON public.service_planning_by_period
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

DROP TRIGGER IF EXISTS audit_planned_productions ON public.planned_productions;
CREATE TRIGGER audit_planned_productions
  AFTER INSERT OR UPDATE OR DELETE ON public.planned_productions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();