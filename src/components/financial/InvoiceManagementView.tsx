import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  FileText,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Receipt,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { SupplierAutocomplete } from "./SupplierAutocomplete";

interface Invoice {
  id: string;
  company_id: string;
  project_id: string;
  supplier_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  tax_amount: number;
  net_amount: number;
  status: string;
  payment_date: string | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  supplier?: { name: string; cnpj_cpf: string | null };
  items?: InvoiceItem[];
}

interface InvoiceItem {
  id: string;
  invoice_id: string;
  macro_id: string | null;
  macro_name: string | null;
  scope_id: string | null;
  scope_name: string | null;
  scope_item_id: string | null;
  description: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  unit: string | null;
}

interface Supplier {
  id: string;
  name: string;
  cnpj_cpf: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  supplier_scope: string;
  project_id: string;
}

interface BudgetItem {
  id: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  name: string;
  unit: string;
  unit_value: number;
  category: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", color: "bg-yellow-500", icon: Clock },
  approved: { label: "Aprovada", color: "bg-blue-500", icon: CheckCircle },
  paid: { label: "Paga", color: "bg-emerald-500", icon: CheckCircle },
  cancelled: { label: "Cancelada", color: "bg-destructive", icon: XCircle },
};

interface InvoiceManagementViewProps {
  onInvoiceSaved?: () => void;
}

