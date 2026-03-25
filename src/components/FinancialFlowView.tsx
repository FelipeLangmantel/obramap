import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  QrCode, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  FileText,
  Undo2,
  UserPlus,
  Settings,
  Trash2,
  BarChart3
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isWithinInterval, parseISO, isSameWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { SupplierAutocomplete } from "./financial/SupplierAutocomplete";
import { CategoryManagement } from "./financial/CategoryManagement";
import { FinancialAnalyticsPanel } from "./financial/FinancialAnalyticsPanel";
import { generatePDFReport } from "./financial/generatePDFReport";
import { SupplierTypesManagement } from "./financial/SupplierTypesManagement";
import { InvoiceManagementView } from "./financial/InvoiceManagementView";

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

const DEFAULT_CATEGORIES = [
  "CUSTOS EXTRAS",
  "MATERIAIS",
  "MÃO DE OBRA",
  "ADM E SEGURANÇA",
  "OUTROS",
  "PÓS-OBRAS E PLANEJAMENTOS"
];

const DEFAULT_SUPPLIER_TYPES = [
  "Materiais",
  "Mão de Obra",
  "Equipamentos",
  "Assessoria",
  "Serviços"
];

const STATUS_CONFIG = {
  pending: { label: "Pendente", color: "bg-yellow-500", icon: Clock },
  paid: { label: "Pago", color: "bg-green-500", icon: CheckCircle },
  overdue: { label: "Atrasado", color: "bg-red-500", icon: AlertCircle }
};

