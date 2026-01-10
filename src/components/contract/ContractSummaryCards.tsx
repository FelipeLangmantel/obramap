import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Target, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContractSummaryCardsProps {
  totals: {
    totalRevenue: number;
    totalMaxCost: number;
    projectedMargin: number;
    servicesWithoutPrice: number;
  };
  costPercent: number;
}

export function ContractSummaryCards({ totals, costPercent }: ContractSummaryCardsProps) {
  const marginPercent = totals.totalRevenue > 0 
    ? ((totals.projectedMargin / totals.totalRevenue) * 100).toFixed(1)
    : "0.0";

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const cards = [
    {
      title: "Receita Total do Contrato",
      value: formatCurrency(totals.totalRevenue),
      icon: DollarSign,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: `Custo Máximo Permitido (${costPercent}%)`,
      value: formatCurrency(totals.totalMaxCost),
      icon: Target,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
    },
    {
      title: `Margem Projetada (${marginPercent}%)`,
      value: formatCurrency(totals.projectedMargin),
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Serviços sem Preço",
      value: totals.servicesWithoutPrice.toString(),
      icon: AlertTriangle,
      color: totals.servicesWithoutPrice > 0 ? "text-yellow-600" : "text-green-600",
      bgColor: totals.servicesWithoutPrice > 0 ? "bg-yellow-500/10" : "bg-green-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <Card key={index} className="border-none shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className={cn("text-xl font-bold", card.color)}>{card.value}</p>
              </div>
              <div className={cn("p-2 rounded-lg", card.bgColor)}>
                <card.icon className={cn("h-5 w-5", card.color)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
