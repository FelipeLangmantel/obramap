-- Realtime para tabelas do PLE (planilha orçamentária)
-- Permite que adições/exclusões/edições de serviços e grupos atualizem KPIs em tempo real
-- entre abas e dispositivos do mesmo usuário/empresa.
ALTER TABLE public.ple_events REPLICA IDENTITY FULL;
ALTER TABLE public.ple_event_groups REPLICA IDENTITY FULL;
ALTER TABLE public.ple_projects REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ple_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ple_event_groups; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ple_projects; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;