import { Crown } from "lucide-react";

export default function HoldingDashboardView() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Crown className="h-16 w-16 text-primary" />
      <h1 className="text-2xl font-bold text-foreground">Painel da Holding</h1>
      <p className="text-muted-foreground">Em construção</p>
    </div>
  );
}
