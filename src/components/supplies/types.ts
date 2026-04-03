// Types for JIT Supply Management - Backend-Driven

export interface MaterialFamily {
  id: string;
  name: string;
  color: string | null;
  is_labor: boolean;
  lead_time_days: number;
  company_id: string | null;
  project_id: string | null;
}

export interface ProjectLeadTime {
  id: string;
  project_id: string;
  family_id: string;
  lead_time_days: number;
  family?: MaterialFamily;
}

export interface ScopeItem {
  id: string;
  name: string;
  category: 'material' | 'labor' | 'equipment';
  quantity: number;
  unit: string;
  unit_value: number;
  scope_id: string;
  macro_id: string;
  material_family?: string;
}

export interface SupplyAlert {
  id: string;
  project_id: string;
  measurement_id: string | null;
  family_id: string | null;
  scope_id: string | null;
  macro_id: string | null;
  scope_item_id: string | null;
  is_labor: boolean;
  week_start: string | null;
  week_end: string | null;
  required_date: string;
  order_by_date: string;
  planned_use_date: string | null;
  actual_delivery_date: string | null;
  delay_days: number;
  is_critical: boolean;
  status: SupplyAlertStatus;
  total_quantity: number;
  total_value: number;
  notes: string | null;
  quotation_id: string | null;
  purchase_order_id: string | null;
  created_at: string;
  updated_at: string;
  family?: MaterialFamily;
  scope_item?: ScopeItem;
  measurement?: {
    id: string;
    measurement_number: number;
    start_date: string;
    end_date: string;
    status: string;
  };
}

// Backend-driven KPIs (from get_supply_kpis RPC)
export interface SupplyKPIs {
  delayed_orders: number;
  on_time_delivered: number;
  late_delivered: number;
  critical_purchases: number;
  planned_without_order: number;
  avg_delay_days: number;
  production_stopped: number;
  total_pending_value: number;
  next_order_date: string | null;
}

// Legacy KPI interface for backward compatibility
export interface LegacySupplyKPIs {
  pendingAlerts: number;
  delayedAlerts: number;
  orderedAlerts: number;
  deliveredAlerts: number;
  nextOrderDate: string | null;
  avgDelayDays: number;
  totalPendingValue: number;
  onTimeDeliveryRate: number;
}

export interface ProductionImpact {
  alertId: string;
  familyName: string;
  affectedHouses: number;
  affectedServices: string[];
  delayDays: number;
}

export type SupplyAlertStatus = 'pending' | 'quoted' | 'approved' | 'ordered' | 'in_transit' | 'delivered' | 'contracted' | 'delayed';

export const ALERT_STATUS_LABELS: Record<SupplyAlertStatus, string> = {
  pending: 'Pendente',
  quoted: 'Cotado',
  approved: 'Aprovado',
  ordered: 'Pedido',
  in_transit: 'Em Trânsito',
  delivered: 'Entregue',
  contracted: 'Contratado',
  delayed: 'Atrasado'
};

export const ALERT_STATUS_COLORS: Record<SupplyAlertStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
  quoted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  approved: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  ordered: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  in_transit: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  contracted: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  delayed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

// Measurement status for backend validation
export type MeasurementStatus = 'planned' | 'in_progress' | 'executed' | 'closed';

export const MEASUREMENT_STATUS_LABELS: Record<MeasurementStatus, string> = {
  planned: 'Planejada',
  in_progress: 'Em Andamento',
  executed: 'Executada',
  closed: 'Fechada'
};
