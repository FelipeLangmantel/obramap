import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  QrCode, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Printer,
  Undo2,
  UserPlus
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, parseISO, isSameWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useConstruction } from "@/contexts/ConstructionContext";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

interface FinancialEntry {
  id: string;
  project_id: string;
  supplier_id: string | null;
  category: string;
  subcategory: string | null;
  description: string;
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: string;
  pix_key: string | null;
  pix_key_type: string | null;
  notes: string | null;
  supplier?: {
    name: string;
    pix_key: string | null;
    pix_key_type: string | null;
    cnpj_cpf: string | null;
  };
}

interface Supplier {
  id: string;
  name: string;
  pix_key: string | null;
  pix_key_type: string | null;
  cnpj_cpf: string | null;
  supplier_scope: string;
  project_id: string;
}

const CATEGORIES = [
  "CUSTOS EXTRAS",
  "MATERIAIS",
  "MÃO DE OBRA",
  "ADM E SEGURANÇA",
  "OUTROS",
  "PÓS-OBRAS E PLANEJAMENTOS"
];

const STATUS_CONFIG = {
  pending: { label: "Pendente", color: "bg-yellow-500", icon: Clock },
  paid: { label: "Pago", color: "bg-green-500", icon: CheckCircle },
  overdue: { label: "Atrasado", color: "bg-red-500", icon: AlertCircle }
};

// CRC16-CCITT calculation for PIX
function crc16CCITT(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function generatePixPayload(pixKey: string, amount: number, merchantName: string, description: string): string {
  // PIX EMV QR Code format
  const formatValue = (id: string, value: string) => `${id}${value.length.toString().padStart(2, '0')}${value}`;
  
  // Clean values
  const cleanName = merchantName.substring(0, 25).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, '');
  const cleanDesc = description.substring(0, 25).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, '');
  const cleanAmount = amount.toFixed(2);
  
  // Build merchant account info (field 26)
  const gui = formatValue('00', 'br.gov.bcb.pix');
  const key = formatValue('01', pixKey);
  const merchantAccountInfo = formatValue('26', gui + key);
  
  // Build the payload
  let payload = '';
  payload += formatValue('00', '01'); // Payload Format Indicator
  payload += merchantAccountInfo; // Merchant Account Info
  payload += formatValue('52', '0000'); // Merchant Category Code
  payload += formatValue('53', '986'); // Transaction Currency (BRL)
  payload += formatValue('54', cleanAmount); // Transaction Amount
  payload += formatValue('58', 'BR'); // Country Code
  payload += formatValue('59', cleanName || 'Pagamento'); // Merchant Name
  payload += formatValue('60', 'SAOPAULO'); // Merchant City
  payload += formatValue('62', formatValue('05', cleanDesc || 'PIX')); // Additional Data
  
  // Calculate CRC16
  payload += '6304';
  const crc = crc16CCITT(payload);
  payload += crc;
  
  return payload;
}

