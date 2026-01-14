import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  alert: ['quoted', 'cancelled'],
  quoted: ['ordered', 'cancelled'],
  ordered: ['delivered'],
  delivered: [],
  cancelled: [],
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create user client to get user info
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: TransitionRequest = await req.json();
    const { request_id, new_status, notes } = body;

    console.log(`[transition-supply-status] User ${user.id} transitioning ${request_id} to ${new_status}`);

    // Validate input
    if (!request_id || !new_status) {
      return new Response(
        JSON.stringify({ success: false, error: 'request_id e new_status são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate new_status is valid
    const validStatuses = ['alert', 'quoted', 'ordered', 'delivered', 'cancelled'];
    if (!validStatuses.includes(new_status)) {
      return new Response(
        JSON.stringify({ success: false, error: `Status inválido: ${new_status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current request
    const { data: currentRequest, error: fetchError } = await supabaseAdmin
      .from('supply_requests')
      .select('id, status, project_id, item_name')
      .eq('id', request_id)
      .single();

    if (fetchError || !currentRequest) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Requisição não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentStatus = currentRequest.status;

    // Validate transition
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(new_status)) {
      console.log(`Invalid transition: ${currentStatus} -> ${new_status}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Transição inválida: ${currentStatus} → ${new_status}. Transições permitidas: ${allowedTransitions.join(', ') || 'nenhuma'}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute transition via RPC for atomic operation with audit log
    const { data: result, error: rpcError } = await supabaseAdmin.rpc('transition_supply_status', {
      p_request_id: request_id,
      p_new_status: new_status,
      p_user_id: user.id,
      p_notes: notes || null
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      return new Response(
        JSON.stringify({ success: false, error: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[transition-supply-status] Success:`, result);

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
