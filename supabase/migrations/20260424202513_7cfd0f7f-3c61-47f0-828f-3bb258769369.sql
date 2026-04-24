-- Trigger que dispara email transacional quando uma nova system_notification é criada
-- Usa pg_net para chamar a edge function notify-system-notification de forma assíncrona

-- Garantir extensão pg_net
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Vault secret com service role key (pode já existir, idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notify_service_role_key') THEN
    PERFORM vault.create_secret(
      current_setting('app.settings.service_role_key', true),
      'notify_service_role_key',
      'Service role key usada pela trigger de notificações'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Se a settings não estiver disponível, apenas seguir; chave será resolvida via secret existente
  NULL;
END$$;

-- Função trigger
CREATE OR REPLACE FUNCTION public.fn_notify_system_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- URL da edge function (project ref fixo)
  v_url := 'https://zcsoudhbfeiszutasead.supabase.co/functions/v1/notify-system-notification';

  -- Recupera service role do vault (preferido) ou da setting
  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name IN ('notify_service_role_key', 'email_queue_service_role_key')
    ORDER BY name = 'notify_service_role_key' DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL THEN
    -- sem chave, não dispara mas não bloqueia o insert
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey', v_key
    ),
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'company_id', NEW.company_id,
      'obra_id', NEW.obra_id,
      'user_id', NEW.user_id,
      'tipo', NEW.tipo,
      'titulo', NEW.titulo,
      'mensagem', NEW.mensagem,
      'modulo', NEW.modulo
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- nunca bloquear o insert por falha de email
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_system_notification ON public.system_notifications;

CREATE TRIGGER trg_notify_system_notification
AFTER INSERT ON public.system_notifications
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_system_notification();