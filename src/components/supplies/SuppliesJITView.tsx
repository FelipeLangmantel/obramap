import { Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useConstruction } from '@/contexts/ConstructionContext';
import { SupplyRequestsView } from './SupplyRequestsView';

export function SuppliesJITView() {
  const { currentProject } = useConstruction();
  const projectId = currentProject?.id;

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

  // Use the new status-based view
  return <SupplyRequestsView />;
}
