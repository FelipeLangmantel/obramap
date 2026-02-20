 import { Calendar, Package, CheckCircle, AlertTriangle, FileText, ShoppingCart, ChevronRight } from 'lucide-react';
 import { Card, CardContent } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { Progress } from '@/components/ui/progress';
 import { cn } from '@/lib/utils';
 import { format } from 'date-fns';
 import { ptBR } from 'date-fns/locale';
 import { MeasurementSupplySummary } from './hooks/useMeasurementSupplies';
 
 interface MeasurementsListProps {
   measurements: MeasurementSupplySummary[];
   selectedMeasurement: MeasurementSupplySummary | null;
   onSelect: (measurement: MeasurementSupplySummary) => void;
   isLoading: boolean;
 }
 
 const SUPPLY_STATUS_CONFIG = {
   empty: { label: 'Sem Itens', color: 'bg-muted text-muted-foreground', icon: Package },
   pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: AlertTriangle },
   quoted: { label: 'Cotado', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: FileText },
   partial: { label: 'Parcial', color: 'bg-orange-100 text-orange-800 border-orange-300', icon: ShoppingCart },
   complete: { label: 'Completo', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle },
 };
 
 export function MeasurementsList({ 
   measurements, 
   selectedMeasurement, 
   onSelect, 
   isLoading 
 }: MeasurementsListProps) {
   const formatCurrency = (value: number) => {
     return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
   };
 
   const formatDateRange = (start: string, end: string) => {
     const startDate = format(new Date(start), 'dd/MM', { locale: ptBR });
     const endDate = format(new Date(end), 'dd/MM', { locale: ptBR });
     return `${startDate} - ${endDate}`;
   };
 
   if (isLoading) {
     return (
       <div className="space-y-3">
         {[1, 2, 3].map(i => (
           <Card key={i} className="animate-pulse">
             <CardContent className="p-4">
               <div className="h-6 bg-muted rounded w-1/3 mb-2" />
               <div className="h-4 bg-muted rounded w-1/2" />
             </CardContent>
           </Card>
         ))}
       </div>
     );
   }
 
   if (measurements.length === 0) {
    return (
        <Card>
          <CardContent className="py-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">Nenhuma Medição</h3>
            <p className="text-muted-foreground mt-2">
              Aprove períodos no Planejamento de Medições para gerar requisições de suprimentos.
            </p>
          </CardContent>
        </Card>
      );
   }
 
   return (
     <div className="space-y-3">
       {measurements.map(measurement => {
         const isSelected = selectedMeasurement?.measurement_id === measurement.measurement_id;
         const statusConfig = SUPPLY_STATUS_CONFIG[measurement.supply_status];
         const StatusIcon = statusConfig.icon;
 
         return (
           <Card
             key={measurement.measurement_id}
             className={cn(
               'cursor-pointer transition-all hover:shadow-md',
               isSelected && 'ring-2 ring-primary shadow-md'
             )}
             onClick={() => onSelect(measurement)}
           >
             <CardContent className="p-4">
               <div className="flex items-center justify-between">
                 <div className="flex-1">
                   {/* Header */}
                   <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                         <span className="font-semibold text-lg">
                           Medição {measurement.measurement_number}
                         </span>
                     </div>
                     <Badge 
                       variant="outline" 
                       className={cn('text-xs', statusConfig.color)}
                     >
                       <StatusIcon className="h-3 w-3 mr-1" />
                       {statusConfig.label}
                     </Badge>
                   </div>
 
                   {/* Date Range */}
                   <p className="text-sm text-muted-foreground mb-3">
                     {formatDateRange(measurement.start_date, measurement.end_date)}
                   </p>
 
                   {/* Stats */}
                   {measurement.total_items > 0 && (
                     <>
                       <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                         <div className="flex items-center gap-1">
                           <div className="w-2 h-2 rounded-full bg-yellow-500" />
                           <span>{measurement.items_alert} alerta</span>
                         </div>
                         <div className="flex items-center gap-1">
                           <div className="w-2 h-2 rounded-full bg-blue-500" />
                           <span>{measurement.items_quoted} cotado</span>
                         </div>
                         <div className="flex items-center gap-1">
                           <div className="w-2 h-2 rounded-full bg-purple-500" />
                           <span>{measurement.items_ordered} pedido</span>
                         </div>
                         <div className="flex items-center gap-1">
                           <div className="w-2 h-2 rounded-full bg-green-500" />
                           <span>{measurement.items_delivered} entregue</span>
                         </div>
                       </div>
 
                       {/* Progress */}
                       <div className="flex items-center gap-2">
                         <Progress value={measurement.percent_purchased} className="flex-1 h-2" />
                         <span className="text-xs font-medium w-12 text-right">
                           {measurement.percent_purchased}%
                         </span>
                       </div>
 
                       {/* Value */}
                       <div className="flex items-center justify-between mt-2 text-sm">
                         <span className="text-muted-foreground">
                           {measurement.total_items} itens
                         </span>
                         <span className="font-medium">
                           {formatCurrency(measurement.total_value)}
                         </span>
                       </div>
                     </>
                   )}
                 </div>
 
                 <ChevronRight className={cn(
                   'h-5 w-5 text-muted-foreground transition-transform',
                   isSelected && 'transform rotate-90'
                 )} />
               </div>
             </CardContent>
           </Card>
         );
       })}
     </div>
   );
 }