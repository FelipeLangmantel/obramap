import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addDays, differenceInDays } from "date-fns";

// Types
interface PlannedProduction {
  id: string;
  project_id: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  planned_houses: number;
  planned_house_ids: number[];
  week_start: string;
  week_end: string;
  measurement_number?: number;
}

interface ScopeItem {
  id: string;
  name: string;
  category: 'material' | 'labor' | 'equipment';
  quantity: number;
  unit: string;
  unit_value: number;
  scope_id: string;
  scope_name?: string;
  macro_id: string;
  macro_name?: string;
  material_family: string | null;
}

interface ScopeCost {
  id: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  material_cost: number;
  labor_cost: number;
  equipment_cost: number;
}

interface MaterialFamily {
  id: string;
  name: string;
  color: string;
  lead_time_days: number;
}

interface Input {
  id: string;
  name: string;
  stock_quantity: number;
  category: string;
}

interface LaborContract {
  id: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  contracted_houses: number;
  executed_houses: number;
  unit_value: number;
  status: string;
}

// Alert types
export interface MaterialAlertItem {
  id: string;
  name: string;
  totalQuantity: number;
  stockQuantity: number;
  needQuantity: number;
  unit: string;
  unitValue: number;
  totalValue: number;
  houseIds: number[];
  scopeName: string;
  macroName: string;
}

export interface MaterialAlert {
  familyId: string;
  familyName: string;
  familyColor: string;
  leadTimeDays: number;
  priority: 'urgent' | 'warning' | 'info';
  dueDate: Date;
  daysUntilDue: number;
  totalValue: number;
  items: MaterialAlertItem[];
}

export interface LaborAlert {
  id: string;
  type: 'urgent' | 'warning' | 'info';
  message: string;
  scopeId: string;
  scopeName: string;
  macroId: string;
  macroName: string;
  plannedHouses: number;
  contractedHouses: number;
  executedHouses: number;
  unitValue: number;
  dueDate: Date;
  hasContract: boolean;
  needsRenewal: boolean;
  needsNewContract: boolean;
  weekStart: string;
  weekEnd: string;
}

