import { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MeasurementSupplyRequest } from './useMeasurementSupplies';

export interface StockEntry {
  id?: string;
  item_id: string;
  item_name: string;
  item_unit: string | null;
  family_id: string | null;
  family_name: string | null;
  quantity_required: number;
  quantity_in_stock: number;
  quantity_to_purchase: number;
  is_confirmed: boolean;
}

export function useMeasurementStock(projectId: string | undefined, currentPlanningPeriodId: string | undefined) {
  const storageKey = useMemo(() => projectId ? `obramap_supply_stock_${projectId}` : null, [projectId]);
  const [stockEntries, setStockEntries] = useState<StockEntry[]>(() => {
    if (!storageKey) return [];
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved ? JSON.parse(saved).stockEntries || [] : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ stockEntries }));
    } catch {
      // noop
    }
  }, [storageKey, stockEntries]);

  // Auto-save to DB with 2s debounce
  useEffect(() => {
    if (!storageKey || stockEntries.length === 0 || !currentPlanningPeriodId || !projectId) return;
    const timer = setTimeout(() => {
      const upsertData = stockEntries.map(e => ({
        ...(e.id ? { id: e.id } : {}),
        project_id: projectId,
        planning_period_id: currentPlanningPeriodId,
        item_id: e.item_id,
        item_name: e.item_name,
        item_unit: e.item_unit,
        family_id: e.family_id,
        family_name: e.family_name,
        quantity_required: e.quantity_required,
        quantity_in_stock: e.quantity_in_stock,
      }));
      supabase
        .from('measurement_stock_entries' as any)
        .upsert(upsertData, { onConflict: 'id' })
        .then(() => {}); // silent
    }, 2000);
    return () => clearTimeout(timer);
  }, [stockEntries, storageKey, currentPlanningPeriodId, projectId]);

  const loadStockEntries = useCallback(async (planningPeriodId: string, requests: MeasurementSupplyRequest[]) => {
    if (!projectId || !planningPeriodId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('measurement_stock_entries' as any)
        .select('*')
        .eq('project_id', projectId)
        .eq('planning_period_id', planningPeriodId);

      if (error) throw error;

      // Build entries: merge existing DB data with current requests
      const existingMap = new Map<string, any>(
        (data || []).map((e: any) => [e.item_id, e])
      );

      // Group requests by item_id summing quantities
      const itemMap = new Map<string, {
        item_id: string;
        item_name: string;
        item_unit: string | null;
        family_id: string | null;
        family_name: string | null;
        quantity_required: number;
      }>();

      for (const req of requests) {
        if (!req.item_id) continue;
        const existing = itemMap.get(req.item_id);
        if (existing) {
          existing.quantity_required += req.quantity || 0;
        } else {
          itemMap.set(req.item_id, {
            item_id: req.item_id,
            item_name: req.item_name,
            item_unit: req.item_unit,
            family_id: req.family_id,
            family_name: req.family_name,
            quantity_required: req.quantity || 0,
          });
        }
      }

      const entries: StockEntry[] = Array.from(itemMap.values()).map(item => {
        const dbEntry = existingMap.get(item.item_id);
        const qty_in_stock = dbEntry ? Number(dbEntry.quantity_in_stock) : 0;
        return {
          id: dbEntry?.id,
          item_id: item.item_id,
          item_name: item.item_name,
          item_unit: item.item_unit,
          family_id: item.family_id,
          family_name: item.family_name,
          quantity_required: item.quantity_required,
          quantity_in_stock: qty_in_stock,
          quantity_to_purchase: Math.max(item.quantity_required - qty_in_stock, 0),
          is_confirmed: dbEntry?.is_confirmed ?? false,
        };
      });

      setStockEntries(entries);
    } catch (error) {
      console.error('Error loading stock entries:', error);
      toast.error('Erro ao carregar estoque');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const updateStockQuantity = useCallback((itemId: string, quantity: number) => {
    setStockEntries(prev => prev.map(e => {
      if (e.item_id !== itemId) return e;
      const qty = Math.max(0, quantity);
      return {
        ...e,
        quantity_in_stock: qty,
        quantity_to_purchase: Math.max(e.quantity_required - qty, 0),
      };
    }));
  }, []);

  const saveStockEntries = useCallback(async (planningPeriodId: string): Promise<boolean> => {
    if (!projectId || !planningPeriodId) return false;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();

      const upsertData = stockEntries.map(e => ({
        id: e.id || undefined,
        project_id: projectId,
        planning_period_id: planningPeriodId,
        item_id: e.item_id,
        item_name: e.item_name,
        item_unit: e.item_unit,
        family_id: e.family_id,
        family_name: e.family_name,
        quantity_required: e.quantity_required,
        quantity_in_stock: e.quantity_in_stock,
        is_confirmed: true,
        confirmed_at: now,
      }));

      const { error } = await supabase
        .from('measurement_stock_entries' as any)
        .upsert(upsertData, { onConflict: 'id' });

      if (error) throw error;

      // Mark all as confirmed locally
      setStockEntries(prev => prev.map(e => ({ ...e, is_confirmed: true })));

      toast.success('Estoque salvo com sucesso! Descontos aplicados automaticamente.');
      return true;
    } catch (error) {
      console.error('Error saving stock entries:', error);
      toast.error('Erro ao salvar estoque');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [projectId, stockEntries]);

  const isConfirmed = stockEntries.length > 0 && stockEntries.every(e => e.is_confirmed);
  const totalInStock = stockEntries.reduce((s, e) => s + e.quantity_in_stock, 0);
  const totalToPurchase = stockEntries.reduce((s, e) => s + e.quantity_to_purchase, 0);

  return {
    stockEntries,
    isLoading,
    isSaving,
    isConfirmed,
    totalInStock,
    totalToPurchase,
    loadStockEntries,
    updateStockQuantity,
    saveStockEntries,
  };
}
