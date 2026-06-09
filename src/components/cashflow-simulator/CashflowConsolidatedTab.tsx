import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency, getFamilyColor } from "./utils";
import type { useCashflowSimulator } from "@/hooks/useCashflowSimulator";

interface Props {
  simulator: ReturnType<typeof useCashflowSimulator>;
}

export function CashflowConsolidatedTab({ simulator }: Props) {
  const { monthlyData, installments } = simulator;
  const { months, monthKeys, supplierMatrix, familyTotals } = monthlyData;

  if (installments.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Configure insumos e selecione períodos para ver o consolidado.
      </div>
    );
  }

  // Chart data for stacked bar
  const chartData = (monthKeys || []).map((mk, idx) => {
    const entry: any = { month: format(months![idx], "MMM/yy", { locale: ptBR }) };
    (familyTotals || []).forEach(ft => {
      entry[ft.family] = ft.months[idx] || 0;
    });
    return entry;
  });

  return (
    <div className="space-y-4">
      {/* Stacked bar chart by family */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Desembolso mensal previsto por família</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: 8,
                  color: "hsl(var(--foreground))",
                  fontSize: 12,
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {(familyTotals || []).map(ft => (
                <Bar
                  key={ft.family}
                  dataKey={ft.family}
                  stackId="a"
                  fill={getFamilyColor(ft.family)}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Supplier × Month matrix */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Matriz prevista Fornecedor × Mês</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[400px] scrollbar-none">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs sticky left-0 bg-card z-10 min-w-[150px]">Fornecedor</TableHead>
                  {(monthKeys || []).map((mk, idx) => (
                    <TableHead key={mk} className="text-xs text-right min-w-[90px]">
                      {format(months![idx], "MMM/yy", { locale: ptBR })}
                    </TableHead>
                  ))}
                  <TableHead className="text-xs text-right font-bold min-w-[100px]">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(supplierMatrix || []).map(row => (
                  <TableRow key={row.supplier}>
                    <TableCell className="text-xs sticky left-0 bg-card z-10 font-medium">{row.supplier}</TableCell>
                    {row.months.map((val, idx) => (
                      <TableCell key={idx} className="text-xs text-right tabular-nums">
                        {val > 0 ? formatCurrency(val) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-xs text-right font-semibold text-primary tabular-nums">
                      {formatCurrency(row.total)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="border-t-2 border-border">
                  <TableCell className="text-xs sticky left-0 bg-card z-10 font-bold">TOTAL</TableCell>
                  {(monthKeys || []).map((_, idx) => {
                    const monthTotal = (supplierMatrix || []).reduce((sum, r) => sum + r.months[idx], 0);
                    return (
                      <TableCell key={idx} className="text-xs text-right font-semibold tabular-nums">
                        {monthTotal > 0 ? formatCurrency(monthTotal) : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-xs text-right font-bold text-primary tabular-nums">
                    {formatCurrency((supplierMatrix || []).reduce((sum, r) => sum + r.total, 0))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
