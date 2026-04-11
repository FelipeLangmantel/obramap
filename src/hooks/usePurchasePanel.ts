import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, isToday, isBefore, startOfDay, addDays } from "date-fns";
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

export interface CompanySupplyKPIs {
  total_pending: number;
  total_critical: number;
  total_overdue: number;
  total_in_transit: number;
  total_pending_value: number;
}

const FINISHED_STATUSES = ["delivered", "cancelled"];

export function usePurchasePanel() {
  const { company } = useAuth();
  const companyId = company?.id;

  const [alerts, setAlerts] = useState<PurchaseAlert[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [companyKpis, setCompanyKpis] = useState<CompanySupplyKPIs | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // IMPORTANT 4: today updates at midnight
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const now = new Date();
    const msToMidnight = startOfDay(addDays(now, 1)).getTime() - now.getTime();
    const timer = setTimeout(() => setToday(startOfDay(new Date())), msToMidnight);
    return () => clearTimeout(timer);
  }, [today]);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id")
        .eq("company_id", companyId);

      const projectIds = (projectsData || []).map((p: any) => p.id);

      if (projectIds.length === 0) {
        setAlerts([]); setRequests([]); setOrders([]); setCompanyKpis(null);
        setIsLoading(false);
        return;
      }

      // Fetch all data + company KPIs in parallel
      const [requestsRes, ordersRes, kpisRes] = await Promise.all([
        supabase
          .from("supply_requests")
          .select(`
            id, project_id, item_name, item_unit, item_id, quantity, unit_value,
            total_value, status, required_date, order_by_date, is_critical,
            supplier_id, family_id, purchase_overdue, days_overdue,
            projects(name),
            suppliers(name),
            material_families(name, color)
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

        supabase.rpc("get_company_supply_kpis", { p_company_id: companyId }),
      ]);

      // Fetch scope_item codes for requests that have item_id
      let scopeItemCodes: Record<string, string> = {};
      if (requestsRes.data) {
        const itemIds = requestsRes.data
          .map((r: any) => r.item_id)
          .filter((id: string | null): id is string => !!id);
        if (itemIds.length > 0) {
          const uniqueIds = [...new Set(itemIds)];
          const { data: scopeData } = await supabase
            .from("scope_items")
            .select("id, input_code")
            .in("id", uniqueIds);
          if (scopeData) {
            for (const s of scopeData) {
              if (s.input_code) scopeItemCodes[s.id] = s.input_code;
            }
          }
        }
      }

      if (requestsRes.data) {
        const mappedRequests = requestsRes.data.map((r: any) => ({
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
          family_name: r.material_families?.name || null,
          family_color: r.material_families?.color || null,
          scope_item_code: r.scope_items?.input_code || null,
          purchase_overdue: r.purchase_overdue ?? false,
          days_overdue: r.days_overdue ?? 0,
        }));
        setRequests(mappedRequests);

        // Derive alerts from supply_requests for panel KPIs/calendar/critical views
        setAlerts(
          mappedRequests.map((r: any) => ({
            id: r.id,
            project_id: r.project_id,
            project_name: r.project_name,
            required_date: r.required_date,
            order_by_date: r.order_by_date,
            planned_use_date: null,
            actual_delivery_date: null,
            delay_days: r.days_overdue,
            is_critical: r.is_critical,
            status: r.status as SupplyAlertStatus,
            total_quantity: r.quantity,
            total_value: r.total_value,
            notes: null,
            family_name: r.family_name,
            family_color: r.family_color,
            scope_item_name: r.item_name,
            scope_item_code: r.scope_item_code || null,
            scope_item_id: null,
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

      if (kpisRes.data) {
        setCompanyKpis(kpisRes.data as unknown as CompanySupplyKPIs);
      }
    } catch (err) {
      console.error("[PurchasePanel] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  // CRITICAL 2: Realtime subscriptions
  useEffect(() => {
    fetchData();

    if (!companyId) return;

    const channel = supabase
      .channel(`purchase-panel-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "supply_requests" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, companyId]);

  // Client-side fallback calculations (always computed to respect rules of hooks)
  const clientOverdueCount = useMemo(
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

  const clientInTransitCount = useMemo(
    () => orders.filter((o) => o.status === "in_transit").length,
    [orders]
  );

  const clientPendingValue = useMemo(
    () =>
      requests
        .filter((r) => !["delivered", "cancelled"].includes(r.status))
        .reduce((sum, r) => sum + r.total_value, 0),
    [requests]
  );

  // Use server KPIs when available, fallback to client calculations
  const overdueCount = companyKpis?.total_overdue ?? clientOverdueCount;
  const inTransitCount = companyKpis?.total_in_transit ?? clientInTransitCount;
  const totalPendingValue = companyKpis?.total_pending_value ?? clientPendingValue;

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
    companyKpis,
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
