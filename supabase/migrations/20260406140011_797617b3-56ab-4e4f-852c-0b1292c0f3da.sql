
-- 1. Add new columns to despesas_mensais
ALTER TABLE public.despesas_mensais
  ADD COLUMN IF NOT EXISTS medicao_id uuid REFERENCES public.medicoes_ple(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_despesa text NOT NULL DEFAULT 'prevista',
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'Geral',
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS valor_medicao_referencia numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- 2. Create system_notifications table
CREATE TABLE IF NOT EXISTS public.system_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  medicao_id uuid REFERENCES public.medicoes_ple(id) ON DELETE SET NULL,
  lida boolean NOT NULL DEFAULT false,
  lida_em timestamptz,
  resolvida boolean NOT NULL DEFAULT false,
  resolvida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_company_read" ON public.system_notifications
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "notif_company_update" ON public.system_notifications
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "notif_company_insert" ON public.system_notifications
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

-- 3. Create despesa_edit_requests table
CREATE TABLE IF NOT EXISTS public.despesa_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despesa_id uuid NOT NULL REFERENCES public.despesas_mensais(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  justificativa text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  admin_response text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.despesa_edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "despesa_edit_req_company" ON public.despesa_edit_requests
  FOR ALL TO authenticated
  USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()));

-- 4. Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_notifications;

-- 5. Function to count unread notifications
CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_company_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.system_notifications
  WHERE company_id = p_company_id AND lida = false;
$$;

-- 6. Function to get notifications list
CREATE OR REPLACE FUNCTION public.get_notifications(p_company_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS SETOF public.system_notifications
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.system_notifications
  WHERE company_id = p_company_id
  ORDER BY created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
