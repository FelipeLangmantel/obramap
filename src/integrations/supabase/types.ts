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
      departments: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          name?: string
        }
        Relationships: []
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
      inputs: {
        Row: {
          category: string
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
      map_layouts: {
        Row: {
          camera_position: Json | null
          camera_target: Json | null
          created_at: string
          house_markers_3d: Json | null
          houses: Json
          id: string
          image_url: string | null
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
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
          company_id: string
          contract_percent: number
          created_at: string
          end_date: string
          financial_balance_estimate: number
          id: string
          is_executed: boolean
          notes: string | null
          period_number: number
          planned_cost_estimate: number
          planning_version_id: string
          project_id: string
          revenue_expected: number
          revenue_target: number
          start_date: string
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_percent?: number
          created_at?: string
          end_date: string
          financial_balance_estimate?: number
          id?: string
          is_executed?: boolean
          notes?: string | null
          period_number: number
          planned_cost_estimate?: number
          planning_version_id: string
          project_id: string
          revenue_expected?: number
          revenue_target?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_percent?: number
          created_at?: string
          end_date?: string
          financial_balance_estimate?: number
          id?: string
          is_executed?: boolean
          notes?: string | null
          period_number?: number
          planned_cost_estimate?: number
          planning_version_id?: string
          project_id?: string
          revenue_expected?: number
          revenue_target?: number
          start_date?: string
          updated_at?: string
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
      production_deviations: {
        Row: {
          actual_count: number
          corrective_action: string | null
          created_at: string
          deviation: number
          deviation_reason: string
          id: string
          macro_id: string
          macro_name: string
          planned_count: number
          planned_production_id: string
          project_id: string
          scope_id: string
          scope_name: string
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          actual_count?: number
          corrective_action?: string | null
          created_at?: string
          deviation?: number
          deviation_reason: string
          id?: string
          macro_id: string
          macro_name: string
          planned_count?: number
          planned_production_id: string
          project_id: string
          scope_id: string
          scope_name: string
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          actual_count?: number
          corrective_action?: string | null
          created_at?: string
          deviation?: number
          deviation_reason?: string
          id?: string
          macro_id?: string
          macro_name?: string
          planned_count?: number
          planned_production_id?: string
          project_id?: string
          scope_id?: string
          scope_name?: string
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
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
      project_contracts: {
        Row: {
          company_id: string
          contract_value_total: number
          cost_target_percent: number
          created_at: string
          id: string
          notes: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          contract_value_total?: number
          cost_target_percent?: number
          created_at?: string
          id?: string
          notes?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contract_value_total?: number
          cost_target_percent?: number
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string
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
          created_at: string
          family_id: string
          id: string
          lead_time_days: number
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          lead_time_days?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          lead_time_days?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
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
      units: {
        Row: {
          abbreviation: string
          created_at: string
          id: string
          name: string
          project_id: string
        }
        Insert: {
          abbreviation: string
          created_at?: string
          id?: string
          name: string
          project_id: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          allowed_project_ids: string[] | null
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
          created_at: string
          id: string
          ip_address: string | null
          is_active: boolean
          login_at: string
          logout_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          login_at?: string
          logout_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          login_at?: string
          logout_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_productions: {
        Row: {
          created_at: string
          house_ids: number[]
          houses_count: number
          id: string
          is_initial_database: boolean
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
        }
        Insert: {
          created_at?: string
          house_ids?: number[]
          houses_count?: number
          id?: string
          is_initial_database?: boolean
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
        }
        Update: {
          created_at?: string
          house_ids?: number[]
          houses_count?: number
          id?: string
          is_initial_database?: boolean
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
        }
        Relationships: [
          {
            foreignKeyName: "weekly_productions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      check_legacy_data_status: { Args: never; Returns: Json }
      clone_planning_version: {
        Args: { p_new_name: string; p_source_version_id: string }
        Returns: string
      }
      close_labor_measurement: {
        Args: { p_contract_id: string; p_house_ids: number[]; p_notes?: string }
        Returns: undefined
      }
      close_measurement: {
        Args: { p_measurement_id: string; p_notes?: string }
        Returns: Json
      }
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
      estimate_service_duration_days: {
        Args: {
          p_planned_houses: number
          p_productivity_expected: number
          p_teams_expected: number
        }
        Returns: number
      }
      generate_measurement_risk_alert: {
        Args: { p_measurement_id: string; p_new_risk: string }
        Returns: undefined
      }
      generate_service_risk_alert: {
        Args: { p_new_risk: string; p_service_id: string }
        Returns: undefined
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
      get_measurement_vs_planning: {
        Args: { p_measurement_id: string }
        Returns: Json
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
      get_supply_kpis: { Args: { p_project_id: string }; Returns: Json }
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
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_house_in_active_measurement: {
        Args: { p_company_id: string; p_house_id: string; p_project_id: string }
        Returns: boolean
      }
      is_system_admin: { Args: { _user_id: string }; Returns: boolean }
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
      migrate_orphan_data_to_company: {
        Args: { target_company_id: string }
        Returns: Json
      }
      promote_to_system_admin: { Args: { admin_email: string }; Returns: Json }
      recalc_alerts_for_measurement: {
        Args: { p_measurement_id: string }
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
      recalculate_service_cost: {
        Args: { p_service_id: string }
        Returns: number
      }
      recalculate_service_forecast: {
        Args: { p_service_id: string }
        Returns: undefined
      }
      recalculate_service_real_results: {
        Args: { p_service_id: string }
        Returns: undefined
      }
      recalculate_supply_risk: {
        Args: { p_service_id: string }
        Returns: undefined
      }
      regenerate_supply_alerts: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      reopen_measurement: {
        Args: { p_measurement_id: string; p_reason: string }
        Returns: Json
      }
      resolve_risk_alert: {
        Args: { p_alert_id: string; p_resolved_by?: string }
        Returns: undefined
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
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer"
      delivery_status:
        | "em_vistoria"
        | "entrega_agendada"
        | "entregue_sem_pendencias"
        | "entregue_com_pendencias"
        | "pos_obra_em_atendimento"
        | "unidade_encerrada"
      issue_severity: "critica" | "media" | "leve"
      issue_status:
        | "aberta"
        | "em_execucao"
        | "aguardando_validacao"
        | "encerrada"
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
      app_role: ["admin", "editor", "viewer"],
      delivery_status: [
        "em_vistoria",
        "entrega_agendada",
        "entregue_sem_pendencias",
        "entregue_com_pendencias",
        "pos_obra_em_atendimento",
        "unidade_encerrada",
      ],
      issue_severity: ["critica", "media", "leve"],
      issue_status: [
        "aberta",
        "em_execucao",
        "aguardando_validacao",
        "encerrada",
      ],
      system_role: ["system_admin", "admin", "user"],
    },
  },
} as const
