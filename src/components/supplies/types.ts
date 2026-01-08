// Types for JIT Supply Management

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
  status: 'pending' | 'quoted' | 'approved' | 'ordered' | 'in_transit' | 'delivered' | 'contracted' | 'delayed';
  total_quantity: number;
  total_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  family?: MaterialFamily;
  scope_item?: ScopeItem;
  measurement?: {
    id: string;
    measurement_number: number;
    start_date: string;
    end_date: string;
  };
}

export interface SupplyKPIs {
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
  pending: 'bg-yellow-500',
  quoted: 'bg-blue-400',
  approved: 'bg-blue-600',
  ordered: 'bg-purple-500',
  in_transit: 'bg-orange-500',
  delivered: 'bg-green-500',
  contracted: 'bg-teal-500',
  delayed: 'bg-red-500'
};
