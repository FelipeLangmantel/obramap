export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      aditivos_contratos: {
        Row: {
          aditivo_prazo_dias: number
          aditivo_valor: number
          created_by_name: string | null
          created_by_user_id: string | null
          data: string | null
          id: string
          num_aditivo: string | null
          obra_id: string
          status: Database["public"]["Enums"]["aditivo_status"]
          supressao_valor: number
          updated_at: string | null
          updated_by_name: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          aditivo_prazo_dias?: number
          aditivo_valor?: number
          created_by_name?: string | null
          created_by_user_id?: string | null
          data?: string | null
          id?: string
          num_aditivo?: string | null
          obra_id: string
          status?: Database["public"]["Enums"]["aditivo_status"]
          supressao_valor?: number
          updated_at?: string | null
          updated_by_name?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          aditivo_prazo_dias?: number
          aditivo_valor?: number
          created_by_name?: string | null
          created_by_user_id?: string | null
          data?: string | null
          id?: string
          num_aditivo?: string | null
          obra_id?: string
          status?: Database["public"]["Enums"]["aditivo_status"]
          supressao_valor?: number
          updated_at?: string | null
          updated_by_name?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aditivos_contratos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          created_at: string | null
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          ip: string | null
          registro_id: string | null
          tabela: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          ip?: string | null
          registro_id?: string | null
          tabela: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          ip?: string | null
          registro_id?: string | null
          tabela?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      board_decisions: {
        Row: {
          action_taken: string
          alert_origin: string
          created_at: string
          decision_date: string
          id: string
          location: string | null
          project_id: string
          projected_impact_cost: number | null
          projected_impact_days: number | null
          risk_type: string
          status: string
          updated_at: string
        }
        Insert: {
          action_taken: string
          alert_origin: string
          created_at?: string
          decision_date?: string
          id?: string
          location?: string | null
          project_id: string
          projected_impact_cost?: number | null
          projected_impact_days?: number | null
          risk_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_taken?: string
          alert_origin?: string
          created_at?: string
          decision_date?: string
          id?: string
          location?: string | null
          project_id?: string
          projected_impact_cost?: number | null
          projected_impact_days?: number | null
          risk_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_service_inputs: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          input_id: string
          input_name: string | null
          macro_id: string
          project_id: string
          quantity_per_unit: number
          scope_id: string
          service_name: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          input_id: string
          input_name?: string | null
          macro_id: string
          project_id: string
          quantity_per_unit?: number
          scope_id: string
          service_name?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          input_id?: string
          input_name?: string | null
          macro_id?: string
          project_id?: string
          quantity_per_unit?: number
          scope_id?: string
          service_name?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_service_inputs_input_id_fkey"
            columns: ["input_id"]
            isOneToOne: false
            referencedRelation: "inputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bsi_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bsi_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_sim_inputs: {
        Row: {
          budget_service_input_id: string | null
          company_id: string
          created_at: string
          id: string
          input_id: string
          input_name: string
          installment_1_days: number
          installment_1_pct: number
          installment_2_days: number
          installment_2_pct: number
          installment_3_days: number
          installment_3_pct: number
          lead_time_days: number
          macro_id: string
          project_id: string
          reference_price: number
          scope_id: string
          supplier_id: string | null
          supplier_name: string | null
          updated_at: string
        }
        Insert: {
          budget_service_input_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          input_id: string
          input_name: string
          installment_1_days?: number
          installment_1_pct?: number
          installment_2_days?: number
          installment_2_pct?: number
          installment_3_days?: number
          installment_3_pct?: number
          lead_time_days?: number
          macro_id: string
          project_id: string
          reference_price?: number
          scope_id: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          budget_service_input_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          input_id?: string
          input_name?: string
          installment_1_days?: number
          installment_1_pct?: number
          installment_2_days?: number
          installment_2_pct?: number
          installment_3_days?: number
          installment_3_pct?: number
          lead_time_days?: number
          macro_id?: string
          project_id?: string
          reference_price?: number
          scope_id?: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_sim_inputs_budget_service_input_id_fkey"
            columns: ["budget_service_input_id"]
            isOneToOne: false
            referencedRelation: "budget_service_inputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_sim_inputs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_sim_inputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_sim_inputs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_sim_suppliers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          project_id: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          project_id: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_sim_suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_sim_suppliers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_sim_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_simulations: {
        Row: {
          company_id: string
          config_snapshot: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          config_snapshot?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          config_snapshot?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_simulations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_simulations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      category_lead_times: {
        Row: {
          category: string
          created_at: string
          id: string
          lead_time_days: number
          project_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          lead_time_days?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          lead_time_days?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_lead_times_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_modules: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          expected_benefits: string | null
          id: string
          module_key: string
          module_name: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          expected_benefits?: string | null
          id?: string
          module_key: string
          module_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          expected_benefits?: string | null
          id?: string
          module_key?: string
          module_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_receipts: {
        Row: {
          amount_received: number
          contract_id: string
          created_at: string
          id: string
          measurement_id: string | null
          notes: string | null
          receipt_date: string
          reference: string | null
          source: string
          updated_at: string
        }
        Insert: {
          amount_received: number
          contract_id: string
          created_at?: string
          id?: string
          measurement_id?: string | null
          notes?: string | null
          receipt_date?: string
          reference?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          amount_received?: number
          contract_id?: string
          created_at?: string
          id?: string
          measurement_id?: string | null
          notes?: string | null
          receipt_date?: string
          reference?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_receipts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "project_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_receipts_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_contract_services: {
        Row: {
          budget_unit_value: number
          company_id: string
          contract_id: string
          created_at: string
          house_ids: number[]
          id: string
          macro_id: string
          macro_name: string
          measured_houses: number
          measured_value: number
          negotiated_unit_value: number
          project_id: string
          scope_id: string
          scope_name: string
          total_houses: number
          total_value: number
          updated_at: string
        }
        Insert: {
          budget_unit_value?: number
          company_id: string
          contract_id: string
          created_at?: string
          house_ids?: number[]
          id?: string
          macro_id: string
          macro_name: string
          measured_houses?: number
          measured_value?: number
          negotiated_unit_value?: number
          project_id: string
          scope_id: string
          scope_name: string
          total_houses?: number
          total_value?: number
          updated_at?: string
        }
        Update: {
          budget_unit_value?: number
          company_id?: string
          contract_id?: string
          created_at?: string
          house_ids?: number[]
          id?: string
          macro_id?: string
          macro_name?: string
          measured_houses?: number
          measured_value?: number
          negotiated_unit_value?: number
          project_id?: string
          scope_id?: string
          scope_name?: string
          total_houses?: number
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_contract_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_contract_services_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contractor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_contract_services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_contracts: {
        Row: {
          company_id: string
          contract_number: string | null
          contractor_id: string
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          project_id: string
          retention_percent: number
          start_date: string | null
          status: string
          total_measured: number
          total_paid: number
          total_retained: number
          total_value: number
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_number?: string | null
          contractor_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          project_id: string
          retention_percent?: number
          start_date?: string | null
          status?: string
          total_measured?: number
          total_paid?: number
          total_retained?: number
          total_value?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_number?: string | null
          contractor_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          retention_percent?: number
          start_date?: string | null
          status?: string
          total_measured?: number
          total_paid?: number
          total_retained?: number
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_contracts_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_measurement_items: {
        Row: {
          company_id: string
          contract_service_id: string
          created_at: string
          house_ids: number[]
          houses_measured: number
          id: string
          measurement_id: string
          notes: string | null
          project_id: string
          total_value: number
          unit_value: number
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_service_id: string
          created_at?: string
          house_ids?: number[]
          houses_measured?: number
          id?: string
          measurement_id: string
          notes?: string | null
          project_id: string
          total_value?: number
          unit_value?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_service_id?: string
          created_at?: string
          house_ids?: number[]
          houses_measured?: number
          id?: string
          measurement_id?: string
          notes?: string | null
          project_id?: string
          total_value?: number
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_measurement_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_measurement_items_contract_service_id_fkey"
            columns: ["contract_service_id"]
            isOneToOne: false
            referencedRelation: "contractor_contract_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_measurement_items_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "contractor_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_measurement_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_measurements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          contract_id: string
          created_at: string
          gross_value: number
          id: string
          measurement_number: number
          net_value: number
          notes: string | null
          payment_date: string | null
          payment_due_date: string | null
          period_end: string
          period_start: string
          project_id: string
          retention_percent: number
          retention_value: number
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          contract_id: string
          created_at?: string
          gross_value?: number
          id?: string
          measurement_number: number
          net_value?: number
          notes?: string | null
          payment_date?: string | null
          payment_due_date?: string | null
          period_end: string
          period_start: string
          project_id: string
          retention_percent?: number
          retention_value?: number
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          contract_id?: string
          created_at?: string
          gross_value?: number
          id?: string
          measurement_number?: number
          net_value?: number
          notes?: string | null
          payment_date?: string | null
          payment_due_date?: string | null
          period_end?: string
          period_start?: string
          project_id?: string
          retention_percent?: number
          retention_value?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_measurements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_measurements_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contractor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_measurements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_period_performance: {
        Row: {
          company_id: string
          completed_houses: number
          completion_percent: number
          contractor_contract_id: string
          created_at: string
          executed_value: number
          id: string
          macro_id: string
          macro_name: string
          notes: string | null
          planned_houses: number
          planned_value: number
          planning_period_id: string
          project_id: string
          scope_id: string
          scope_name: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_houses?: number
          completion_percent?: number
          contractor_contract_id: string
          created_at?: string
          executed_value?: number
          id?: string
          macro_id: string
          macro_name: string
          notes?: string | null
          planned_houses?: number
          planned_value?: number
          planning_period_id: string
          project_id: string
          scope_id: string
          scope_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_houses?: number
          completion_percent?: number
          contractor_contract_id?: string
          created_at?: string
          executed_value?: number
          id?: string
          macro_id?: string
          macro_name?: string
          notes?: string | null
          planned_houses?: number
          planned_value?: number
          planning_period_id?: string
          project_id?: string
          scope_id?: string
          scope_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_period_performance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_period_performance_contractor_contract_id_fkey"
            columns: ["contractor_contract_id"]
            isOneToOne: false
            referencedRelation: "contractor_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_period_performance_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_period_performance_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_name: string | null
          city: string | null
          company_id: string
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pix_key: string | null
          pix_key_type: string | null
          state: string | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          city?: string | null
          company_id: string
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          state?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          city?: string | null
          company_id?: string
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          state?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_work_logs: {
        Row: {
          created_at: string
          created_by: string | null
          house_ids: number[]
          id: string
          log_date: string
          notes: string | null
          project_id: string
          stage_id: string
          team_id: string | null
          units_completed: number
          updated_at: string
          weather: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          house_ids?: number[]
          id?: string
          log_date?: string
          notes?: string | null
          project_id: string
          stage_id: string
          team_id?: string | null
          units_completed?: number
          updated_at?: string
          weather?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          house_ids?: number[]
          id?: string
          log_date?: string
          notes?: string | null
          project_id?: string
          stage_id?: string
          team_id?: string | null
          units_completed?: number
          updated_at?: string
          weather?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_work_logs_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "planning_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_work_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "planning_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_checklist_items: {
        Row: {
          category: string
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: string
          inspection_id: string
          is_conforming: boolean | null
          is_critical: boolean
          item_name: string
          observation: string | null
          photo_url: string | null
          template_id: string | null
        }
        Insert: {
          category: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          inspection_id: string
          is_conforming?: boolean | null
          is_critical?: boolean
          item_name: string
          observation?: string | null
          photo_url?: string | null
          template_id?: string | null
        }
        Update: {
          category?: string
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          inspection_id?: string
          is_conforming?: boolean | null
          is_critical?: boolean
          item_name?: string
          observation?: string | null
          photo_url?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_checklist_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "delivery_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "delivery_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_checklist_templates: {
        Row: {
          category: string
          created_at: string
          display_order: number
          id: string
          is_critical: boolean
          item_name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          display_order?: number
          id?: string
          is_critical?: boolean
          item_name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          is_critical?: boolean
          item_name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_inspections: {
        Row: {
          created_at: string
          delivery_date: string | null
          house_id: string
          house_number: number
          id: string
          inspection_date: string | null
          inspector_id: string | null
          inspector_name: string | null
          notes: string | null
          project_id: string
          scheduled_delivery_date: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_date?: string | null
          house_id: string
          house_number: number
          id?: string
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          notes?: string | null
          project_id: string
          scheduled_delivery_date?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_date?: string | null
          house_id?: string
          house_number?: number
          id?: string
          inspection_date?: string | null
          inspector_id?: string | null
          inspector_name?: string | null
          notes?: string | null
          project_id?: string
          scheduled_delivery_date?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Relationships: []
      }
      delivery_issues: {
        Row: {
          category: string
          checklist_item_id: string | null
          created_at: string
          description: string
          due_date: string | null
          house_id: string
          house_number: number
          id: string
          inspection_id: string
          photo_after_url: string | null
          photo_before_url: string | null
          project_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          responsible_id: string | null
          responsible_name: string | null
          severity: Database["public"]["Enums"]["issue_severity"]
          sla_days: number
          status: Database["public"]["Enums"]["issue_status"]
          updated_at: string
        }
        Insert: {
          category: string
          checklist_item_id?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          house_id: string
          house_number: number
          id?: string
          inspection_id: string
          photo_after_url?: string | null
          photo_before_url?: string | null
          project_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responsible_id?: string | null
          responsible_name?: string | null
          severity?: Database["public"]["Enums"]["issue_severity"]
          sla_days?: number
          status?: Database["public"]["Enums"]["issue_status"]
          updated_at?: string
        }
        Update: {
          category?: string
          checklist_item_id?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          house_id?: string
          house_number?: number
          id?: string
          inspection_id?: string
          photo_after_url?: string | null
          photo_before_url?: string | null
          project_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responsible_id?: string | null
          responsible_name?: string | null
          severity?: Database["public"]["Enums"]["issue_severity"]
          sla_days?: number
          status?: Database["public"]["Enums"]["issue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_issues_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "delivery_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_issues_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "delivery_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tracking: {
        Row: {
          created_at: string
          description: string | null
          id: string
          location: string | null
          purchase_order_id: string
          status: string
          tracking_date: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          purchase_order_id: string
          status: string
          tracking_date?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          purchase_order_id?: string
          status?: string
          tracking_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tracking_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      department_permissions: {
        Row: {
          allowed_project_ids: string[] | null
          can_edit: boolean
          company_id: string
          created_at: string
          department_name: string
          id: string
          updated_at: string
          visible_management_sections: string[]
          visible_menus: string[]
        }
        Insert: {
          allowed_project_ids?: string[] | null
          can_edit?: boolean
          company_id: string
          created_at?: string
          department_name: string
          id?: string
          updated_at?: string
          visible_management_sections?: string[]
          visible_menus?: string[]
        }
        Update: {
          allowed_project_ids?: string[] | null
          can_edit?: boolean
          company_id?: string
          created_at?: string
          department_name?: string
          id?: string
          updated_at?: string
          visible_management_sections?: string[]
          visible_menus?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "department_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          company_id: string | null
          created_at: string
          display_order: number | null
          id: string
          name: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      despesa_edit_requests: {
        Row: {
          admin_response: string | null
          created_at: string
          despesa_id: string
          id: string
          justificativa: string
          obra_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
          user_name: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          despesa_id: string
          id?: string
          justificativa: string
          obra_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
          user_name: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          despesa_id?: string
          id?: string
          justificativa?: string
          obra_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "despesa_edit_requests_despesa_id_fkey"
            columns: ["despesa_id"]
            isOneToOne: false
            referencedRelation: "despesas_mensais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesa_edit_requests_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_mensais: {
        Row: {
          ano_referencia: number | null
          categoria: string
          created_by_name: string | null
          created_by_user_id: string | null
          descricao: string | null
          id: string
          is_locked: boolean
          medicao_id: string | null
          mes_referencia: string | null
          obra_id: string
          status: Database["public"]["Enums"]["despesa_status"]
          tipo_despesa: string
          updated_at: string | null
          updated_by_name: string | null
          updated_by_user_id: string | null
          valor: number
          valor_medicao_referencia: number | null
        }
        Insert: {
          ano_referencia?: number | null
          categoria?: string
          created_by_name?: string | null
          created_by_user_id?: string | null
          descricao?: string | null
          id?: string
          is_locked?: boolean
          medicao_id?: string | null
          mes_referencia?: string | null
          obra_id: string
          status?: Database["public"]["Enums"]["despesa_status"]
          tipo_despesa?: string
          updated_at?: string | null
          updated_by_name?: string | null
          updated_by_user_id?: string | null
          valor?: number
          valor_medicao_referencia?: number | null
        }
        Update: {
          ano_referencia?: number | null
          categoria?: string
          created_by_name?: string | null
          created_by_user_id?: string | null
          descricao?: string | null
          id?: string
          is_locked?: boolean
          medicao_id?: string | null
          mes_referencia?: string | null
          obra_id?: string
          status?: Database["public"]["Enums"]["despesa_status"]
          tipo_despesa?: string
          updated_at?: string | null
          updated_by_name?: string | null
          updated_by_user_id?: string | null
          valor?: number
          valor_medicao_referencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "despesas_mensais_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes_ple"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_mensais_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_obra: {
        Row: {
          art: boolean
          ata: boolean
          checklist_seguranca: boolean
          cno: boolean
          id: string
          impl: boolean
          obra_id: string
          ois: boolean
          painel_bordo: boolean
          plano_altimetrico: boolean
          planta_localizacao: boolean
          scp: boolean
          sondagem_spt: boolean
        }
        Insert: {
          art?: boolean
          ata?: boolean
          checklist_seguranca?: boolean
          cno?: boolean
          id?: string
          impl?: boolean
          obra_id: string
          ois?: boolean
          painel_bordo?: boolean
          plano_altimetrico?: boolean
          planta_localizacao?: boolean
          scp?: boolean
          sondagem_spt?: boolean
        }
        Update: {
          art?: boolean
          ata?: boolean
          checklist_seguranca?: boolean
          cno?: boolean
          id?: string
          impl?: boolean
          obra_id?: string
          ois?: boolean
          painel_bordo?: boolean
          plano_altimetrico?: boolean
          planta_localizacao?: boolean
          scp?: boolean
          sondagem_spt?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "documentos_obra_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_requests: {
        Row: {
          admin_response: string | null
          created_at: string | null
          id: string
          justificativa: string
          obra_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
          user_name: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string | null
          id?: string
          justificativa: string
          obra_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
          user_name: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string | null
          id?: string
          justificativa?: string
          obra_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "edit_requests_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_entries: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          due_date: string
          id: string
          notes: string | null
          payment_date: string | null
          pix_key: string | null
          pix_key_type: string | null
          project_id: string
          status: string
          subcategory: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          description: string
          due_date: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          project_id: string
          status?: string
          subcategory?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          project_id?: string
          status?: string
          subcategory?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_audit_log: {
        Row: {
          acao: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          descricao: string
          id: string
          obra_id: string
          realizado_em: string
          realizado_por: string | null
          realizado_por_nome: string
          registro_id: string | null
          tabela: string
        }
        Insert: {
          acao: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          descricao: string
          id?: string
          obra_id: string
          realizado_em?: string
          realizado_por?: string | null
          realizado_por_nome?: string
          registro_id?: string | null
          tabela: string
        }
        Update: {
          acao?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          descricao?: string
          id?: string
          obra_id?: string
          realizado_em?: string
          realizado_por?: string | null
          realizado_por_nome?: string
          registro_id?: string | null
          tabela?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_audit_log_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_doc_files: {
        Row: {
          content_type: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          obra_doc_id: string
          uploaded_by: string
          uploaded_by_name: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          id?: string
          obra_doc_id: string
          uploaded_by: string
          uploaded_by_name?: string
        }
        Update: {
          content_type?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          obra_doc_id?: string
          uploaded_by?: string
          uploaded_by_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_doc_files_obra_doc_id_fkey"
            columns: ["obra_doc_id"]
            isOneToOne: false
            referencedRelation: "holding_obra_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_doc_tipos: {
        Row: {
          ativo: boolean
          categoria: string
          company_id: string
          created_at: string
          id: string
          nome: string
          obrigatorio: boolean
          ordem: number
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          company_id: string
          created_at?: string
          id?: string
          nome: string
          obrigatorio?: boolean
          ordem?: number
        }
        Update: {
          ativo?: boolean
          categoria?: string
          company_id?: string
          created_at?: string
          id?: string
          nome?: string
          obrigatorio?: boolean
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "holding_doc_tipos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_empresas: {
        Row: {
          ativo: boolean
          cnpj: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          nome: string
          responsavel: string | null
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          responsavel?: string | null
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          responsavel?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holding_empresas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_obra_docs: {
        Row: {
          checked: boolean
          created_at: string
          data_entrega: string | null
          doc_tipo_id: string
          id: string
          obra_id: string
          observacao: string | null
        }
        Insert: {
          checked?: boolean
          created_at?: string
          data_entrega?: string | null
          doc_tipo_id: string
          id?: string
          obra_id: string
          observacao?: string | null
        }
        Update: {
          checked?: boolean
          created_at?: string
          data_entrega?: string | null
          doc_tipo_id?: string
          id?: string
          obra_id?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holding_obra_docs_doc_tipo_id_fkey"
            columns: ["doc_tipo_id"]
            isOneToOne: false
            referencedRelation: "holding_doc_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_obra_docs_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      houses: {
        Row: {
          area: number
          constructor_name: string | null
          created_at: string
          expected_date: string | null
          house_number: number
          id: string
          last_update: string
          macros: Json
          project_id: string
          quadra_id: string | null
          type: string
        }
        Insert: {
          area?: number
          constructor_name?: string | null
          created_at?: string
          expected_date?: string | null
          house_number: number
          id?: string
          last_update?: string
          macros?: Json
          project_id: string
          quadra_id?: string | null
          type?: string
        }
        Update: {
          area?: number
          constructor_name?: string | null
          created_at?: string
          expected_date?: string | null
          house_number?: number
          id?: string
          last_update?: string
          macros?: Json
          project_id?: string
          quadra_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "houses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "houses_quadra_id_fkey"
            columns: ["quadra_id"]
            isOneToOne: false
            referencedRelation: "quadras"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_batch_units: {
        Row: {
          batch_id: string
          context_id: string
          house_number: number | null
          id: string
          status: string
          unit_id: string | null
        }
        Insert: {
          batch_id: string
          context_id: string
          house_number?: number | null
          id?: string
          status?: string
          unit_id?: string | null
        }
        Update: {
          batch_id?: string
          context_id?: string
          house_number?: number | null
          id?: string
          status?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_batch_units_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ind_production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_batch_units_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_batch_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ind_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_demand_entries: {
        Row: {
          auto_generated: boolean
          company_id: string
          context_id: string
          created_at: string
          id: string
          ind_period_id: string | null
          ind_service_id: string | null
          macro_id: string | null
          notes: string | null
          obramap_period_id: string | null
          scope_id: string | null
          target_quantity: number
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean
          company_id: string
          context_id: string
          created_at?: string
          id?: string
          ind_period_id?: string | null
          ind_service_id?: string | null
          macro_id?: string | null
          notes?: string | null
          obramap_period_id?: string | null
          scope_id?: string | null
          target_quantity?: number
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean
          company_id?: string
          context_id?: string
          created_at?: string
          id?: string
          ind_period_id?: string | null
          ind_service_id?: string | null
          macro_id?: string | null
          notes?: string | null
          obramap_period_id?: string | null
          scope_id?: string | null
          target_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_demand_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_demand_entries_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_demand_entries_ind_period_id_fkey"
            columns: ["ind_period_id"]
            isOneToOne: false
            referencedRelation: "ind_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_demand_entries_ind_service_id_fkey"
            columns: ["ind_service_id"]
            isOneToOne: false
            referencedRelation: "ind_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_demand_entries_obramap_period_id_fkey"
            columns: ["obramap_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_demand_units: {
        Row: {
          context_id: string
          demand_entry_id: string
          house_number: number | null
          id: string
          unit_id: string | null
        }
        Insert: {
          context_id: string
          demand_entry_id: string
          house_number?: number | null
          id?: string
          unit_id?: string | null
        }
        Update: {
          context_id?: string
          demand_entry_id?: string
          house_number?: number | null
          id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_demand_units_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_demand_units_demand_entry_id_fkey"
            columns: ["demand_entry_id"]
            isOneToOne: false
            referencedRelation: "ind_demand_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_demand_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ind_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_factories: {
        Row: {
          advance_payment_pct: number
          avg_lead_time_days: number
          capacity_houses_month: number
          city: string | null
          cnpj: string | null
          company_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms: string | null
          price_per_house: number
          radius_km: number | null
          state: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          advance_payment_pct?: number
          avg_lead_time_days?: number
          capacity_houses_month?: number
          city?: string | null
          cnpj?: string | null
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms?: string | null
          price_per_house?: number
          radius_km?: number | null
          state?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          advance_payment_pct?: number
          avg_lead_time_days?: number
          capacity_houses_month?: number
          city?: string | null
          cnpj?: string | null
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms?: string | null
          price_per_house?: number
          radius_km?: number | null
          state?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_factories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_factories_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_factory_capacities: {
        Row: {
          capacity_day: number
          capacity_month: number
          capacity_week: number
          factory_id: string
          id: string
          ind_service_id: string | null
          is_active: boolean
          lead_time_days: number
          macro_id: string | null
          scope_id: string | null
        }
        Insert: {
          capacity_day?: number
          capacity_month?: number
          capacity_week?: number
          factory_id: string
          id?: string
          ind_service_id?: string | null
          is_active?: boolean
          lead_time_days?: number
          macro_id?: string | null
          scope_id?: string | null
        }
        Update: {
          capacity_day?: number
          capacity_month?: number
          capacity_week?: number
          factory_id?: string
          id?: string
          ind_service_id?: string | null
          is_active?: boolean
          lead_time_days?: number
          macro_id?: string | null
          scope_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_factory_capacities_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "ind_factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_factory_capacities_ind_service_id_fkey"
            columns: ["ind_service_id"]
            isOneToOne: false
            referencedRelation: "ind_services"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_factory_context_rules: {
        Row: {
          company_id: string
          context_id: string
          factory_id: string
          id: string
          ind_service_id: string | null
          is_active: boolean
          macro_id: string | null
          max_share_percent: number | null
          priority: number
          reserved_capacity_month: number
          scope_id: string | null
        }
        Insert: {
          company_id: string
          context_id: string
          factory_id: string
          id?: string
          ind_service_id?: string | null
          is_active?: boolean
          macro_id?: string | null
          max_share_percent?: number | null
          priority?: number
          reserved_capacity_month?: number
          scope_id?: string | null
        }
        Update: {
          company_id?: string
          context_id?: string
          factory_id?: string
          id?: string
          ind_service_id?: string | null
          is_active?: boolean
          macro_id?: string | null
          max_share_percent?: number | null
          priority?: number
          reserved_capacity_month?: number
          scope_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_factory_context_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_factory_context_rules_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_factory_context_rules_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "ind_factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_factory_context_rules_ind_service_id_fkey"
            columns: ["ind_service_id"]
            isOneToOne: false
            referencedRelation: "ind_services"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_factory_models: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          factory_id: string
          id: string
          ind_service_id: string | null
          is_active: boolean
          macro_id: string | null
          name: string
          scope_id: string | null
          total_positions: number
          units_per_week: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          factory_id: string
          id?: string
          ind_service_id?: string | null
          is_active?: boolean
          macro_id?: string | null
          name: string
          scope_id?: string | null
          total_positions?: number
          units_per_week?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          factory_id?: string
          id?: string
          ind_service_id?: string | null
          is_active?: boolean
          macro_id?: string | null
          name?: string
          scope_id?: string | null
          total_positions?: number
          units_per_week?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_factory_models_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_factory_models_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "ind_factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_factory_models_ind_service_id_fkey"
            columns: ["ind_service_id"]
            isOneToOne: false
            referencedRelation: "ind_services"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_installation_schedule: {
        Row: {
          batch_id: string | null
          company_id: string
          context_id: string
          contractor_id: string | null
          contractor_name: string | null
          created_at: string
          end_time: string | null
          id: string
          lifting_schedule_id: string | null
          notes: string | null
          scheduled_date: string
          start_time: string | null
          status: string
          team_size: number
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          context_id: string
          contractor_id?: string | null
          contractor_name?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          lifting_schedule_id?: string | null
          notes?: string | null
          scheduled_date: string
          start_time?: string | null
          status?: string
          team_size?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          context_id?: string
          contractor_id?: string | null
          contractor_name?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          lifting_schedule_id?: string | null
          notes?: string | null
          scheduled_date?: string
          start_time?: string | null
          status?: string
          team_size?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_installation_schedule_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ind_production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_installation_schedule_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_installation_schedule_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_installation_schedule_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_installation_schedule_lifting_schedule_id_fkey"
            columns: ["lifting_schedule_id"]
            isOneToOne: false
            referencedRelation: "ind_lifting_schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_installation_units: {
        Row: {
          context_id: string
          house_number: number | null
          id: string
          installation_id: string
          status: string
          unit_id: string | null
        }
        Insert: {
          context_id: string
          house_number?: number | null
          id?: string
          installation_id: string
          status?: string
          unit_id?: string | null
        }
        Update: {
          context_id?: string
          house_number?: number | null
          id?: string
          installation_id?: string
          status?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_installation_units_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_installation_units_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "ind_installation_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_installation_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ind_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_lifting_equipment: {
        Row: {
          capacity_tons: number | null
          company_id: string
          created_at: string
          daily_cost: number
          equipment_type: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          supplier_name: string | null
        }
        Insert: {
          capacity_tons?: number | null
          company_id: string
          created_at?: string
          daily_cost?: number
          equipment_type: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          supplier_name?: string | null
        }
        Update: {
          capacity_tons?: number | null
          company_id?: string
          created_at?: string
          daily_cost?: number
          equipment_type?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_lifting_equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_lifting_schedule: {
        Row: {
          batch_id: string | null
          booking_date: string
          company_id: string
          context_id: string
          created_at: string
          daily_cost: number
          end_time: string | null
          equipment_id: string | null
          id: string
          ind_period_id: string | null
          linked_shipment_id: string | null
          notes: string | null
          obramap_period_id: string | null
          start_time: string | null
          status: string
          supplier_name: string | null
          unit_ids: string[] | null
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          booking_date: string
          company_id: string
          context_id: string
          created_at?: string
          daily_cost?: number
          end_time?: string | null
          equipment_id?: string | null
          id?: string
          ind_period_id?: string | null
          linked_shipment_id?: string | null
          notes?: string | null
          obramap_period_id?: string | null
          start_time?: string | null
          status?: string
          supplier_name?: string | null
          unit_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          booking_date?: string
          company_id?: string
          context_id?: string
          created_at?: string
          daily_cost?: number
          end_time?: string | null
          equipment_id?: string | null
          id?: string
          ind_period_id?: string | null
          linked_shipment_id?: string | null
          notes?: string | null
          obramap_period_id?: string | null
          start_time?: string | null
          status?: string
          supplier_name?: string | null
          unit_ids?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_lifting_schedule_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ind_production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_lifting_schedule_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_lifting_schedule_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_lifting_schedule_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "ind_lifting_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_lifting_schedule_ind_period_id_fkey"
            columns: ["ind_period_id"]
            isOneToOne: false
            referencedRelation: "ind_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_lifting_schedule_linked_shipment_id_fkey"
            columns: ["linked_shipment_id"]
            isOneToOne: false
            referencedRelation: "ind_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_lifting_schedule_obramap_period_id_fkey"
            columns: ["obramap_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_lifting_units: {
        Row: {
          context_id: string
          house_number: number | null
          id: string
          lifting_schedule_id: string
          unit_id: string | null
        }
        Insert: {
          context_id: string
          house_number?: number | null
          id?: string
          lifting_schedule_id: string
          unit_id?: string | null
        }
        Update: {
          context_id?: string
          house_number?: number | null
          id?: string
          lifting_schedule_id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_lifting_units_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_lifting_units_lifting_schedule_id_fkey"
            columns: ["lifting_schedule_id"]
            isOneToOne: false
            referencedRelation: "ind_lifting_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_lifting_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ind_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_model_positions: {
        Row: {
          created_at: string
          description: string | null
          height_cm: number | null
          id: string
          model_id: string
          position_code: string
          position_order: number
          thickness_cm: number | null
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          model_id: string
          position_code: string
          position_order?: number
          thickness_cm?: number | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          model_id?: string
          position_code?: string
          position_order?: number
          thickness_cm?: number | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_model_positions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ind_factory_models"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_operation_contexts: {
        Row: {
          client_name: string | null
          company_id: string
          context_type: string
          created_at: string
          description: string | null
          id: string
          location: string | null
          name: string
          obramap_project_id: string | null
          obras_portfolio_id: string | null
          status: string
          total_units: number
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          company_id: string
          context_type: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name: string
          obramap_project_id?: string | null
          obras_portfolio_id?: string | null
          status?: string
          total_units?: number
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          company_id?: string
          context_type?: string
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          name?: string
          obramap_project_id?: string | null
          obras_portfolio_id?: string | null
          status?: string
          total_units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_operation_contexts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_operation_contexts_obramap_project_id_fkey"
            columns: ["obramap_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_operation_contexts_obras_portfolio_id_fkey"
            columns: ["obras_portfolio_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_periods: {
        Row: {
          company_id: string
          context_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          status: string
          target_units: number
        }
        Insert: {
          company_id: string
          context_id: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: string
          target_units?: number
        }
        Update: {
          company_id?: string
          context_id?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: string
          target_units?: number
        }
        Relationships: [
          {
            foreignKeyName: "ind_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_periods_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_planning_grid: {
        Row: {
          actual_houses: number
          company_id: string
          context_id: string
          created_at: string
          end_date: string
          factory_id: string
          fortnight: number
          id: string
          month: number
          notes: string | null
          planned_houses: number
          start_date: string
          updated_at: string
          year: number
        }
        Insert: {
          actual_houses?: number
          company_id: string
          context_id: string
          created_at?: string
          end_date: string
          factory_id: string
          fortnight: number
          id?: string
          month: number
          notes?: string | null
          planned_houses?: number
          start_date: string
          updated_at?: string
          year: number
        }
        Update: {
          actual_houses?: number
          company_id?: string
          context_id?: string
          created_at?: string
          end_date?: string
          factory_id?: string
          fortnight?: number
          id?: string
          month?: number
          notes?: string | null
          planned_houses?: number
          start_date?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "ind_planning_grid_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_planning_grid_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_planning_grid_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "ind_factories"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_production_batches: {
        Row: {
          actual_finish: string | null
          actual_quantity: number
          actual_start: string | null
          actual_value: number
          batch_code: string
          company_id: string
          context_id: string
          created_at: string
          demand_entry_id: string | null
          factory_id: string
          id: string
          ind_period_id: string | null
          ind_service_id: string | null
          macro_id: string | null
          model_id: string | null
          notes: string | null
          obramap_period_id: string | null
          planned_finish: string | null
          planned_quantity: number
          planned_start: string | null
          scope_id: string | null
          status: string
          unit_value: number
          updated_at: string
        }
        Insert: {
          actual_finish?: string | null
          actual_quantity?: number
          actual_start?: string | null
          actual_value?: number
          batch_code: string
          company_id: string
          context_id: string
          created_at?: string
          demand_entry_id?: string | null
          factory_id: string
          id?: string
          ind_period_id?: string | null
          ind_service_id?: string | null
          macro_id?: string | null
          model_id?: string | null
          notes?: string | null
          obramap_period_id?: string | null
          planned_finish?: string | null
          planned_quantity?: number
          planned_start?: string | null
          scope_id?: string | null
          status?: string
          unit_value?: number
          updated_at?: string
        }
        Update: {
          actual_finish?: string | null
          actual_quantity?: number
          actual_start?: string | null
          actual_value?: number
          batch_code?: string
          company_id?: string
          context_id?: string
          created_at?: string
          demand_entry_id?: string | null
          factory_id?: string
          id?: string
          ind_period_id?: string | null
          ind_service_id?: string | null
          macro_id?: string | null
          model_id?: string | null
          notes?: string | null
          obramap_period_id?: string | null
          planned_finish?: string | null
          planned_quantity?: number
          planned_start?: string | null
          scope_id?: string | null
          status?: string
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_production_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_production_batches_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_production_batches_demand_entry_id_fkey"
            columns: ["demand_entry_id"]
            isOneToOne: false
            referencedRelation: "ind_demand_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_production_batches_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "ind_factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_production_batches_ind_period_id_fkey"
            columns: ["ind_period_id"]
            isOneToOne: false
            referencedRelation: "ind_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_production_batches_ind_service_id_fkey"
            columns: ["ind_service_id"]
            isOneToOne: false
            referencedRelation: "ind_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_production_batches_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ind_factory_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_production_batches_obramap_period_id_fkey"
            columns: ["obramap_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_service_configs: {
        Row: {
          company_id: string
          context_id: string
          created_at: string
          default_lead_time_days: number
          id: string
          ind_service_id: string | null
          installation_time_per_unit: number | null
          loading_time_hours: number | null
          logistic_unit_type: string
          macro_id: string | null
          requires_installation_team: boolean
          requires_lifting: boolean
          requires_transport: boolean
          scope_id: string | null
          unloading_time_hours: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          context_id: string
          created_at?: string
          default_lead_time_days?: number
          id?: string
          ind_service_id?: string | null
          installation_time_per_unit?: number | null
          loading_time_hours?: number | null
          logistic_unit_type?: string
          macro_id?: string | null
          requires_installation_team?: boolean
          requires_lifting?: boolean
          requires_transport?: boolean
          scope_id?: string | null
          unloading_time_hours?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          context_id?: string
          created_at?: string
          default_lead_time_days?: number
          id?: string
          ind_service_id?: string | null
          installation_time_per_unit?: number | null
          loading_time_hours?: number | null
          logistic_unit_type?: string
          macro_id?: string | null
          requires_installation_team?: boolean
          requires_lifting?: boolean
          requires_transport?: boolean
          scope_id?: string | null
          unloading_time_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_service_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_service_configs_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_service_configs_ind_service_id_fkey"
            columns: ["ind_service_id"]
            isOneToOne: false
            referencedRelation: "ind_services"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_services: {
        Row: {
          category: string
          company_id: string
          context_id: string
          created_at: string
          display_order: number | null
          id: string
          is_industrialized: boolean
          name: string
        }
        Insert: {
          category?: string
          company_id: string
          context_id: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_industrialized?: boolean
          name: string
        }
        Update: {
          category?: string
          company_id?: string
          context_id?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_industrialized?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_services_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_shipment_units: {
        Row: {
          context_id: string
          house_number: number | null
          id: string
          notes: string | null
          shipment_id: string
          status: string
          unit_id: string | null
        }
        Insert: {
          context_id: string
          house_number?: number | null
          id?: string
          notes?: string | null
          shipment_id: string
          status?: string
          unit_id?: string | null
        }
        Update: {
          context_id?: string
          house_number?: number | null
          id?: string
          notes?: string | null
          shipment_id?: string
          status?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_shipment_units_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_shipment_units_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "ind_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_shipment_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ind_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_shipments: {
        Row: {
          actual_date: string | null
          batch_id: string
          company_id: string
          context_id: string
          created_at: string
          driver_name: string | null
          freight_value: number
          id: string
          ind_period_id: string | null
          notes: string | null
          obramap_period_id: string | null
          planned_date: string
          received_at: string | null
          received_by: string | null
          shipment_number: string
          status: string
          total_weight_kg: number
          truck_capacity_kg: number | null
          truck_id: string | null
          truck_plate: string | null
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          batch_id: string
          company_id: string
          context_id: string
          created_at?: string
          driver_name?: string | null
          freight_value?: number
          id?: string
          ind_period_id?: string | null
          notes?: string | null
          obramap_period_id?: string | null
          planned_date: string
          received_at?: string | null
          received_by?: string | null
          shipment_number: string
          status?: string
          total_weight_kg?: number
          truck_capacity_kg?: number | null
          truck_id?: string | null
          truck_plate?: string | null
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          batch_id?: string
          company_id?: string
          context_id?: string
          created_at?: string
          driver_name?: string | null
          freight_value?: number
          id?: string
          ind_period_id?: string | null
          notes?: string | null
          obramap_period_id?: string | null
          planned_date?: string
          received_at?: string | null
          received_by?: string | null
          shipment_number?: string
          status?: string
          total_weight_kg?: number
          truck_capacity_kg?: number | null
          truck_id?: string | null
          truck_plate?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_shipments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ind_production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_shipments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_shipments_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_shipments_ind_period_id_fkey"
            columns: ["ind_period_id"]
            isOneToOne: false
            referencedRelation: "ind_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_shipments_obramap_period_id_fkey"
            columns: ["obramap_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_shipments_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "ind_trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_trucks: {
        Row: {
          capacity_kg: number
          carrier_name: string | null
          company_id: string
          created_at: string
          driver_name: string | null
          driver_phone: string | null
          id: string
          is_active: boolean
          notes: string | null
          plate: string
          truck_type: string
        }
        Insert: {
          capacity_kg?: number
          carrier_name?: string | null
          company_id: string
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          plate: string
          truck_type?: string
        }
        Update: {
          capacity_kg?: number
          carrier_name?: string | null
          company_id?: string
          created_at?: string
          driver_name?: string | null
          driver_phone?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          plate?: string
          truck_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_trucks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_unit_kits: {
        Row: {
          batch_id: string | null
          company_id: string
          components_delivered: number
          components_total: number
          context_id: string
          created_at: string
          factory_id: string
          house_number: number | null
          id: string
          kit_status: string
          model_id: string | null
          needed_by_date: string | null
          notes: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          company_id: string
          components_delivered?: number
          components_total?: number
          context_id: string
          created_at?: string
          factory_id: string
          house_number?: number | null
          id?: string
          kit_status?: string
          model_id?: string | null
          needed_by_date?: string | null
          notes?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          company_id?: string
          components_delivered?: number
          components_total?: number
          context_id?: string
          created_at?: string
          factory_id?: string
          house_number?: number | null
          id?: string
          kit_status?: string
          model_id?: string | null
          needed_by_date?: string | null
          notes?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_unit_kits_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ind_production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_unit_kits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_unit_kits_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_unit_kits_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "ind_factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_unit_kits_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ind_factory_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_unit_kits_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "ind_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_units: {
        Row: {
          code: string
          company_id: string
          context_id: string
          created_at: string
          id: string
          notes: string | null
          position_x: number | null
          position_y: number | null
          status: string
          unit_number: number
          unit_type: string | null
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          code: string
          company_id: string
          context_id: string
          created_at?: string
          id?: string
          notes?: string | null
          position_x?: number | null
          position_y?: number | null
          status?: string
          unit_number: number
          unit_type?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          context_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          position_x?: number | null
          position_y?: number | null
          status?: string
          unit_number?: number
          unit_type?: string | null
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ind_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_units_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_units_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "ind_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      ind_zones: {
        Row: {
          code: string | null
          color: string | null
          company_id: string
          context_id: string
          created_at: string
          display_order: number | null
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          color?: string | null
          company_id: string
          context_id: string
          created_at?: string
          display_order?: number | null
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          color?: string | null
          company_id?: string
          context_id?: string
          created_at?: string
          display_order?: number | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ind_zones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ind_zones_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "ind_operation_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      indirect_costs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          project_id: string
          quantity: number
          subcategory: string
          unit: string
          updated_at: string
          value: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          project_id: string
          quantity?: number
          subcategory: string
          unit?: string
          updated_at?: string
          value?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          project_id?: string
          quantity?: number
          subcategory?: string
          unit?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "indirect_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indirect_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      input_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          company_id: string
          field_name: string
          id: string
          input_id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          company_id: string
          field_name: string
          id?: string
          input_id: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          field_name?: string
          id?: string
          input_id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "input_audit_log_input_id_fkey"
            columns: ["input_id"]
            isOneToOne: false
            referencedRelation: "inputs"
            referencedColumns: ["id"]
          },
        ]
      }
      inputs: {
        Row: {
          category: string
          code: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          material_family_id: string | null
          name: string
          project_id: string
          stock_quantity: number
          unit: string
          unit_value: number | null
          updated_at: string
        }
        Insert: {
          category?: string
          code?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          material_family_id?: string | null
          name: string
          project_id: string
          stock_quantity?: number
          unit?: string
          unit_value?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          material_family_id?: string | null
          name?: string
          project_id?: string
          stock_quantity?: number
          unit?: string
          unit_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inputs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inputs_material_family_id_fkey"
            columns: ["material_family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          invoice_id: string
          macro_id: string | null
          macro_name: string | null
          project_id: string
          quantity: number
          scope_id: string | null
          scope_item_id: string | null
          scope_name: string | null
          total_value: number
          unit: string | null
          unit_value: number
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          macro_id?: string | null
          macro_name?: string | null
          project_id: string
          quantity?: number
          scope_id?: string | null
          scope_item_id?: string | null
          scope_name?: string | null
          total_value?: number
          unit?: string | null
          unit_value?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          macro_id?: string | null
          macro_name?: string | null
          project_id?: string
          quantity?: number
          scope_id?: string | null
          scope_item_id?: string | null
          scope_name?: string | null
          total_value?: number
          unit?: string | null
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_scope_item_id_fkey"
            columns: ["scope_item_id"]
            isOneToOne: false
            referencedRelation: "scope_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          attachment_url: string | null
          company_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          net_amount: number
          notes: string | null
          payment_date: string | null
          project_id: string
          status: string
          supplier_id: string | null
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          net_amount?: number
          notes?: string | null
          payment_date?: string | null
          project_id: string
          status?: string
          supplier_id?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          net_amount?: number
          notes?: string | null
          payment_date?: string | null
          project_id?: string
          status?: string
          supplier_id?: string | null
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_contracts: {
        Row: {
          contracted_houses: number
          contractor_name: string | null
          created_at: string
          executed_houses: number
          id: string
          macro_id: string
          macro_name: string
          notes: string | null
          project_id: string
          scope_id: string
          scope_name: string
          status: string
          total_value: number
          unit_value: number
          updated_at: string
        }
        Insert: {
          contracted_houses?: number
          contractor_name?: string | null
          created_at?: string
          executed_houses?: number
          id?: string
          macro_id: string
          macro_name: string
          notes?: string | null
          project_id: string
          scope_id: string
          scope_name: string
          status?: string
          total_value?: number
          unit_value?: number
          updated_at?: string
        }
        Update: {
          contracted_houses?: number
          contractor_name?: string | null
          created_at?: string
          executed_houses?: number
          id?: string
          macro_id?: string
          macro_name?: string
          notes?: string | null
          project_id?: string
          scope_id?: string
          scope_name?: string
          status?: string
          total_value?: number
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_histogram: {
        Row: {
          company_id: string
          created_at: string | null
          duration_days: number
          estimated_cost: number | null
          id: string
          labor_needs: Json
          macro_id: string
          macro_name: string
          notes: string | null
          period_end: string
          period_id: string
          period_number: number
          period_start: string
          planned_houses: number
          productivity: number
          productivity_type: string
          project_id: string
          scope_id: string
          scope_name: string
          status: string | null
          total_helpers: number
          total_professionals: number
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          duration_days?: number
          estimated_cost?: number | null
          id?: string
          labor_needs?: Json
          macro_id: string
          macro_name: string
          notes?: string | null
          period_end: string
          period_id: string
          period_number: number
          period_start: string
          planned_houses?: number
          productivity?: number
          productivity_type?: string
          project_id: string
          scope_id: string
          scope_name: string
          status?: string | null
          total_helpers?: number
          total_professionals?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          duration_days?: number
          estimated_cost?: number | null
          id?: string
          labor_needs?: Json
          macro_id?: string
          macro_name?: string
          notes?: string | null
          period_end?: string
          period_id?: string
          period_number?: number
          period_start?: string
          planned_houses?: number
          productivity?: number
          productivity_type?: string
          project_id?: string
          scope_id?: string
          scope_name?: string
          status?: string | null
          total_helpers?: number
          total_professionals?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "labor_histogram_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_histogram_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      map_layer_stage_links: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          layer_name: string
          macro_id: string | null
          project_id: string
          scope_id: string | null
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          layer_name: string
          macro_id?: string | null
          project_id: string
          scope_id?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          layer_name?: string
          macro_id?: string | null
          project_id?: string
          scope_id?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_layer_stage_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_layer_stage_links_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "planning_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      map_layouts: {
        Row: {
          camera_position: Json | null
          camera_target: Json | null
          created_at: string
          house_markers_3d: Json | null
          houses: Json
          id: string
          image_url: string | null
          layer_visibility: Json | null
          map_height: number
          map_width: number
          model_3d_type: string | null
          model_3d_url: string | null
          model_mtl_url: string | null
          project_id: string
          quadras: Json
          updated_at: string
        }
        Insert: {
          camera_position?: Json | null
          camera_target?: Json | null
          created_at?: string
          house_markers_3d?: Json | null
          houses?: Json
          id?: string
          image_url?: string | null
          layer_visibility?: Json | null
          map_height?: number
          map_width?: number
          model_3d_type?: string | null
          model_3d_url?: string | null
          model_mtl_url?: string | null
          project_id: string
          quadras?: Json
          updated_at?: string
        }
        Update: {
          camera_position?: Json | null
          camera_target?: Json | null
          created_at?: string
          house_markers_3d?: Json | null
          houses?: Json
          id?: string
          image_url?: string | null
          layer_visibility?: Json | null
          map_height?: number
          map_width?: number
          model_3d_type?: string | null
          model_3d_url?: string | null
          model_mtl_url?: string | null
          project_id?: string
          quadras?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_layouts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      material_families: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          display_order: number
          icon: string | null
          id: string
          is_labor: boolean
          lead_time_days: number
          name: string
          project_id: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_labor?: boolean
          lead_time_days?: number
          name: string
          project_id: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_labor?: boolean
          lead_time_days?: number
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_families_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_families_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          company_id: string
          created_at: string
          family_id: string | null
          id: string
          name: string
          unit: string
          unit_value: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          family_id?: string | null
          id?: string
          name: string
          unit?: string
          unit_value?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          family_id?: string | null
          id?: string
          name?: string
          unit?: string
          unit_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_houses: {
        Row: {
          company_id: string
          created_at: string
          house_id: string
          id: string
          measurement_id: string
          project_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          house_id: string
          id?: string
          measurement_id: string
          project_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          house_id?: string
          id?: string
          measurement_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_houses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_houses_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_houses_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_houses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_services: {
        Row: {
          company_id: string
          created_at: string
          family_id: string | null
          financial_result: number
          forecast_end_date: string | null
          forecast_final_cost: number | null
          forecast_risk: string | null
          helpers_per_team: number
          id: string
          macro_color: string
          macro_id: string
          macro_name: string
          measurement_id: string
          notes: string | null
          planned_cost: number
          planned_house_ids: number[]
          planned_houses: number
          productivity_expected: number
          productivity_real: number
          professionals_per_team: number
          project_id: string
          realized_cost: number
          scope_id: string
          scope_name: string
          service_status: string
          teams_expected: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          family_id?: string | null
          financial_result?: number
          forecast_end_date?: string | null
          forecast_final_cost?: number | null
          forecast_risk?: string | null
          helpers_per_team?: number
          id?: string
          macro_color?: string
          macro_id: string
          macro_name: string
          measurement_id: string
          notes?: string | null
          planned_cost?: number
          planned_house_ids?: number[]
          planned_houses?: number
          productivity_expected?: number
          productivity_real?: number
          professionals_per_team?: number
          project_id: string
          realized_cost?: number
          scope_id: string
          scope_name: string
          service_status?: string
          teams_expected?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          family_id?: string | null
          financial_result?: number
          forecast_end_date?: string | null
          forecast_final_cost?: number | null
          forecast_risk?: string | null
          helpers_per_team?: number
          id?: string
          macro_color?: string
          macro_id?: string
          macro_name?: string
          measurement_id?: string
          notes?: string | null
          planned_cost?: number
          planned_house_ids?: number[]
          planned_houses?: number
          productivity_expected?: number
          productivity_real?: number
          professionals_per_team?: number
          project_id?: string
          realized_cost?: number
          scope_id?: string
          scope_name?: string
          service_status?: string
          teams_expected?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_services_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_services_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_stock_entries: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          family_id: string | null
          family_name: string | null
          id: string
          is_confirmed: boolean
          item_id: string
          item_name: string
          item_unit: string | null
          notes: string | null
          planning_period_id: string
          project_id: string
          quantity_in_stock: number
          quantity_required: number
          quantity_to_purchase: number | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          family_id?: string | null
          family_name?: string | null
          id?: string
          is_confirmed?: boolean
          item_id: string
          item_name: string
          item_unit?: string | null
          notes?: string | null
          planning_period_id: string
          project_id: string
          quantity_in_stock?: number
          quantity_required?: number
          quantity_to_purchase?: number | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          family_id?: string | null
          family_name?: string | null
          id?: string
          is_confirmed?: boolean
          item_id?: string
          item_name?: string
          item_unit?: string | null
          notes?: string | null
          planning_period_id?: string
          project_id?: string
          quantity_in_stock?: number
          quantity_required?: number
          quantity_to_purchase?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      measurements: {
        Row: {
          company_id: string
          contract_percent_planned: number
          created_at: string
          end_date: string
          financial_result: number
          financial_status: string
          forecast_cost: number | null
          forecast_result: number | null
          forecast_risk: string | null
          id: string
          measurement_number: number
          notes: string | null
          planned_cost: number
          planning_period_id: string | null
          project_id: string
          realized_cost: number
          revenue_expected: number
          revenue_target: number
          start_date: string
          status: string | null
          type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_percent_planned?: number
          created_at?: string
          end_date: string
          financial_result?: number
          financial_status?: string
          forecast_cost?: number | null
          forecast_result?: number | null
          forecast_risk?: string | null
          id?: string
          measurement_number: number
          notes?: string | null
          planned_cost?: number
          planning_period_id?: string | null
          project_id: string
          realized_cost?: number
          revenue_expected?: number
          revenue_target?: number
          start_date: string
          status?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_percent_planned?: number
          created_at?: string
          end_date?: string
          financial_result?: number
          financial_status?: string
          forecast_cost?: number | null
          forecast_result?: number | null
          forecast_risk?: string | null
          id?: string
          measurement_number?: number
          notes?: string | null
          planned_cost?: number
          planning_period_id?: string | null
          project_id?: string
          realized_cost?: number
          revenue_expected?: number
          revenue_target?: number
          start_date?: string
          status?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      medicao_correction_requests: {
        Row: {
          created_at: string
          id: string
          medicao_id: string
          obra_id: string
          reason: string
          requested_by: string
          requested_by_name: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          section: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          medicao_id: string
          obra_id: string
          reason: string
          requested_by: string
          requested_by_name: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          section?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          medicao_id?: string
          obra_id?: string
          reason?: string
          requested_by?: string
          requested_by_name?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          section?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicao_correction_requests_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      medicoes_ple: {
        Row: {
          ano_referencia: number | null
          created_by_name: string | null
          created_by_user_id: string | null
          data_aprovacao: string | null
          data_envio: string | null
          data_envio_nf: string | null
          data_pagamento: string | null
          data_previsao_medicao: string | null
          id: string
          mes_referencia: string | null
          num_medicao: string | null
          num_nf: string | null
          obra_id: string
          status_medicao: Database["public"]["Enums"]["medicao_status"]
          status_nf: Database["public"]["Enums"]["nf_status"]
          unlocked_by: string | null
          unlocked_section: string | null
          unlocked_until: string | null
          updated_at: string | null
          updated_by_name: string | null
          updated_by_user_id: string | null
          valor_acatado: number | null
          valor_medicao: number
          valor_previsto_medicao: number | null
        }
        Insert: {
          ano_referencia?: number | null
          created_by_name?: string | null
          created_by_user_id?: string | null
          data_aprovacao?: string | null
          data_envio?: string | null
          data_envio_nf?: string | null
          data_pagamento?: string | null
          data_previsao_medicao?: string | null
          id?: string
          mes_referencia?: string | null
          num_medicao?: string | null
          num_nf?: string | null
          obra_id: string
          status_medicao?: Database["public"]["Enums"]["medicao_status"]
          status_nf?: Database["public"]["Enums"]["nf_status"]
          unlocked_by?: string | null
          unlocked_section?: string | null
          unlocked_until?: string | null
          updated_at?: string | null
          updated_by_name?: string | null
          updated_by_user_id?: string | null
          valor_acatado?: number | null
          valor_medicao?: number
          valor_previsto_medicao?: number | null
        }
        Update: {
          ano_referencia?: number | null
          created_by_name?: string | null
          created_by_user_id?: string | null
          data_aprovacao?: string | null
          data_envio?: string | null
          data_envio_nf?: string | null
          data_pagamento?: string | null
          data_previsao_medicao?: string | null
          id?: string
          mes_referencia?: string | null
          num_medicao?: string | null
          num_nf?: string | null
          obra_id?: string
          status_medicao?: Database["public"]["Enums"]["medicao_status"]
          status_nf?: Database["public"]["Enums"]["nf_status"]
          unlocked_by?: string | null
          unlocked_section?: string | null
          unlocked_until?: string | null
          updated_at?: string | null
          updated_by_name?: string | null
          updated_by_user_id?: string | null
          valor_acatado?: number | null
          valor_medicao?: number
          valor_previsto_medicao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medicoes_ple_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      obra_doc_config: {
        Row: {
          created_at: string | null
          id: string
          obra_id: string
          obrigatorio: boolean | null
          tipo_doc: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          obra_id: string
          obrigatorio?: boolean | null
          tipo_doc: string
        }
        Update: {
          created_at?: string | null
          id?: string
          obra_id?: string
          obrigatorio?: boolean | null
          tipo_doc?: string
        }
        Relationships: [
          {
            foreignKeyName: "obra_doc_config_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      obras_portfolio: {
        Row: {
          aditivo_prazo_dias: number
          aditivo_valor_total: number
          company_id: string
          coordenador_nome: string | null
          coordenador_telefone: string | null
          created_at: string
          data_inicio: string | null
          empresa: string | null
          estado: string | null
          has_initial_balance: boolean
          id: string
          latitude: number | null
          longitude: number | null
          municipio: string | null
          nome: string
          num_contrato: string | null
          obramap_project_id: string | null
          parceria_scp: string | null
          percentual_andamento: number
          percentual_financeiro: number | null
          percentual_fisico: number | null
          periodo_medicao: string | null
          planejador_nome: string | null
          planejador_telefone: string | null
          prazo_dias: number
          prazo_pagamento: string | null
          responsavel: string | null
          responsavel_nome: string | null
          responsavel_telefone: string | null
          status: Database["public"]["Enums"]["obra_status"]
          tipo_contrato: string | null
          total_houses: number
          uh: number | null
          updated_at: string | null
          valor_contrato: number
          valor_medido_inicial: number
        }
        Insert: {
          aditivo_prazo_dias?: number
          aditivo_valor_total?: number
          company_id: string
          coordenador_nome?: string | null
          coordenador_telefone?: string | null
          created_at?: string
          data_inicio?: string | null
          empresa?: string | null
          estado?: string | null
          has_initial_balance?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          municipio?: string | null
          nome: string
          num_contrato?: string | null
          obramap_project_id?: string | null
          parceria_scp?: string | null
          percentual_andamento?: number
          percentual_financeiro?: number | null
          percentual_fisico?: number | null
          periodo_medicao?: string | null
          planejador_nome?: string | null
          planejador_telefone?: string | null
          prazo_dias?: number
          prazo_pagamento?: string | null
          responsavel?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          status?: Database["public"]["Enums"]["obra_status"]
          tipo_contrato?: string | null
          total_houses?: number
          uh?: number | null
          updated_at?: string | null
          valor_contrato?: number
          valor_medido_inicial?: number
        }
        Update: {
          aditivo_prazo_dias?: number
          aditivo_valor_total?: number
          company_id?: string
          coordenador_nome?: string | null
          coordenador_telefone?: string | null
          created_at?: string
          data_inicio?: string | null
          empresa?: string | null
          estado?: string | null
          has_initial_balance?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          municipio?: string | null
          nome?: string
          num_contrato?: string | null
          obramap_project_id?: string | null
          parceria_scp?: string | null
          percentual_andamento?: number
          percentual_financeiro?: number | null
          percentual_fisico?: number | null
          periodo_medicao?: string | null
          planejador_nome?: string | null
          planejador_telefone?: string | null
          prazo_dias?: number
          prazo_pagamento?: string | null
          responsavel?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          status?: Database["public"]["Enums"]["obra_status"]
          tipo_contrato?: string | null
          total_houses?: number
          uh?: number | null
          updated_at?: string | null
          valor_contrato?: number
          valor_medido_inicial?: number
        }
        Relationships: [
          {
            foreignKeyName: "obras_portfolio_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obras_portfolio_obramap_project_id_fkey"
            columns: ["obramap_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pendencias_projeto: {
        Row: {
          concluido: boolean
          descricao: string | null
          id: string
          obra_id: string
          tipo: string | null
        }
        Insert: {
          concluido?: boolean
          descricao?: string | null
          id?: string
          obra_id: string
          tipo?: string | null
        }
        Update: {
          concluido?: boolean
          descricao?: string | null
          id?: string
          obra_id?: string
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pendencias_projeto_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      period_supply_requirements: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          input_id: string
          input_name: string | null
          macro_id: string | null
          planning_period_id: string
          project_id: string
          quantity_delivered: number | null
          quantity_ordered: number | null
          quantity_required: number
          quantity_reserved: number | null
          scope_id: string | null
          service_plan_id: string
          status: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          input_id: string
          input_name?: string | null
          macro_id?: string | null
          planning_period_id: string
          project_id: string
          quantity_delivered?: number | null
          quantity_ordered?: number | null
          quantity_required?: number
          quantity_reserved?: number | null
          scope_id?: string | null
          service_plan_id: string
          status?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          input_id?: string
          input_name?: string | null
          macro_id?: string | null
          planning_period_id?: string
          project_id?: string
          quantity_delivered?: number | null
          quantity_ordered?: number | null
          quantity_required?: number
          quantity_reserved?: number | null
          scope_id?: string | null
          service_plan_id?: string
          status?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_psr_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_psr_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_supply_requirements_input_id_fkey"
            columns: ["input_id"]
            isOneToOne: false
            referencedRelation: "inputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_supply_requirements_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_supply_requirements_service_plan_id_fkey"
            columns: ["service_plan_id"]
            isOneToOne: false
            referencedRelation: "service_planning_by_period"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_productions: {
        Row: {
          created_at: string
          id: string
          macro_color: string
          macro_id: string
          macro_name: string
          measurement_number: number | null
          notes: string | null
          planned_house_ids: number[]
          planned_houses: number
          project_id: string
          scope_id: string
          scope_name: string
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          macro_color?: string
          macro_id: string
          macro_name: string
          measurement_number?: number | null
          notes?: string | null
          planned_house_ids?: number[]
          planned_houses?: number
          project_id: string
          scope_id: string
          scope_name: string
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          macro_color?: string
          macro_id?: string
          macro_name?: string
          measurement_number?: number | null
          notes?: string | null
          planned_house_ids?: number[]
          planned_houses?: number
          project_id?: string
          scope_id?: string
          scope_name?: string
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_productions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_alerts: {
        Row: {
          alert_type: string
          created_at: string
          description: string
          id: string
          impact_days: number | null
          is_resolved: boolean
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          stage_id: string | null
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          description: string
          id?: string
          impact_days?: number | null
          is_resolved?: boolean
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          stage_id?: string | null
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          description?: string
          id?: string
          impact_days?: number | null
          is_resolved?: boolean
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          stage_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_alerts_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "planning_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_baselines: {
        Row: {
          baseline_data: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          project_id: string
          version_number: number
        }
        Insert: {
          baseline_data?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          project_id: string
          version_number?: number
        }
        Update: {
          baseline_data?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          project_id?: string
          version_number?: number
        }
        Relationships: []
      }
      planning_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          company_id: string
          contract_percent: number
          created_at: string
          end_date: string
          financial_balance_estimate: number
          global_target_percent: number | null
          houses_at_risk: number | null
          houses_capacity_risk: number | null
          id: string
          is_closed: boolean | null
          is_executed: boolean
          name: string | null
          notes: string | null
          period_number: number
          planned_cost_estimate: number
          planned_cost_total: number | null
          planning_version_id: string
          project_id: string
          projected_result: number | null
          result_at_risk: number | null
          revenue_at_risk: number | null
          revenue_expected: number
          revenue_target: number
          services_at_risk: number | null
          services_capacity_risk: number | null
          start_date: string
          status: string
          supplies_generated_at: string | null
          target_revenue_total: number | null
          updated_at: string
          weekly_plan_generated: boolean | null
          weekly_plan_locked: boolean | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          contract_percent?: number
          created_at?: string
          end_date: string
          financial_balance_estimate?: number
          global_target_percent?: number | null
          houses_at_risk?: number | null
          houses_capacity_risk?: number | null
          id?: string
          is_closed?: boolean | null
          is_executed?: boolean
          name?: string | null
          notes?: string | null
          period_number: number
          planned_cost_estimate?: number
          planned_cost_total?: number | null
          planning_version_id: string
          project_id: string
          projected_result?: number | null
          result_at_risk?: number | null
          revenue_at_risk?: number | null
          revenue_expected?: number
          revenue_target?: number
          services_at_risk?: number | null
          services_capacity_risk?: number | null
          start_date: string
          status?: string
          supplies_generated_at?: string | null
          target_revenue_total?: number | null
          updated_at?: string
          weekly_plan_generated?: boolean | null
          weekly_plan_locked?: boolean | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          contract_percent?: number
          created_at?: string
          end_date?: string
          financial_balance_estimate?: number
          global_target_percent?: number | null
          houses_at_risk?: number | null
          houses_capacity_risk?: number | null
          id?: string
          is_closed?: boolean | null
          is_executed?: boolean
          name?: string | null
          notes?: string | null
          period_number?: number
          planned_cost_estimate?: number
          planned_cost_total?: number | null
          planning_version_id?: string
          project_id?: string
          projected_result?: number | null
          result_at_risk?: number | null
          revenue_at_risk?: number | null
          revenue_expected?: number
          revenue_target?: number
          services_at_risk?: number | null
          services_capacity_risk?: number | null
          start_date?: string
          status?: string
          supplies_generated_at?: string | null
          target_revenue_total?: number | null
          updated_at?: string
          weekly_plan_generated?: boolean | null
          weekly_plan_locked?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_periods_planning_version_id_fkey"
            columns: ["planning_version_id"]
            isOneToOne: false
            referencedRelation: "planning_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_periods_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_scenarios: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_base: boolean | null
          name: string
          project_id: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_base?: boolean | null
          name: string
          project_id: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_base?: boolean | null
          name?: string
          project_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_scenarios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_services: {
        Row: {
          company_id: string
          created_at: string
          estimated_cost: number
          helpers_per_team: number
          id: string
          macro_color: string
          macro_id: string
          macro_name: string
          notes: string | null
          planned_house_ids: number[]
          planned_houses: number
          planning_period_id: string
          productivity_expected: number
          professionals_per_team: number
          project_id: string
          scope_id: string
          scope_name: string
          teams_expected: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          estimated_cost?: number
          helpers_per_team?: number
          id?: string
          macro_color?: string
          macro_id: string
          macro_name: string
          notes?: string | null
          planned_house_ids?: number[]
          planned_houses?: number
          planning_period_id: string
          productivity_expected?: number
          professionals_per_team?: number
          project_id: string
          scope_id: string
          scope_name: string
          teams_expected?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          estimated_cost?: number
          helpers_per_team?: number
          id?: string
          macro_color?: string
          macro_id?: string
          macro_name?: string
          notes?: string | null
          planned_house_ids?: number[]
          planned_houses?: number
          planning_period_id?: string
          productivity_expected?: number
          professionals_per_team?: number
          project_id?: string
          scope_id?: string
          scope_name?: string
          teams_expected?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_services_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_simulations: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_applied: boolean
          name: string
          project_id: string
          results: Json | null
          simulation_data: Json
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_applied?: boolean
          name: string
          project_id: string
          results?: Json | null
          simulation_data?: Json
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_applied?: boolean
          name?: string
          project_id?: string
          results?: Json | null
          simulation_data?: Json
        }
        Relationships: []
      }
      planning_stages: {
        Row: {
          baseline_created_at: string | null
          color: string
          completed_units_at_start: number | null
          created_at: string
          depends_on: string | null
          duration_days: number | null
          id: string
          is_baseline: boolean
          is_service_level: boolean | null
          latency_days: number | null
          macro_id: string | null
          name: string
          planned_productivity: number
          planned_teams: number
          project_id: string
          scope_id: string | null
          sequence_order: number
          updated_at: string
          version_id: string | null
        }
        Insert: {
          baseline_created_at?: string | null
          color?: string
          completed_units_at_start?: number | null
          created_at?: string
          depends_on?: string | null
          duration_days?: number | null
          id?: string
          is_baseline?: boolean
          is_service_level?: boolean | null
          latency_days?: number | null
          macro_id?: string | null
          name: string
          planned_productivity?: number
          planned_teams?: number
          project_id: string
          scope_id?: string | null
          sequence_order?: number
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          baseline_created_at?: string | null
          color?: string
          completed_units_at_start?: number | null
          created_at?: string
          depends_on?: string | null
          duration_days?: number | null
          id?: string
          is_baseline?: boolean
          is_service_level?: boolean | null
          latency_days?: number | null
          macro_id?: string | null
          name?: string
          planned_productivity?: number
          planned_teams?: number
          project_id?: string
          scope_id?: string | null
          sequence_order?: number
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_stages_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "planning_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_stages_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "planning_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_teams: {
        Row: {
          created_at: string
          helpers_count: number
          id: string
          is_active: boolean
          name: string
          professionals_count: number
          project_id: string
          stage_id: string
        }
        Insert: {
          created_at?: string
          helpers_count?: number
          id?: string
          is_active?: boolean
          name: string
          professionals_count?: number
          project_id: string
          stage_id: string
        }
        Update: {
          created_at?: string
          helpers_count?: number
          id?: string
          is_active?: boolean
          name?: string
          professionals_count?: number
          project_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_teams_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "planning_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_versions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          project_id: string
          version_number: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          project_id: string
          version_number?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ple_audit_log: {
        Row: {
          action: string
          details: Json | null
          id: string
          measurement_id: string | null
          performed_at: string
          performed_by: string | null
          performed_by_name: string | null
          ple_project_id: string
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          measurement_id?: string | null
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
          ple_project_id: string
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          measurement_id?: string | null
          performed_at?: string
          performed_by?: string | null
          performed_by_name?: string | null
          ple_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ple_audit_log_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "ple_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_audit_log_ple_project_id_fkey"
            columns: ["ple_project_id"]
            isOneToOne: false
            referencedRelation: "ple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ple_entries: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          event_id: string
          house_number: number
          id: string
          measurement_id: string
          ple_project_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          event_id: string
          house_number: number
          id?: string
          measurement_id: string
          ple_project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          event_id?: string
          house_number?: number
          id?: string
          measurement_id?: string
          ple_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ple_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "ple_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_entries_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "ple_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_entries_ple_project_id_fkey"
            columns: ["ple_project_id"]
            isOneToOne: false
            referencedRelation: "ple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ple_event_groups: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          name: string
          parent_id: string | null
          ple_project_id: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          parent_id?: string | null
          ple_project_id: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          parent_id?: string | null
          ple_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ple_event_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ple_event_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_event_groups_ple_project_id_fkey"
            columns: ["ple_project_id"]
            isOneToOne: false
            referencedRelation: "ple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ple_events: {
        Row: {
          billing_type: string
          created_at: string
          description: string
          discrimination: string | null
          display_order: number
          group_id: string | null
          id: string
          item_code: string
          mat_unit_value: number
          mo_unit_value: number
          obramap_macro_id: string | null
          obramap_macro_name: string | null
          obramap_scope_id: string | null
          obramap_scope_name: string | null
          ple_project_id: string
          quantity: number
          sinapi_code: string | null
          unit: string
          unit_value: number
          updated_at: string
        }
        Insert: {
          billing_type?: string
          created_at?: string
          description: string
          discrimination?: string | null
          display_order?: number
          group_id?: string | null
          id?: string
          item_code: string
          mat_unit_value?: number
          mo_unit_value?: number
          obramap_macro_id?: string | null
          obramap_macro_name?: string | null
          obramap_scope_id?: string | null
          obramap_scope_name?: string | null
          ple_project_id: string
          quantity?: number
          sinapi_code?: string | null
          unit?: string
          unit_value?: number
          updated_at?: string
        }
        Update: {
          billing_type?: string
          created_at?: string
          description?: string
          discrimination?: string | null
          display_order?: number
          group_id?: string | null
          id?: string
          item_code?: string
          mat_unit_value?: number
          mo_unit_value?: number
          obramap_macro_id?: string | null
          obramap_macro_name?: string | null
          obramap_scope_id?: string | null
          obramap_scope_name?: string | null
          ple_project_id?: string
          quantity?: number
          sinapi_code?: string | null
          unit?: string
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ple_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "ple_event_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_events_ple_project_id_fkey"
            columns: ["ple_project_id"]
            isOneToOne: false
            referencedRelation: "ple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ple_glosses: {
        Row: {
          event_id: string
          glossed_at: string
          glossed_by: string | null
          house_number: number
          id: string
          measurement_id: string
          ple_project_id: string
          resolved: boolean
          resolved_measurement_id: string | null
        }
        Insert: {
          event_id: string
          glossed_at?: string
          glossed_by?: string | null
          house_number: number
          id?: string
          measurement_id: string
          ple_project_id: string
          resolved?: boolean
          resolved_measurement_id?: string | null
        }
        Update: {
          event_id?: string
          glossed_at?: string
          glossed_by?: string | null
          house_number?: number
          id?: string
          measurement_id?: string
          ple_project_id?: string
          resolved?: boolean
          resolved_measurement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ple_glosses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "ple_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_glosses_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "ple_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_glosses_ple_project_id_fkey"
            columns: ["ple_project_id"]
            isOneToOne: false
            referencedRelation: "ple_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_glosses_resolved_measurement_id_fkey"
            columns: ["resolved_measurement_id"]
            isOneToOne: false
            referencedRelation: "ple_measurements"
            referencedColumns: ["id"]
          },
        ]
      }
      ple_measurements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          end_date: string | null
          id: string
          measurement_number: number
          notes: string | null
          period_label: string | null
          ple_project_id: string
          registered_by: string | null
          registered_by_name: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          measurement_number: number
          notes?: string | null
          period_label?: string | null
          ple_project_id: string
          registered_by?: string | null
          registered_by_name?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          measurement_number?: number
          notes?: string | null
          period_label?: string | null
          ple_project_id?: string
          registered_by?: string | null
          registered_by_name?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ple_measurements_ple_project_id_fkey"
            columns: ["ple_project_id"]
            isOneToOne: false
            referencedRelation: "ple_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ple_projects: {
        Row: {
          address_city: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          art_rrt_number: string | null
          bdi_percentage: number | null
          cnpj: string | null
          company_id: string
          contract_end_date: string | null
          contract_number: string | null
          contract_sign_date: string | null
          contract_type: string | null
          contract_value: number
          contractor: string | null
          created_at: string
          created_by: string | null
          executor_company: string | null
          funding_source: string | null
          id: string
          inspector_name: string | null
          location: string | null
          mode: string
          name: string
          notes: string | null
          obramap_project_id: string | null
          obras_portfolio_id: string | null
          program: string | null
          responsible_engineer: string | null
          start_date: string | null
          total_houses: number
          unit_value: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_city?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          art_rrt_number?: string | null
          bdi_percentage?: number | null
          cnpj?: string | null
          company_id: string
          contract_end_date?: string | null
          contract_number?: string | null
          contract_sign_date?: string | null
          contract_type?: string | null
          contract_value?: number
          contractor?: string | null
          created_at?: string
          created_by?: string | null
          executor_company?: string | null
          funding_source?: string | null
          id?: string
          inspector_name?: string | null
          location?: string | null
          mode?: string
          name: string
          notes?: string | null
          obramap_project_id?: string | null
          obras_portfolio_id?: string | null
          program?: string | null
          responsible_engineer?: string | null
          start_date?: string | null
          total_houses?: number
          unit_value?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_city?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          art_rrt_number?: string | null
          bdi_percentage?: number | null
          cnpj?: string | null
          company_id?: string
          contract_end_date?: string | null
          contract_number?: string | null
          contract_sign_date?: string | null
          contract_type?: string | null
          contract_value?: number
          contractor?: string | null
          created_at?: string
          created_by?: string | null
          executor_company?: string | null
          funding_source?: string | null
          id?: string
          inspector_name?: string | null
          location?: string | null
          mode?: string
          name?: string
          notes?: string | null
          obramap_project_id?: string | null
          obras_portfolio_id?: string | null
          program?: string | null
          responsible_engineer?: string | null
          start_date?: string | null
          total_houses?: number
          unit_value?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ple_projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_projects_obramap_project_id_fkey"
            columns: ["obramap_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ple_projects_obras_portfolio_id_fkey"
            columns: ["obras_portfolio_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      production_deviations: {
        Row: {
          actual_count: number
          actual_house_ids: number[]
          company_id: string | null
          corrective_action: string | null
          created_at: string
          deviation: number
          deviation_reason: string | null
          id: string
          macro_id: string
          macro_name: string
          missing_house_ids: number[]
          planned_count: number
          planned_house_ids: number[]
          planned_production_id: string | null
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          scope_id: string
          scope_name: string
          severity: string
          status: string
          unplanned_house_ids: number[]
          updated_at: string
          week_end: string
          week_start: string
          weekly_plan_service_id: string | null
        }
        Insert: {
          actual_count?: number
          actual_house_ids?: number[]
          company_id?: string | null
          corrective_action?: string | null
          created_at?: string
          deviation?: number
          deviation_reason?: string | null
          id?: string
          macro_id: string
          macro_name: string
          missing_house_ids?: number[]
          planned_count?: number
          planned_house_ids?: number[]
          planned_production_id?: string | null
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          scope_id: string
          scope_name: string
          severity?: string
          status?: string
          unplanned_house_ids?: number[]
          updated_at?: string
          week_end: string
          week_start: string
          weekly_plan_service_id?: string | null
        }
        Update: {
          actual_count?: number
          actual_house_ids?: number[]
          company_id?: string | null
          corrective_action?: string | null
          created_at?: string
          deviation?: number
          deviation_reason?: string | null
          id?: string
          macro_id?: string
          macro_name?: string
          missing_house_ids?: number[]
          planned_count?: number
          planned_house_ids?: number[]
          planned_production_id?: string | null
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          scope_id?: string
          scope_name?: string
          severity?: string
          status?: string
          unplanned_house_ids?: number[]
          updated_at?: string
          week_end?: string
          week_start?: string
          weekly_plan_service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_deviations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_deviations_planned_production_id_fkey"
            columns: ["planned_production_id"]
            isOneToOne: false
            referencedRelation: "planned_productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_deviations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_deviations_weekly_plan_service_id_fkey"
            columns: ["weekly_plan_service_id"]
            isOneToOne: false
            referencedRelation: "weekly_plan_services"
            referencedColumns: ["id"]
          },
        ]
      }
      production_exceptions: {
        Row: {
          approved_by: string | null
          company_id: string
          created_at: string
          id: string
          production_log_id: string
          project_id: string
          reason: string
        }
        Insert: {
          approved_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          production_log_id: string
          project_id: string
          reason: string
        }
        Update: {
          approved_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          production_log_id?: string
          project_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_exceptions_production_log_id_fkey"
            columns: ["production_log_id"]
            isOneToOne: false
            referencedRelation: "production_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_logs: {
        Row: {
          company_id: string
          cost_realized: number
          created_at: string
          execution_date: string
          house_id: string
          id: string
          is_initial_database: boolean
          is_unplanned: boolean
          measurement_id: string | null
          notes: string | null
          project_id: string
          quantity_executed: number
          service_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          cost_realized?: number
          created_at?: string
          execution_date?: string
          house_id: string
          id?: string
          is_initial_database?: boolean
          is_unplanned?: boolean
          measurement_id?: string | null
          notes?: string | null
          project_id: string
          quantity_executed?: number
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          cost_realized?: number
          created_at?: string
          execution_date?: string
          house_id?: string
          id?: string
          is_initial_database?: boolean
          is_unplanned?: boolean
          measurement_id?: string | null
          notes?: string | null
          project_id?: string
          quantity_executed?: number
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_logs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "measurement_services"
            referencedColumns: ["id"]
          },
        ]
      }
      productions: {
        Row: {
          created_at: string
          created_by: string | null
          house_ids: number[]
          houses_count: number
          id: string
          is_initial_database: boolean
          is_unplanned: boolean
          macro_color: string
          macro_id: string
          macro_name: string
          measurement_id: string | null
          measurement_service_id: string | null
          notes: string | null
          production_date: string
          project_id: string
          scope_id: string
          scope_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          house_ids?: number[]
          houses_count?: number
          id?: string
          is_initial_database?: boolean
          is_unplanned?: boolean
          macro_color?: string
          macro_id: string
          macro_name: string
          measurement_id?: string | null
          measurement_service_id?: string | null
          notes?: string | null
          production_date?: string
          project_id: string
          scope_id: string
          scope_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          house_ids?: number[]
          houses_count?: number
          id?: string
          is_initial_database?: boolean
          is_unplanned?: boolean
          macro_color?: string
          macro_id?: string
          macro_name?: string
          measurement_id?: string | null
          measurement_service_id?: string | null
          notes?: string | null
          production_date?: string
          project_id?: string
          scope_id?: string
          scope_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_measurement_service_id_fkey"
            columns: ["measurement_service_id"]
            isOneToOne: false
            referencedRelation: "measurement_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      productivity_library: {
        Row: {
          created_at: string
          default_productivity: number
          id: string
          project_id: string | null
          sample_count: number
          source: string
          stage_name: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_productivity?: number
          id?: string
          project_id?: string | null
          sample_count?: number
          source?: string
          stage_name: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_productivity?: number
          id?: string
          project_id?: string | null
          sample_count?: number
          source?: string
          stage_name?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          must_change_password: boolean | null
          status: string | null
          system_role: Database["public"]["Enums"]["system_role"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          display_name: string
          email: string
          id?: string
          must_change_password?: boolean | null
          status?: string | null
          system_role?: Database["public"]["Enums"]["system_role"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          must_change_password?: boolean | null
          status?: string | null
          system_role?: Database["public"]["Enums"]["system_role"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_contract_services: {
        Row: {
          company_id: string
          contract_id: string
          cost_percent: number
          created_at: string
          id: string
          macro_id: string
          macro_name: string
          macro_order: number
          max_cost_value: number
          project_id: string
          scope_id: string
          scope_name: string
          scope_order: number
          status: string
          unit_revenue_value: number
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_id: string
          cost_percent?: number
          created_at?: string
          id?: string
          macro_id: string
          macro_name: string
          macro_order?: number
          max_cost_value?: number
          project_id: string
          scope_id: string
          scope_name: string
          scope_order?: number
          status?: string
          unit_revenue_value?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_id?: string
          cost_percent?: number
          created_at?: string
          id?: string
          macro_id?: string
          macro_name?: string
          macro_order?: number
          max_cost_value?: number
          project_id?: string
          scope_id?: string
          scope_name?: string
          scope_order?: number
          status?: string
          unit_revenue_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contract_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contract_services_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "project_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contract_services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contracts: {
        Row: {
          company_id: string
          contract_date: string | null
          contract_number: string | null
          contract_value_total: number
          cost_target_percent: number
          created_at: string
          id: string
          notes: string | null
          performance_status: string | null
          project_id: string
          target_margin_percent: number | null
          target_profit_value: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_date?: string | null
          contract_number?: string | null
          contract_value_total?: number
          cost_target_percent?: number
          created_at?: string
          id?: string
          notes?: string | null
          performance_status?: string | null
          project_id: string
          target_margin_percent?: number | null
          target_profit_value?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_date?: string | null
          contract_number?: string | null
          contract_value_total?: number
          cost_target_percent?: number
          created_at?: string
          id?: string
          notes?: string | null
          performance_status?: string | null
          project_id?: string
          target_margin_percent?: number | null
          target_profit_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_lead_times: {
        Row: {
          company_id: string | null
          created_at: string
          family_id: string
          id: string
          lead_time_days: number
          project_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          family_id: string
          id?: string
          lead_time_days?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          family_id?: string
          id?: string
          lead_time_days?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_lead_times_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_lead_times_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_lead_times_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_service_productivity: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          default_team_count: number | null
          helpers_per_team: number | null
          id: string
          is_active: boolean | null
          macro_id: string
          notes: string | null
          productivity_unit: string
          productivity_value: number
          professionals_per_team: number | null
          project_id: string
          scope_id: string
          updated_at: string | null
          version: number | null
          working_days_per_week: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          default_team_count?: number | null
          helpers_per_team?: number | null
          id?: string
          is_active?: boolean | null
          macro_id: string
          notes?: string | null
          productivity_unit?: string
          productivity_value: number
          professionals_per_team?: number | null
          project_id: string
          scope_id: string
          updated_at?: string | null
          version?: number | null
          working_days_per_week?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          default_team_count?: number | null
          helpers_per_team?: number | null
          id?: string
          is_active?: boolean | null
          macro_id?: string
          notes?: string | null
          productivity_unit?: string
          productivity_value?: number
          professionals_per_team?: number | null
          project_id?: string
          scope_id?: string
          updated_at?: string | null
          version?: number | null
          working_days_per_week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_service_productivity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_service_team_composition: {
        Row: {
          created_at: string | null
          id: string
          productivity_id: string
          quantity: number
          role_name: string
          role_type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          productivity_id: string
          quantity?: number
          role_name: string
          role_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          productivity_id?: string
          quantity?: number
          role_name?: string
          role_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_service_team_composition_productivity_id_fkey"
            columns: ["productivity_id"]
            isOneToOne: false
            referencedRelation: "project_service_productivity"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          company_id: string | null
          contractor: string
          created_at: string
          custom_legend_items: Json
          display_order: number
          expected_end_date: string
          financial_categories: Json | null
          id: string
          legend_follow_macros: boolean
          location: string
          macros_template: Json
          name: string
          project_type: string
          setup_complete: boolean
          setup_step: string
          start_date: string
          total_houses: number
          unit_size: number
          updated_at: string
          weight_mode: string
        }
        Insert: {
          company_id?: string | null
          contractor: string
          created_at?: string
          custom_legend_items?: Json
          display_order?: number
          expected_end_date: string
          financial_categories?: Json | null
          id?: string
          legend_follow_macros?: boolean
          location: string
          macros_template?: Json
          name: string
          project_type?: string
          setup_complete?: boolean
          setup_step?: string
          start_date: string
          total_houses?: number
          unit_size?: number
          updated_at?: string
          weight_mode?: string
        }
        Update: {
          company_id?: string | null
          contractor?: string
          created_at?: string
          custom_legend_items?: Json
          display_order?: number
          expected_end_date?: string
          financial_categories?: Json | null
          id?: string
          legend_follow_macros?: boolean
          location?: string
          macros_template?: Json
          name?: string
          project_type?: string
          setup_complete?: boolean
          setup_step?: string
          start_date?: string
          total_houses?: number
          unit_size?: number
          updated_at?: string
          weight_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          purchase_order_id: string
          quantity: number
          quotation_item_id: string | null
          total_value: number
          unit: string
          unit_value: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          purchase_order_id: string
          quantity?: number
          quotation_item_id?: string | null
          total_value?: number
          unit?: string
          unit_value?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          purchase_order_id?: string
          quantity?: number
          quotation_item_id?: string | null
          total_value?: number
          unit?: string
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          actual_delivery_date: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_status: string | null
          expected_delivery_date: string | null
          id: string
          notes: string | null
          order_number: string
          project_id: string
          quotation_id: string | null
          status: string
          supplier_id: string
          total_value: number
          updated_at: string
        }
        Insert: {
          actual_delivery_date?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_number: string
          project_id: string
          quotation_id?: string | null
          status?: string
          supplier_id: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          actual_delivery_date?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          project_id?: string
          quotation_id?: string | null
          status?: string
          supplier_id?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_request_items: {
        Row: {
          created_at: string | null
          id: string
          input_id: string
          input_name: string | null
          period_supply_requirement_id: string
          purchase_request_id: string
          quantity_requested: number
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          input_id: string
          input_name?: string | null
          period_supply_requirement_id: string
          purchase_request_id: string
          quantity_requested?: number
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          input_id?: string
          input_name?: string | null
          period_supply_requirement_id?: string
          purchase_request_id?: string
          quantity_requested?: number
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_input_id_fkey"
            columns: ["input_id"]
            isOneToOne: false
            referencedRelation: "inputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_period_supply_requirement_id_fkey"
            columns: ["period_supply_requirement_id"]
            isOneToOne: false
            referencedRelation: "period_supply_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          notes: string | null
          planning_period_id: string
          project_id: string
          requested_by: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          planning_period_id: string
          project_id: string
          requested_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          planning_period_id?: string
          project_id?: string
          requested_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pr_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pr_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      quadras: {
        Row: {
          created_at: string
          display_order: number
          house_ids: number[]
          id: string
          name: string
          project_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          house_ids?: number[]
          id?: string
          name: string
          project_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          house_ids?: number[]
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quadras_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          category: string
          created_at: string
          estimated_unit_value: number | null
          id: string
          name: string
          quantity: number
          quotation_id: string
          scope_item_id: string | null
          unit: string
        }
        Insert: {
          category: string
          created_at?: string
          estimated_unit_value?: number | null
          id?: string
          name: string
          quantity?: number
          quotation_id: string
          scope_item_id?: string | null
          unit?: string
        }
        Update: {
          category?: string
          created_at?: string
          estimated_unit_value?: number | null
          id?: string
          name?: string
          quantity?: number
          quotation_id?: string
          scope_item_id?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_scope_item_id_fkey"
            columns: ["scope_item_id"]
            isOneToOne: false
            referencedRelation: "scope_items"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          project_id: string
          required_date: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          project_id: string
          required_date: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          required_date?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      restricoes_financeiras: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          data_limite: string
          descricao: string
          forma_resolucao: string | null
          id: string
          impacto_medicao: number
          medicao_id: string | null
          obra_id: string
          resolvida: boolean
          resolvida_em: string | null
          resolvida_por: string | null
          resolvida_por_nome: string | null
          tipo: string
          updated_at: string | null
          valor: number
          valor_pago: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          data_limite: string
          descricao: string
          forma_resolucao?: string | null
          id?: string
          impacto_medicao?: number
          medicao_id?: string | null
          obra_id: string
          resolvida?: boolean
          resolvida_em?: string | null
          resolvida_por?: string | null
          resolvida_por_nome?: string | null
          tipo: string
          updated_at?: string | null
          valor?: number
          valor_pago?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          data_limite?: string
          descricao?: string
          forma_resolucao?: string | null
          id?: string
          impacto_medicao?: number
          medicao_id?: string | null
          obra_id?: string
          resolvida?: boolean
          resolvida_em?: string | null
          resolvida_por?: string | null
          resolvida_por_nome?: string | null
          tipo?: string
          updated_at?: string | null
          valor?: number
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restricoes_financeiras_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restricoes_financeiras_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes_ple"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restricoes_financeiras_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_alerts: {
        Row: {
          alert_type: string
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          level: string
          measurement_id: string | null
          message: string
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          service_id: string | null
        }
        Insert: {
          alert_type: string
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level?: string
          measurement_id?: string | null
          message: string
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          service_id?: string | null
        }
        Update: {
          alert_type?: string
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level?: string
          measurement_id?: string | null
          message?: string
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_alerts_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_alerts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "measurement_services"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_services: {
        Row: {
          created_at: string | null
          id: string
          macro_id: string | null
          macro_name: string | null
          measurement_service_id: string | null
          planned_cost: number | null
          planned_houses: number
          productivity_expected: number | null
          scenario_id: string
          scope_id: string | null
          scope_name: string | null
          simulated_duration_days: number | null
          teams_expected: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          macro_id?: string | null
          macro_name?: string | null
          measurement_service_id?: string | null
          planned_cost?: number | null
          planned_houses?: number
          productivity_expected?: number | null
          scenario_id: string
          scope_id?: string | null
          scope_name?: string | null
          simulated_duration_days?: number | null
          teams_expected?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          macro_id?: string | null
          macro_name?: string | null
          measurement_service_id?: string | null
          planned_cost?: number | null
          planned_houses?: number
          productivity_expected?: number | null
          scenario_id?: string
          scope_id?: string | null
          scope_name?: string | null
          simulated_duration_days?: number | null
          teams_expected?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenario_services_measurement_service_id_fkey"
            columns: ["measurement_service_id"]
            isOneToOne: false
            referencedRelation: "measurement_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_services_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "planning_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_costs: {
        Row: {
          created_at: string
          equipment_cost: number
          id: string
          labor_cost: number
          macro_color: string
          macro_id: string
          macro_name: string
          material_cost: number
          project_id: string
          scope_id: string
          scope_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          equipment_cost?: number
          id?: string
          labor_cost?: number
          macro_color?: string
          macro_id: string
          macro_name: string
          material_cost?: number
          project_id: string
          scope_id: string
          scope_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          equipment_cost?: number
          id?: string
          labor_cost?: number
          macro_color?: string
          macro_id?: string
          macro_name?: string
          material_cost?: number
          project_id?: string
          scope_id?: string
          scope_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_items: {
        Row: {
          category: string
          created_at: string
          id: string
          input_code: string | null
          input_id: string | null
          macro_id: string
          material_family: string | null
          name: string
          notes: string | null
          project_id: string
          quantity: number
          scope_cost_id: string | null
          scope_id: string
          unit: string
          unit_value: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          input_code?: string | null
          input_id?: string | null
          macro_id: string
          material_family?: string | null
          name: string
          notes?: string | null
          project_id: string
          quantity?: number
          scope_cost_id?: string | null
          scope_id: string
          unit?: string
          unit_value?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          input_code?: string | null
          input_id?: string | null
          macro_id?: string
          material_family?: string | null
          name?: string
          notes?: string | null
          project_id?: string
          quantity?: number
          scope_cost_id?: string | null
          scope_id?: string
          unit?: string
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_items_input_id_fkey"
            columns: ["input_id"]
            isOneToOne: false
            referencedRelation: "inputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_scope_cost_id_fkey"
            columns: ["scope_cost_id"]
            isOneToOne: false
            referencedRelation: "scope_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_house_allocations: {
        Row: {
          company_id: string
          created_at: string | null
          house_id: string
          id: string
          macro_id: string | null
          planning_period_id: string
          project_id: string
          scope_id: string | null
          service_plan_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          house_id: string
          id?: string
          macro_id?: string | null
          planning_period_id: string
          project_id: string
          scope_id?: string | null
          service_plan_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          house_id?: string
          id?: string
          macro_id?: string | null
          planning_period_id?: string
          project_id?: string
          scope_id?: string | null
          service_plan_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sha_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sha_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_house_allocations_house_id_fkey"
            columns: ["house_id"]
            isOneToOne: false
            referencedRelation: "houses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_house_allocations_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_house_allocations_service_plan_id_fkey"
            columns: ["service_plan_id"]
            isOneToOne: false
            referencedRelation: "service_planning_by_period"
            referencedColumns: ["id"]
          },
        ]
      }
      service_materials: {
        Row: {
          created_at: string
          id: string
          macro_id: string
          material_id: string
          project_id: string
          quantity_per_house: number
          scope_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          macro_id: string
          material_id: string
          project_id: string
          quantity_per_house?: number
          scope_id: string
        }
        Update: {
          created_at?: string
          id?: string
          macro_id?: string
          material_id?: string
          project_id?: string
          quantity_per_house?: number
          scope_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_materials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_planning_by_period: {
        Row: {
          available_days: number | null
          capacity_status: string | null
          company_id: string
          contract_id: string | null
          created_at: string | null
          expected_output: number | null
          id: string
          macro_id: string | null
          macro_name: string | null
          macro_order: number
          performance_percent: number | null
          planned_cost: number | null
          planned_end_date: string | null
          planned_revenue: number | null
          planned_start_date: string | null
          planning_period_id: string
          production_capacity: number | null
          productivity_per_team: number | null
          productivity_planned: number | null
          project_id: string
          projected_result: number | null
          real_result: number | null
          realized_cost: number | null
          realized_houses: number | null
          realized_revenue: number | null
          scope_id: string | null
          scope_name: string | null
          scope_order: number
          status: string | null
          supply_deadline: string | null
          supply_risk: boolean | null
          target_houses: number | null
          team_count: number | null
          teams_planned: number | null
          unit_cost_value: number | null
          unit_revenue_value: number | null
          updated_at: string | null
        }
        Insert: {
          available_days?: number | null
          capacity_status?: string | null
          company_id: string
          contract_id?: string | null
          created_at?: string | null
          expected_output?: number | null
          id?: string
          macro_id?: string | null
          macro_name?: string | null
          macro_order?: number
          performance_percent?: number | null
          planned_cost?: number | null
          planned_end_date?: string | null
          planned_revenue?: number | null
          planned_start_date?: string | null
          planning_period_id: string
          production_capacity?: number | null
          productivity_per_team?: number | null
          productivity_planned?: number | null
          project_id: string
          projected_result?: number | null
          real_result?: number | null
          realized_cost?: number | null
          realized_houses?: number | null
          realized_revenue?: number | null
          scope_id?: string | null
          scope_name?: string | null
          scope_order?: number
          status?: string | null
          supply_deadline?: string | null
          supply_risk?: boolean | null
          target_houses?: number | null
          team_count?: number | null
          teams_planned?: number | null
          unit_cost_value?: number | null
          unit_revenue_value?: number | null
          updated_at?: string | null
        }
        Update: {
          available_days?: number | null
          capacity_status?: string | null
          company_id?: string
          contract_id?: string | null
          created_at?: string | null
          expected_output?: number | null
          id?: string
          macro_id?: string | null
          macro_name?: string | null
          macro_order?: number
          performance_percent?: number | null
          planned_cost?: number | null
          planned_end_date?: string | null
          planned_revenue?: number | null
          planned_start_date?: string | null
          planning_period_id?: string
          production_capacity?: number | null
          productivity_per_team?: number | null
          productivity_planned?: number | null
          project_id?: string
          projected_result?: number | null
          real_result?: number | null
          realized_cost?: number | null
          realized_houses?: number | null
          realized_revenue?: number | null
          scope_id?: string | null
          scope_name?: string | null
          scope_order?: number
          status?: string | null
          supply_deadline?: string | null
          supply_risk?: boolean | null
          target_houses?: number | null
          team_count?: number | null
          teams_planned?: number | null
          unit_cost_value?: number | null
          unit_revenue_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_spbp_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_spbp_contract"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "project_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_spbp_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_planning_by_period_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      service_planning_targets: {
        Row: {
          company_id: string
          contract_id: string | null
          created_at: string
          deviation_cost: number | null
          deviation_houses: number | null
          deviation_productivity: number | null
          execution_status: string | null
          id: string
          is_locked: boolean | null
          macro_id: string | null
          macro_name: string | null
          measurement_id: string | null
          measurement_number: number | null
          period_end: string
          period_start: string
          planned_cost: number
          planned_duration_days: number
          planned_houses: number
          planned_margin: number
          planned_revenue: number
          productivity_planned: number
          productivity_real: number | null
          project_id: string
          realized_cost: number | null
          realized_houses: number | null
          scenario_id: string | null
          scope_id: string | null
          scope_name: string | null
          target_margin_percent: number | null
          target_profit_value: number | null
          teams_planned: number
          unit_cost_value: number | null
          unit_revenue_value: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_id?: string | null
          created_at?: string
          deviation_cost?: number | null
          deviation_houses?: number | null
          deviation_productivity?: number | null
          execution_status?: string | null
          id?: string
          is_locked?: boolean | null
          macro_id?: string | null
          macro_name?: string | null
          measurement_id?: string | null
          measurement_number?: number | null
          period_end: string
          period_start: string
          planned_cost?: number
          planned_duration_days?: number
          planned_houses?: number
          planned_margin?: number
          planned_revenue?: number
          productivity_planned?: number
          productivity_real?: number | null
          project_id: string
          realized_cost?: number | null
          realized_houses?: number | null
          scenario_id?: string | null
          scope_id?: string | null
          scope_name?: string | null
          target_margin_percent?: number | null
          target_profit_value?: number | null
          teams_planned?: number
          unit_cost_value?: number | null
          unit_revenue_value?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_id?: string | null
          created_at?: string
          deviation_cost?: number | null
          deviation_houses?: number | null
          deviation_productivity?: number | null
          execution_status?: string | null
          id?: string
          is_locked?: boolean | null
          macro_id?: string | null
          macro_name?: string | null
          measurement_id?: string | null
          measurement_number?: number | null
          period_end?: string
          period_start?: string
          planned_cost?: number
          planned_duration_days?: number
          planned_houses?: number
          planned_margin?: number
          planned_revenue?: number
          productivity_planned?: number
          productivity_real?: number | null
          project_id?: string
          realized_cost?: number | null
          realized_houses?: number | null
          scenario_id?: string | null
          scope_id?: string | null
          scope_name?: string | null
          target_margin_percent?: number | null
          target_profit_value?: number | null
          teams_planned?: number
          unit_cost_value?: number | null
          unit_revenue_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_planning_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_planning_targets_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "project_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_planning_targets_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_planning_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_planning_targets_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "planning_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      service_productivities: {
        Row: {
          base_productivity: number
          company_id: string
          created_at: string | null
          id: string
          macro_id: string
          macro_name: string
          notes: string | null
          productivity_type: string
          scope_id: string
          scope_name: string
          team_composition: Json
          updated_at: string | null
        }
        Insert: {
          base_productivity?: number
          company_id: string
          created_at?: string | null
          id?: string
          macro_id: string
          macro_name: string
          notes?: string | null
          productivity_type?: string
          scope_id: string
          scope_name: string
          team_composition?: Json
          updated_at?: string | null
        }
        Update: {
          base_productivity?: number
          company_id?: string
          created_at?: string | null
          id?: string
          macro_id?: string
          macro_name?: string
          notes?: string | null
          productivity_type?: string
          scope_id?: string
          scope_name?: string
          team_composition?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_productivities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      session_security_rules: {
        Row: {
          alert_on_new_ip: boolean
          allow_multiple_devices: boolean
          company_id: string
          created_at: string
          force_logout_on_new_login: boolean
          id: string
          inactivity_timeout_min: number
          max_concurrent_sessions: number
          session_duration_hours: number
          updated_at: string
        }
        Insert: {
          alert_on_new_ip?: boolean
          allow_multiple_devices?: boolean
          company_id: string
          created_at?: string
          force_logout_on_new_login?: boolean
          id?: string
          inactivity_timeout_min?: number
          max_concurrent_sessions?: number
          session_duration_hours?: number
          updated_at?: string
        }
        Update: {
          alert_on_new_ip?: boolean
          allow_multiple_devices?: boolean
          company_id?: string
          created_at?: string
          force_logout_on_new_login?: boolean
          id?: string
          inactivity_timeout_min?: number
          max_concurrent_sessions?: number
          session_duration_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_security_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quotes: {
        Row: {
          created_at: string
          delivery_days: number
          id: string
          is_selected: boolean
          notes: string | null
          quotation_item_id: string
          supplier_id: string
          total_value: number
          unit_value: number
        }
        Insert: {
          created_at?: string
          delivery_days?: number
          id?: string
          is_selected?: boolean
          notes?: string | null
          quotation_item_id: string
          supplier_id: string
          total_value: number
          unit_value: number
        }
        Update: {
          created_at?: string
          delivery_days?: number
          id?: string
          is_selected?: boolean
          notes?: string | null
          quotation_item_id?: string
          supplier_id?: string
          total_value?: number
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quotes_quotation_item_id_fkey"
            columns: ["quotation_item_id"]
            isOneToOne: false
            referencedRelation: "quotation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_agency: string | null
          bank_name: string | null
          cnpj_cpf: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pix_key: string | null
          pix_key_type: string | null
          project_id: string
          supplier_scope: string
          supplier_type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          cnpj_cpf?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          project_id: string
          supplier_scope?: string
          supplier_type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          cnpj_cpf?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          project_id?: string
          supplier_scope?: string
          supplier_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_alerts: {
        Row: {
          actual_delivery_date: string | null
          created_at: string
          delay_days: number | null
          family_id: string
          id: string
          is_critical: boolean | null
          is_labor: boolean | null
          macro_id: string | null
          measurement_id: string | null
          notes: string | null
          order_by_date: string
          planned_production_id: string | null
          planned_use_date: string | null
          project_id: string
          purchase_order_id: string | null
          quotation_id: string | null
          related_service_id: string | null
          required_date: string
          risk_of_stop: boolean | null
          scope_id: string | null
          scope_item_id: string | null
          status: string
          total_quantity: number
          total_value: number
          updated_at: string
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          actual_delivery_date?: string | null
          created_at?: string
          delay_days?: number | null
          family_id: string
          id?: string
          is_critical?: boolean | null
          is_labor?: boolean | null
          macro_id?: string | null
          measurement_id?: string | null
          notes?: string | null
          order_by_date: string
          planned_production_id?: string | null
          planned_use_date?: string | null
          project_id: string
          purchase_order_id?: string | null
          quotation_id?: string | null
          related_service_id?: string | null
          required_date: string
          risk_of_stop?: boolean | null
          scope_id?: string | null
          scope_item_id?: string | null
          status?: string
          total_quantity?: number
          total_value?: number
          updated_at?: string
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          actual_delivery_date?: string | null
          created_at?: string
          delay_days?: number | null
          family_id?: string
          id?: string
          is_critical?: boolean | null
          is_labor?: boolean | null
          macro_id?: string | null
          measurement_id?: string | null
          notes?: string | null
          order_by_date?: string
          planned_production_id?: string | null
          planned_use_date?: string | null
          project_id?: string
          purchase_order_id?: string | null
          quotation_id?: string | null
          related_service_id?: string | null
          required_date?: string
          risk_of_stop?: boolean | null
          scope_id?: string | null
          scope_item_id?: string | null
          status?: string
          total_quantity?: number
          total_value?: number
          updated_at?: string
          week_end?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_alerts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_alerts_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_alerts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_alerts_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_alerts_related_service_id_fkey"
            columns: ["related_service_id"]
            isOneToOne: false
            referencedRelation: "measurement_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_alerts_scope_item_id_fkey"
            columns: ["scope_item_id"]
            isOneToOne: false
            referencedRelation: "scope_items"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_requests: {
        Row: {
          blocked_house_ids: number[]
          blocked_scope_ids: string[]
          carried_over_from_period_id: string | null
          created_at: string
          days_overdue: number
          family_id: string | null
          id: string
          impact_description: string | null
          is_critical: boolean | null
          item_id: string | null
          item_name: string
          item_unit: string | null
          lead_time_days: number | null
          macro_id: string | null
          measurement_id: string | null
          notes: string | null
          order_by_date: string | null
          planning_period_id: string | null
          project_id: string
          purchase_order_id: string | null
          purchase_overdue: boolean
          quantity: number
          quantity_carried_over: number
          quantity_net: number
          quotation_id: string | null
          required_date: string | null
          scope_id: string | null
          source_plan_id: string | null
          status: Database["public"]["Enums"]["supply_request_status"]
          supplier_id: string | null
          total_value: number | null
          unit_value: number | null
          updated_at: string
        }
        Insert: {
          blocked_house_ids?: number[]
          blocked_scope_ids?: string[]
          carried_over_from_period_id?: string | null
          created_at?: string
          days_overdue?: number
          family_id?: string | null
          id?: string
          impact_description?: string | null
          is_critical?: boolean | null
          item_id?: string | null
          item_name: string
          item_unit?: string | null
          lead_time_days?: number | null
          macro_id?: string | null
          measurement_id?: string | null
          notes?: string | null
          order_by_date?: string | null
          planning_period_id?: string | null
          project_id: string
          purchase_order_id?: string | null
          purchase_overdue?: boolean
          quantity?: number
          quantity_carried_over?: number
          quantity_net?: number
          quotation_id?: string | null
          required_date?: string | null
          scope_id?: string | null
          source_plan_id?: string | null
          status?: Database["public"]["Enums"]["supply_request_status"]
          supplier_id?: string | null
          total_value?: number | null
          unit_value?: number | null
          updated_at?: string
        }
        Update: {
          blocked_house_ids?: number[]
          blocked_scope_ids?: string[]
          carried_over_from_period_id?: string | null
          created_at?: string
          days_overdue?: number
          family_id?: string | null
          id?: string
          impact_description?: string | null
          is_critical?: boolean | null
          item_id?: string | null
          item_name?: string
          item_unit?: string | null
          lead_time_days?: number | null
          macro_id?: string | null
          measurement_id?: string | null
          notes?: string | null
          order_by_date?: string | null
          planning_period_id?: string | null
          project_id?: string
          purchase_order_id?: string | null
          purchase_overdue?: boolean
          quantity?: number
          quantity_carried_over?: number
          quantity_net?: number
          quotation_id?: string | null
          required_date?: string | null
          scope_id?: string | null
          source_plan_id?: string | null
          status?: Database["public"]["Enums"]["supply_request_status"]
          supplier_id?: string | null
          total_value?: number | null
          unit_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_requests_carried_over_from_period_id_fkey"
            columns: ["carried_over_from_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "material_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supply_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_status_logs: {
        Row: {
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["supply_request_status"]
          notes: string | null
          old_status:
            | Database["public"]["Enums"]["supply_request_status"]
            | null
          supply_request_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["supply_request_status"]
          notes?: string | null
          old_status?:
            | Database["public"]["Enums"]["supply_request_status"]
            | null
          supply_request_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["supply_request_status"]
          notes?: string | null
          old_status?:
            | Database["public"]["Enums"]["supply_request_status"]
            | null
          supply_request_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supply_status_logs_supply_request_id_fkey"
            columns: ["supply_request_id"]
            isOneToOne: false
            referencedRelation: "supply_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      system_modules: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_beta: boolean
          is_enabled: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_beta?: boolean
          is_enabled?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_beta?: boolean
          is_enabled?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          lida: boolean
          lida_em: string | null
          medicao_id: string | null
          mensagem: string
          modulo: string | null
          obra_id: string
          resolvida: boolean
          resolvida_em: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          medicao_id?: string | null
          mensagem: string
          modulo?: string | null
          obra_id: string
          resolvida?: boolean
          resolvida_em?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          lida?: boolean
          lida_em?: string | null
          medicao_id?: string | null
          mensagem?: string
          modulo?: string | null
          obra_id?: string
          resolvida?: boolean
          resolvida_em?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_notifications_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes_ple"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_notifications_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras_portfolio"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          abbreviation: string
          company_id: string
          created_at: string
          id: string
          name: string
          project_id: string
        }
        Insert: {
          abbreviation: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          project_id: string
        }
        Update: {
          abbreviation?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding: {
        Row: {
          action_key: string
          seen_at: string | null
          user_id: string
        }
        Insert: {
          action_key: string
          seen_at?: string | null
          user_id: string
        }
        Update: {
          action_key?: string
          seen_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          allowed_project_ids: string[] | null
          can_edit: boolean | null
          created_at: string
          department: string | null
          id: string
          updated_at: string
          user_id: string
          visible_management_sections: Json | null
          visible_menus: Json | null
        }
        Insert: {
          allowed_project_ids?: string[] | null
          can_edit?: boolean | null
          created_at?: string
          department?: string | null
          id?: string
          updated_at?: string
          user_id: string
          visible_management_sections?: Json | null
          visible_menus?: Json | null
        }
        Update: {
          allowed_project_ids?: string[] | null
          can_edit?: boolean | null
          created_at?: string
          department?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          visible_management_sections?: Json | null
          visible_menus?: Json | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          id: string
          inactivity_timeout_min: number | null
          ip_address: string | null
          is_active: boolean
          last_active_at: string | null
          login_at: string
          logout_at: string | null
          region: string | null
          terminated_by: string | null
          termination_reason: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          inactivity_timeout_min?: number | null
          ip_address?: string | null
          is_active?: boolean
          last_active_at?: string | null
          login_at?: string
          logout_at?: string | null
          region?: string | null
          terminated_by?: string | null
          termination_reason?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          inactivity_timeout_min?: number | null
          ip_address?: string | null
          is_active?: boolean
          last_active_at?: string | null
          login_at?: string
          logout_at?: string | null
          region?: string | null
          terminated_by?: string | null
          termination_reason?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_plan_config: {
        Row: {
          company_id: string
          created_at: string
          id: string
          project_id: string
          updated_at: string
          working_days_per_week: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          project_id: string
          updated_at?: string
          working_days_per_week?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          project_id?: string
          updated_at?: string
          working_days_per_week?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plan_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_config_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plan_contractor_log: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          company_id: string
          created_at: string
          id: string
          macro_id: string
          new_contractor_id: string | null
          new_contractor_name: string | null
          new_house_ids: number[]
          previous_contractor_id: string | null
          previous_contractor_name: string | null
          previous_house_ids: number[]
          project_id: string
          scope_id: string
          scope_name: string
          transferred_house_ids: number[]
          week_start: string
          weekly_plan_service_id: string | null
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          macro_id: string
          new_contractor_id?: string | null
          new_contractor_name?: string | null
          new_house_ids?: number[]
          previous_contractor_id?: string | null
          previous_contractor_name?: string | null
          previous_house_ids?: number[]
          project_id: string
          scope_id: string
          scope_name: string
          transferred_house_ids?: number[]
          week_start: string
          weekly_plan_service_id?: string | null
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          macro_id?: string
          new_contractor_id?: string | null
          new_contractor_name?: string | null
          new_house_ids?: number[]
          previous_contractor_id?: string | null
          previous_contractor_name?: string | null
          previous_house_ids?: number[]
          project_id?: string
          scope_id?: string
          scope_name?: string
          transferred_house_ids?: number[]
          week_start?: string
          weekly_plan_service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plan_contractor_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_contractor_log_new_contractor_id_fkey"
            columns: ["new_contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_contractor_log_previous_contractor_id_fkey"
            columns: ["previous_contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_contractor_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_contractor_log_weekly_plan_service_id_fkey"
            columns: ["weekly_plan_service_id"]
            isOneToOne: false
            referencedRelation: "weekly_plan_services"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plan_services: {
        Row: {
          company_id: string
          contractor_contract_service_id: string | null
          contractor_house_ids: number[]
          contractor_houses: number
          contractor_id: string | null
          contractor_name: string | null
          created_at: string
          has_out_of_contract_houses: boolean
          id: string
          macro_color: string
          macro_id: string
          macro_name: string
          notes: string | null
          out_of_contract_house_ids: number[]
          planned_house_ids: number[]
          planned_houses: number
          planning_period_id: string
          project_id: string
          scope_id: string
          scope_name: string
          updated_at: string
          weekly_plan_week_id: string
        }
        Insert: {
          company_id: string
          contractor_contract_service_id?: string | null
          contractor_house_ids?: number[]
          contractor_houses?: number
          contractor_id?: string | null
          contractor_name?: string | null
          created_at?: string
          has_out_of_contract_houses?: boolean
          id?: string
          macro_color?: string
          macro_id: string
          macro_name: string
          notes?: string | null
          out_of_contract_house_ids?: number[]
          planned_house_ids?: number[]
          planned_houses?: number
          planning_period_id: string
          project_id: string
          scope_id: string
          scope_name: string
          updated_at?: string
          weekly_plan_week_id: string
        }
        Update: {
          company_id?: string
          contractor_contract_service_id?: string | null
          contractor_house_ids?: number[]
          contractor_houses?: number
          contractor_id?: string | null
          contractor_name?: string | null
          created_at?: string
          has_out_of_contract_houses?: boolean
          id?: string
          macro_color?: string
          macro_id?: string
          macro_name?: string
          notes?: string | null
          out_of_contract_house_ids?: number[]
          planned_house_ids?: number[]
          planned_houses?: number
          planning_period_id?: string
          project_id?: string
          scope_id?: string
          scope_name?: string
          updated_at?: string
          weekly_plan_week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plan_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_services_contractor_contract_service_id_fkey"
            columns: ["contractor_contract_service_id"]
            isOneToOne: false
            referencedRelation: "contractor_contract_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_services_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_services_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_services_weekly_plan_week_id_fkey"
            columns: ["weekly_plan_week_id"]
            isOneToOne: false
            referencedRelation: "weekly_plan_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plan_weeks: {
        Row: {
          company_id: string
          created_at: string
          id: string
          planning_period_id: string
          project_id: string
          status: string
          updated_at: string
          week_end: string
          week_number: number
          week_start: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          planning_period_id: string
          project_id: string
          status?: string
          updated_at?: string
          week_end: string
          week_number: number
          week_start: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          planning_period_id?: string
          project_id?: string
          status?: string
          updated_at?: string
          week_end?: string
          week_number?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plan_weeks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_weeks_planning_period_id_fkey"
            columns: ["planning_period_id"]
            isOneToOne: false
            referencedRelation: "planning_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plan_weeks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_productions: {
        Row: {
          contractor_id: string | null
          created_at: string
          created_by_name: string | null
          created_by_user_id: string | null
          house_ids: number[]
          houses_count: number
          id: string
          is_initial_database: boolean
          is_unplanned: boolean
          macro_color: string
          macro_id: string
          macro_name: string
          notes: string | null
          project_id: string
          scope_id: string
          scope_name: string
          updated_at: string
          week_end: string
          week_start: string
          weekly_plan_service_id: string | null
        }
        Insert: {
          contractor_id?: string | null
          created_at?: string
          created_by_name?: string | null
          created_by_user_id?: string | null
          house_ids?: number[]
          houses_count?: number
          id?: string
          is_initial_database?: boolean
          is_unplanned?: boolean
          macro_color?: string
          macro_id: string
          macro_name: string
          notes?: string | null
          project_id: string
          scope_id: string
          scope_name: string
          updated_at?: string
          week_end: string
          week_start: string
          weekly_plan_service_id?: string | null
        }
        Update: {
          contractor_id?: string | null
          created_at?: string
          created_by_name?: string | null
          created_by_user_id?: string | null
          house_ids?: number[]
          houses_count?: number
          id?: string
          is_initial_database?: boolean
          is_unplanned?: boolean
          macro_color?: string
          macro_id?: string
          macro_name?: string
          notes?: string | null
          project_id?: string
          scope_id?: string
          scope_name?: string
          updated_at?: string
          week_end?: string
          week_start?: string
          weekly_plan_service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_productions_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_productions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_productions_weekly_plan_service_id_fkey"
            columns: ["weekly_plan_service_id"]
            isOneToOne: false
            referencedRelation: "weekly_plan_services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_planning_period: {
        Args: {
          p_company_id: string
          p_planning_version_id: string
          p_project_id: string
        }
        Returns: Json
      }
      admin_create_company: { Args: { company_name: string }; Returns: Json }
      admin_create_company_admin: {
        Args: {
          admin_display_name: string
          admin_email: string
          target_company_id: string
        }
        Returns: Json
      }
      admin_exists: { Args: never; Returns: boolean }
      allocate_house_to_service_period: {
        Args: { p_house_id: string; p_service_plan_id: string }
        Returns: Json
      }
      apply_contract_to_planning: {
        Args: { p_contract_id: string }
        Returns: Json
      }
      apply_structure_mutation: {
        Args: { p_new_template: Json; p_project_id: string }
        Returns: Json
      }
      approve_planning_period: {
        Args: { p_period_id: string; p_user_id?: string }
        Returns: Json
      }
      calculate_labor_needs: { Args: { p_project_id: string }; Returns: Json }
      calculate_service_planned_cost: {
        Args: {
          p_company_id: string
          p_macro_id: string
          p_planned_houses: number
          p_project_id: string
          p_scope_id: string
        }
        Returns: number
      }
      can_write: { Args: never; Returns: boolean }
      carry_over_stock: {
        Args: { p_from_period_id: string; p_to_period_id: string }
        Returns: Json
      }
      check_legacy_data_status: { Args: never; Returns: Json }
      cleanup_stale_sessions: { Args: never; Returns: undefined }
      clone_planning_version: {
        Args: { p_new_name: string; p_source_version_id: string }
        Returns: string
      }
      clone_services_to_scenario: {
        Args: { p_scenario_id: string }
        Returns: Json
      }
      close_labor_measurement: {
        Args: { p_contract_id: string; p_house_ids: number[]; p_notes?: string }
        Returns: undefined
      }
      close_measurement: {
        Args: { p_measurement_id: string; p_notes?: string }
        Returns: Json
      }
      close_planning_period: { Args: { p_period_id: string }; Returns: Json }
      compare_planning_versions: {
        Args: { p_project_id: string }
        Returns: Json
      }
      complete_orphan_data_migration: {
        Args: { target_company_id: string }
        Returns: Json
      }
      correct_production_log: {
        Args: {
          p_correction_reason: string
          p_new_cost?: number
          p_new_quantity?: number
          p_production_log_id: string
        }
        Returns: Json
      }
      count_orphan_projects: { Args: never; Returns: number }
      create_company_user: {
        Args: {
          p_company_id: string
          p_display_name: string
          p_email: string
          p_role: string
          p_temp_password: string
        }
        Returns: Json
      }
      create_measurement_service_with_cost: {
        Args: {
          p_company_id: string
          p_family_id?: string
          p_helpers_per_team?: number
          p_macro_color: string
          p_macro_id: string
          p_macro_name: string
          p_measurement_id: string
          p_planned_house_ids: number[]
          p_productivity_expected?: number
          p_professionals_per_team?: number
          p_project_id: string
          p_scope_id: string
          p_scope_name: string
          p_teams_expected?: number
        }
        Returns: string
      }
      create_order_from_alert: {
        Args: {
          p_alert_id: string
          p_expected_delivery_date?: string
          p_notes?: string
          p_order_number?: string
          p_supplier_id: string
        }
        Returns: string
      }
      create_production_log: {
        Args: {
          p_company_id: string
          p_cost: number
          p_execution_date?: string
          p_house_id: string
          p_is_initial_database?: boolean
          p_is_unplanned?: boolean
          p_measurement_id: string
          p_notes?: string
          p_project_id: string
          p_quantity: number
          p_service_id: string
        }
        Returns: string
      }
      create_production_log_with_exception: {
        Args: {
          p_company_id: string
          p_cost_realized: number
          p_exception_reason: string
          p_execution_date: string
          p_house_id: string
          p_measurement_id: string
          p_notes: string
          p_project_id: string
          p_quantity_executed: number
          p_service_id: string
        }
        Returns: Json
      }
      create_quotation_from_alert: {
        Args: { p_alert_id: string; p_notes?: string; p_title?: string }
        Returns: string
      }
      create_system_admin: {
        Args: {
          admin_display_name: string
          admin_email: string
          admin_user_id: string
        }
        Returns: boolean
      }
      delete_planning_period: { Args: { p_period_id: string }; Returns: Json }
      estimate_service_duration_days: {
        Args: {
          p_planned_houses: number
          p_productivity: number
          p_teams: number
        }
        Returns: number
      }
      generate_all_supply_requirements_for_project: {
        Args: { p_project_id: string }
        Returns: Json
      }
      generate_measurement_risk_alert: {
        Args: { p_measurement_id: string; p_new_risk: string }
        Returns: undefined
      }
      generate_period_supply_requirements: {
        Args: { p_planning_period_id: string }
        Returns: Json
      }
      generate_purchase_order_from_quotation: {
        Args: { p_quotation_id: string; p_supplier_id: string }
        Returns: Json
      }
      generate_quotation_from_purchase_request: {
        Args: { p_purchase_request_id: string }
        Returns: Json
      }
      generate_service_planning_for_period: {
        Args: {
          p_company_id: string
          p_contract_id: string
          p_planning_period_id: string
          p_project_id: string
        }
        Returns: Json
      }
      generate_service_planning_targets: {
        Args: {
          p_measurement_number: number
          p_period_end: string
          p_period_start: string
          p_project_id: string
          p_scenario_id?: string
        }
        Returns: Json
      }
      generate_service_risk_alert: {
        Args: { p_new_risk: string; p_service_id: string }
        Returns: undefined
      }
      generate_supplies_from_planning_period: {
        Args: { p_period_id: string }
        Returns: Json
      }
      generate_supply_requests_from_planning: {
        Args: { p_measurement_id?: string; p_project_id: string }
        Returns: Json
      }
      generate_supply_requirements_from_targets: {
        Args: { p_measurement_id: string }
        Returns: Json
      }
      generate_supply_risk_alert: {
        Args: {
          p_company_id: string
          p_input_name: string
          p_macro_name: string
          p_project_id: string
          p_scope_name: string
          p_service_id: string
          p_supply_alert_id: string
        }
        Returns: undefined
      }
      generate_temp_password: { Args: never; Returns: string }
      generate_unique_slug: { Args: { company_name: string }; Returns: string }
      get_available_measurements: {
        Args: { p_project_id: string }
        Returns: {
          end_date: string
          id: string
          measurement_number: number
          notes: string
          start_date: string
          status: string
        }[]
      }
      get_company_supply_kpis: { Args: { p_company_id: string }; Returns: Json }
      get_contract_financial_dashboard: {
        Args: { p_contract_id: string }
        Returns: Json
      }
      get_ind_cash_projection: {
        Args: { p_context_id: string }
        Returns: {
          advance_due_date: string
          advance_pct: number
          advance_value: number
          factory_id: string
          factory_name: string
          freight_value: number
          lifting_value: number
          period_label: string
          period_start: string
          production_value: number
          total_outflow: number
        }[]
      }
      get_ind_costs_by_period: {
        Args: { p_context_id: string }
        Returns: {
          actual_units: number
          advance_pct: number
          advance_value: number
          batch_value: number
          factory_id: string
          factory_name: string
          freight_value: number
          lifting_value: number
          period_end: string
          period_id: string
          period_label: string
          period_start: string
          planned_units: number
          total_value: number
          unit_value: number
        }[]
      }
      get_ind_long_term_plan: {
        Args: { p_context_id: string }
        Returns: {
          actual_units: number
          completion_pct: number
          factory_id: string
          factory_name: string
          period_end: string
          period_id: string
          period_label: string
          period_start: string
          planned_units: number
          target_units: number
        }[]
      }
      get_ind_planning_grid: {
        Args: { p_context_id: string }
        Returns: {
          actual_houses: number
          advance_pct: number
          capacity_month: number
          end_date: string
          factory_id: string
          factory_name: string
          fortnight: number
          month: number
          planned_houses: number
          price_per_house: number
          start_date: string
          year: number
        }[]
      }
      get_measurement_cost_summary: {
        Args: { p_measurement_id: string }
        Returns: Json
      }
      get_measurement_dashboard: {
        Args: { p_measurement_id: string }
        Returns: Json
      }
      get_measurement_financial_summary: {
        Args: { p_measurement_id: string }
        Returns: Json
      }
      get_measurement_house_count: {
        Args: { p_measurement_id: string }
        Returns: number
      }
      get_measurement_houses: {
        Args: { p_measurement_id: string }
        Returns: {
          house_id: string
          house_number: number
        }[]
      }
      get_measurement_revenue_expected: {
        Args: { p_measurement_id: string }
        Returns: number
      }
      get_measurement_supply_kpis: {
        Args: { p_measurement_id: string; p_project_id: string }
        Returns: {
          critical_items: number
          items_alert: number
          items_delivered: number
          items_ordered: number
          items_quoted: number
          percent_purchased: number
          total_items: number
          total_quantity: number
          total_value: number
          value_pending: number
          value_purchased: number
        }[]
      }
      get_measurement_supply_requests: {
        Args: {
          p_measurement_id: string
          p_project_id: string
          p_status?: string
        }
        Returns: {
          created_at: string
          family_color: string
          family_id: string
          family_name: string
          id: string
          is_critical: boolean
          item_id: string
          item_name: string
          item_unit: string
          macro_id: string
          measurement_id: string
          notes: string
          order_by_date: string
          project_id: string
          purchase_order_id: string
          quantity: number
          quotation_id: string
          required_date: string
          scope_id: string
          source_plan_id: string
          status: string
          supplier_id: string
          supplier_name: string
          total_value: number
          unit_value: number
          updated_at: string
        }[]
      }
      get_measurement_vs_planning: {
        Args: { p_measurement_id: string }
        Returns: Json
      }
      get_my_company_id: { Args: never; Returns: string }
      get_notifications: {
        Args: { p_company_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          company_id: string
          created_at: string
          id: string
          lida: boolean
          lida_em: string | null
          medicao_id: string | null
          mensagem: string
          modulo: string | null
          obra_id: string
          resolvida: boolean
          resolvida_em: string | null
          tipo: string
          titulo: string
        }[]
        SetofOptions: {
          from: "*"
          to: "system_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_operational_risk_dashboard: {
        Args: { p_project_id: string }
        Returns: Json
      }
      get_orphan_data_counts: { Args: never; Returns: Json }
      get_pending_supply_alerts: {
        Args: { p_project_id: string }
        Returns: {
          actual_delivery_date: string
          created_at: string
          delay_days: number
          family_id: string
          id: string
          is_critical: boolean
          is_labor: boolean
          macro_id: string
          measurement_id: string
          notes: string
          order_by_date: string
          planned_use_date: string
          project_id: string
          purchase_order_id: string
          quotation_id: string
          required_date: string
          scope_id: string
          scope_item_id: string
          status: string
          total_quantity: number
          total_value: number
          updated_at: string
          week_end: string
          week_start: string
        }[]
      }
      get_planning_version_execution_summary: {
        Args: { p_version_id: string }
        Returns: Json
      }
      get_planning_version_summary: {
        Args: { p_version_id: string }
        Returns: Json
      }
      get_ple_from_holding: {
        Args: { p_obras_portfolio_id: string }
        Returns: {
          data_inicio: string
          empresa: string
          nome: string
          num_contrato: string
          obramap_project_id: string
          obramap_project_name: string
          obramap_total_houses: number
          total_houses: number
          valor_contrato: number
        }[]
      }
      get_project_contract_value: {
        Args: { p_project_id: string }
        Returns: number
      }
      get_project_cost_target_percent: {
        Args: { p_project_id: string }
        Returns: number
      }
      get_project_execution_dashboard: {
        Args: { p_project_id: string }
        Returns: Json
      }
      get_project_risk_alerts: {
        Args: { p_project_id: string }
        Returns: {
          alert_type: string
          created_at: string
          id: string
          level: string
          measurement_number: number
          message: string
          service_name: string
        }[]
      }
      get_service_execution_bank: {
        Args: { p_project_id: string }
        Returns: {
          available_houses: number
          completion_percent: number
          executed_houses: number
          macro_id: string
          macro_name: string
          scope_id: string
          scope_name: string
          status: string
          total_houses: number
        }[]
      }
      get_supply_kpis: { Args: { p_project_id: string }; Returns: Json }
      get_supply_requests_by_measurement: {
        Args: { p_project_id: string }
        Returns: {
          end_date: string
          items_alert: number
          items_delivered: number
          items_ordered: number
          items_quoted: number
          measurement_id: string
          measurement_number: number
          measurement_status: string
          percent_purchased: number
          start_date: string
          supply_status: string
          total_items: number
          total_quantity: number
          total_value: number
        }[]
      }
      get_supply_requests_by_status: {
        Args: { p_project_id: string; p_status?: string }
        Returns: {
          created_at: string
          family_color: string
          family_id: string
          family_name: string
          id: string
          is_critical: boolean
          item_id: string
          item_name: string
          item_unit: string
          macro_id: string
          measurement_id: string
          notes: string
          order_by_date: string
          project_id: string
          purchase_order_id: string
          quantity: number
          quotation_id: string
          required_date: string
          scope_id: string
          source_plan_id: string
          status: string
          supplier_id: string
          supplier_name: string
          total_value: number
          unit_value: number
          updated_at: string
        }[]
      }
      get_supply_risk_summary: {
        Args: { p_project_id: string }
        Returns: {
          forecast_end_date: string
          inputs_at_risk: number
          macro_name: string
          max_days_overdue: number
          risk_level: string
          scope_name: string
          service_id: string
        }[]
      }
      get_unread_notifications_count: {
        Args: { p_company_id: string }
        Returns: number
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      init_company_modules: {
        Args: { target_company_id: string }
        Returns: undefined
      }
      initialize_long_term_planning: {
        Args: {
          p_company_id: string
          p_number_of_periods?: number
          p_project_id: string
        }
        Returns: Json
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_house_in_active_measurement: {
        Args: { p_company_id: string; p_house_id: string; p_project_id: string }
        Returns: boolean
      }
      is_system_admin: { Args: { _user_id?: string }; Returns: boolean }
      link_houses_to_measurement: {
        Args: {
          p_company_id: string
          p_house_ids: string[]
          p_measurement_id: string
          p_project_id: string
        }
        Returns: Json
      }
      link_measurement_to_planning_period: {
        Args: { p_measurement_id: string; p_planning_period_id: string }
        Returns: Json
      }
      link_supply_to_service: {
        Args: { p_service_id: string; p_supply_alert_id: string }
        Returns: undefined
      }
      log_production_for_planned_house: {
        Args: {
          p_cost: number
          p_execution_date: string
          p_house_id: string
          p_quantity: number
          p_service_plan_id: string
        }
        Returns: Json
      }
      migrate_orphan_data_to_company: {
        Args: { target_company_id: string }
        Returns: Json
      }
      promote_to_system_admin: { Args: { admin_email: string }; Returns: Json }
      recalc_alerts_for_measurement: {
        Args: { p_measurement_id: string }
        Returns: undefined
      }
      recalcular_percentual_financeiro: {
        Args: { p_obra_id: string }
        Returns: undefined
      }
      recalculate_measurement_forecast: {
        Args: { p_measurement_id: string }
        Returns: undefined
      }
      recalculate_measurement_totals: {
        Args: { p_measurement_id: string }
        Returns: undefined
      }
      recalculate_period_capacity_risk: {
        Args: { p_planning_period_id: string }
        Returns: undefined
      }
      recalculate_period_item_supply_risk: {
        Args: { p_planning_period_id: string }
        Returns: undefined
      }
      recalculate_period_supply_deadlines: {
        Args: { p_planning_period_id: string }
        Returns: undefined
      }
      recalculate_period_supply_impact: {
        Args: { p_planning_period_id: string }
        Returns: undefined
      }
      recalculate_planning_period_financials: {
        Args: { p_period_id: string }
        Returns: undefined
      }
      recalculate_project_forecasts: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      recalculate_project_supply_risks: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      recalculate_service_capacity: {
        Args: { p_service_planning_id: string }
        Returns: undefined
      }
      recalculate_service_cost: {
        Args: { p_service_id: string }
        Returns: number
      }
      recalculate_service_execution_deviation: {
        Args: { p_measurement_number: number; p_project_id: string }
        Returns: undefined
      }
      recalculate_service_forecast: {
        Args: { p_service_id: string }
        Returns: undefined
      }
      recalculate_service_planning_period_realized: {
        Args: { p_service_id: string }
        Returns: undefined
      }
      recalculate_service_real_results: {
        Args: { p_service_id: string }
        Returns: undefined
      }
      recalculate_service_supply_deadline: {
        Args: { p_service_planning_id: string }
        Returns: undefined
      }
      recalculate_supply_risk: {
        Args: { p_service_id: string }
        Returns: undefined
      }
      recalculate_supply_risk_on_orders: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      regenerate_supply_alerts: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      rename_house_number: {
        Args: {
          p_new_number: number
          p_old_number: number
          p_project_id: string
        }
        Returns: boolean
      }
      reopen_measurement: {
        Args: { p_measurement_id: string; p_reason: string }
        Returns: Json
      }
      reopen_planning_period: { Args: { p_period_id: string }; Returns: Json }
      repair_house_macros_from_productions: {
        Args: { p_project_id: string }
        Returns: number
      }
      resolve_risk_alert: {
        Args: { p_alert_id: string; p_resolved_by?: string }
        Returns: undefined
      }
      set_contract_macro_value: {
        Args: {
          p_contract_id: string
          p_macro_id: string
          p_total_value: number
        }
        Returns: Json
      }
      sync_contract_from_ple: {
        Args: { p_ple_project_id: string }
        Returns: Json
      }
      sync_contract_services: {
        Args: { p_company_id: string; p_project_id: string }
        Returns: Json
      }
      sync_period_services_with_strategic: {
        Args: { p_project_id: string }
        Returns: Json
      }
      sync_period_supply_requirements: {
        Args: { p_measurement_id?: string; p_planning_period_id: string }
        Returns: Json
      }
      sync_supply_on_delivery: {
        Args: { p_purchase_order_id: string }
        Returns: undefined
      }
      transition_supply_status: {
        Args: {
          p_new_status: string
          p_notes?: string
          p_request_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      unlink_houses_from_measurement: {
        Args: {
          p_company_id: string
          p_house_ids: string[]
          p_measurement_id: string
          p_project_id: string
        }
        Returns: Json
      }
      update_planning_period_status: {
        Args: { p_new_status: string; p_period_id: string }
        Returns: Json
      }
      update_supply_impacts: { Args: { p_project_id: string }; Returns: Json }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      user_must_change_password: {
        Args: { _user_id: string }
        Returns: boolean
      }
      validate_alert_for_quotation: {
        Args: { p_alert_id: string }
        Returns: boolean
      }
      validate_contract_ready: {
        Args: { p_contract_id: string }
        Returns: Json
      }
    }
    Enums: {
      aditivo_status: "aprovado" | "pendente"
      app_role: "admin" | "editor" | "viewer"
      delivery_status:
        | "em_vistoria"
        | "entrega_agendada"
        | "entregue_sem_pendencias"
        | "entregue_com_pendencias"
        | "pos_obra_em_atendimento"
        | "unidade_encerrada"
      despesa_status: "fechado" | "em_fechamento" | "nao_iniciado"
      issue_severity: "critica" | "media" | "leve"
      issue_status:
        | "aberta"
        | "em_execucao"
        | "aguardando_validacao"
        | "encerrada"
      medicao_status:
        | "aprovada"
        | "enviada"
        | "pendente"
        | "nao_iniciada"
        | "prevista"
      nf_status: "recebido" | "aguardando_aprovacao" | "pendente"
      obra_status: "em_andamento" | "nao_iniciada" | "concluida" | "paralisada"
      supply_request_status:
        | "alert"
        | "quoted"
        | "ordered"
        | "delivered"
        | "cancelled"
      system_role: "system_admin" | "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      aditivo_status: ["aprovado", "pendente"],
      app_role: ["admin", "editor", "viewer"],
      delivery_status: [
        "em_vistoria",
        "entrega_agendada",
        "entregue_sem_pendencias",
        "entregue_com_pendencias",
        "pos_obra_em_atendimento",
        "unidade_encerrada",
      ],
      despesa_status: ["fechado", "em_fechamento", "nao_iniciado"],
      issue_severity: ["critica", "media", "leve"],
      issue_status: [
        "aberta",
        "em_execucao",
        "aguardando_validacao",
        "encerrada",
      ],
      medicao_status: [
        "aprovada",
        "enviada",
        "pendente",
        "nao_iniciada",
        "prevista",
      ],
      nf_status: ["recebido", "aguardando_aprovacao", "pendente"],
      obra_status: ["em_andamento", "nao_iniciada", "concluida", "paralisada"],
      supply_request_status: [
        "alert",
        "quoted",
        "ordered",
        "delivered",
        "cancelled",
      ],
      system_role: ["system_admin", "admin", "user"],
    },
  },
} as const
