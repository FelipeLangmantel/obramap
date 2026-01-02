export interface PlanningStage {
  id: string;
  project_id: string;
  name: string;
  sequence_order: number;
  planned_productivity: number;
  planned_teams: number;
  duration_days: number | null;
  depends_on: string | null;
  latency_days: number;
  color: string;
  is_baseline: boolean;
  baseline_created_at: string | null;
  created_at: string;
  updated_at: string;
  // Linked to existing macro
  macro_id?: string;
  // Linked to scope for service-level planning
  scope_id?: string;
  is_service_level: boolean;
  // Track already completed units at planning start
  completed_units_at_start: number;
  version_id?: string;
}

export interface PlanningTeam {
  id: string;
  project_id: string;
  stage_id: string;
  name: string;
  is_active: boolean;
  professionals_count: number;
  helpers_count: number;
  created_at: string;
}

export interface TeamComposition {
  professionals: number;
  helpers: number;
}

export interface ProductivityTemplate {
  id: string;
  project_id: string | null;
  stage_name: string;
  default_productivity: number;
  unit: string;
  source: 'manual' | 'historical' | 'calculated' | 'template';
  sample_count: number;
  created_at: string;
  updated_at: string;
}

export interface DailyWorkLog {
  id: string;
  project_id: string;
  stage_id: string;
  team_id: string | null;
  log_date: string;
  units_completed: number;
  house_ids: number[];
  notes: string | null;
  weather: 'sol' | 'nublado' | 'chuva' | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanningAlert {
  id: string;
  project_id: string;
  stage_id: string | null;
  alert_type: 'rhythm_break' | 'bottleneck' | 'team_conflict' | 'delay_risk';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  impact_days: number | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface PlanningSimulation {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  simulation_data: SimulationData;
  results: SimulationResults | null;
  is_applied: boolean;
  applied_at: string | null;
  applied_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SimulationData {
  type: 'add_team' | 'remove_team' | 'change_sequence' | 'change_productivity';
  stage_id?: string;
  team_count_delta?: number;
  new_sequence?: string[];
  new_productivity?: number;
}

export interface SimulationResults {
  original_end_date: string;
  simulated_end_date: string;
  days_impact: number;
  cost_impact?: number;
}

export interface PlanningBaseline {
  id: string;
  project_id: string;
  name: string;
  version_number: number;
  baseline_data: BaselineData;
  created_at: string;
  created_by: string | null;
}

export interface BaselineData {
  stages: PlanningStage[];
  teams: PlanningTeam[];
  projected_end_date: string;
  total_duration_days: number;
}

export interface GanttTask {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  color: string;
  isCritical: boolean;
  status: 'planned' | 'in_progress' | 'at_risk' | 'delayed' | 'completed';
  dependencies: string[];
}

export interface LineOfBalancePoint {
  stageId: string;
  stageName: string;
  teamId: string;
  teamName: string;
  color: string;
  plannedLine: { x: Date; y: number }[];
  actualLine: { x: Date; y: number }[];
}

export interface ProductivityMetrics {
  stageId: string;
  stageName: string;
  plannedProductivity: number;
  actualProductivity: number;
  variance: number;
  variancePercent: number;
}

export interface StageConfigInput {
  macroId: string;
  macroName: string;
  color: string;
  planned_productivity: number;
  planned_teams: number;
  team_composition: TeamComposition;
  depends_on: string | null;
  latency_days: number;
  sequence_order: number;
  // For service-level planning
  scopeId?: string;
  scopeName?: string;
  isServiceLevel: boolean;
  // Completed units at start
  completedUnitsAtStart: number;
}

export interface PlanningVersion {
  id: string;
  project_id: string;
  version_number: number;
  name: string;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface CompletedUnitsInfo {
  macroId: string;
  macroName: string;
  completedUnits: number;
  totalHouseIds: number[];
}
