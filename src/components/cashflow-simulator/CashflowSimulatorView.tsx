import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Calendar, Table2, BarChart3, Info } from "lucide-react";
import { useCashflowSimulator } from "@/hooks/useCashflowSimulator";
import { CashflowConfigPanel } from "./CashflowConfigPanel";
import { CashflowCalendarTab } from "./CashflowCalendarTab";
import { CashflowTableTab } from "./CashflowTableTab";
import { CashflowConsolidatedTab } from "./CashflowConsolidatedTab";
import { useConstruction } from "@/contexts/ConstructionContext";
import { formatCurrency } from "./utils";

export default function CashflowSimulatorView() {
  const { currentProject } = useConstruction();
  const simulator = useCashflowSimulator();
  const [tab, setTab] = useState("calendar");
  const [configCollapsed, setConfigCollapsed] = useState(false);

  const totalDesembolso = simulator.installments.reduce((sum, i) => sum + i.installment_value, 0);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione uma obra para usar o simulador.
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Programação de Desembolsos</h2>
          <p className="text-sm text-muted-foreground">
            Previsão simulada com base no orçamento de materiais, planejamento por período, fornecedores, lead time e parcelas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-base px-3 py-1.5 border-primary/30 text-primary">
            {formatCurrency(totalDesembolso)}
          </Badge>
          <Badge variant="secondary" className="px-2 py-1">
            {simulator.installments.length} parcelas
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_0.9fr_0.9fr]">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 flex gap-3 text-sm">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="font-medium text-foreground">Previsão simulada de saída de dinheiro</p>
              <p className="text-muted-foreground">
                Esta tela não gera contas a pagar automaticamente e não cria lançamentos financeiros reais.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Previsto</Badge>
                <Badge variant="secondary">Simulado</Badge>
                <Badge variant="outline">Não consolidado como conta a pagar</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardContent className="p-3 flex gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Custos não previstos</p>
              <p className="text-muted-foreground">
                Nesta versão, custos não previstos devem ser lançados no Fluxo Financeiro. Em uma próxima fase, esta tela poderá ter itens manuais, recorrência, medições e aprovação.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-3 text-sm">
            <p className="font-medium text-foreground">Próxima evolução do módulo</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline">Item manual</Badge>
              <Badge variant="outline">Custo não previsto</Badge>
              <Badge variant="outline">Recorrência mensal</Badge>
              <Badge variant="outline">Medição</Badge>
              <Badge variant="outline">Pago/a pagar/atrasado</Badge>
              <Badge variant="outline">Vínculo com financeiro</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content: config panel + results */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Config panel (collapsible) */}
        <div className={`transition-all duration-300 ${configCollapsed ? "w-10" : "w-[420px]"} shrink-0`}>
          <CashflowConfigPanel
            simulator={simulator}
            collapsed={configCollapsed}
            onToggleCollapse={() => setConfigCollapsed(!configCollapsed)}
          />
        </div>

        {/* Results area */}
        <div className="flex-1 min-w-0">
          <Tabs value={tab} onValueChange={setTab} className="h-full flex flex-col">
            <TabsList className="w-fit">
              <TabsTrigger value="calendar" className="gap-1.5">
                <Calendar className="h-4 w-4" />
                Calendário
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-1.5">
                <Table2 className="h-4 w-4" />
                Tabela
              </TabsTrigger>
              <TabsTrigger value="consolidated" className="gap-1.5">
                <BarChart3 className="h-4 w-4" />
                Consolidado
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calendar" className="flex-1 mt-4">
              <CashflowCalendarTab simulator={simulator} />
            </TabsContent>
            <TabsContent value="table" className="flex-1 mt-4">
              <CashflowTableTab simulator={simulator} />
            </TabsContent>
            <TabsContent value="consolidated" className="flex-1 mt-4">
              <CashflowConsolidatedTab simulator={simulator} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