export function FinancialFlowView() {
  const { currentProject } = useConstruction();
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<FinancialEntry | null>(null);
  const [showNewSupplierDialog, setShowNewSupplierDialog] = useState(false);
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [supplierSearchValue, setSupplierSearchValue] = useState("");
  
  const [newEntry, setNewEntry] = useState({
    category: "",
    subcategory: "",
    description: "",
    amount: 0,
    due_date: format(new Date(), "yyyy-MM-dd"),
    supplier_id: "",
    supplier_name: "",
    pix_key: "",
    pix_key_type: "cpf",
    notes: ""
  });

  const [newSupplier, setNewSupplier] = useState({
    name: "",
    supplier_type: "material",
    supplier_scope: "project",
    pix_key: "",
    pix_key_type: "cpf",
    cnpj_cpf: "",
    phone: "",
    email: ""
  });

  const weeks = Array.from({ length: 5 }, (_, i) => {
    const weekStart = addWeeks(currentWeekStart, i);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    return { start: weekStart, end: weekEnd };
  });

  const today = new Date();

  useEffect(() => {
    if (currentProject?.id) {
      loadData();
    }
  }, [currentProject?.id]);

  const loadData = async () => {
    if (!currentProject?.id) return;
    setIsLoading(true);

    try {
      const [entriesRes, suppliersRes] = await Promise.all([
        supabase
          .from("financial_entries")
          .select("*, supplier:suppliers(name, pix_key, pix_key_type, cnpj_cpf)")
          .eq("project_id", currentProject.id)
          .order("due_date", { ascending: true }),
        supabase
          .from("suppliers")
          .select("id, name, pix_key, pix_key_type, cnpj_cpf, supplier_scope, project_id")
          .or(`project_id.eq.${currentProject.id},supplier_scope.eq.global`)
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;

      setEntries(entriesRes.data || []);
      setSuppliers(suppliersRes.data || []);
    } catch (error) {
      console.error("Error loading financial data:", error);
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(supplierSearchValue.toLowerCase())
  );

  const handleSelectSupplier = (supplier: Supplier) => {
    setNewEntry({
      ...newEntry,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      pix_key: supplier.pix_key || newEntry.pix_key,
      pix_key_type: supplier.pix_key_type || newEntry.pix_key_type
    });
    setSupplierSearchValue(supplier.name);
    setSupplierSearchOpen(false);
  };

  const handleCreateNewSupplier = async () => {
    if (!currentProject?.id || !newSupplier.name) {
      toast.error("Preencha o nome do fornecedor");
      return;
    }

    try {
      const { data, error } = await supabase.from("suppliers").insert({
        project_id: currentProject.id,
        name: newSupplier.name,
        supplier_type: newSupplier.supplier_type,
        supplier_scope: newSupplier.supplier_scope,
        pix_key: newSupplier.pix_key || null,
        pix_key_type: newSupplier.pix_key_type || null,
        cnpj_cpf: newSupplier.cnpj_cpf || null,
        phone: newSupplier.phone || null,
        email: newSupplier.email || null
      }).select().single();

      if (error) throw error;

      toast.success("Fornecedor cadastrado com sucesso");
      setShowNewSupplierDialog(false);
      
      // Update suppliers list and select the new one
      setSuppliers([...suppliers, data]);
      setNewEntry({
        ...newEntry,
        supplier_id: data.id,
        supplier_name: data.name,
        pix_key: data.pix_key || newEntry.pix_key,
        pix_key_type: data.pix_key_type || newEntry.pix_key_type
      });
      setSupplierSearchValue(data.name);
      
      setNewSupplier({
        name: "",
        supplier_type: "material",
        supplier_scope: "project",
        pix_key: "",
        pix_key_type: "cpf",
        cnpj_cpf: "",
        phone: "",
        email: ""
      });
    } catch (error) {
      console.error("Error creating supplier:", error);
      toast.error("Erro ao cadastrar fornecedor");
    }
  };

  const handleAddEntry = async () => {
    if (!currentProject?.id || !newEntry.description || !newEntry.category) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    try {
      const { error } = await supabase.from("financial_entries").insert({
        project_id: currentProject.id,
        category: newEntry.category,
        subcategory: newEntry.subcategory || null,
        description: newEntry.description,
        amount: newEntry.amount,
        due_date: newEntry.due_date,
        supplier_id: newEntry.supplier_id || null,
        pix_key: newEntry.pix_key || null,
        pix_key_type: newEntry.pix_key_type || null,
        notes: newEntry.notes || null,
        status: "pending"
      });

      if (error) throw error;

      toast.success("Lançamento adicionado com sucesso");
      setShowAddDialog(false);
      setNewEntry({
        category: "",
        subcategory: "",
        description: "",
        amount: 0,
        due_date: format(new Date(), "yyyy-MM-dd"),
        supplier_id: "",
        supplier_name: "",
        pix_key: "",
        pix_key_type: "cpf",
        notes: ""
      });
      setSupplierSearchValue("");
      loadData();
    } catch (error) {
      console.error("Error adding entry:", error);
      toast.error("Erro ao adicionar lançamento");
    }
  };

  const handleMarkAsPaid = async (entry: FinancialEntry) => {
    try {
      const { error } = await supabase
        .from("financial_entries")
        .update({ status: "paid", payment_date: format(new Date(), "yyyy-MM-dd") })
        .eq("id", entry.id);

      if (error) throw error;
      toast.success("Pagamento registrado");
      loadData();
    } catch (error) {
      console.error("Error updating entry:", error);
      toast.error("Erro ao atualizar lançamento");
    }
  };

  const handleUndoPayment = async (entry: FinancialEntry) => {
    try {
      const { error } = await supabase
        .from("financial_entries")
        .update({ status: "pending", payment_date: null })
        .eq("id", entry.id);

      if (error) throw error;
      toast.success("Pagamento desfeito");
      loadData();
    } catch (error) {
      console.error("Error updating entry:", error);
      toast.error("Erro ao desfazer pagamento");
    }
  };

  const openQRCode = (entry: FinancialEntry) => {
    setSelectedEntry(entry);
    setShowQRDialog(true);
  };

  const getEntriesForWeek = (weekStart: Date, weekEnd: Date) => {
    return entries.filter(entry => {
      const dueDate = parseISO(entry.due_date);
      return isWithinInterval(dueDate, { start: weekStart, end: weekEnd });
    });
  };

  const getCategoryTotal = (category: string, weekStart: Date, weekEnd: Date) => {
    return getEntriesForWeek(weekStart, weekEnd)
      .filter(e => e.category === category)
      .reduce((sum, e) => sum + Number(e.amount), 0);
  };

  const getWeekTotal = (weekStart: Date, weekEnd: Date) => {
    return getEntriesForWeek(weekStart, weekEnd)
      .reduce((sum, e) => sum + Number(e.amount), 0);
  };

  const isCurrentWeek = (weekStart: Date) => {
    return isSameWeek(weekStart, today, { weekStartsOn: 1 });
  };

  const generatePaymentReport = () => {
    const pendingEntries = entries.filter(e => e.status === "pending");
    
    let report = `RELATÓRIO DE PAGAMENTOS - ${currentProject?.name}\n`;
    report += `Data: ${format(new Date(), "dd/MM/yyyy HH:mm")}\n\n`;
    report += "=".repeat(60) + "\n\n";

    CATEGORIES.forEach(category => {
      const categoryEntries = pendingEntries.filter(e => e.category === category);
      if (categoryEntries.length > 0) {
        report += `${category}\n`;
        report += "-".repeat(40) + "\n";
        categoryEntries.forEach(entry => {
          report += `• ${entry.description}\n`;
          report += `  Valor: R$ ${Number(entry.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
          report += `  Vencimento: ${format(parseISO(entry.due_date), "dd/MM/yyyy")}\n`;
          if (entry.pix_key || entry.supplier?.pix_key) {
            report += `  PIX: ${entry.pix_key || entry.supplier?.pix_key}\n`;
          }
          report += "\n";
        });
      }
    });

    report += "=".repeat(60) + "\n";
    report += `TOTAL PENDENTE: R$ ${pendingEntries.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;

    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_pagamentos_${format(new Date(), "yyyy-MM-dd")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório gerado com sucesso");
  };

  const getPixPayloadForEntry = (entry: FinancialEntry) => {
    const pixKey = entry.pix_key || entry.supplier?.pix_key || "";
    if (!pixKey) return "";
    
    const merchantName = entry.supplier?.name || "Pagamento";
    const description = entry.description.substring(0, 25);
    
    return generatePixPayload(pixKey, Number(entry.amount), merchantName, description);
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecione um projeto para visualizar o fluxo financeiro</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Fluxo Financeiro</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generatePaymentReport}>
            <Printer className="h-4 w-4 mr-2" />
            Relatório de Pagamentos
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Week Navigation */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}>
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <CardTitle className="text-lg">
              {format(currentWeekStart, "MMMM yyyy", { locale: ptBR })}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px] sticky left-0 bg-background z-10">Categoria / Descrição</TableHead>
                  {weeks.map((week, i) => (
                    <TableHead 
                      key={i} 
                      className={cn(
                        "text-center min-w-[140px]",
                        isCurrentWeek(week.start) && "bg-primary/20"
                      )}
                    >
                      <div className={cn(
                        "font-semibold",
                        isCurrentWeek(week.start) && "text-primary"
                      )}>
                        {format(week.start, "dd/MM")} a {format(week.end, "dd/MM")}
                        {isCurrentWeek(week.start) && (
                          <Badge className="ml-2 text-xs" variant="secondary">Atual</Badge>
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Total Row */}
                <TableRow className="bg-primary/10 font-bold">
                  <TableCell className="sticky left-0 bg-primary/10">TOTAL</TableCell>
                  {weeks.map((week, i) => (
                    <TableCell 
                      key={i} 
                      className={cn(
                        "text-center",
                        isCurrentWeek(week.start) && "bg-primary/20"
                      )}
                    >
                      R$ {getWeekTotal(week.start, week.end).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Categories and Entries */}
                {CATEGORIES.map(category => {
                  const hasEntries = entries.some(e => e.category === category);
                  if (!hasEntries) return null;

                  return (
                    <>
                      <TableRow key={category} className="bg-muted/50">
                        <TableCell className="font-semibold sticky left-0 bg-muted/50">{category}</TableCell>
                        {weeks.map((week, i) => {
                          const total = getCategoryTotal(category, week.start, week.end);
                          return (
                            <TableCell 
                              key={i} 
                              className={cn(
                                "text-center font-semibold",
                                isCurrentWeek(week.start) && "bg-primary/10"
                              )}
                            >
                              {total > 0 ? `R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      {entries
                        .filter(e => e.category === category)
                        .map(entry => (
                          <TableRow key={entry.id} className="hover:bg-muted/30">
                            <TableCell className="pl-6 sticky left-0 bg-background">
                              <div className="flex items-center gap-2">
                                <span className={entry.status === "paid" ? "line-through text-muted-foreground" : ""}>
                                  {entry.description}
                                </span>
                                <Badge variant={entry.status === "paid" ? "secondary" : entry.status === "overdue" ? "destructive" : "default"} className="text-xs">
                                  {STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG]?.label || entry.status}
                                </Badge>
                              </div>
                            </TableCell>
                            {weeks.map((week, i) => {
                              const dueDate = parseISO(entry.due_date);
                              const isInWeek = isWithinInterval(dueDate, { start: week.start, end: week.end });
                              
                              return (
                                <TableCell 
                                  key={i} 
                                  className={cn(
                                    "text-center",
                                    isCurrentWeek(week.start) && "bg-primary/5"
                                  )}
                                >
                                  {isInWeek ? (
                                    <div className="space-y-1">
                                      <div 
                                        className={cn(
                                          "font-medium cursor-pointer hover:underline",
                                          entry.status === "paid" && "text-green-600",
                                          entry.status === "overdue" && "text-red-600"
                                        )}
                                        onClick={() => openQRCode(entry)}
                                      >
                                        R$ {Number(entry.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </div>
                                      <div className="flex gap-1 justify-center">
                                        {entry.status === "pending" && (
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-6 text-xs"
                                            onClick={() => handleMarkAsPaid(entry)}
                                          >
                                            <CheckCircle className="h-3 w-3 mr-1" />
                                            Pagar
                                          </Button>
                                        )}
                                        {entry.status === "paid" && (
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-6 text-xs text-orange-600 hover:text-orange-700"
                                            onClick={() => handleUndoPayment(entry)}
                                          >
                                            <Undo2 className="h-3 w-3 mr-1" />
                                            Desfazer
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  ) : null}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Add Entry Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Lançamento Financeiro</DialogTitle>
            <DialogDescription>Adicione um novo lançamento ao fluxo de caixa</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Categoria *</Label>
              <Select value={newEntry.category} onValueChange={(v) => setNewEntry({ ...newEntry, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Descrição *</Label>
              <Input 
                value={newEntry.description}
                onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                placeholder="Ex: Pagamento materiais"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$) *</Label>
                <Input 
                  type="number"
                  value={newEntry.amount}
                  onChange={(e) => setNewEntry({ ...newEntry, amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Vencimento *</Label>
                <Input 
                  type="date"
                  value={newEntry.due_date}
                  onChange={(e) => setNewEntry({ ...newEntry, due_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Fornecedor</Label>
              <Popover open={supplierSearchOpen} onOpenChange={setSupplierSearchOpen}>
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Input
                      value={supplierSearchValue}
                      onChange={(e) => {
                        setSupplierSearchValue(e.target.value);
                        setSupplierSearchOpen(true);
                        if (!e.target.value) {
                          setNewEntry({ ...newEntry, supplier_id: "", supplier_name: "" });
                        }
                      }}
                      onFocus={() => setSupplierSearchOpen(true)}
                      placeholder="Digite para buscar ou criar fornecedor..."
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandList>
                      {filteredSuppliers.length > 0 ? (
                        <CommandGroup heading="Fornecedores">
                          {filteredSuppliers.map(supplier => (
                            <CommandItem 
                              key={supplier.id} 
                              onSelect={() => handleSelectSupplier(supplier)}
                              className="cursor-pointer"
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{supplier.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {supplier.supplier_scope === 'global' ? 'Geral' : 'Obra'}
                                </Badge>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null}
                      {supplierSearchValue && !filteredSuppliers.some(s => s.name.toLowerCase() === supplierSearchValue.toLowerCase()) && (
                        <CommandGroup>
                          <CommandItem 
                            onSelect={() => {
                              setNewSupplier({ ...newSupplier, name: supplierSearchValue });
                              setShowNewSupplierDialog(true);
                              setSupplierSearchOpen(false);
                            }}
                            className="cursor-pointer text-primary"
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            Cadastrar "{supplierSearchValue}" como novo fornecedor
                          </CommandItem>
                        </CommandGroup>
                      )}
                      {!supplierSearchValue && filteredSuppliers.length === 0 && (
                        <CommandEmpty>
                          <div className="p-2 text-sm text-muted-foreground">
                            Nenhum fornecedor cadastrado. Digite um nome para criar.
                          </div>
                        </CommandEmpty>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Chave PIX</Label>
                <Input 
                  value={newEntry.pix_key}
                  onChange={(e) => setNewEntry({ ...newEntry, pix_key: e.target.value })}
                  placeholder="CPF, CNPJ, Email..."
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={newEntry.pix_key_type} onValueChange={(v) => setNewEntry({ ...newEntry, pix_key_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="random">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea 
                value={newEntry.notes}
                onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                placeholder="Notas adicionais..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
              <Button onClick={handleAddEntry}>Adicionar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Supplier Dialog */}
      <Dialog open={showNewSupplierDialog} onOpenChange={setShowNewSupplierDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Fornecedor</DialogTitle>
            <DialogDescription>O fornecedor será salvo automaticamente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input 
                value={newSupplier.name}
                onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={newSupplier.supplier_type} onValueChange={(v) => setNewSupplier({ ...newSupplier, supplier_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">Materiais</SelectItem>
                    <SelectItem value="labor">Mão de Obra</SelectItem>
                    <SelectItem value="equipment">Equipamentos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Escopo</Label>
                <Select value={newSupplier.supplier_scope} onValueChange={(v) => setNewSupplier({ ...newSupplier, supplier_scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Apenas esta Obra</SelectItem>
                    <SelectItem value="global">Geral (todas as obras)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CPF/CNPJ</Label>
                <Input 
                  value={newSupplier.cnpj_cpf}
                  onChange={(e) => setNewSupplier({ ...newSupplier, cnpj_cpf: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input 
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Chave PIX</Label>
                <Input 
                  value={newSupplier.pix_key}
                  onChange={(e) => setNewSupplier({ ...newSupplier, pix_key: e.target.value })}
                />
              </div>
              <div>
                <Label>Tipo PIX</Label>
                <Select value={newSupplier.pix_key_type} onValueChange={(v) => setNewSupplier({ ...newSupplier, pix_key_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="random">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSupplierDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateNewSupplier} disabled={!newSupplier.name}>
              <UserPlus className="h-4 w-4 mr-2" />
              Cadastrar e Usar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Pagamento PIX
            </DialogTitle>
            <DialogDescription>Escaneie o QR Code para pagar</DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4 text-center">
              <div className="bg-white p-4 rounded-lg inline-block mx-auto">
                {(selectedEntry.pix_key || selectedEntry.supplier?.pix_key) ? (
                  <QRCodeSVG 
                    value={getPixPayloadForEntry(selectedEntry)}
                    size={192}
                    level="M"
                    includeMargin={true}
                  />
                ) : (
                  <div className="w-48 h-48 border-2 border-dashed border-muted-foreground flex items-center justify-center">
                    <div className="text-center text-sm text-muted-foreground">
                      <QrCode className="h-12 w-12 mx-auto mb-2" />
                      <p>Chave PIX não informada</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <p className="font-semibold text-lg">
                  R$ {Number(selectedEntry.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-muted-foreground">{selectedEntry.description}</p>
                {selectedEntry.supplier?.name && (
                  <p className="text-sm">Favorecido: {selectedEntry.supplier.name}</p>
                )}
                {(selectedEntry.pix_key || selectedEntry.supplier?.pix_key) && (
                  <div className="mt-2 p-2 bg-muted rounded">
                    <p className="text-xs text-muted-foreground">Chave PIX:</p>
                    <p className="font-mono text-sm break-all">
                      {selectedEntry.pix_key || selectedEntry.supplier?.pix_key}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setShowQRDialog(false)}>
                  Fechar
                </Button>
                {selectedEntry.status === "pending" ? (
                  <Button onClick={() => {
                    handleMarkAsPaid(selectedEntry);
                    setShowQRDialog(false);
                  }}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Marcar como Pago
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    className="text-orange-600"
                    onClick={() => {
                      handleUndoPayment(selectedEntry);
                      setShowQRDialog(false);
                    }}
                  >
                    <Undo2 className="h-4 w-4 mr-2" />
                    Desfazer Pagamento
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
