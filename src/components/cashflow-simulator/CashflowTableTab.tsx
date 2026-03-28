import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "./utils";
import type { useCashflowSimulator } from "@/hooks/useCashflowSimulator";
import type { CashflowInstallment } from "@/hooks/useCashflowSimulator";

interface Props {
  simulator: ReturnType<typeof useCashflowSimulator>;
}

type SortKey = "installment_date" | "supplier_name" | "input_name" | "installment_value" | "family";

export function CashflowTableTab({ simulator }: Props) {
  const { installments } = simulator;
  const [search, setSearch] = useState("");
  const [filterFamily, setFilterFamily] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("installment_date");
  const [sortAsc, setSortAsc] = useState(true);

  const families = [...new Set(installments.map(i => i.family))].sort();
  const supplierNames = [...new Set(installments.map(i => i.supplier_name))].sort();

  const filtered = useMemo(() => {
    let data = [...installments];
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(i =>
        i.input_name.toLowerCase().includes(s) ||
        i.supplier_name.toLowerCase().includes(s) ||
        i.macro_name.toLowerCase().includes(s)
      );
    }
    if (filterFamily !== "all") data = data.filter(i => i.family === filterFamily);
    if (filterSupplier !== "all") data = data.filter(i => i.supplier_name === filterSupplier);

    data.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "installment_date") cmp = a.installment_date.getTime() - b.installment_date.getTime();
      else if (sortKey === "installment_value") cmp = a.installment_value - b.installment_value;
      else cmp = (a[sortKey] || "").localeCompare(b[sortKey] || "", "pt-BR");
      return sortAsc ? cmp : -cmp;
    });

    return data;
  }, [installments, search, filterFamily, filterSupplier, sortKey, sortAsc]);

  const total = filtered.reduce((s, i) => s + i.installment_value, 0);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const exportCSV = () => {
    const headers = ["Data", "Fornecedor", "Insumo", "Família", "Escopo", "Período", "Parcela", "%", "Valor"];
    const rows = filtered.map(i => [
      format(i.installment_date, "dd/MM/yyyy"),
      i.supplier_name,
      i.input_name,
      i.family,
      i.scope_name,
      i.period_name,
      i.installment_number,
      i.installment_pct,
      i.installment_value.toFixed(2),
    ]);
    const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `desembolsos_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortButton = ({ col, label }: { col: SortKey; label: string }) => (
    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort(col)}>
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === col ? "text-primary" : "text-muted-foreground/50"}`} />
    </button>
  );

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar insumo, fornecedor..."
              className="h-8 text-xs pl-8"
            />
          </div>
          <Select value={filterFamily} onValueChange={setFilterFamily}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Família" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {families.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {supplierNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Badge variant="secondary" className="text-xs">{filtered.length} linhas</Badge>
          <Badge variant="outline" className="text-xs text-primary border-primary/30">{formatCurrency(total)}</Badge>
        </div>

        {/* Table */}
        <div className="max-h-[calc(100vh-280px)] overflow-auto scrollbar-none rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs"><SortButton col="installment_date" label="Data" /></TableHead>
                <TableHead className="text-xs"><SortButton col="supplier_name" label="Fornecedor" /></TableHead>
                <TableHead className="text-xs"><SortButton col="input_name" label="Insumo" /></TableHead>
                <TableHead className="text-xs"><SortButton col="family" label="Família" /></TableHead>
                <TableHead className="text-xs">Período</TableHead>
                <TableHead className="text-xs text-center">Parc.</TableHead>
                <TableHead className="text-xs text-right"><SortButton col="installment_value" label="Valor" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 500).map(item => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{format(item.installment_date, "dd/MM/yy")}</TableCell>
                  <TableCell className="text-xs">{item.supplier_name}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{item.input_name}</TableCell>
                  <TableCell className="text-xs">{item.family}</TableCell>
                  <TableCell className="text-xs">{item.period_name}</TableCell>
                  <TableCell className="text-xs text-center">{item.installment_number} ({item.installment_pct}%)</TableCell>
                  <TableCell className="text-xs text-right font-medium">{formatCurrency(item.installment_value)}</TableCell>
                </TableRow>
              ))}
              {filtered.length > 500 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-2">
                    Mostrando 500 de {filtered.length} linhas. Exporte CSV para ver todas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
