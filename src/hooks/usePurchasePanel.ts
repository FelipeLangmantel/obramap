import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isBefore, startOfDay } from "date-fns";
import type { SupplyAlertStatus } from "@/components/supplies/types";

export interface PurchaseAlert {
  id: string;
  project_id: string;
  project_name: string;
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
  family_name: string | null;
  family_color: string | null;
  scope_item_name: string | null;
  scope_item_code: string | null;
  scope_item_id: string | null;
}

export interface PurchaseRequest {
  id: string;
  project_id: string;
  project_name: string;
  item_name: string;
  item_unit: string | null;
  quantity: number;
  unit_value: number;
  total_value: number;
  status: string;
  required_date: string | null;
  order_by_date: string | null;
  is_critical: boolean;
  supplier_name: string | null;
}

export interface PurchaseOrder {
  id: string;
  project_id: string;
  project_name: string;
  order_number: string | null;
  status: string;
  total_value: number;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  created_at: string;
  supplier_name: string | null;
}

const FINISHED_STATUSES = ["delivered", "contracted"];

export function usePurchasePanel() {
  const { company } = useAuth();
  const companyId = company?.id;

  const [alerts, setAlerts] = useState<PurchaseAlert[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      // Step 1: get all project IDs for this company
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id")
        .eq("company_id", companyId);

      const projectIds = (projectsData || []).map((p: any) => p.id);

      if (projectIds.length === 0) {
        setAlerts([]); setRequests([]); setOrders([]);
        setIsLoading(false);
        return;
      }

      // Step 2: fetch all three tables filtered by project IDs
      const [alertsRes, requestsRes, ordersRes] = await Promise.all([
        supabase
          .from("supply_alerts")
          .select(`
            id, project_id, required_date, order_by_date, planned_use_date,
            actual_delivery_date, delay_days, is_critical, status,
            total_quantity, total_value, notes, family_id, scope_item_id,
            projects(name),
            material_families(name, color),
            scope_items(name, input_code)
          `)
          .in("project_id", projectIds),

        supabase
          .from("supply_requests")
          .select(`
            id, project_id, item_name, item_unit, quantity, unit_value,
            total_value, status, required_date, order_by_date, is_critical,
            supplier_id,
            projects(name),
            suppliers(name)
          `)
          .in("project_id", projectIds),

        supabase
          .from("purchase_orders")
          .select(`
            id, project_id, order_number, status, total_value,
            expected_delivery_date, actual_delivery_date, created_at,
            supplier_id,
            projects(name),
            suppliers(name)
          `)
          .in("project_id", projectIds),
      ]);

      if (alertsRes.data) {
        setAlerts(
          alertsRes.data.map((a: any) => ({
            id: a.id,
            project_id: a.project_id,
            project_name: a.projects?.name || "—",
            required_date: a.required_date,
            order_by_date: a.order_by_date,
            planned_use_date: a.planned_use_date,
            actual_delivery_date: a.actual_delivery_date,
            delay_days: a.delay_days ?? 0,
            is_critical: a.is_critical ?? false,
            status: a.status as SupplyAlertStatus,
            total_quantity: a.total_quantity ?? 0,
            total_value: a.total_value ?? 0,
            notes: a.notes,
            family_name: a.material_families?.name || null,
            family_color: a.material_families?.color || null,
            scope_item_name: a.scope_items?.name || null,
            scope_item_code: a.scope_items?.input_code || null,
            scope_item_id: a.scope_item_id,
          }))
        );
      }

      if (requestsRes.data) {
        setRequests(
          requestsRes.data.map((r: any) => ({
            id: r.id,
            project_id: r.project_id,
            project_name: r.projects?.name || "—",
            item_name: r.item_name,
            item_unit: r.item_unit,
            quantity: r.quantity ?? 0,
            unit_value: r.unit_value ?? 0,
            total_value: r.total_value ?? 0,
            status: r.status,
            required_date: r.required_date,
            order_by_date: r.order_by_date,
            is_critical: r.is_critical ?? false,
            supplier_name: r.suppliers?.name || null,
          }))
        );
      }

      if (ordersRes.data) {
        setOrders(
          ordersRes.data.map((o: any) => ({
            id: o.id,
            project_id: o.project_id,
            project_name: o.projects?.name || "—",
            order_number: o.order_number,
            status: o.status ?? "pending",
            total_value: o.total_value ?? 0,
            expected_delivery_date: o.expected_delivery_date,
            actual_delivery_date: o.actual_delivery_date,
            created_at: o.created_at,
            supplier_name: o.suppliers?.name || null,
          }))
        );
      }
    } catch (err) {
      console.error("[PurchasePanel] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const today = startOfDay(new Date());

  const overdueCount = useMemo(
    () =>
      alerts.filter(
        (a) =>
          !FINISHED_STATUSES.includes(a.status) &&
          a.order_by_date &&
          isBefore(new Date(a.order_by_date), today)
      ).length,
    [alerts, today]
  );

  const todayCount = useMemo(
    () =>
      alerts.filter(
        (a) => a.order_by_date && isToday(new Date(a.order_by_date))
      ).length,
    [alerts]
  );

  const inTransitCount = useMemo(
    () => orders.filter((o) => o.status === "in_transit").length,
    [orders]
  );

  const totalPendingValue = useMemo(
    () =>
      requests
        .filter((r) => !["delivered", "cancelled"].includes(r.status))
        .reduce((sum, r) => sum + r.total_value, 0),
    [requests]
  );

  const criticalAlerts = useMemo(
    () =>
      alerts
        .filter((a) => a.is_critical)
        .sort(
          (a, b) =>
            new Date(a.order_by_date).getTime() -
            new Date(b.order_by_date).getTime()
        ),
    [alerts]
  );

  const calendarMap = useMemo(() => {
    const map = new Map<string, PurchaseAlert[]>();
    for (const a of alerts) {
      if (!a.order_by_date) continue;
      const key = format(new Date(a.order_by_date), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [alerts]);

  // Group alerts by project
  const alertsByProject = useMemo(() => {
    const map = new Map<
      string,
      { projectName: string; alerts: PurchaseAlert[] }
    >();
    for (const a of alerts) {
      if (!map.has(a.project_id)) {
        map.set(a.project_id, { projectName: a.project_name, alerts: [] });
      }
      map.get(a.project_id)!.alerts.push(a);
    }
    return Array.from(map.entries()).map(([projectId, data]) => ({
      projectId,
      ...data,
      pendingCount: data.alerts.filter(
        (al) => !FINISHED_STATUSES.includes(al.status)
      ).length,
      pendingValue: data.alerts
        .filter((al) => !FINISHED_STATUSES.includes(al.status))
        .reduce((s, al) => s + al.total_value, 0),
    }));
  }, [alerts]);

  return {
    alerts,
    requests,
    orders,
    isLoading,
    overdueCount,
    todayCount,
    inTransitCount,
    totalPendingValue,
    criticalAlerts,
    calendarMap,
    alertsByProject,
    refetch: fetchData,
  };
}
