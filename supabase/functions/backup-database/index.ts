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

    // Lista completa de tabelas públicas — qualquer ausente é registrada em errors
    const tables = [
      // NÚCLEO
      "companies","profiles","projects","houses","quadras",
      "user_permissions","user_roles","company_modules","system_modules",
      "departments","department_permissions","user_onboarding","user_sessions",
      // PRODUÇÃO E DIÁRIO
      "productions","weekly_productions",
      "diary_entries","diary_items","diary_item_corrections","diary_photos",
      "planned_productions","production_deviations",
      "production_deletion_log","production_logs",
      // PLANEJAMENTO
      "planning_periods","planning_services","planning_stages","planning_teams",
      "planning_baselines","planning_alerts","planning_simulations",
      "daily_work_logs","productivity_library",
      "service_house_allocations","service_planning_by_period",
      "service_planning_targets","weekly_plan_config",
      "weekly_plan_services","weekly_plan_weeks",
      "weekly_plan_contractor_log",
      // HOLDING E FINANCEIRO
      "obras_portfolio","medicoes_ple","aditivos_contratos",
      "restricoes_financeiras","despesas_mensais",
      "medicao_correction_requests","medicao_previsao_historico",
      "holding_doc_tipos","holding_obra_docs",
      "holding_obra_docs_deleted","holding_doc_files",
      "holding_audit_log","holding_empresas","obra_doc_config",
      "edit_requests","pendencias_projeto","despesa_edit_requests",
      // PLE
      "ple_projects","ple_measurements","ple_entries",
      "ple_events","ple_event_groups","ple_glosses","ple_audit_log",
      "ple_budget_items","ple_measurement_items",
      // CONTRATO E CUSTOS
      "project_contracts","project_contract_services",
      "contract_receipts","scope_costs","indirect_costs",
      "labor_contracts","labor_histogram",
      "financial_entries","invoices","invoice_items",
      // SUPRIMENTOS E COMPRAS
      "materials","material_families","service_materials",
      "supply_alerts","supply_requests","supply_status_logs",
      "project_lead_times","category_lead_times",
      "purchase_orders","purchase_order_items",
      "purchase_requests","purchase_request_items",
      "quotation_requests","quotation_items","supplier_quotes",
      "suppliers","supplier_types",
      // EMPREITEIROS
      "contractors","contractor_contracts",
      "contractor_contract_services","contractor_measurements",
      "contractor_measurement_items","contractor_period_performance",
      // ENTREGA
      "delivery_checklist_templates","delivery_checklist_items",
      "delivery_inspections","delivery_issues","delivery_tracking",
      // INDUSTRIALIZAÇÃO
      "ind_factories","ind_factory_capacities","ind_factory_models",
      "ind_operation_contexts","ind_periods","ind_production_batches",
      "ind_batch_units","ind_units","ind_unit_kits",
      "ind_demand_entries","ind_demand_units","ind_services",
      "ind_service_configs","ind_shipments","ind_shipment_units",
      "ind_trucks","ind_zones","ind_installation_schedule",
      "ind_installation_units","ind_lifting_equipment",
      "ind_lifting_schedule","ind_lifting_units",
      "ind_factory_context_rules","ind_model_positions",
      // SIMULADOR
      "cashflow_simulations","cashflow_sim_inputs","cashflow_sim_suppliers",
      // AUDITORIA E SEGURANÇA
      "audit_log","system_notifications","session_security_rules",
      // OUTROS
      "inputs","units","budget_service_inputs",
      "service_productivities","measurement_houses",
      "measurement_stock_entries","board_decisions","documentos_obra",
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
        schema_version: "2026-04",
        exported_at: new Date().toISOString(),
        exported_by: userId,
        tables_attempted: tables.length,
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