// CRC16-CCITT calculation for PIX (polynomial 0x1021)
function crc16CCITT(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// Format a PIX EMV field: ID + Length (2 digits) + Value
function formatEMVField(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

// Sanitize text for PIX (remove accents, special chars, uppercase)
function sanitizePixText(text: string, maxLength: number = 25): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .substring(0, maxLength)
    .toUpperCase()
    .trim() || "PAGAMENTO";
}

// Generate a valid PIX BR Code (EMV-QR) payload
function generatePixPayload(pixKey: string, amount: number, merchantName: string, merchantCity: string = "SAO PAULO"): string {
  // Validate PIX key
  if (!pixKey || pixKey.trim() === '') {
    return '';
  }
  
  const cleanKey = pixKey.trim();
  const cleanName = sanitizePixText(merchantName, 25);
  const cleanCity = sanitizePixText(merchantCity, 15);
  const cleanAmount = amount.toFixed(2);
  
  // Build Merchant Account Information (ID 26)
  // 00: GUI - br.gov.bcb.pix (mandatory)
  // 01: PIX Key (mandatory)
  const gui = formatEMVField('00', 'br.gov.bcb.pix');
  const key = formatEMVField('01', cleanKey);
  const merchantAccountInfo = formatEMVField('26', gui + key);
  
  // Build the payload without CRC
  let payload = '';
  payload += formatEMVField('00', '01');                    // Payload Format Indicator
  payload += merchantAccountInfo;                           // Merchant Account Information
  payload += formatEMVField('52', '0000');                  // Merchant Category Code
  payload += formatEMVField('53', '986');                   // Transaction Currency (986 = BRL)
  
  if (amount > 0) {
    payload += formatEMVField('54', cleanAmount);           // Transaction Amount
  }
  
  payload += formatEMVField('58', 'BR');                    // Country Code
  payload += formatEMVField('59', cleanName);              // Merchant Name
  payload += formatEMVField('60', cleanCity);              // Merchant City
  
  // Add CRC placeholder and calculate
  payload += '6304';
  const crc = crc16CCITT(payload);
  payload += crc;
  
  return payload;
}

// Generate boleto barcode payload for QR Code (compatible with bank apps)
function generateBoletoPayload(barcodeOrLine: string): string {
  // Clean the input - remove spaces, dots, and special chars
  const cleaned = barcodeOrLine.replace(/[\s.\-]/g, '');
  
  // If it's a linha digitável (47 or 48 digits), return as is for bank app
  if (cleaned.length >= 44) {
    return cleaned;
  }
  
  return cleaned;
}

export function FinancialFlowView() {
  const { currentProject } = useConstruction();
  const { canEdit, company } = useAuth();
  const companyId = company?.id;
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("analytics");
  
  // Dialogs
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [showNewSupplierDialog, setShowNewSupplierDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showSupplierTypesDialog, setShowSupplierTypesDialog] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [supplierTypes, setSupplierTypes] = useState<string[]>(DEFAULT_SUPPLIER_TYPES);
  
  const [selectedEntry, setSelectedEntry] = useState<FinancialEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<FinancialEntry | null>(null);
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
    notes: "",
    payment_type: "pix" as "pix" | "boleto",
    boleto_code: "",
    installments: 1,
    installment_interval: 30
  });

  const [newSupplier, setNewSupplier] = useState({
    name: "",
    supplier_type: "",
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
      const [entriesRes, suppliersRes, projectRes] = await Promise.all([
        supabase
          .from("financial_entries")
          .select("*, supplier:suppliers(name, pix_key, pix_key_type, cnpj_cpf)")
          .eq("project_id", currentProject.id)
          .order("due_date", { ascending: true }),
        supabase
          .from("suppliers")
          .select("id, name, pix_key, pix_key_type, cnpj_cpf, supplier_scope, project_id")
          .or(`project_id.eq.${currentProject.id},supplier_scope.eq.global`),
        supabase
          .from("projects")
          .select("financial_categories")
          .eq("id", currentProject.id)
          .single()
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;

      setEntries(entriesRes.data || []);
      setSuppliers(suppliersRes.data || []);
      
      // Load project-specific categories
      if (projectRes.data?.financial_categories) {
        const projectCategories = projectRes.data.financial_categories as string[];
        if (Array.isArray(projectCategories) && projectCategories.length > 0) {
          setCategories(projectCategories);
        }
      }
    } catch (error) {
      console.error("Error loading financial data:", error);
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoriesChange = async (newCategories: string[]) => {
    if (!canEdit) return;
    if (!currentProject?.id) return;
    
    setCategories(newCategories);
    
    try {
      const { error } = await supabase
        .from("projects")
        .update({ financial_categories: newCategories })
        .eq("id", currentProject.id);
      
      if (error) throw error;
    } catch (error) {
      console.error("Error saving categories:", error);
      toast.error("Erro ao salvar categorias");
    }
  };

  const handleSelectSupplier = (supplier: Supplier) => {
    setNewEntry({
      ...newEntry,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      pix_key: supplier.pix_key || newEntry.pix_key,
      pix_key_type: supplier.pix_key_type || newEntry.pix_key_type
    });
    setSupplierSearchValue(supplier.name);
  };

  const handleCreateNewSupplier = async () => {
    if (!canEdit) return;
    if (!currentProject?.id || !newSupplier.name) {
      toast.error("Preencha o nome do fornecedor");
      return;
    }

    try {
      const { data, error } = await supabase.from("suppliers").insert({
        project_id: currentProject.id,
        company_id: companyId!,
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
        supplier_type: "",
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
      const installments = newEntry.installments || 1;
      const baseAmount = newEntry.amount / installments;
      const baseDate = parseISO(newEntry.due_date);
      
      const entriesToInsert = [];
      
      for (let i = 0; i < installments; i++) {
        const dueDate = addDays(baseDate, i * newEntry.installment_interval);
        const description = installments > 1 
          ? `${newEntry.description} (${i + 1}/${installments})`
          : newEntry.description;
        
        entriesToInsert.push({
          project_id: currentProject.id,
          category: newEntry.category,
          subcategory: newEntry.subcategory || null,
          description,
          amount: baseAmount,
          due_date: format(dueDate, "yyyy-MM-dd"),
          supplier_id: newEntry.supplier_id || null,
          pix_key: newEntry.payment_type === "pix" ? (newEntry.pix_key || null) : null,
          pix_key_type: newEntry.payment_type === "pix" ? (newEntry.pix_key_type || null) : null,
          notes: newEntry.payment_type === "boleto" && newEntry.boleto_code 
            ? `Boleto: ${newEntry.boleto_code}${newEntry.notes ? '\n' + newEntry.notes : ''}`
            : (newEntry.notes || null),
          status: "pending"
        });
      }

      const { error } = await supabase.from("financial_entries").insert(entriesToInsert);

      if (error) throw error;

      toast.success(installments > 1 
        ? `${installments} parcelas adicionadas com sucesso`
        : "Lançamento adicionado com sucesso"
      );
      setShowAddDialog(false);
      resetNewEntry();
      loadData();
    } catch (error) {
      console.error("Error adding entry:", error);
      toast.error("Erro ao adicionar lançamento");
    }
  };

  const resetNewEntry = () => {
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
      notes: "",
      payment_type: "pix",
      boleto_code: "",
      installments: 1,
      installment_interval: 30
    });
    setSupplierSearchValue("");
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

  const handleDeleteEntry = async () => {
    if (!deleteEntryId) return;
    
    try {
      const { error } = await supabase
        .from("financial_entries")
        .delete()
        .eq("id", deleteEntryId);

      if (error) throw error;
      toast.success("Lançamento excluído");
      setDeleteEntryId(null);
      setShowEditDialog(false);
      setEditingEntry(null);
      loadData();
    } catch (error) {
      console.error("Error deleting entry:", error);
      toast.error("Erro ao excluir lançamento");
    }
  };

  const openEditDialog = (entry: FinancialEntry) => {
    setEditingEntry(entry);
    setNewEntry({
      category: entry.category,
      subcategory: entry.subcategory || "",
      description: entry.description,
      amount: Number(entry.amount),
      due_date: entry.due_date,
      supplier_id: entry.supplier_id || "",
      supplier_name: entry.supplier?.name || "",
      pix_key: entry.pix_key || "",
      pix_key_type: entry.pix_key_type || "cpf",
      notes: entry.notes || "",
      payment_type: "pix",
      boleto_code: "",
      installments: 1,
      installment_interval: 30
    });
    setSupplierSearchValue(entry.supplier?.name || "");
    setShowEditDialog(true);
  };

  const handleUpdateEntry = async () => {
    if (!editingEntry || !newEntry.description || !newEntry.category) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    try {
      const { error } = await supabase
        .from("financial_entries")
        .update({
          category: newEntry.category,
          subcategory: newEntry.subcategory || null,
          description: newEntry.description,
          amount: newEntry.amount,
          due_date: newEntry.due_date,
          supplier_id: newEntry.supplier_id || null,
          pix_key: newEntry.pix_key || null,
          pix_key_type: newEntry.pix_key_type || null,
          notes: newEntry.notes || null
        })
        .eq("id", editingEntry.id);

      if (error) throw error;

      toast.success("Lançamento atualizado com sucesso");
      setShowEditDialog(false);
      setEditingEntry(null);
      resetNewEntry();
      loadData();
    } catch (error) {
      console.error("Error updating entry:", error);
      toast.error("Erro ao atualizar lançamento");
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

  const handleGeneratePDF = () => {
    if (!currentProject) return;
    
    try {
      generatePDFReport({
        projectName: currentProject.name,
        entries,
        categories,
        filterStatus: 'pending'
      });
      toast.success("PDF gerado com sucesso");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Erro ao gerar PDF");
    }
  };

  const getPixPayloadForEntry = (entry: FinancialEntry) => {
    const pixKey = entry.pix_key || entry.supplier?.pix_key || "";
    if (!pixKey) return "";
    
    const merchantName = entry.supplier?.name || "Pagamento";
    
    return generatePixPayload(pixKey, Number(entry.amount), merchantName);
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
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setShowCategoryDialog(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Categorias
            </Button>
          )}
          <Button variant="outline" onClick={handleGeneratePDF}>
            <FileText className="h-4 w-4 mr-2" />
            Gerar PDF
          </Button>
          {canEdit && (
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Lançamento
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Análises
          </TabsTrigger>
          <TabsTrigger value="flow">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="invoices">
            <FileText className="h-4 w-4 mr-2" />
            Notas Fiscais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="space-y-4">
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
                    {categories.map(category => {
                      const categoryEntries = entries.filter(e => e.category === category);
                      if (categoryEntries.length === 0) return null;

                      return (
                        <React.Fragment key={category}>
                          <TableRow className="bg-muted/50">
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
                          {categoryEntries.map(entry => (
                            <TableRow key={entry.id} className="hover:bg-muted/30 group">
                              <TableCell className="pl-6 sticky left-0 bg-background">
                                <div 
                                  className="flex flex-col gap-0.5 cursor-pointer"
                                  onClick={() => openEditDialog(entry)}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "font-medium",
                                      entry.status === "paid" && "line-through text-muted-foreground"
                                    )}>
                                      {entry.supplier?.name || entry.description}
                                    </span>
                                    <Badge variant={entry.status === "paid" ? "secondary" : entry.status === "overdue" ? "destructive" : "default"} className="text-xs">
                                      {STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG]?.label || entry.status}
                                    </Badge>
                                  </div>
                                  {entry.supplier?.name && expandedEntryId === entry.id && (
                                    <span className="text-xs text-muted-foreground">{entry.description}</span>
                                  )}
                                  {entry.supplier?.name && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground w-fit"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedEntryId(expandedEntryId === entry.id ? null : entry.id);
                                      }}
                                    >
                                      {expandedEntryId === entry.id ? "Ocultar serviço" : "Ver serviço"}
                                    </Button>
                                  )}
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
                                        {canEdit && (
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
                                        )}
                                      </div>
                                    ) : null}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <FinancialAnalyticsPanel entries={entries} categories={categories} />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoiceManagementView onInvoiceSaved={loadData} />
        </TabsContent>
      </Tabs>

      {/* Add Entry Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Novo Lançamento Financeiro</DialogTitle>
            <DialogDescription>Adicione um novo lançamento ao fluxo de caixa</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 pb-2">
              <div>
                <Label>Categoria *</Label>
                <Select value={newEntry.category} onValueChange={(v) => setNewEntry({ ...newEntry, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
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
                  <Label>Valor Total (R$) *</Label>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Parcelas</Label>
                  <Select 
                    value={String(newEntry.installments)} 
                    onValueChange={(v) => setNewEntry({ ...newEntry, installments: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                        <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newEntry.installments > 1 && (
                  <div>
                    <Label>Intervalo (dias)</Label>
                    <Select 
                      value={String(newEntry.installment_interval)} 
                      onValueChange={(v) => setNewEntry({ ...newEntry, installment_interval: parseInt(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 dias</SelectItem>
                        <SelectItem value="14">14 dias</SelectItem>
                        <SelectItem value="15">15 dias</SelectItem>
                        <SelectItem value="30">30 dias</SelectItem>
                        <SelectItem value="60">60 dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {newEntry.installments > 1 && (
                <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                  {newEntry.installments} parcelas de R$ {(newEntry.amount / newEntry.installments).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              )}

              <div>
                <Label>Fornecedor</Label>
                <SupplierAutocomplete
                  suppliers={suppliers}
                  value={supplierSearchValue}
                  selectedId={newEntry.supplier_id}
                  onChange={setSupplierSearchValue}
                  onSelect={handleSelectSupplier}
                  onCreateNew={(name) => {
                    setNewSupplier({ ...newSupplier, name });
                    setShowNewSupplierDialog(true);
                  }}
                />
              </div>

              <div>
                <Label>Tipo de Pagamento</Label>
                <Select 
                  value={newEntry.payment_type} 
                  onValueChange={(v: "pix" | "boleto") => setNewEntry({ ...newEntry, payment_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="boleto">Boleto Bancário</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newEntry.payment_type === "pix" && (
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
                    <Label>Tipo da Chave</Label>
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
              )}

              {newEntry.payment_type === "boleto" && (
                <div>
                  <Label>Linha Digitável do Boleto</Label>
                  <Input 
                    value={newEntry.boleto_code}
                    onChange={(e) => setNewEntry({ ...newEntry, boleto_code: e.target.value })}
                    placeholder="Cole a linha digitável (47 ou 48 dígitos)"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    O QR Code gerado permitirá o pagamento direto no app do banco
                  </p>
                </div>
              )}

              <div>
                <Label>Observações</Label>
                <Textarea 
                  value={newEntry.notes}
                  onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                  placeholder="Notas adicionais..."
                  rows={2}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetNewEntry(); }}>Cancelar</Button>
            <Button onClick={handleAddEntry}>Lançar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { 
        setShowEditDialog(open); 
        if (!open) { setEditingEntry(null); resetNewEntry(); }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Editar Lançamento</DialogTitle>
            <DialogDescription>Atualize os dados do lançamento financeiro</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 pb-2">
              <div>
                <Label>Categoria *</Label>
                <Select value={newEntry.category} onValueChange={(v) => setNewEntry({ ...newEntry, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
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
                <SupplierAutocomplete
                  suppliers={suppliers}
                  value={supplierSearchValue}
                  selectedId={newEntry.supplier_id}
                  onChange={setSupplierSearchValue}
                  onSelect={handleSelectSupplier}
                  onCreateNew={(name) => {
                    setNewSupplier({ ...newSupplier, name });
                    setShowNewSupplierDialog(true);
                  }}
                />
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
                  rows={2}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <div className="flex justify-between w-full">
              <Button 
                variant="destructive" 
                onClick={() => setDeleteEntryId(editingEntry?.id || null)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingEntry(null); resetNewEntry(); }}>Cancelar</Button>
                <Button onClick={handleUpdateEntry}>Salvar</Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Supplier Dialog */}
      <Dialog open={showNewSupplierDialog} onOpenChange={setShowNewSupplierDialog}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Cadastrar Novo Fornecedor</DialogTitle>
            <DialogDescription>O fornecedor será salvo automaticamente</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 pb-2">
              <div>
                <Label>Nome *</Label>
                <Input 
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Tipo</Label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs"
                    onClick={() => setShowSupplierTypesDialog(true)}
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    Editar tipos
                  </Button>
                </div>
                <Select value={newSupplier.supplier_type} onValueChange={(v) => setNewSupplier({ ...newSupplier, supplier_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    {supplierTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Disponível para</Label>
                <Select value={newSupplier.supplier_scope} onValueChange={(v) => setNewSupplier({ ...newSupplier, supplier_scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Esta Obra</SelectItem>
                    <SelectItem value="global">Todas as Obras</SelectItem>
                  </SelectContent>
                </Select>
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
          </ScrollArea>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowNewSupplierDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateNewSupplier} disabled={!newSupplier.name}>
              <UserPlus className="h-4 w-4 mr-2" />
              Cadastrar e Usar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Management */}
      <CategoryManagement
        open={showCategoryDialog}
        onOpenChange={setShowCategoryDialog}
        categories={categories}
        onCategoriesChange={handleCategoriesChange}
      />

      {/* Supplier Types Management */}
      <SupplierTypesManagement
        open={showSupplierTypesDialog}
        onOpenChange={setShowSupplierTypesDialog}
        types={supplierTypes}
        onTypesChange={setSupplierTypes}
      />

      {/* Delete Entry Confirmation */}
      <AlertDialog open={!!deleteEntryId} onOpenChange={() => setDeleteEntryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lançamento financeiro? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              {selectedEntry?.notes?.includes("Boleto:") ? "Pagamento Boleto" : "Pagamento PIX"}
            </DialogTitle>
            <DialogDescription>Escaneie o QR Code para pagar</DialogDescription>
          </DialogHeader>
          {selectedEntry && (() => {
            // Check if it's a boleto payment (extract from notes)
            const boletoMatch = selectedEntry.notes?.match(/Boleto:\s*(\d+)/);
            const boletoCode = boletoMatch ? boletoMatch[1] : null;
            const pixKey = selectedEntry.pix_key || selectedEntry.supplier?.pix_key || "";
            const hasValidPayment = boletoCode || pixKey;
            
            return (
              <div className="space-y-4 text-center">
                <div className="bg-white p-4 rounded-lg inline-block mx-auto">
                  {hasValidPayment ? (
                    <QRCodeSVG 
                      value={boletoCode ? generateBoletoPayload(boletoCode) : getPixPayloadForEntry(selectedEntry)}
                      size={192}
                      level="M"
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center text-muted-foreground text-sm">
                      Sem dados de pagamento cadastrados
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="font-semibold">{selectedEntry.description}</p>
                  <p className="text-2xl font-bold text-primary">
                    R$ {Number(selectedEntry.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  {selectedEntry.supplier?.name && (
                    <p className="text-sm text-muted-foreground">
                      Fornecedor: {selectedEntry.supplier.name}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Vencimento: {format(parseISO(selectedEntry.due_date), "dd/MM/yyyy")}
                  </p>
                  {boletoCode && (
                    <p className="text-xs text-muted-foreground bg-muted p-2 rounded break-all">
                      Linha: {boletoCode}
                    </p>
                  )}
                </div>
                {canEdit && selectedEntry.status === "pending" && (
                  <Button 
                    onClick={() => {
                      handleMarkAsPaid(selectedEntry);
                      setShowQRDialog(false);
                    }}
                    className="w-full"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Marcar como Pago
                  </Button>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
