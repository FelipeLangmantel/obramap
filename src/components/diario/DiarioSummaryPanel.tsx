import { Card, CardContent } from "@/components/ui/card";
import { Users, CheckCircle2, Home, Camera, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiarioSummaryPanelProps {
  equipePresente: number;
  totalServicos: number;
  servicosConcluidos: number;
  casasTrabalhadas: number;
  totalCasas: number;
  totalFotos: number;
  clima: string | null;
}

const CLIMA_LABELS: Record<string, string> = {
  sol: "☀️ Sol",
  nublado: "☁️ Nublado",
  chuva_fraca: "🌦️ Chuva fraca",
  chuva_forte: "⛈️ Chuva forte",
  vento: "💨 Vento",
};

export function DiarioSummaryPanel(props: DiarioSummaryPanelProps) {
  const { equipePresente, totalServicos, servicosConcluidos, casasTrabalhadas, totalCasas, totalFotos, clima } = props;

  const kpis = [
    {
      label: "Equipe",
      value: equipePresente,
      sub: "presentes",
      icon: <Users className="h-4 w-4" />,
      tone: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40",
    },
    {
      label: "Serviços",
      value: totalServicos,
      sub: `${servicosConcluidos} concluído(s)`,
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
    },
    {
      label: "Casas",
      value: casasTrabalhadas,
      sub: `de ${totalCasas}`,
      icon: <Home className="h-4 w-4" />,
      tone: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40",
    },
    {
      label: "Fotos",
      value: totalFotos,
      sub: "do dia",
      icon: <Camera className="h-4 w-4" />,
      tone: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40",
    },
    {
      label: "Clima",
      value: clima ? (CLIMA_LABELS[clima] || clima) : "—",
      sub: clima ? "registrado" : "não informado",
      icon: <Cloud className="h-4 w-4" />,
      tone: "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40",
      isText: true,
    },
  ];

  return (
    <Card>
      <CardContent className="p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {kpis.map((kpi, i) => (
            <div
              key={i}
              className="rounded-lg border bg-card p-2.5 flex items-center gap-2.5"
            >
              <div className={cn("p-2 rounded-md shrink-0", kpi.tone)}>
                {kpi.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase font-medium text-muted-foreground tracking-wide">
                  {kpi.label}
                </div>
                <div className={cn("font-bold leading-tight truncate", kpi.isText ? "text-sm" : "text-xl")}>
                  {kpi.value}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{kpi.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
