import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, TrendingUp } from "lucide-react";
import { ServiceProductivityView } from "@/components/productivity/ServiceProductivityView";
import { ProductivityHistoryView } from "@/components/productivity/ProductivityHistoryView";

/**
 * Container que une o cadastro de produtividade planejada (equipes)
 * com o histórico real de RUP calculado a partir dos diários.
 */
export function ProductivityModule() {
  return (
    <Tabs defaultValue="planejada" className="flex-1 flex flex-col h-full">
      <div className="px-4 sm:px-6 pt-4">
        <TabsList className="w-fit">
          <TabsTrigger value="planejada" className="gap-1.5">
            <Users className="h-4 w-4" />
            Equipes & Produtividade Planejada
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            Histórico de RUP
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="planejada" className="flex-1 mt-2 overflow-auto">
        <ServiceProductivityView />
      </TabsContent>

      <TabsContent value="historico" className="flex-1 mt-2 overflow-auto">
        <ProductivityHistoryView />
      </TabsContent>
    </Tabs>
  );
}
