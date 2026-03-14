import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Search, Home, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { usePleData } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface HouseData {
  houseNumber: number;
  totalMeasuredValue: number;
  totalContractValue: number;
  progress: number;
  servicesCount: number;
  measurementsCount: number;
  hasGloss: boolean;
  glossCount: number;
}

export function PleHouseMapTab({ entries, events, measurements, glosses, currentProject }: PleDataReturn) {
  const totalHouses = currentProject?.total_houses || 0;
  const [selectedHouse, setSelectedHouse] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "measured" | "pending" | "glossed">("all");
  const [search, setSearch] = useState("");

  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Per-house contract value (sum of all events' unit totals)
  const totalPerHouseContract = useMemo(() => {
    return events.reduce((sum, ev) => sum + ev.quantity * ev.unit_value, 0);
  }, [events]);

  // Compute data for each house
  const housesData = useMemo<HouseData[]>(() => {
    const houses: HouseData[] = [];
    for (let i = 1; i <= totalHouses; i++) {
      const houseEntries = entries.filter(e => e.house_number === i);
      let totalMeasuredValue = 0;
      const measurementIds = new Set<string>();
      const serviceIds = new Set<string>();

      houseEntries.forEach(entry => {
        const ev = events.find(e => e.id === entry.event_id);
        if (ev) {
          totalMeasuredValue += ev.quantity * ev.unit_value;
          serviceIds.add(ev.id);
        }
        measurementIds.add(entry.measurement_id);
      });

      const houseGlosses = glosses.filter(g => g.house_number === i);
      const progress = totalPerHouseContract > 0 ? (totalMeasuredValue / totalPerHouseContract) * 100 : 0;

      houses.push({
        houseNumber: i,
        totalMeasuredValue,
        totalContractValue: totalPerHouseContract,
        progress: Math.min(progress, 100),
        servicesCount: serviceIds.size,
        measurementsCount: measurementIds.size,
        hasGloss: houseGlosses.length > 0,
        glossCount: houseGlosses.filter(g => !g.resolved).length,
      });
    }
    return houses;
  }, [totalHouses, entries, events, glosses, totalPerHouseContract]);

  // Filter houses
  const filteredHouses = useMemo(() => {
    let filtered = housesData;
    if (filterStatus === "measured") filtered = filtered.filter(h => h.progress > 0);
    else if (filterStatus === "pending") filtered = filtered.filter(h => h.progress === 0);
    else if (filterStatus === "glossed") filtered = filtered.filter(h => h.hasGloss);
    if (search) {
      const s = search.trim();
      filtered = filtered.filter(h => h.houseNumber.toString().includes(s));
    }
    return filtered;
  }, [housesData, filterStatus, search]);

  // Stats
  const stats = useMemo(() => {
    const measured = housesData.filter(h => h.progress > 0).length;
    const complete = housesData.filter(h => h.progress >= 100).length;
    const glossed = housesData.filter(h => h.hasGloss).length;
    return { measured, complete, glossed, total: totalHouses };
  }, [housesData, totalHouses]);

  // House detail data
  const houseDetail = useMemo(() => {
    if (selectedHouse === null) return null;
    const houseEntries = entries.filter(e => e.house_number === selectedHouse);
    const houseGlosses = glosses.filter(g => g.house_number === selectedHouse);

    // Group by event
    const serviceDetails = events.map(ev => {
      const evEntries = houseEntries.filter(e => e.event_id === ev.id);
      if (evEntries.length === 0 && houseGlosses.filter(g => g.event_id === ev.id).length === 0) return null;
      const measurementNums = evEntries.map(e => {
        const m = measurements.find(m => m.id === e.measurement_id);
        return m ? { number: m.measurement_number, date: m.created_at, period: m.period_label } : null;
      }).filter(Boolean);
      const evGlosses = houseGlosses.filter(g => g.event_id === ev.id);
      const valor = ev.quantity * ev.unit_value;
      const isMeasured = evEntries.length > 0;
      return { event: ev, measurementNums, glosses: evGlosses, valor, isMeasured };
    }).filter(Boolean) as any[];

    const houseData = housesData.find(h => h.houseNumber === selectedHouse);
    return { serviceDetails, houseData };
  }, [selectedHouse, entries, events, measurements, glosses, housesData]);

  const getHouseColor = (h: HouseData) => {
    if (h.glossCount > 0) return "border-destructive bg-destructive/10 text-destructive";
    if (h.progress >= 100) return "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    if (h.progress > 0) return "border-primary bg-primary/10 text-primary";
    return "border-border bg-card text-muted-foreground hover:border-muted-foreground/50";
  };

  if (totalHouses === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Configure o número de casas no projeto para visualizar o mapa.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-card border border-border rounded-lg p-2 sm:p-3 text-center">
          <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase">Total</div>
          <div className="text-lg sm:text-xl font-bold text-foreground">{stats.total}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 sm:p-3 text-center">
          <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase">Com Medição</div>
          <div className="text-lg sm:text-xl font-bold text-primary">{stats.measured}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 sm:p-3 text-center">
          <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase">Concluídas</div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.complete}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2 sm:p-3 text-center">
          <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase">Com Glossa</div>
          <div className="text-lg sm:text-xl font-bold text-destructive">{stats.glossed}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1 sm:max-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar casa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 h-8 text-xs"
          />
        </div>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v as any)}>
          <SelectTrigger className="h-8 text-xs w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Casas</SelectItem>
            <SelectItem value="measured">Com Medição</SelectItem>
            <SelectItem value="pending">Sem Medição</SelectItem>
            <SelectItem value="glossed">Com Glossa</SelectItem>
          </SelectContent>
        </Select>
        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] sm:text-xs ml-auto flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-emerald-500 bg-emerald-500/15" /> 100%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-primary bg-primary/10" /> Parcial</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-destructive bg-destructive/10" /> Glossa</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-border bg-card" /> Pendente</span>
        </div>
      </div>

      {/* House Grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-14 xl:grid-cols-16 gap-1.5 p-1">
          {filteredHouses.map(h => (
            <button
              key={h.houseNumber}
              onClick={() => setSelectedHouse(h.houseNumber)}
              className={`relative aspect-square rounded-lg border-2 flex flex-col items-center justify-center transition-all ${getHouseColor(h)}`}
            >
              <span className="font-bold text-sm sm:text-base">{h.houseNumber}</span>
              <span className="text-[8px] sm:text-[9px] font-mono">{h.progress.toFixed(0)}%</span>
              {h.glossCount > 0 && (
                <AlertTriangle className="absolute -top-1 -right-1 h-3 w-3 text-destructive" />
              )}
              {h.progress >= 100 && (
                <div className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* House Detail Dialog */}
      <Dialog open={selectedHouse !== null} onOpenChange={() => setSelectedHouse(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Home className="h-4 w-4 text-primary" />
              Casa {selectedHouse}
              {houseDetail?.houseData && (
                <Badge variant="outline" className="font-mono text-xs">
                  {houseDetail.houseData.progress.toFixed(1)}%
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {houseDetail && (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded-lg p-2 text-center border border-border">
                  <div className="text-[9px] text-muted-foreground uppercase">Valor Medido</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {fmtCur(houseDetail.houseData?.totalMeasuredValue || 0)}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center border border-border">
                  <div className="text-[9px] text-muted-foreground uppercase">Valor Contrato</div>
                  <div className="text-sm font-bold text-foreground">
                    {fmtCur(houseDetail.houseData?.totalContractValue || 0)}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center border border-border col-span-2">
                  <div className="text-[9px] text-muted-foreground uppercase mb-1">Evolução</div>
                  <Progress value={houseDetail.houseData?.progress || 0} className="h-2" />
                  <div className="text-xs font-mono mt-1">{(houseDetail.houseData?.progress || 0).toFixed(1)}%</div>
                </div>
              </div>

              {/* Services table */}
              <ScrollArea className="flex-1 border border-border rounded-lg">
                {houseDetail.serviceDetails.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    Nenhum serviço medido para esta casa.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/80 text-[10px]">
                        <TableHead className="font-bold w-14">ITEM</TableHead>
                        <TableHead className="font-bold">SERVIÇO</TableHead>
                        <TableHead className="font-bold text-right w-20">VALOR</TableHead>
                        <TableHead className="font-bold text-center w-16">MEDIÇÃO</TableHead>
                        <TableHead className="font-bold text-center w-16">GLOSSA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {houseDetail.serviceDetails.map((d: any) => (
                        <TableRow key={d.event.id} className="text-[10px]">
                          <TableCell className="font-mono">{d.event.item_code}</TableCell>
                          <TableCell className="max-w-[120px] truncate">{d.event.description}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                            {fmtCur(d.valor)}
                          </TableCell>
                          <TableCell className="text-center">
                            {d.measurementNums.map((m: any) => (
                              <Badge key={m.number} variant="outline" className="text-[9px] font-mono mr-0.5">
                                {m.number}
                              </Badge>
                            ))}
                          </TableCell>
                          <TableCell className="text-center">
                            {d.glosses.length > 0 ? (
                              <Badge className="bg-destructive text-[9px]">
                                {d.glosses.length}x
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
