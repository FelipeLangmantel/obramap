import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller identity
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;

    // Check if caller is system_admin
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("system_role")
      .eq("user_id", userId)
      .single();

    if (profileError || profile?.system_role !== "system_admin") {
      return new Response(
        JSON.stringify({ error: "Unauthorized - only system admins can export backups" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to read all data (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // List of all public tables to export
    const tables = [
      "aditivos_contratos",
      "board_decisions",
      "budget_service_inputs",
      "cashflow_sim_inputs",
      "cashflow_sim_suppliers",
      "cashflow_simulations",
      "category_lead_times",
      "companies",
      "company_modules",
      "contract_receipts",
      "contractor_contract_services",
      "contractor_contracts",
      "contractor_measurement_items",
      "contractor_measurements",
      "contractor_period_performance",
      "contractors",
      "daily_work_logs",
      "delivery_checklist_items",
      "delivery_checklist_templates",
      "delivery_inspections",
      "delivery_issues",
      "delivery_tracking",
      "department_permissions",
      "departments",
      "despesas_mensais",
      "documentos_obra",
      "financial_entries",
      "holding_audit_log",
      "holding_doc_tipos",
      "holding_empresas",
      "holding_obra_docs",
      "houses",
      "ind_batch_units",
      "ind_demand_entries",
      "ind_demand_units",
      "ind_factories",
      "ind_operation_contexts",
      "ind_periods",
      "ind_production_batches",
      "ind_services",
      "ind_units",
      "inputs",
      "macros",
      "measurement_items",
      "measurements",
      "obras_portfolio",
      "planning_periods",
      "planning_stages",
      "planning_teams",
      "ple_budget_items",
      "ple_measurement_items",
      "ple_measurements",
      "ple_projects",
      "profiles",
      "project_contracts",
      "project_scopes",
      "projects",
      "purchase_order_items",
      "purchase_orders",
      "quadras",
      "receitas_mensais",
      "scopes",
      "service_planning_by_period",
      "service_productivity",
      "supplier_types",
      "suppliers",
      "supply_alerts",
      "supply_requests",
      "user_permissions",
      "user_roles",
    ];

    const backup: Record<string, unknown[]> = {};
    const errors: Record<string, string> = {};

    // Fetch all tables in parallel (batches of 10 to avoid overwhelming)
    const batchSize = 10;
    for (let i = 0; i < tables.length; i += batchSize) {
      const batch = tables.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (table) => {
          try {
            // Fetch all rows (paginate beyond 1000 limit)
            const allRows: unknown[] = [];
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
              const { data, error } = await supabaseAdmin
                .from(table)
                .select("*")
                .range(from, from + pageSize - 1);

              if (error) {
                return { table, data: null, error: error.message };
              }

              if (data && data.length > 0) {
                allRows.push(...data);
                from += pageSize;
                hasMore = data.length === pageSize;
              } else {
                hasMore = false;
              }
            }

            return { table, data: allRows, error: null };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            return { table, data: null, error: msg };
          }
        })
      );

      for (const result of results) {
        if (result.error) {
          errors[result.table] = result.error;
        } else {
          backup[result.table] = result.data ?? [];
        }
      }
    }

    const exportData = {
      metadata: {
        exported_at: new Date().toISOString(),
        exported_by: userId,
        tables_exported: Object.keys(backup).length,
        tables_with_errors: Object.keys(errors).length,
        total_records: Object.values(backup).reduce((sum, rows) => sum + rows.length, 0),
      },
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      data: backup,
    };

    const jsonString = JSON.stringify(exportData, null, 2);

    return new Response(jsonString, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error: unknown) {
    console.error("Backup error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
