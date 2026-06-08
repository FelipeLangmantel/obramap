import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, FileText, Receipt, ShoppingCart, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useCashflowSimulator } from "@/hooks/useCashflowSimulator";

interface FinancialEntry {
  id: string;
  supplier_id: string | null;
  category: string;
  description: string;
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: string;
  notes: string | null;
}

interface FinancialReconciliationPanelProps {
  entries: FinancialEntry[];
}

interface BudgetItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit_value: number;
  input_id: string | null;
}

interface IndirectCost {
  id: string;
  name: string;
  value: number;
  quantity: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  net_amount: number;
  status: string;
  supplier_id: string | null;
  supplier?: { name: string | null } | null;
}

interface PurchaseOrder {
  id: string;
  order_number: string;
  total_value: number;
  status: string;
  supplier_id: string | null;
}

interface PurchaseRequest {
  id: string;
  status: string | null;
}

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

const toNumber = (value: unknown) => Number(value || 0);

const isCloseAmount = (left: number, right: number) => Math.abs(left - right) <= 0.01;

const isNearDate = (left?: string | null, right?: string | null) => {
  if (!left || !right) return false;
  const leftDate = new Date(`${left}T00:00:00`);
  const rightDate = new Date(`${right}T00:00:00`);
  const diffDays = Math.abs(leftDate.getTime() - rightDate.getTime()) / 86_400_000;
  return diffDays <= 7;
};

