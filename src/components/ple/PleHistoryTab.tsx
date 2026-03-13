import { useMemo } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle } from "lucide-react";
import type { usePleData } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

export function PleHistoryTab({ measurements, entries, events, currentProject, approveMeasurement }: PleDataReturn) {
  const contractValue = currentProject?.contract_value || 0;
  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const rows = useMemo(() => {
    return measurements.map(m => {
      let valorMedido = 0;
      const measuredEntries = entries.filter(e => e.measurement_id === m.id);
      measuredEntries.forEach(entry => {
        const event = events.find(ev => ev.id === entry.event_id);
        if (event) valorMedido += event.unit_value;
      });
      const pctAvanco = contractValue > 0 ? (valorMedido / contractValue) * 100 : 0;

      return { measurement: m, valorMedido, pctAvanco };
    });
  }, [measurements, entries, events, contractValue]);

  if (measurements.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhuma medição registrada ainda.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-accent/50 text-xs">
            <TableHead className="w-10 font-bold">#</TableHead>
            <TableHead className="font-bold">MEDIÇÃO</TableHead>
            <TableHead className="font-bold">PERÍODO</TableHead>
            <TableHead className="font-bold">REGISTRADO EM</TableHead>
            <TableHead className="font-bold text-right">VALOR MEDIDO</TableHead>
            <TableHead className="font-bold text-center">% AVANÇO</TableHead>
            <TableHead className="font-bold text-center">STATUS</TableHead>
            <TableHead className="font-bold text-center">AÇÕES</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.measurement.id} className="text-xs">
              <TableCell className="font-bold">{r.measurement.measurement_number}</TableCell>
              <TableCell className="font-semibold">Medição {r.measurement.measurement_number}</TableCell>
              <TableCell>{r.measurement.period_label || "—"}</TableCell>
              <TableCell>{new Date(r.measurement.created_at).toLocaleString("pt-BR")}</TableCell>
              <TableCell className="text-right font-mono text-green-500">{fmtCur(r.valorMedido)}</TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="text-amber-500 border-amber-500/30 font-mono">
                  {r.pctAvanco.toFixed(2)}%
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge className={r.measurement.status === "approved"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-amber-600 hover:bg-amber-700"
                }>
                  {r.measurement.status === "approved" ? "APROVADA" : "PENDENTE"}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <Eye className="h-3 w-3" /> Ver
                  </Button>
                  {r.measurement.status !== "approved" && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
                      onClick={() => approveMeasurement(r.measurement.id)}
                    >
                      <CheckCircle className="h-3 w-3" /> Aprovar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
