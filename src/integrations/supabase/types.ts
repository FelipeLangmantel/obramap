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
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
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
          created_at: string
          display_order: number
          icon: string | null
          id: string
          lead_time_days: number
          name: string
          project_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          lead_time_days?: number
          name: string
          project_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          lead_time_days?: number
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_families_project_id_fkey"
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
          color: string
          created_at: string
          depends_on: string | null
          duration_days: number | null
          id: string
          name: string
          planned_productivity: number
          planned_teams: number
          project_id: string
          sequence_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          depends_on?: string | null
          duration_days?: number | null
          id?: string
          name: string
          planned_productivity?: number
          planned_teams?: number
          project_id: string
          sequence_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          depends_on?: string | null
          duration_days?: number | null
          id?: string
          name?: string
          planned_productivity?: number
          planned_teams?: number
          project_id?: string
          sequence_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_stages_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "planning_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_teams: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          project_id: string
          stage_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          project_id: string
          stage_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
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
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          display_name: string
          email: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
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
        Relationships: []
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
      admin_exists: { Args: never; Returns: boolean }
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
    },
  },
} as const