export function InvoiceManagementView({ onInvoiceSaved }: InvoiceManagementViewProps = {}) {
  const { currentProject } = useConstruction();
  const { canEdit, company } = useAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialogs
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);

  // New invoice form
  const [newInvoice, setNewInvoice] = useState({
    invoice_number: "",
    invoice_date: format(new Date(), "yyyy-MM-dd"),
    due_date: "",
    supplier_id: "",
    description: "",
    notes: "",
    tax_amount: 0,
  });

  const [newItems, setNewItems] = useState<Array<{
    macro_id: string;
    scope_id: string;
    scope_item_id: string;
    description: string;
    quantity: number;
    unit_value: number;
    unit: string;
  }>>([{ macro_id: "", scope_id: "", scope_item_id: "", description: "", quantity: 1, unit_value: 0, unit: "un" }]);

  const [supplierSearchValue, setSupplierSearchValue] = useState("");

  // Build macro/scope hierarchy from project macrosTemplate
  const macroOptions = useMemo(() => {
    if (!currentProject) return [];
    const template = (currentProject as any).macrosTemplate || [];
    return template.map((m: any) => ({
      id: m.id,
      name: m.name,
      scopes: (m.scopes || []).map((s: any) => ({
        id: s.id,
        name: s.name,
      })),
    }));
  }, [currentProject]);

  useEffect(() => {
    if (currentProject?.id) loadData();
  }, [currentProject?.id]);

  const loadData = async () => {
    if (!currentProject?.id || !company?.id) return;
    setIsLoading(true);

    try {
      const [invoicesRes, suppliersRes, budgetRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*, supplier:suppliers(name, cnpj_cpf)")
          .eq("project_id", currentProject.id)
          .eq("company_id", company.id)
          .order("invoice_date", { ascending: false }),
        supabase
          .from("suppliers")
          .select("id, name, cnpj_cpf, pix_key, pix_key_type, supplier_scope, project_id")
          .or(`project_id.eq.${currentProject.id},supplier_scope.eq.global`),
        supabase
          .from("scope_items")
          .select("id, macro_id, scope_id, name, unit, unit_value, category")
          .eq("project_id", currentProject.id),
      ]);

      if (invoicesRes.error) throw invoicesRes.error;
      setInvoices(invoicesRes.data || []);
      setSuppliers(suppliersRes.data || []);

      // Build budget items with macro/scope names from template
      const template = (currentProject as any).macrosTemplate || [];
      const macroMap: Record<string, string> = {};
      const scopeMap: Record<string, string> = {};
      template.forEach((m: any) => {
        macroMap[m.id] = m.name;
        (m.scopes || []).forEach((s: any) => {
          scopeMap[s.id] = s.name;
        });
      });

      const items: BudgetItem[] = (budgetRes.data || []).map((item: any) => ({
        id: item.id,
        macro_id: item.macro_id,
        macro_name: macroMap[item.macro_id] || item.macro_id,
        scope_id: item.scope_id,
        scope_name: scopeMap[item.scope_id] || item.scope_id,
        name: item.name,
        unit: item.unit,
        unit_value: item.unit_value,
        category: item.category,
      }));
      setBudgetItems(items);
    } catch (error) {
      console.error("Error loading invoice data:", error);
      toast.error("Erro ao carregar dados de notas fiscais");
    } finally {
      setIsLoading(false);
    }
  };

  const getItemTotal = (item: { quantity: number; unit_value: number }) =>
    item.quantity * item.unit_value;

  const getInvoiceTotal = () =>
    newItems.reduce((sum, item) => sum + getItemTotal(item), 0);

  const handleAddItem = () => {
    setNewItems([...newItems, { macro_id: "", scope_id: "", scope_item_id: "", description: "", quantity: 1, unit_value: 0, unit: "un" }]);
  };

  const handleRemoveItem = (index: number) => {
    if (newItems.length <= 1) return;
    setNewItems(newItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...newItems];
    (updated[index] as any)[field] = value;

    // Auto-fill from budget item
    if (field === "scope_item_id" && value) {
      const budgetItem = budgetItems.find(b => b.id === value);
      if (budgetItem) {
        updated[index].description = budgetItem.name;
        updated[index].unit_value = budgetItem.unit_value;
        updated[index].unit = budgetItem.unit;
        updated[index].macro_id = budgetItem.macro_id;
        updated[index].scope_id = budgetItem.scope_id;
      }
    }

    // When macro changes, reset scope and item
    if (field === "macro_id") {
      updated[index].scope_id = "";
      updated[index].scope_item_id = "";
    }
    if (field === "scope_id") {
      updated[index].scope_item_id = "";
    }

    setNewItems(updated);
  };

  const handleSelectSupplier = (supplier: Supplier) => {
    setNewInvoice({ ...newInvoice, supplier_id: supplier.id });
    setSupplierSearchValue(supplier.name);
  };

  const handleSaveInvoice = async () => {
    if (!currentProject?.id || !company?.id) return;

    if (!newInvoice.invoice_number) {
      toast.error("Informe o número da nota fiscal");
      return;
    }

    const validItems = newItems.filter(item => item.description && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error("Adicione pelo menos um item à nota fiscal");
      return;
    }

    const totalAmount = validItems.reduce((sum, item) => sum + item.quantity * item.unit_value, 0);
    const netAmount = totalAmount - (newInvoice.tax_amount || 0);

    try {
      // Insert invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          company_id: company.id,
          project_id: currentProject.id,
          supplier_id: newInvoice.supplier_id || null,
          invoice_number: newInvoice.invoice_number,
          invoice_date: newInvoice.invoice_date,
          due_date: newInvoice.due_date || null,
          total_amount: totalAmount,
          tax_amount: newInvoice.tax_amount || 0,
          net_amount: netAmount,
          description: newInvoice.description || null,
          notes: newInvoice.notes || null,
          status: "pending",
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Get macro/scope names
      const template = (currentProject as any).macrosTemplate || [];
      const macroMap: Record<string, string> = {};
      const scopeMap: Record<string, string> = {};
      template.forEach((m: any) => {
        macroMap[m.id] = m.name;
        (m.scopes || []).forEach((s: any) => { scopeMap[s.id] = s.name; });
      });

      // Insert items
      const itemsToInsert = validItems.map(item => ({
        invoice_id: invoiceData.id,
        company_id: company.id,
        project_id: currentProject.id,
        macro_id: item.macro_id || null,
        macro_name: item.macro_id ? (macroMap[item.macro_id] || null) : null,
        scope_id: item.scope_id || null,
        scope_name: item.scope_id ? (scopeMap[item.scope_id] || null) : null,
        scope_item_id: item.scope_item_id || null,
        description: item.description,
        quantity: item.quantity,
        unit_value: item.unit_value,
        total_value: item.quantity * item.unit_value,
        unit: item.unit || "un",
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Auto-create financial entry in cash flow
      const supplierName = suppliers.find(s => s.id === newInvoice.supplier_id)?.name;
      const { error: financialError } = await supabase
        .from("financial_entries")
        .insert({
          project_id: currentProject.id,
          category: "MATERIAIS",
          description: `NF ${newInvoice.invoice_number}${supplierName ? ` - ${supplierName}` : ''}`,
          amount: totalAmount,
          due_date: newInvoice.due_date || newInvoice.invoice_date,
          status: "pending",
          supplier_id: newInvoice.supplier_id || null,
          notes: `Importado automaticamente da NF ${newInvoice.invoice_number}`,
        });

      if (financialError) {
        console.error("Error creating financial entry:", financialError);
        // Don't block - invoice was saved successfully
      }

      toast.success("Nota fiscal registrada e lançada no fluxo de caixa");
      setShowAddDialog(false);
      resetForm();
      loadData();
      onInvoiceSaved?.();
    } catch (error) {
      console.error("Error saving invoice:", error);
      toast.error("Erro ao salvar nota fiscal");
    }
  };

  const resetForm = () => {
    setNewInvoice({
      invoice_number: "",
      invoice_date: format(new Date(), "yyyy-MM-dd"),
      due_date: "",
      supplier_id: "",
      description: "",
      notes: "",
      tax_amount: 0,
    });
    setNewItems([{ macro_id: "", scope_id: "", scope_item_id: "", description: "", quantity: 1, unit_value: 0, unit: "un" }]);
    setSupplierSearchValue("");
  };

  const handleViewInvoice = async (invoice: Invoice) => {
    // Load items for this invoice
    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("created_at");

    setViewingInvoice({ ...invoice, items: items || [] });
    setShowViewDialog(true);
  };

  const handleUpdateStatus = async (invoiceId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus };
      if (newStatus === "paid") updates.payment_date = format(new Date(), "yyyy-MM-dd");
      if (newStatus !== "paid") updates.payment_date = null;

      const { error } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", invoiceId);

      if (error) throw error;
      toast.success("Status atualizado");
      loadData();
      if (viewingInvoice?.id === invoiceId) {
        setViewingInvoice({ ...viewingInvoice, ...updates });
      }
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Erro ao atualizar status");
    }
  };

  const handleDeleteInvoice = async () => {
    if (!deleteInvoiceId) return;
    try {
      const { error } = await supabase.from("invoices").delete().eq("id", deleteInvoiceId);
      if (error) throw error;
      toast.success("Nota fiscal excluída");
      setDeleteInvoiceId(null);
      setShowViewDialog(false);
      loadData();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      toast.error("Erro ao excluir nota fiscal");
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const getFilteredBudgetItems = (macroId: string, scopeId: string) => {
    return budgetItems.filter(b =>
      (!macroId || b.macro_id === macroId) &&
      (!scopeId || b.scope_id === scopeId)
    );
  };

  const getScopesForMacro = (macroId: string) => {
    const macro = macroOptions.find((m: any) => m.id === macroId);
    return macro?.scopes || [];
  };

  // Totals
  const totalPending = invoices.filter(i => i.status === "pending").reduce((s, i) => s + Number(i.total_amount), 0);
  const totalApproved = invoices.filter(i => i.status === "approved").reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.total_amount), 0);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecione um projeto para gerenciar notas fiscais</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(totalPending)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <CheckCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Aprovadas</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(totalApproved)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pagas</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(totalPaid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Notas Fiscais ({invoices.length})
        </h3>
        {canEdit && (
          <Button onClick={() => setShowAddDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova NF
          </Button>
        )}
      </div>

      {/* Invoice List */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NF</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma nota fiscal registrada
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => {
                    const config = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.pending;
                    return (
                      <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewInvoice(invoice)}>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell>{(invoice.supplier as any)?.name || "—"}</TableCell>
                        <TableCell>{format(parseISO(invoice.invoice_date), "dd/MM/yy")}</TableCell>
                        <TableCell>{invoice.due_date ? format(parseISO(invoice.due_date), "dd/MM/yy") : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(invoice.total_amount))}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleViewInvoice(invoice); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Add Invoice Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { resetForm(); } setShowAddDialog(open); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Nota Fiscal</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Header fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Nº da Nota *</Label>
                <Input
                  value={newInvoice.invoice_number}
                  onChange={(e) => setNewInvoice({ ...newInvoice, invoice_number: e.target.value })}
                  placeholder="Ex: 12345"
                />
              </div>
              <div>
                <Label>Data de Emissão *</Label>
                <Input
                  type="date"
                  value={newInvoice.invoice_date}
                  onChange={(e) => setNewInvoice({ ...newInvoice, invoice_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={newInvoice.due_date}
                  onChange={(e) => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Fornecedor</Label>
                <SupplierAutocomplete
                  suppliers={suppliers}
                  value={supplierSearchValue}
                  selectedId={newInvoice.supplier_id}
                  onChange={setSupplierSearchValue}
                  onSelect={handleSelectSupplier}
                  onCreateNew={() => {}}
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={newInvoice.description}
                  onChange={(e) => setNewInvoice({ ...newInvoice, description: e.target.value })}
                  placeholder="Descrição geral da NF"
                />
              </div>
            </div>

            <Separator />

            {/* Items with budget appropriation */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Itens da Nota Fiscal</Label>
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Item
                </Button>
              </div>

              <div className="space-y-4">
                {newItems.map((item, index) => (
                  <Card key={index} className="border-border/50">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
                        {newItems.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveItem(index)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>

                      {/* Budget appropriation */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Etapa (Macro)</Label>
                          <Select value={item.macro_id} onValueChange={(v) => handleItemChange(index, "macro_id", v)}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Selecionar etapa" />
                            </SelectTrigger>
                            <SelectContent>
                              {macroOptions.map((m: any) => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Serviço (Escopo)</Label>
                          <Select
                            value={item.scope_id}
                            onValueChange={(v) => handleItemChange(index, "scope_id", v)}
                            disabled={!item.macro_id}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Selecionar serviço" />
                            </SelectTrigger>
                            <SelectContent>
                              {getScopesForMacro(item.macro_id).map((s: any) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Item do Orçamento</Label>
                          <Select
                            value={item.scope_item_id}
                            onValueChange={(v) => handleItemChange(index, "scope_item_id", v)}
                            disabled={!item.scope_id}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Selecionar item" />
                            </SelectTrigger>
                            <SelectContent>
                              {getFilteredBudgetItems(item.macro_id, item.scope_id).map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name} ({b.unit})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Item details */}
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-5">
                          <Label className="text-xs">Descrição *</Label>
                          <Input
                            className="h-9"
                            value={item.description}
                            onChange={(e) => handleItemChange(index, "description", e.target.value)}
                            placeholder="Descrição do item"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Qtd</Label>
                          <Input
                            className="h-9"
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, "quantity", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-1">
                          <Label className="text-xs">Un.</Label>
                          <Input
                            className="h-9"
                            value={item.unit}
                            onChange={(e) => handleItemChange(index, "unit", e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Valor Un.</Label>
                          <Input
                            className="h-9"
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unit_value}
                            onChange={(e) => handleItemChange(index, "unit_value", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Total</Label>
                          <Input className="h-9 bg-muted" readOnly value={formatCurrency(getItemTotal(item))} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Separator />

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Impostos Retidos</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newInvoice.tax_amount}
                  onChange={(e) => setNewInvoice({ ...newInvoice, tax_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Valor Bruto</Label>
                <Input readOnly className="bg-muted font-bold" value={formatCurrency(getInvoiceTotal())} />
              </div>
              <div>
                <Label>Valor Líquido</Label>
                <Input readOnly className="bg-muted font-bold" value={formatCurrency(getInvoiceTotal() - (newInvoice.tax_amount || 0))} />
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                value={newInvoice.notes}
                onChange={(e) => setNewInvoice({ ...newInvoice, notes: e.target.value })}
                rows={2}
                placeholder="Observações adicionais"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowAddDialog(false); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveInvoice}>
              <FileText className="h-4 w-4 mr-2" />
              Salvar NF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {viewingInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  NF {viewingInvoice.invoice_number}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block">Fornecedor</span>
                    <span className="font-medium">{(viewingInvoice.supplier as any)?.name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Emissão</span>
                    <span className="font-medium">{format(parseISO(viewingInvoice.invoice_date), "dd/MM/yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Vencimento</span>
                    <span className="font-medium">{viewingInvoice.due_date ? format(parseISO(viewingInvoice.due_date), "dd/MM/yyyy") : "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Status</span>
                    <Badge variant="secondary">{STATUS_CONFIG[viewingInvoice.status]?.label || viewingInvoice.status}</Badge>
                  </div>
                </div>

                {viewingInvoice.description && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Descrição: </span>
                    <span>{viewingInvoice.description}</span>
                  </div>
                )}

                <Separator />

                {/* Items */}
                <div>
                  <h4 className="font-semibold mb-2">Itens</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Apropriação</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor Un.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(viewingInvoice.items || []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="text-sm">{item.description}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.macro_name && item.scope_name
                              ? `${item.macro_name} › ${item.scope_name}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(item.unit_value))}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(Number(item.total_value))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">Impostos: </span>
                    <span>{formatCurrency(Number(viewingInvoice.tax_amount))}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground">Total Bruto: {formatCurrency(Number(viewingInvoice.total_amount))}</div>
                    <div className="font-bold text-lg">Líquido: {formatCurrency(Number(viewingInvoice.net_amount))}</div>
                  </div>
                </div>

                {viewingInvoice.notes && (
                  <div className="text-sm bg-muted/50 p-3 rounded-lg">
                    <span className="text-muted-foreground">Obs: </span>{viewingInvoice.notes}
                  </div>
                )}
              </div>

              <DialogFooter className="flex gap-2">
                {canEdit && viewingInvoice.status === "pending" && (
                  <Button variant="outline" onClick={() => handleUpdateStatus(viewingInvoice.id, "approved")}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Aprovar
                  </Button>
                )}
                {canEdit && (viewingInvoice.status === "pending" || viewingInvoice.status === "approved") && (
                  <Button onClick={() => handleUpdateStatus(viewingInvoice.id, "paid")} className="bg-emerald-600 hover:bg-emerald-700">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Marcar como Paga
                  </Button>
                )}
                {canEdit && viewingInvoice.status !== "cancelled" && (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteInvoiceId(viewingInvoice.id)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteInvoiceId} onOpenChange={(open) => !open && setDeleteInvoiceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Nota Fiscal?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os itens desta nota serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInvoice} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
