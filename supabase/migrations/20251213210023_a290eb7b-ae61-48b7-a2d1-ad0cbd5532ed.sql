-- Add user_sessions table for tracking login info and session management
CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  login_at timestamp with time zone NOT NULL DEFAULT now(),
  logout_at timestamp with time zone,
  ip_address text,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage all sessions
CREATE POLICY "Admins can view all sessions"
ON public.user_sessions
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = 'admin'::app_role
));

CREATE POLICY "Admins can manage sessions"
ON public.user_sessions
FOR ALL
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = 'admin'::app_role
))
WITH CHECK (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = 'admin'::app_role
));

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions"
ON public.user_sessions
FOR SELECT
USING (user_id = auth.uid());

-- Add company_id to profiles for future multi-tenant support
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id uuid;

-- Create companies table for future multi-tenant structure
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  cnpj text,
  logo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Company members can view their company
CREATE POLICY "Company members can view their company"
ON public.companies
FOR SELECT
USING (
  id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role)
);

-- Only admins can create/update/delete companies
CREATE POLICY "Admins can manage companies"
ON public.companies
FOR ALL
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = 'admin'::app_role
))
WITH CHECK (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = 'admin'::app_role
));