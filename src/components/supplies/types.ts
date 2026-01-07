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

export interface Material {
  id: string;
  company_id: string;
  family_id: string | null;
  name: string;
  unit: string;
  unit_value: number;
  family?: MaterialFamily;
}

export interface ServiceMaterial {
  id: string;
  project_id: string;
  macro_id: string;
  scope_id: string;
  material_id: string;
  quantity_per_house: number;
  material?: Material;
}

export interface ProjectLeadTime {
  id: string;
  project_id: string;
  family_id: string;
  lead_time_days: number;
  family?: MaterialFamily;
}

export interface SupplyAlert {
  id: string;
  project_id: string;
  measurement_id: string | null;
  family_id: string;
  required_date: string;
  order_by_date: string;
  status: 'pending' | 'ordered' | 'delivered' | 'delayed';
  total_quantity: number;
  total_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  family?: MaterialFamily;
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

export type SupplyAlertStatus = 'pending' | 'ordered' | 'delivered' | 'delayed';

export const ALERT_STATUS_LABELS: Record<SupplyAlertStatus, string> = {
  pending: 'Pendente',
  ordered: 'Pedido',
  delivered: 'Entregue',
  delayed: 'Atrasado'
};

export const ALERT_STATUS_COLORS: Record<SupplyAlertStatus, string> = {
  pending: 'bg-yellow-500',
  ordered: 'bg-blue-500',
  delivered: 'bg-green-500',
  delayed: 'bg-red-500'
};