interface SupplyAlertsResult {
  materialAlerts: MaterialAlert[];
  laborAlerts: LaborAlert[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  totalMaterialsValue: number;
  totalLaborValue: number;
}

/**
 * Hook para calcular alertas de suprimentos baseado no planejamento
 * 
 * REGRAS:
 * 1. Busca todas as produções planejadas (planned_productions) do projeto
 * 2. Para cada produção planejada, busca os itens do orçamento (scope_items) 
 *    correspondentes pelo macro_name + scope_name (não pelo ID)
 * 3. Calcula quantidades: quantidade_unitária × número_casas_planejadas
 * 4. Consolida materiais por família e soma quantidades iguais
 * 5. Gera alertas baseados no lead time de cada família
 * 6. Gera alertas de mão de obra baseados nos contratos existentes
 */
export function useSupplyAlerts(projectId: string | undefined): SupplyAlertsResult {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Raw data
  const [plannedProductions, setPlannedProductions] = useState<PlannedProduction[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [scopeCosts, setScopeCosts] = useState<ScopeCost[]>([]);
  const [materialFamilies, setMaterialFamilies] = useState<MaterialFamily[]>([]);
  const [inputs, setInputs] = useState<Input[]>([]);
  const [laborContracts, setLaborContracts] = useState<LaborContract[]>([]);
  const [executedProductions, setExecutedProductions] = useState<Record<string, number[]>>({});

  // Normalize string for comparison
  const normalizeString = (str: string): string => {
    return str.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch all data in parallel
      const [
        plannedRes,
        scopeItemsRes,
        scopeCostsRes,
        familiesRes,
        inputsRes,
        contractsRes,
        weeklyProdRes
      ] = await Promise.all([
        // Future planned productions only
        supabase
          .from('planned_productions')
          .select('*')
          .eq('project_id', projectId)
          .gte('week_start', today),
        
        // All scope items (budget)
        supabase
          .from('scope_items')
          .select('*')
          .eq('project_id', projectId),
        
        // Scope costs for name mapping
        supabase
          .from('scope_costs')
          .select('*')
          .eq('project_id', projectId),
        
        // Material families with lead times
        supabase
          .from('material_families')
          .select('*')
          .eq('project_id', projectId)
          .order('display_order'),
        
        // Inputs for stock quantities
        supabase
          .from('inputs')
          .select('id, name, stock_quantity, category')
          .eq('project_id', projectId),
        
        // Labor contracts
        supabase
          .from('labor_contracts')
          .select('*')
          .eq('project_id', projectId),
        
        // Weekly productions (executed) - non-initial only
        supabase
          .from('weekly_productions')
          .select('scope_id, scope_name, macro_name, house_ids, is_initial_database')
          .eq('project_id', projectId)
          .eq('is_initial_database', false)
      ]);

      if (plannedRes.error) throw plannedRes.error;
      if (scopeItemsRes.error) throw scopeItemsRes.error;
      if (scopeCostsRes.error) throw scopeCostsRes.error;
      if (familiesRes.error) throw familiesRes.error;
      if (inputsRes.error) throw inputsRes.error;
      if (contractsRes.error) throw contractsRes.error;
      if (weeklyProdRes.error) throw weeklyProdRes.error;

      setPlannedProductions(plannedRes.data as PlannedProduction[]);
      setScopeItems((scopeItemsRes.data || []).map(item => ({
        ...item,
        category: item.category as 'material' | 'labor' | 'equipment'
      })));
      setScopeCosts(scopeCostsRes.data || []);
      setMaterialFamilies((familiesRes.data || []).map(f => ({
        id: f.id,
        name: f.name,
        color: f.color || '#9ca3af',
        lead_time_days: f.lead_time_days || 7
      })));
      setInputs(inputsRes.data || []);
      setLaborContracts(contractsRes.data || []);

      // Build executed houses map by scope_name + macro_name
      const executed: Record<string, number[]> = {};
      (weeklyProdRes.data || []).forEach(wp => {
        const key = `${normalizeString(wp.macro_name)}|${normalizeString(wp.scope_name)}`;
        if (!executed[key]) executed[key] = [];
        executed[key].push(...(wp.house_ids || []));
      });
      setExecutedProductions(executed);

    } catch (err) {
      console.error('Error fetching supply alerts data:', err);
      setError('Erro ao carregar dados de alertas');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Fetch on mount and when projectId changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`supply-alerts-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'planned_productions',
          filter: `project_id=eq.${projectId}`
        },
        () => {
          console.log('Planned productions changed, refetching alerts...');
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scope_items',
          filter: `project_id=eq.${projectId}`
        },
        () => {
          console.log('Scope items changed, refetching alerts...');
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'labor_contracts',
          filter: `project_id=eq.${projectId}`
        },
        () => {
          console.log('Labor contracts changed, refetching alerts...');
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weekly_productions',
          filter: `project_id=eq.${projectId}`
        },
        () => {
          console.log('Weekly productions changed, refetching alerts...');
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchData]);

  // Build a map of scope_costs for name lookup (scope_id -> {scopeName, macroName})
  const scopeCostMap = useMemo(() => {
    const map: Record<string, { scopeName: string; macroName: string }> = {};
    scopeCosts.forEach(sc => {
      map[sc.scope_id] = { scopeName: sc.scope_name, macroName: sc.macro_name };
    });
    return map;
  }, [scopeCosts]);

  // Calculate material alerts
  const materialAlerts = useMemo((): MaterialAlert[] => {
    if (plannedProductions.length === 0 || scopeItems.length === 0) {
      return [];
    }

    const today = new Date();
    
    // Build a lookup map: "macroName|scopeName" -> PlannedProduction[]
    const plannedByScope: Record<string, PlannedProduction[]> = {};
    plannedProductions.forEach(pp => {
      const key = `${normalizeString(pp.macro_name)}|${normalizeString(pp.scope_name)}`;
      if (!plannedByScope[key]) plannedByScope[key] = [];
      plannedByScope[key].push(pp);
    });

    // For each scope_item, find matching planned productions
    // Match by: macro_name + scope_name (using scope_costs for name lookup if needed)
    interface MatchedItem {
      item: ScopeItem;
      plannedHouses: number;
      plannedHouseIds: number[];
      weekStart: string;
      macroName: string;
      scopeName: string;
    }

    const matchedItems: MatchedItem[] = [];

    scopeItems
      .filter(item => item.category === 'material')
      .forEach(item => {
        // Get scope/macro names from scope_costs if available
        const costInfo = scopeCostMap[item.scope_id];
        const macroName = costInfo?.macroName || '';
        const scopeName = costInfo?.scopeName || '';

        // Try to match by macro_name + scope_name
        const key = `${normalizeString(macroName)}|${normalizeString(scopeName)}`;
        const matchedPlanned = plannedByScope[key];

        if (matchedPlanned && matchedPlanned.length > 0) {
          // Sum all planned houses and IDs
          const allHouseIds = new Set<number>();
          let earliestWeekStart = matchedPlanned[0].week_start;
          
          matchedPlanned.forEach(pp => {
            pp.planned_house_ids.forEach(id => allHouseIds.add(id));
            if (pp.week_start < earliestWeekStart) {
              earliestWeekStart = pp.week_start;
            }
          });

          matchedItems.push({
            item,
            plannedHouses: allHouseIds.size,
            plannedHouseIds: Array.from(allHouseIds),
            weekStart: earliestWeekStart,
            macroName,
            scopeName
          });
        }
      });

    // Group by material family and consolidate items by name
    const itemsByFamily: Record<string, MatchedItem[]> = {};
    matchedItems.forEach(matched => {
      const familyName = matched.item.material_family || 'Geral';
      if (!itemsByFamily[familyName]) itemsByFamily[familyName] = [];
      itemsByFamily[familyName].push(matched);
    });

    // Create alerts
    const alerts: MaterialAlert[] = [];

    Object.entries(itemsByFamily).forEach(([familyName, items]) => {
      const family = materialFamilies.find(f => normalizeString(f.name) === normalizeString(familyName));
      const leadTimeDays = family?.lead_time_days || 7;

      // Group and sum items by normalized name
      const groupedByName: Record<string, {
        totalQuantity: number;
        stockQuantity: number;
        unit: string;
        unitValue: number;
        houseIds: Set<number>;
        ids: string[];
        originalName: string;
        scopeName: string;
        macroName: string;
        earliestWeekStart: string;
      }> = {};

      items.forEach(matched => {
        const normalizedName = normalizeString(matched.item.name);
        const matchingInput = inputs.find(i => 
          normalizeString(i.name) === normalizedName && i.category === 'material'
        );
        const stockQuantity = matchingInput?.stock_quantity || 0;

        if (!groupedByName[normalizedName]) {
          groupedByName[normalizedName] = {
            totalQuantity: 0,
            stockQuantity,
            unit: matched.item.unit,
            unitValue: matched.item.unit_value,
            houseIds: new Set(),
            ids: [],
            originalName: matched.item.name,
            scopeName: matched.scopeName,
            macroName: matched.macroName,
            earliestWeekStart: matched.weekStart
          };
        }

        // Quantity = unit quantity × number of planned houses
        groupedByName[normalizedName].totalQuantity += matched.item.quantity * matched.plannedHouses;
        groupedByName[normalizedName].ids.push(matched.item.id);
        matched.plannedHouseIds.forEach(h => groupedByName[normalizedName].houseIds.add(h));
        
        // Keep the highest unit value
        if (matched.item.unit_value > groupedByName[normalizedName].unitValue) {
          groupedByName[normalizedName].unitValue = matched.item.unit_value;
        }
        
        // Keep earliest week start
        if (matched.weekStart < groupedByName[normalizedName].earliestWeekStart) {
          groupedByName[normalizedName].earliestWeekStart = matched.weekStart;
        }
      });

      // Convert to alert items
      const alertItems: MaterialAlertItem[] = Object.values(groupedByName)
        .map(data => {
          const needQuantity = Math.max(0, data.totalQuantity - data.stockQuantity);
          return {
            id: data.ids.join(','),
            name: data.originalName,
            totalQuantity: data.totalQuantity,
            stockQuantity: data.stockQuantity,
            needQuantity,
            unit: data.unit,
            unitValue: data.unitValue,
            totalValue: needQuantity * data.unitValue,
            houseIds: Array.from(data.houseIds),
            scopeName: data.scopeName,
            macroName: data.macroName
          };
        })
        .filter(item => item.needQuantity > 0); // Only items that need purchasing

      if (alertItems.length === 0) return;

      // Due date based on earliest planned production minus lead time
      const earliestWeekStart = items
        .map(i => i.weekStart)
        .sort()[0];
      
      const dueDate = earliestWeekStart
        ? addDays(new Date(earliestWeekStart), -leadTimeDays)
        : addDays(today, leadTimeDays);

      const daysUntilDue = differenceInDays(dueDate, today);

      // Priority based on days until due
      let priority: 'urgent' | 'warning' | 'info' = 'info';
      if (daysUntilDue <= 3) priority = 'urgent';
      else if (daysUntilDue <= 7) priority = 'warning';

      const totalValue = alertItems.reduce((sum, item) => sum + item.totalValue, 0);

      alerts.push({
        familyId: family?.id || familyName,
        familyName: family?.name || familyName,
        familyColor: family?.color || '#9ca3af',
        leadTimeDays,
        priority,
        dueDate,
        daysUntilDue,
        totalValue,
        items: alertItems
      });
    });

    // Sort by priority (most urgent first)
    return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }, [plannedProductions, scopeItems, scopeCostMap, materialFamilies, inputs]);

  // Calculate labor alerts
  const laborAlerts = useMemo((): LaborAlert[] => {
    if (plannedProductions.length === 0) {
      return [];
    }

    const today = new Date();
    const alerts: LaborAlert[] = [];

    // Get unique scope+macro combinations from planned productions
    const plannedScopes = new Map<string, PlannedProduction[]>();
    plannedProductions.forEach(pp => {
      const key = `${normalizeString(pp.macro_name)}|${normalizeString(pp.scope_name)}`;
      if (!plannedScopes.has(key)) {
        plannedScopes.set(key, []);
      }
      plannedScopes.get(key)!.push(pp);
    });

    // For each planned scope, check if there's a labor contract
    plannedScopes.forEach((productions, key) => {
      const firstProd = productions[0];
      
      // Calculate total planned houses for this scope
      const allHouseIds = new Set<number>();
      let earliestWeekStart = firstProd.week_start;
      let latestWeekEnd = firstProd.week_end;
      
      productions.forEach(pp => {
        pp.planned_house_ids.forEach(id => allHouseIds.add(id));
        if (pp.week_start < earliestWeekStart) earliestWeekStart = pp.week_start;
        if (pp.week_end > latestWeekEnd) latestWeekEnd = pp.week_end;
      });

      const plannedHouses = allHouseIds.size;

      // Find labor contract by macro_name + scope_name
      const contract = laborContracts.find(c => {
        const contractKey = `${normalizeString(c.macro_name)}|${normalizeString(c.scope_name)}`;
        return contractKey === key && c.status === 'active';
      });

      // Get executed houses for this scope
      const executedHouseIds = executedProductions[key] || [];
      const executedHouses = [...new Set(executedHouseIds)].length;

      // Find scope items with labor for unit value
      const costInfo = scopeCosts.find(sc => {
        const scKey = `${normalizeString(sc.macro_name)}|${normalizeString(sc.scope_name)}`;
        return scKey === key;
      });
      const laborUnitValue = costInfo?.labor_cost || contract?.unit_value || 0;

      // Determine alert type
      let alertType: 'urgent' | 'warning' | 'info' = 'info';
      let needsRenewal = false;
      let needsNewContract = false;
      let message = '';

      if (contract) {
        const remainingContracted = contract.contracted_houses - executedHouses;
        
        if (remainingContracted <= 0) {
          // Contract exhausted
          alertType = 'urgent';
          needsRenewal = true;
          message = `Contrato de mão de obra para "${firstProd.scope_name}" precisa ser renovado (${executedHouses}/${contract.contracted_houses} casas executadas)`;
        } else if (remainingContracted < plannedHouses) {
          // Contract will run out
          alertType = 'warning';
          needsRenewal = true;
          message = `Contrato de mão de obra para "${firstProd.scope_name}" será insuficiente (${remainingContracted} restantes, ${plannedHouses} planejadas)`;
        } else {
          // Contract sufficient - don't generate alert
          return;
        }
      } else {
        // No contract exists
        alertType = 'warning';
        needsNewContract = true;
        message = `Contratar mão de obra para "${firstProd.scope_name}" (${plannedHouses} casas planejadas)`;
      }

      const dueDate = addDays(new Date(earliestWeekStart), -7); // 7 days before start

      alerts.push({
        id: `labor-${key}`,
        type: alertType,
        message,
        scopeId: firstProd.scope_id,
        scopeName: firstProd.scope_name,
        macroId: firstProd.macro_id,
        macroName: firstProd.macro_name,
        plannedHouses,
        contractedHouses: contract?.contracted_houses || 0,
        executedHouses,
        unitValue: laborUnitValue,
        dueDate,
        hasContract: !!contract,
        needsRenewal,
        needsNewContract,
        weekStart: earliestWeekStart,
        weekEnd: latestWeekEnd
      });
    });

    // Sort by urgency then due date
    return alerts.sort((a, b) => {
      const priorityOrder = { urgent: 0, warning: 1, info: 2 };
      const priorityDiff = priorityOrder[a.type] - priorityOrder[b.type];
      if (priorityDiff !== 0) return priorityDiff;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });
  }, [plannedProductions, laborContracts, executedProductions, scopeCosts]);

  // Calculate totals
  const totalMaterialsValue = useMemo(() => {
    return materialAlerts.reduce((sum, alert) => sum + alert.totalValue, 0);
  }, [materialAlerts]);

  const totalLaborValue = useMemo(() => {
    return laborAlerts.reduce((sum, alert) => sum + (alert.plannedHouses * alert.unitValue), 0);
  }, [laborAlerts]);

  return {
    materialAlerts,
    laborAlerts,
    isLoading,
    error,
    refetch: fetchData,
    totalMaterialsValue,
    totalLaborValue
  };
}
