 import { Package, RefreshCw } from 'lucide-react';
 import { Card, CardContent } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
import { useConstruction } from '@/contexts/ConstructionContext';
 import { useMeasurementSupplies } from './hooks/useMeasurementSupplies';
 import { MeasurementsList } from './MeasurementsList';
 import { MeasurementSupplyDetail } from './MeasurementSupplyDetail';

export function SupplyRequestsView() {
  const { currentProject } = useConstruction();
  const projectId = currentProject?.id;

  useEffect(() => {
    console.log("[MOUNT] SupplyRequestsView mounted");
    return () => console.log("[UNMOUNT] SupplyRequestsView unmounted");
  }, []);

  const {
     measurements,
     selectedMeasurement,
     requests,
     kpis,
    isLoading,
     isLoadingRequests,
     loadMeasurements,
     loadMeasurementRequests,
     selectMeasurement,
     generateForMeasurement,
    getGroupedByFamily,
   } = useMeasurementSupplies(projectId);

  if (!projectId) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Selecione uma Obra</h3>
          <p className="text-muted-foreground mt-2">
            Escolha uma obra para visualizar o painel de suprimentos.
          </p>
        </CardContent>
      </Card>
    );
  }

   // If a measurement is selected, show detail view
   if (selectedMeasurement) {
     return (
       <MeasurementSupplyDetail
         projectId={projectId}
         measurement={selectedMeasurement}
         requests={requests}
         kpis={kpis}
         isLoading={isLoadingRequests}
         onBack={() => selectMeasurement(null)}
         onRefresh={() => loadMeasurementRequests(selectedMeasurement.measurement_id)}
         onGenerate={() => generateForMeasurement(selectedMeasurement.measurement_id)}
         getGroupedByFamily={getGroupedByFamily}
       />
     );
   }
 
   // Main view: list of measurements
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Suprimentos</h2>
          <p className="text-muted-foreground">
             Selecione uma medição para gerenciar os materiais
          </p>
        </div>
         <Button 
           variant="outline" 
           onClick={() => loadMeasurements()}
           disabled={isLoading}
         >
           <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
           Atualizar
         </Button>
      </div>

       {/* Measurements List */}
       <MeasurementsList
         measurements={measurements}
         selectedMeasurement={selectedMeasurement}
         onSelect={selectMeasurement}
         isLoading={isLoading}
       />
    </div>
  );
}