export function FinancialReconciliationPanel({ entries }: FinancialReconciliationPanelProps) {
  const { company } = useAuth();
  const { currentProject } = useConstruction();
  const simulator = useCashflowSimulator();
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [indirectCosts, setIndirectCosts] = useState<IndirectCost[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadReadOnlyData = async () => {
      if (!currentProject?.id || !company?.id) return;
      setLoading(true);
      try {
        const [budgetRes, indirectRes, invoicesRes, ordersRes, requestsRes] = await Promise.all([
          supabase
            .from("scope_items")
            .select("id, name, category, quantity, unit_value, input_id")
            .eq("project_id", currentProject.id),
          supabase
            .from("indirect_costs")
            .select("id, name, value, quantity")
            .eq("project_id", currentProject.id),
          supabase
            .from("invoices")
            .select("id, invoice_number, invoice_date, due_date, total_amount, net_amount, status, supplier_id, supplier:suppliers(name)")
            .eq("project_id", currentProject.id)
            .eq("company_id", company.id),
          supabase
            .from("purchase_orders")
            .select("id, order_number, total_value, status, supplier_id")
            .eq("project_id", currentProject.id),
          supabase
            .from("purchase_requests")
            .select("id, status")
            .eq("project_id", currentProject.id)
            .eq("company_id", company.id),
        ]);

        if (!budgetRes.error) setBudgetItems((budgetRes.data || []) as BudgetItem[]);
        if (!indirectRes.error) setIndirectCosts((indirectRes.data || []) as IndirectCost[]);
        if (!invoicesRes.error) setInvoices((invoicesRes.data || []) as Invoice[]);
        if (!ordersRes.error) setPurchaseOrders((ordersRes.data || []) as PurchaseOrder[]);
        if (!requestsRes.error) setPurchaseRequests((requestsRes.data || []) as PurchaseRequest[]);
      } finally {
        setLoading(false);
      }
    };

    void loadReadOnlyData();
  }, [company?.id, currentProject?.id]);

  const budgetTotal = useMemo(
    () => budgetItems.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unit_value), 0),
    [budgetItems]
  );

  const indirectTotal = useMemo(
    () => indirectCosts.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.value), 0),
    [indirectCosts]
  );

  const simulatedTotal = useMemo(
    () => simulator.installments.reduce((sum, item) => sum + toNumber(item.installment_value), 0),
    [simulator.installments]
  );

  const simulatedByPeriod = useMemo(() => {
    const map = new Map<string, number>();
    for (const installment of simulator.installments) {
      const key = installment.period_name || "Periodo nao definido";
      map.set(key, (map.get(key) || 0) + toNumber(installment.installment_value));
    }
    return Array.from(map.entries())
      .map(([period, total]) => ({ period, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [simulator.installments]);

  const realTotals = useMemo(() => {
    const paid = entries.filter((entry) => entry.status === "paid").reduce((sum, entry) => sum + toNumber(entry.amount), 0);
    const payable = entries.filter((entry) => entry.status !== "paid").reduce((sum, entry) => sum + toNumber(entry.amount), 0);
    const overdue = entries.filter((entry) => entry.status === "overdue").reduce((sum, entry) => sum + toNumber(entry.amount), 0);
    const next = entries
      .filter((entry) => entry.status !== "paid")
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

    return {
      total: paid + payable,
      paid,
      payable,
      overdue,
      nextDueDate: next?.due_date || null,
      nextDueAmount: next ? toNumber(next.amount) : 0,
    };
  }, [entries]);

  const invoiceTotals = useMemo(() => {
    const byStatus = invoices.reduce<Record<string, { count: number; total: number }>>((acc, invoice) => {
      const status = invoice.status || "sem status";
      acc[status] = acc[status] || { count: 0, total: 0 };
      acc[status].count += 1;
      acc[status].total += toNumber(invoice.total_amount);
      return acc;
    }, {});

    return {
      total: invoices.reduce((sum, invoice) => sum + toNumber(invoice.total_amount), 0),
      byStatus,
    };
  }, [invoices]);

  const purchaseTotals = useMemo(() => {
    const orderByStatus = purchaseOrders.reduce<Record<string, { count: number; total: number }>>((acc, order) => {
      const status = order.status || "sem status";
      acc[status] = acc[status] || { count: 0, total: 0 };
      acc[status].count += 1;
      acc[status].total += toNumber(order.total_value);
      return acc;
    }, {});

    const requestByStatus = purchaseRequests.reduce<Record<string, number>>((acc, request) => {
      const status = request.status || "sem status";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return {
      ordersTotal: purchaseOrders.reduce((sum, order) => sum + toNumber(order.total_value), 0),
      orderByStatus,
      requestByStatus,
    };
  }, [purchaseOrders, purchaseRequests]);

  const extraEntries = useMemo(() => {
    const extraLabels = ["CUSTOS EXTRAS", "OUTROS", "EXTRA", "NAO PREVISTO", "NÃO PREVISTO"];
    return entries.filter((entry) =>
      extraLabels.some((label) => `${entry.category} ${entry.description}`.toUpperCase().includes(label))
    );
  }, [entries]);

  const possibleDuplicateInvoices = useMemo(() => {
    return invoices
      .map((invoice) => {
        const matches = entries.filter((entry) => {
          const sameSupplier = invoice.supplier_id && entry.supplier_id === invoice.supplier_id;
          const sameAmount =
            isCloseAmount(toNumber(entry.amount), toNumber(invoice.total_amount)) ||
            isCloseAmount(toNumber(entry.amount), toNumber(invoice.net_amount));
          const nearDate = isNearDate(entry.due_date, invoice.due_date || invoice.invoice_date);
          const mentionsInvoice =
            entry.description?.toLowerCase().includes(invoice.invoice_number.toLowerCase()) ||
            entry.notes?.toLowerCase().includes(invoice.invoice_number.toLowerCase());

          return Boolean(sameSupplier && sameAmount && (nearDate || mentionsInvoice));
        });

        return { invoice, matches };
      })
      .filter((item) => item.matches.length > 1 || item.matches.some((entry) => !entry.notes?.includes("Importado automaticamente")));
  }, [entries, invoices]);

  const purchaseOrdersWithoutFinance = useMemo(() => {
    return purchaseOrders.filter((order) => {
      if (!order.supplier_id || toNumber(order.total_value) <= 0) return false;
      return !entries.some(
        (entry) =>
          entry.supplier_id === order.supplier_id &&
          isCloseAmount(toNumber(entry.amount), toNumber(order.total_value))
      );
    });
  }, [entries, purchaseOrders]);

  const unlinkedInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (!invoice.supplier_id || toNumber(invoice.total_amount) <= 0) return false;
      return !entries.some((entry) => {
        const sameSupplier = entry.supplier_id === invoice.supplier_id;
        const sameAmount =
          isCloseAmount(toNumber(entry.amount), toNumber(invoice.total_amount)) ||
          isCloseAmount(toNumber(entry.amount), toNumber(invoice.net_amount));
        const mentionsInvoice =
          entry.description?.toLowerCase().includes(invoice.invoice_number.toLowerCase()) ||
          entry.notes?.toLowerCase().includes(invoice.invoice_number.toLowerCase());
        return sameSupplier && sameAmount && mentionsInvoice;
      });
    });
  }, [entries, invoices]);

  const variance = {
    simulatedMinusReal: simulatedTotal - realTotals.total,
    budgetMinusReal: budgetTotal + indirectTotal - realTotals.total,
  };

  if (!currentProject) {
    return <p className="text-sm text-muted-foreground">Selecione uma obra para ver a conciliacao financeira.</p>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Diagnostico somente leitura. Os numeros abaixo ajudam a comparar fontes financeiras existentes, mas nao criam contas,
          compras, notas ou movimentos contabeis.
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          title="Orcado"
          icon={ClipboardList}
          main={money(budgetTotal + indirectTotal)}
          lines={[
            `${budgetItems.length} itens diretos: ${money(budgetTotal)}`,
            `${indirectCosts.length} custos indiretos: ${money(indirectTotal)}`,
          ]}
        />
        <SummaryCard
          title="Simulado"
          icon={Wallet}
          main={simulator.isLoading ? "Carregando..." : money(simulatedTotal)}
          lines={[
            `${simulator.installments.length} parcelas simuladas`,
            simulator.installments.length > 0 ? "Origem: simulador de desembolsos" : "Sem consolidacao simulada",
          ]}
        />
        <SummaryCard
          title="Financeiro real/manual"
          icon={Receipt}
          main={money(realTotals.total)}
          lines={[
            `Pago: ${money(realTotals.paid)}`,
            `A pagar: ${money(realTotals.payable)}`,
            `Vencido: ${money(realTotals.overdue)}`,
            realTotals.nextDueDate ? `Proximo: ${realTotals.nextDueDate} - ${money(realTotals.nextDueAmount)}` : "Sem proximo vencimento",
          ]}
        />
        <SummaryCard
          title="Notas fiscais"
          icon={FileText}
          main={money(invoiceTotals.total)}
          lines={[`${invoices.length} notas cadastradas`, ...Object.entries(invoiceTotals.byStatus).map(([status, item]) => `${status}: ${item.count} / ${money(item.total)}`)]}
        />
        <SummaryCard
          title="Compras/requisicoes"
          icon={ShoppingCart}
          main={money(purchaseTotals.ordersTotal)}
          lines={[
            `${purchaseOrders.length} pedidos de compra`,
            `${purchaseRequests.length} requisicoes`,
            ...Object.entries(purchaseTotals.orderByStatus).slice(0, 3).map(([status, item]) => `${status}: ${item.count} / ${money(item.total)}`),
          ]}
        />
        <SummaryCard
          title="Saldo gerencial"
          icon={Wallet}
          main={money(variance.simulatedMinusReal)}
          lines={[
            `Simulado - financeiro: ${money(variance.simulatedMinusReal)}`,
            `Orcado - financeiro: ${money(variance.budgetMinusReal)}`,
            "Saldo gerencial, nao contabil.",
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Simulado por periodo</CardTitle>
          </CardHeader>
          <CardContent>
            {simulatedByPeriod.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem desembolso simulado consolidado para os periodos ativos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simulatedByPeriod.map((period) => (
                    <TableRow key={period.period}>
                      <TableCell>{period.period}</TableCell>
                      <TableCell className="text-right">{money(period.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Alertas de conciliacao
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <AlertLine
              label="Possiveis custos nao previstos"
              value={`${extraEntries.length} lancamentos / ${money(extraEntries.reduce((sum, entry) => sum + toNumber(entry.amount), 0))}`}
              description="Detectado por categoria ou descricao de custo extra/outros; o schema atual nao vincula financial_entries ao item de orcamento."
            />
            <AlertLine
              label="Possiveis duplicidades NF x financeiro"
              value={`${possibleDuplicateInvoices.length} nota(s) para revisar`}
              description="Mesmo fornecedor, valor compativel e data proxima, sem garantia de vinculo unico."
            />
            <AlertLine
              label="Compras sem lancamento financeiro equivalente"
              value={`${purchaseOrdersWithoutFinance.length} pedido(s)`}
              description="Pedido com fornecedor/valor sem financial_entry compativel encontrado."
            />
            <AlertLine
              label="Notas sem pagamento claramente vinculado"
              value={`${unlinkedInvoices.length} nota(s)`}
              description="Nota sem lancamento financeiro espelho identificado por fornecedor, valor e numero da NF."
            />
          </CardContent>
        </Card>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Atualizando leitura financeira...</p>}
    </div>
  );
}

function SummaryCard({
  title,
  icon: Icon,
  main,
  lines,
}: {
  title: string;
  icon: typeof Wallet;
  main: string;
  lines: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-2xl font-bold">{main}</p>
        <div className="space-y-1">
          {lines.map((line) => (
            <p key={line} className="text-xs text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertLine({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Badge variant="outline">{value}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
