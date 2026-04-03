import { useState } from 'react';
import { Clock, Save, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MaterialFamily, ProjectLeadTime } from './types';
import { toast } from 'sonner';

interface LeadTimeConfigProps {
  families: MaterialFamily[];
  projectLeadTimes: ProjectLeadTime[];
  canEdit: boolean;
  onSave: (familyId: string, leadTimeDays: number) => Promise<void>;
}

export function LeadTimeConfig({ families, projectLeadTimes, canEdit, onSave }: LeadTimeConfigProps) {
  const [editingValues, setEditingValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const getLeadTimeForFamily = (familyId: string): number => {
    const projectLeadTime = projectLeadTimes.find(lt => lt.family_id === familyId);
    if (projectLeadTime) return projectLeadTime.lead_time_days;
    
    const family = families.find(f => f.id === familyId);
    return family?.lead_time_days || 7;
  };

  const isCustomized = (familyId: string): boolean => {
    return projectLeadTimes.some(lt => lt.family_id === familyId);
  };

  const handleValueChange = (familyId: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      setEditingValues(prev => ({ ...prev, [familyId]: numValue }));
    }
  };

  const handleSave = async (familyId: string) => {
    const value = editingValues[familyId];
    if (value === undefined) return;
    
    setSaving(familyId);
    try {
      await onSave(familyId, value);
      setEditingValues(prev => {
        const next = { ...prev };
        delete next[familyId];
        return next;
      });
    } finally {
      setSaving(null);
    }
  };

  const getCurrentValue = (familyId: string): number => {
    if (editingValues[familyId] !== undefined) {
      return editingValues[familyId];
    }
    return getLeadTimeForFamily(familyId);
  };

  const hasChanges = (familyId: string): boolean => {
    if (editingValues[familyId] === undefined) return false;
    return editingValues[familyId] !== getLeadTimeForFamily(familyId);
  };

  // Filter to show only material families (not labor)
  const materialFamilies = families.filter(f => !f.is_labor);

  // Count families without custom lead time
  const unconfiguredCount = materialFamilies.filter(f => !isCustomized(f.id)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Lead Time por Família
        </CardTitle>
        <CardDescription>
          Configure o tempo de antecedência para pedidos de cada família de materiais nesta obra
        </CardDescription>
      </CardHeader>
      <CardContent>
        {unconfiguredCount > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>{unconfiguredCount} família(s)</strong> usando lead time padrão. 
              Configure valores específicos para esta obra.
            </div>
          </div>
        )}

        {materialFamilies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma família de materiais cadastrada.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Família</TableHead>
                <TableHead className="w-[150px]">Lead Time (dias)</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                {canEdit && <TableHead className="w-[100px]">Ação</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {materialFamilies.map(family => (
                <TableRow key={family.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: family.color || '#9ca3af' }}
                      />
                      <span>{family.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={getCurrentValue(family.id)}
                        onChange={(e) => handleValueChange(family.id, e.target.value)}
                        className="w-24"
                      />
                    ) : (
                      <span>{getCurrentValue(family.id)} dias</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isCustomized(family.id) ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Personalizado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        Padrão
                      </Badge>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      {hasChanges(family.id) && (
                        <Button
                          size="sm"
                          onClick={() => handleSave(family.id)}
                          disabled={saving === family.id}
                        >
                          {saving === family.id ? (
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-1" />
                              Salvar
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
