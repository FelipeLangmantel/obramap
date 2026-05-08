// notify-system-notification — Edge Function chamada por trigger no banco
// Dispara email transacional quando uma nova system_notification é criada.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPayload {
  notification_id: string
  company_id: string
  obra_id?: string | null
  user_id?: string | null
  tipo: string
  titulo: string
  mensagem: string
  modulo?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // SECURITY: only the DB webhook (with shared secret) or service-role caller may invoke this function.
  {
    const expectedSecret = Deno.env.get('NOTIFY_WEBHOOK_SECRET') ?? ''
    const providedSecret = req.headers.get('x-webhook-secret') ?? ''
    const authHeader = req.headers.get('Authorization') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const isServiceRole = serviceKey && authHeader === `Bearer ${serviceKey}`
    const hasSharedSecret = expectedSecret && providedSecret && providedSecret === expectedSecret
    if (!isServiceRole && !hasSharedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = (await req.json()) as NotificationPayload
    if (!body?.notification_id || !body?.titulo) {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Determinar destinatários:
    // - Se user_id: apenas esse usuário
    // - Senão: todos usuários ativos da company com permissão pro módulo
    let recipients: Array<{ user_id: string; email: string; display_name: string }> = []

    if (body.user_id) {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, email, display_name')
        .eq('user_id', body.user_id)
        .eq('status', 'active')
        .maybeSingle()
      if (data?.email) {
        recipients = [{
          user_id: data.user_id,
          email: data.email,
          display_name: data.display_name,
        }]
      }
    } else {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, email, display_name')
        .eq('company_id', body.company_id)
        .eq('status', 'active')
      recipients = (data || []).filter((p: any) => p.email)
    }

    // Buscar nome da obra (best-effort)
    let obraNome: string | undefined
    if (body.obra_id) {
      const { data } = await supabase
        .from('obras_portfolio')
        .select('nome')
        .eq('id', body.obra_id)
        .maybeSingle()
      obraNome = data?.nome
    }

    // Disparar email para cada destinatário (1:1 transacional)
    const results: Array<{ email: string; ok: boolean; error?: string }> = []
    for (const r of recipients) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({
            templateName: 'system-notification',
            recipientEmail: r.email,
            idempotencyKey: `notif-${body.notification_id}-${r.user_id}`,
            templateData: {
              titulo: body.titulo,
              mensagem: body.mensagem,
              tipo: body.tipo,
              obraNome,
              recipientName: r.display_name?.split(' ')[0],
            },
          }),
        })
        const json = await resp.json().catch(() => ({}))
        results.push({ email: r.email, ok: resp.ok, error: resp.ok ? undefined : JSON.stringify(json) })
      } catch (e) {
        results.push({ email: r.email, ok: false, error: String(e) })
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-system-notification error', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
