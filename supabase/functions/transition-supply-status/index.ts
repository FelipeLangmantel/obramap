import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TransitionRequest {
  request_id: string;
  new_status: string;
  notes?: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  alert: ['quoted', 'cancelled'],
  quoted: ['ordered', 'cancelled'],
  ordered: ['delivered'],
  delivered: [],
  cancelled: [],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use admin client to verify the token
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !authUser) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = authUser.id;
    console.log(`[transition-supply-status] User ${userId} authenticated`);

    const body: TransitionRequest = await req.json();
    const { request_id, new_status, notes } = body;

    console.log(`[transition-supply-status] Request: request_id=${request_id}, new_status=${new_status}`);

    if (!request_id || !new_status) {
      return new Response(
        JSON.stringify({ success: false, error: 'request_id e new_status são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validStatuses = ['alert', 'quoted', 'ordered', 'delivered', 'cancelled'];
    if (!validStatuses.includes(new_status)) {
      return new Response(
        JSON.stringify({ success: false, error: `Status inválido: ${new_status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: currentRequest, error: fetchError } = await supabaseAdmin
      .from('supply_requests')
      .select('id, status, project_id, item_name')
      .eq('id', request_id)
      .single();

    if (fetchError || !currentRequest) {
      return new Response(
        JSON.stringify({ success: false, error: 'Requisição não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentStatus = currentRequest.status;
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(new_status)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Transição inválida: ${currentStatus} → ${new_status}. Transições permitidas: ${allowedTransitions.join(', ') || 'nenhuma'}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: result, error: rpcError } = await supabaseAdmin.rpc('transition_supply_status', {
      p_request_id: request_id,
      p_new_status: new_status,
      p_user_id: userId,
      p_notes: notes || null
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      return new Response(
        JSON.stringify({ success: false, error: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[transition-supply-status] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
