-- Create table for board decisions history
CREATE TABLE public.board_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  decision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  risk_type TEXT NOT NULL, -- 'custo', 'prazo', 'suprimentos', 'produtividade'
  alert_origin TEXT NOT NULL, -- description of what triggered the decision
  action_taken TEXT NOT NULL, -- what action was decided
  projected_impact_cost NUMERIC DEFAULT 0, -- R$ impact projected
  projected_impact_days INTEGER DEFAULT 0, -- days impact projected
  location TEXT, -- obra/quadra/casas affected
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'executed', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.board_decisions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view board_decisions"
ON public.board_decisions
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage board_decisions"
ON public.board_decisions
FOR ALL
USING (EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_roles.user_id = auth.uid()
  AND user_roles.role = 'admin'::app_role
));

-- Trigger for updated_at
CREATE TRIGGER update_board_decisions_updated_at
BEFORE UPDATE ON public.board_decisions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();