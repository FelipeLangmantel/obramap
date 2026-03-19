import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useSupplyOverdueCount(projectId: string | null | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setCount(0);
      return;
    }
    supabase
      .from('supply_requests')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('purchase_overdue', true)
      .not('status', 'in', '(ordered,delivered,cancelled)')
      .then(({ count: c }) => setCount(c || 0));
  }, [projectId]);

  return count;
}
