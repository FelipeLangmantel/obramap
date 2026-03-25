import { useState, useEffect, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Factory, Plus, ChevronLeft, AlertTriangle, Loader2, Trash2, Zap, Pencil } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FactoriesTabContent } from "./FactoriesTabContent";
import { LiftingTabContent } from "./LiftingTabContent";
import { OverviewTabContent } from "./OverviewTabContent";
import { InstallationTabContent } from "./InstallationTabContent";
import { BatchesTabContent } from "./BatchesTabContent";
import { LogisticsTabContent } from "./LogisticsTabContent";

interface OperationContext {
  id: string;
  company_id: string;
  context_type: "integrated" | "standalone";
  obramap_project_id: string | null;
  obras_portfolio_id: string | null;
  name: string;
  description: string | null;
  location: string | null;
  client_name: string | null;
  total_units: number;
  status: string;
  created_at: string;
}

interface ObraPortfolioItem {
  id: string;
  nome: string;
  uh: number | null;
  empresa: string | null;
  num_contrato: string | null;
  obramap_project_id: string | null;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function IndustrializationModuleView() {
  const { projects } = useConstruction();
  const { profile, isCompanyAdmin, canEdit, requireEdit } = useAuth();
  const companyId = profile?.company_id;

  const [view, setView] = useState<"dashboard" | "detail">("dashboard");
  const [activeContext, setActiveContext] = useState<OperationContext | null>(null);
  const [contexts, setContexts] = useState<OperationContext[]>([]);
  const [factories, setFactories] = useState<any[]>([]);
  const [factoryModels, setFactoryModels] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [obrasPortfolio, setObrasPortfolio] = useState<ObraPortfolioItem[]>([]);
  const [planningPeriods, setPlanningPeriods] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);

  // Limpar automaticamente se houver demos duplicadas (proteção contra cliques múltiplos)
  useEffect(() => {
    const demos = contexts.filter(c => c.name.includes("— DEMO"));
    if (demos.length <= 1) return;
    const limpar = async () => {
      for (const ctx of demos) {
        await supabase.from("ind_installation_schedule").delete().eq("context_id", ctx.id);
        await supabase.from("ind_unit_kits").delete().eq("context_id", ctx.id);
        await supabase.from("ind_lifting_schedule").delete().eq("context_id", ctx.id);
        await supabase.from("ind_shipment_units").delete().eq("context_id", ctx.id);
        await supabase.from("ind_shipments").delete().eq("context_id", ctx.id);
        await supabase.from("ind_batch_units").delete().eq("context_id", ctx.id);
        await supabase.from("ind_production_batches").delete().eq("context_id", ctx.id);
        await supabase.from("ind_periods").delete().eq("context_id", ctx.id);
        await supabase.from("ind_units").delete().eq("context_id", ctx.id);
        await supabase.from("ind_zones").delete().eq("context_id", ctx.id);
        await supabase.from("ind_services").delete().eq("context_id", ctx.id);
        await supabase.from("ind_operation_contexts").delete().eq("id", ctx.id);
      }
      await supabase.from("ind_factories").delete().eq("company_id", companyId!).ilike("name", "%— DEMO%");
      await supabase.from("ind_lifting_equipment").delete().eq("company_id", companyId!).ilike("name", "%— DEMO%");
      await supabase.from("ind_trucks").delete().eq("company_id", companyId!).in("plate", ["ABC-1D23", "XYZ-4E56"]);
      toast.info("Demonstrações duplicadas removidas automaticamente.");
      fetchAll();
    };
    limpar();
  }, [contexts.length]);

  // Dialog
  const [newContextDialog, setNewContextDialog] = useState(false);
  const [newContextForm, setNewContextForm] = useState({
    name: "", total_units: 0,
    context_type: "standalone" as "standalone" | "integrated",
    obras_portfolio_id: "", obramap_project_id: "",
  });

  // Factory dialog states
  const [factoryDialog, setFactoryDialog] = useState(false);
  const [editingFactory, setEditingFactory] = useState<any>(null);
  const defaultFactoryForm = {
    name: "", city: "", state: "RS", contact_name: "", contact_phone: "",
    avg_lead_time_days: 21, advance_payment_pct: 30,
    payment_terms: "", capacity_houses_month: 0, price_per_house: 0,
    is_active: true, notes: "",
  };
  const [factoryForm, setFactoryForm] = useState(defaultFactoryForm);

  useEffect(() => {
    if (!companyId) return;
    fetchAll();
  }, [companyId]);

  const fetchAll = async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const [ctxRes, facRes, modRes, batRes, perRes, obrasRes, planPeriRes] = await Promise.all([
        supabase.from("ind_operation_contexts").select("*").order("created_at"),
        supabase.from("ind_factories").select("id,name,is_active,advance_payment_pct,avg_lead_time_days,city,state,contact_name,contact_phone,capacity_houses_month,price_per_house,payment_terms,notes").eq("company_id", companyId),
        supabase.from("ind_factory_models").select("id,factory_id,units_per_week,is_active").eq("company_id", companyId),
        supabase.from("ind_production_batches").select("id,context_id,factory_id,planned_quantity,actual_quantity,unit_value,status,planned_start,planned_finish,ind_period_id,obramap_period_id"),
        supabase.from("ind_periods").select("id,context_id,name,start_date,end_date,target_units").order("start_date"),
        supabase.from("obras_portfolio").select("id,nome,uh,empresa,num_contrato,obramap_project_id").eq("company_id", companyId).order("nome"),
        supabase.from("planning_periods").select("id,name,start_date,end_date,total_planned_houses,project_id").order("start_date"),
      ]);
      setContexts((ctxRes.data || []) as OperationContext[]);
      setFactories(facRes.data || []);
      setFactoryModels(modRes.data || []);
      setBatches(batRes.data || []);
      setPeriods(perRes.data || []);
      setObrasPortfolio((obrasRes.data || []) as ObraPortfolioItem[]);
      setPlanningPeriods(planPeriRes.data || []);
    } catch (err: any) {
      console.error("[Industrialization] fetchAll error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveNewContext = async () => {
    if (!requireEdit()) return;
    if (!newContextForm.name.trim() || !companyId) {
      toast.error("Nome obrigatório");
      return;
    }
    if (newContextForm.context_type === "integrated" && !newContextForm.obramap_project_id) {
      toast.error("Selecione o projeto ObraMap para modo integrado");
      return;
    }
    const { error } = await supabase.from("ind_operation_contexts").insert({
      company_id: companyId,
      context_type: newContextForm.context_type,
      name: newContextForm.name.trim(),
      total_units: newContextForm.total_units,
      obras_portfolio_id: newContextForm.obras_portfolio_id || null,
      obramap_project_id: newContextForm.obramap_project_id || null,
    }).select().single();
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    toast.success("Obra industrial criada!");
    setNewContextDialog(false);
    setNewContextForm({ name: "", total_units: 0, context_type: "standalone", obras_portfolio_id: "", obramap_project_id: "" });
    fetchAll();
  };

  // ══════════════════════════════════════════
  // DEMONSTRAÇÃO COMPLETA
  // ══════════════════════════════════════════
  const criarDemonstracao = async () => {
    if (!requireEdit()) return;
    if (!companyId) return;
    setLoadingDemo(true);

    // Impedir criação se já existe demo
    if (contexts.some(c => c.name.includes("— DEMO"))) {
      toast.warning("Demonstração já existe. Use o botão 'Excluir Demonstração' antes de criar nova.");
      setLoadingDemo(false);
      return;
    }
    try {
      const hoje = new Date();
      const fmt = (d: Date) => d.toISOString().split("T")[0];
      const addD = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

      // 1. FÁBRICAS
      const { data: fab1 } = await supabase.from("ind_factories").insert({
        company_id: companyId, name: "Previbras Pré-Fab — DEMO",
        city: "Gravataí", state: "RS", contact_name: "Carlos Souza",
        contact_phone: "(51) 99912-0001", contact_email: "carlos@previbras.com.br",
        avg_lead_time_days: 21, advance_payment_pct: 30,
        payment_terms: "30% entrada + 70% na entrega", radius_km: 150,
        notes: "Fábrica principal — capacidade 60 painéis/semana", is_active: true,
      }).select("id").single();

      const { data: fab2 } = await supabase.from("ind_factories").insert({
        company_id: companyId, name: "Sul Concreto Pré-Fab — DEMO",
        city: "São Leopoldo", state: "RS", contact_name: "Ana Lima",
        contact_phone: "(51) 98765-0002", contact_email: "ana@sulconcreto.com.br",
        avg_lead_time_days: 28, advance_payment_pct: 40,
        payment_terms: "40% entrada + 60% contra entrega", radius_km: 80,
        notes: "Fábrica de apoio — capacidade 40 painéis/semana", is_active: true,
      }).select("id").single();

      if (!fab1 || !fab2) throw new Error("Erro ao criar fábricas");

      const { data: mod1 } = await supabase.from("ind_factory_models").insert({
        factory_id: fab1.id, company_id: companyId,
        name: "Painel Estrutural 2T — Padrão",
        description: "Painel de concreto pré-fabricado 2 toneladas, acabamento liso, vão 3,0m",
      }).select("id").single();

      const { data: mod2 } = await supabase.from("ind_factory_models").insert({
        factory_id: fab2.id, company_id: companyId,
        name: "Painel Vedação 1T — Leve",
        description: "Painel de vedação 1 tonelada, acabamento texturizado",
      }).select("id").single();

      // Equipamentos de içamento
      const { data: eq1 } = await supabase.from("ind_lifting_equipment").insert({
        company_id: companyId, name: "Guindaste Liebherr LTM 1050 — DEMO",
        equipment_type: "crane", supplier_name: "Guindastes RS Locações",
        capacity_tons: 50, daily_cost: 4800, is_active: true,
      }).select("id").single();

      const { data: eq2 } = await supabase.from("ind_lifting_equipment").insert({
        company_id: companyId, name: "Munck Volvo FH — DEMO",
        equipment_type: "munck", supplier_name: "TransPainel Ltda",
        capacity_tons: 12, daily_cost: 1800, is_active: true,
      }).select("id").single();

      // Caminhões
      const { data: truck1 } = await supabase.from("ind_trucks").insert({
        company_id: companyId, plate: "ABC-1D23", truck_type: "munck",
        capacity_kg: 15000, carrier_name: "TransPainel Ltda",
        driver_name: "João Silva", driver_phone: "(51) 99100-1111",
      }).select("id").single();

      const { data: truck2 } = await supabase.from("ind_trucks").insert({
        company_id: companyId, plate: "XYZ-4E56", truck_type: "munck",
        capacity_kg: 12000, carrier_name: "CargoRS Transportes",
        driver_name: "Pedro Alves", driver_phone: "(51) 99200-2222",
      }).select("id").single();

      // 2. CONTEXTO
      const { data: ctx } = await supabase.from("ind_operation_contexts").insert({
        company_id: companyId, context_type: "standalone",
        name: "El Dorado 01 — DEMO",
        description: "Obra demonstração — 120 UH, padrão Moradia Popular MCMV. Paredes pré-fabricadas de concreto.",
        location: "Eldorado do Sul / RS", client_name: "Prefeitura Municipal de Eldorado do Sul",
        total_units: 120, status: "active",
      }).select("id").single();
      if (!ctx) throw new Error("Erro ao criar contexto");

      // 3. SERVIÇOS
      await supabase.from("ind_services").insert([
        { context_id: ctx.id, company_id: companyId, name: "Montagem Estrutural", category: "Estrutural", display_order: 1, is_industrialized: true },
        { context_id: ctx.id, company_id: companyId, name: "Painéis de Vedação", category: "Vedação", display_order: 2, is_industrialized: true },
        { context_id: ctx.id, company_id: companyId, name: "Laje Pré-Fabricada", category: "Estrutural", display_order: 3, is_industrialized: true },
      ]);

      // 4. ZONAS
      const { data: zonas } = await supabase.from("ind_zones").insert([
        { context_id: ctx.id, company_id: companyId, name: "Quadra A", code: "QA", color: "#3b82f6", display_order: 1 },
        { context_id: ctx.id, company_id: companyId, name: "Quadra B", code: "QB", color: "#10b981", display_order: 2 },
        { context_id: ctx.id, company_id: companyId, name: "Quadra C", code: "QC", color: "#f59e0b", display_order: 3 },
      ]).select("id, name");
      if (!zonas || zonas.length < 3) throw new Error("Erro ao criar zonas — verifique permissões do banco");
      const [zA, zB, zC] = zonas;

      // 5. PERÍODOS
      const { data: periodos, error: periodError } = await supabase.from("ind_periods").insert([
        { context_id: ctx.id, company_id: companyId, name: "1ª Qnz Abr/26", start_date: fmt(addD(hoje, -75)), end_date: fmt(addD(hoje, -61)), target_units: 40, status: "closed" },
        { context_id: ctx.id, company_id: companyId, name: "2ª Qnz Abr/26", start_date: fmt(addD(hoje, -60)), end_date: fmt(addD(hoje, -46)), target_units: 40, status: "closed" },
        { context_id: ctx.id, company_id: companyId, name: "1ª Qnz Mai/26", start_date: fmt(addD(hoje, -45)), end_date: fmt(addD(hoje, -31)), target_units: 40, status: "active" },
        { context_id: ctx.id, company_id: companyId, name: "2ª Qnz Mai/26", start_date: fmt(addD(hoje, -30)), end_date: fmt(addD(hoje, -16)), target_units: 40, status: "draft" },
        { context_id: ctx.id, company_id: companyId, name: "1ª Qnz Jun/26", start_date: fmt(addD(hoje, -15)), end_date: fmt(addD(hoje, 0)),  target_units: 40, status: "draft" },
        { context_id: ctx.id, company_id: companyId, name: "2ª Qnz Jun/26", start_date: fmt(addD(hoje, 1)),  end_date: fmt(addD(hoje, 15)), target_units: 40, status: "draft" },
      ]).select("id");
      if (periodError) throw new Error("Erro ao criar períodos: " + periodError.message);
      const [p1, p2, p3, p4, p5, p6] = periodos || [];

      // 6. LOTES
      const { data: lotes, error: batchError } = await supabase.from("ind_production_batches").insert([
        {
          context_id: ctx.id, company_id: companyId, factory_id: fab1.id,
          model_id: mod1?.id, ind_period_id: p1?.id, batch_code: "ELD-L01", status: "installed",
          planned_quantity: 40, actual_quantity: 40, unit_value: 18500, actual_value: 740000,
          planned_start: fmt(addD(hoje, -75)), planned_finish: fmt(addD(hoje, -61)),
          actual_start: fmt(addD(hoje, -73)), actual_finish: fmt(addD(hoje, -62)),
          notes: "Lote 1 concluído. 40 painéis instalados sem ocorrências.",
        },
        {
          context_id: ctx.id, company_id: companyId, factory_id: fab1.id,
          model_id: mod1?.id, ind_period_id: p2?.id, batch_code: "ELD-L02", status: "installed",
          planned_quantity: 40, actual_quantity: 39, unit_value: 18500, actual_value: 721500,
          planned_start: fmt(addD(hoje, -60)), planned_finish: fmt(addD(hoje, -46)),
          actual_start: fmt(addD(hoje, -58)), actual_finish: fmt(addD(hoje, -44)),
          notes: "1 painel com retrabalho — rejunte corrigido em campo. Concluído.",
        },
        {
          context_id: ctx.id, company_id: companyId, factory_id: fab2.id,
          model_id: mod2?.id, ind_period_id: p3?.id, batch_code: "ELD-L03", status: "in_production",
          planned_quantity: 40, actual_quantity: 24, unit_value: 17200, actual_value: 0,
          planned_start: fmt(addD(hoje, -45)), planned_finish: fmt(addD(hoje, -31)),
          actual_start: fmt(addD(hoje, -43)), actual_finish: null,
          notes: "24/40 painéis prontos. Previsão de conclusão: próximos 8 dias.",
        },
        {
          context_id: ctx.id, company_id: companyId, factory_id: fab1.id,
          model_id: mod1?.id, ind_period_id: p4?.id, batch_code: "ELD-L04", status: "awaiting_transport",
          planned_quantity: 40, actual_quantity: 40, unit_value: 18500, actual_value: 0,
          planned_start: fmt(addD(hoje, -30)), planned_finish: fmt(addD(hoje, -16)),
          actual_start: fmt(addD(hoje, -29)), actual_finish: fmt(addD(hoje, -17)),
          notes: "Lote pronto em fábrica. Aguardando agendamento de transporte.",
        },
        {
          context_id: ctx.id, company_id: companyId, factory_id: fab1.id,
          model_id: mod1?.id, ind_period_id: p5?.id, batch_code: "ELD-L05", status: "planned",
          planned_quantity: 40, actual_quantity: 0, unit_value: 18500, actual_value: 0,
          planned_start: fmt(addD(hoje, -10)), planned_finish: fmt(addD(hoje, 5)),
          actual_start: null, actual_finish: null,
          notes: "Aguardando liberação de 30% entrada para iniciar produção.",
        },
        {
          context_id: ctx.id, company_id: companyId, factory_id: fab2.id,
          model_id: mod2?.id, ind_period_id: p6?.id, batch_code: "ELD-L06", status: "planned",
          planned_quantity: 40, actual_quantity: 0, unit_value: 17200, actual_value: 0,
          planned_start: fmt(addD(hoje, 6)), planned_finish: fmt(addD(hoje, 20)),
          actual_start: null, actual_finish: null,
          notes: "Planejado. Contrato de fornecimento a ser assinado.",
        },
      ]).select("id, batch_code, status, planned_quantity");
      if (batchError) throw new Error("Erro ao criar lotes: " + batchError.message);
      if (!lotes || lotes.length < 4) throw new Error("Erro ao criar lotes de produção — dados insuficientes retornados");
      const [l1, l2, l3, l4, l5, l6] = lotes;
      if (!l1?.id || !l2?.id || !l3?.id || !l4?.id) throw new Error("IDs dos lotes inválidos");

      // 7. UNIDADES — 120 UH
      const unidades: any[] = [];
      for (let i = 1; i <= 120; i++) {
        const zona = i <= 40 ? zA : i <= 80 ? zB : zC;
        let statusUnit = "pending";
        if (i <= 40) statusUnit = "installed";
        else if (i <= 79) statusUnit = "installed";
        else if (i === 80) statusUnit = "delivered";
        else if (i <= 104) statusUnit = "in_production";
        else statusUnit = "pending";
        unidades.push({
          context_id: ctx.id, company_id: companyId,
          zone_id: zona?.id || null,
          code: `U-${String(i).padStart(3, "0")}`,
          unit_number: i, unit_type: "residential", status: statusUnit,
        });
      }
      for (let i = 0; i < unidades.length; i += 50) {
        await supabase.from("ind_units").insert(unidades.slice(i, i + 50));
      }

      const { data: unidadesDB } = await supabase
        .from("ind_units").select("id, unit_number")
        .eq("context_id", ctx.id).order("unit_number");
      const uMap = new Map((unidadesDB || []).map((u: any) => [u.unit_number, u.id]));

      // 8. BATCH_UNITS
      const batchUnitRows: any[] = [];
      [[l1, 1, 40, "installed"], [l2, 41, 80, "installed"], [l3, 81, 104, "in_production"],
       [l4, 105, 120, "planned"]].forEach(([lote, de, ate, st]: any) => {
        if (!lote?.id) return;
        for (let n = de; n <= ate; n++) {
          const uid = uMap.get(n);
          if (uid) batchUnitRows.push({ batch_id: lote.id, context_id: ctx.id, unit_id: uid, house_number: n, status: st });
        }
      });
      for (let i = 0; i < batchUnitRows.length; i += 50) {
        await supabase.from("ind_batch_units").insert(batchUnitRows.slice(i, i + 50));
      }

      // 9. REMESSAS
      const { data: rem1 } = await supabase.from("ind_shipments").insert({
        company_id: companyId, context_id: ctx.id, batch_id: l1.id,
        truck_id: truck1?.id || null, shipment_number: "REM-ELD-001",
        status: "delivered",
        planned_date: fmt(addD(hoje, -63)), actual_date: fmt(addD(hoje, -62)),
        truck_plate: "ABC-1D23", driver_name: "João Silva",
        total_units: 40, notes: "Entrega realizada. 40 painéis. Sem ocorrências.",
      }).select("id").single();

      const { data: rem2 } = await supabase.from("ind_shipments").insert({
        company_id: companyId, context_id: ctx.id, batch_id: l2.id,
        truck_id: truck2?.id || null, shipment_number: "REM-ELD-002",
        status: "delivered",
        planned_date: fmt(addD(hoje, -45)), actual_date: fmt(addD(hoje, -44)),
        truck_plate: "XYZ-4E56", driver_name: "Pedro Alves",
        total_units: 39, notes: "39 painéis entregues. 1 painel com avaria — reparado em campo.",
      }).select("id").single();

      const { data: rem3 } = await supabase.from("ind_shipments").insert({
        company_id: companyId, context_id: ctx.id, batch_id: l4.id,
        truck_id: truck1?.id || null, shipment_number: "REM-ELD-003",
        status: "planned",
        planned_date: fmt(addD(hoje, 3)), actual_date: null,
        truck_plate: "ABC-1D23", driver_name: "João Silva",
        total_units: 40, notes: "Agendada para daqui 3 dias. Aguardando confirmação da obra.",
      }).select("id").single();

      // Vincular unidades às remessas
      const shipUnitRows: any[] = [];
      for (let n = 1; n <= 40; n++) {
        const uid = uMap.get(n);
        if (uid && rem1?.id) shipUnitRows.push({ shipment_id: rem1.id, context_id: ctx.id, unit_id: uid, house_number: n, status: "delivered" });
      }
      for (let n = 41; n <= 79; n++) {
        const uid = uMap.get(n);
        if (uid && rem2?.id) shipUnitRows.push({ shipment_id: rem2.id, context_id: ctx.id, unit_id: uid, house_number: n, status: "delivered" });
      }
      for (let i = 0; i < shipUnitRows.length; i += 50) {
        await supabase.from("ind_shipment_units").insert(shipUnitRows.slice(i, i + 50));
      }

      // 10. IÇAMENTO
      await supabase.from("ind_lifting_schedule").insert({
        company_id: companyId, context_id: ctx.id,
        batch_id: l1.id, linked_shipment_id: rem1?.id || null,
        equipment_id: eq1?.id || null, supplier_name: "Guindastes RS Locações",
        booking_date: fmt(addD(hoje, -62)), start_time: "07:00", end_time: "17:00",
        daily_cost: 4800, status: "completed",
        unit_ids: Array.from({ length: 40 }, (_, i) => uMap.get(i + 1)).filter(Boolean),
        notes: "Içamento concluído. 40 painéis instalados. Equipe de 8 pessoas.",
      });
      await supabase.from("ind_lifting_schedule").insert({
        company_id: companyId, context_id: ctx.id,
        batch_id: l2.id, linked_shipment_id: rem2?.id || null,
        equipment_id: eq2?.id || null, supplier_name: "TransPainel Ltda",
        booking_date: fmt(addD(hoje, -44)), start_time: "07:00", end_time: "16:00",
        daily_cost: 1800, status: "completed",
        unit_ids: Array.from({ length: 39 }, (_, i) => uMap.get(i + 41)).filter(Boolean),
        notes: "39 painéis içados. 1 com correção em campo. Concluído.",
      });
      await supabase.from("ind_lifting_schedule").insert({
        company_id: companyId, context_id: ctx.id,
        batch_id: l4.id, linked_shipment_id: rem3?.id || null,
        equipment_id: eq1?.id || null, supplier_name: "Guindastes RS Locações",
        booking_date: fmt(addD(hoje, 4)), start_time: "07:00", end_time: "17:00",
        daily_cost: 4800, status: "scheduled",
        notes: "Agendado. Aguardar confirmação 24h antes.",
      });

      // 11. KITS
      const kitRows: any[] = [];
      for (let n = 1; n <= 40; n++) {
        const uid = uMap.get(n);
        if (uid) kitRows.push({
          company_id: companyId, context_id: ctx.id,
          batch_id: l1.id, factory_id: fab1.id, model_id: mod1?.id || null,
          house_number: n, unit_id: uid, needed_by_date: fmt(addD(hoje, -63)),
          kit_status: "delivered", components_total: 8, components_delivered: 8,
        });
      }
      for (let n = 41; n <= 80; n++) {
        const uid = uMap.get(n);
        if (uid) kitRows.push({
          company_id: companyId, context_id: ctx.id,
          batch_id: l2.id, factory_id: fab1.id, model_id: mod1?.id || null,
          house_number: n, unit_id: uid, needed_by_date: fmt(addD(hoje, -45)),
          kit_status: "delivered", components_total: 8, components_delivered: 8,
        });
      }
      for (let i = 0; i < kitRows.length; i += 50) {
        await supabase.from("ind_unit_kits").insert(kitRows.slice(i, i + 50));
      }

      // 12. INSTALAÇÃO
      await supabase.from("ind_installation_schedule").insert([
        {
          company_id: companyId, context_id: ctx.id, batch_id: l1.id,
          contractor_name: "Montagem Rápida Serviços",
          scheduled_date: fmt(addD(hoje, -62)), start_time: "07:00", end_time: "17:00",
          status: "completed", notes: "Quadra A — 40 UH montadas. Equipe de 12 montadores.",
        },
        {
          company_id: companyId, context_id: ctx.id, batch_id: l2.id,
          contractor_name: "Montagem Rápida Serviços",
          scheduled_date: fmt(addD(hoje, -44)), start_time: "07:00", end_time: "16:30",
          status: "completed", notes: "Quadra B — 39 UH montadas. 1 correção de esquadro.",
        },
        {
          company_id: companyId, context_id: ctx.id, batch_id: l4.id,
          contractor_name: "Montagem Rápida Serviços",
          scheduled_date: fmt(addD(hoje, 4)), start_time: "07:00", end_time: "17:00",
          status: "scheduled", notes: "Quadra C — 40 UH previstas. Aguardando entrega.",
        },
      ]);

      toast.success(
        "✅ Demonstração completa criada! 120 UH · 6 lotes · 2 fábricas · 3 remessas · 3 içamentos · 2 equipamentos · 2 caminhões. Explore todas as abas."
      );
      fetchAll();
    } catch (e: any) {
      console.error("[DEMO]", e);
      toast.error("Erro ao criar demonstração: " + e.message);
    } finally {
      setLoadingDemo(false);
    }
  };

  const excluirDemonstracao = async () => {
    if (!requireEdit()) return;
    if (!companyId) return;
    const demoContexts = contexts.filter(c => c.name.includes("— DEMO"));
    if (demoContexts.length === 0) { toast.info("Nenhuma demonstração encontrada."); return; }
    if (!confirm("Excluir todos os dados de demonstração? Esta ação é irreversível.")) return;
    setLoadingDemo(true);
    try {
      for (const ctx of demoContexts) {
        // Delete in dependency order
        await supabase.from("ind_installation_schedule").delete().eq("context_id", ctx.id);
        await supabase.from("ind_unit_kits").delete().eq("context_id", ctx.id);
        await supabase.from("ind_lifting_schedule").delete().eq("context_id", ctx.id);
        await supabase.from("ind_shipment_units").delete().eq("context_id", ctx.id);
        await supabase.from("ind_shipments").delete().eq("context_id", ctx.id);
        await supabase.from("ind_batch_units").delete().eq("context_id", ctx.id);
        await supabase.from("ind_production_batches").delete().eq("context_id", ctx.id);
        await supabase.from("ind_periods").delete().eq("context_id", ctx.id);
        await supabase.from("ind_units").delete().eq("context_id", ctx.id);
        await supabase.from("ind_zones").delete().eq("context_id", ctx.id);
        await supabase.from("ind_services").delete().eq("context_id", ctx.id);
        await supabase.from("ind_operation_contexts").delete().eq("id", ctx.id);
      }
      // Delete demo factories/equipment/trucks
      await supabase.from("ind_factory_models").delete().eq("company_id", companyId).like("name", "%— Padrão%");
      await supabase.from("ind_factory_models").delete().eq("company_id", companyId).like("name", "%— Leve%");
      await supabase.from("ind_factories").delete().eq("company_id", companyId).like("name", "%— DEMO%");
      await supabase.from("ind_lifting_equipment").delete().eq("company_id", companyId).like("name", "%— DEMO%");
      await supabase.from("ind_trucks").delete().eq("company_id", companyId).in("plate", ["ABC-1D23", "XYZ-4E56"]);
      toast.success("Demonstração excluída com sucesso.");
      fetchAll();
    } catch (e: any) {
      console.error("[DEMO]", e);
      toast.error("Erro ao excluir demonstração: " + e.message);
    } finally {
      setLoadingDemo(false);
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
      paused: "bg-amber-500/10 text-amber-600 border-amber-200",
      completed: "bg-blue-500/10 text-blue-600 border-blue-200",
      cancelled: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return map[status] || "";
  };

  // ── Computed data for dashboard ──
  const allPeriodsSorted = useMemo(() => {
    const integCtxProjectIds = new Set(
      contexts.filter(c=>c.context_type==='integrated'&&c.obramap_project_id)
             .map(c=>c.obramap_project_id)
    );
    const oPeriods = planningPeriods
      .filter(pp => integCtxProjectIds.has(pp.project_id))
      .map(pp => ({...pp, period_type:'obramap', target_units:pp.total_planned_houses||0}));
    const iPeriods = periods
      .filter(p => contexts.some(c=>c.id===p.context_id))
      .map(p => ({...p, period_type:'ind'}));
    const seen = new Set<string>();
    return [...iPeriods, ...oPeriods]
      .filter(p => { if(seen.has(p.id)) return false; seen.add(p.id); return true; })
      .sort((a,b) => a.start_date.localeCompare(b.start_date));
  }, [periods, planningPeriods, contexts]);

  // Capacity heatmap data
  const capacityData = useMemo(() => {
    const activeFactories = factories.filter(f => f.is_active);
    const today = new Date();
    const weeks: { start: Date; end: Date; label: string }[] = [];
    for (let i = 0; i < 8; i++) {
      const s = new Date(today);
      s.setDate(s.getDate() + i * 7 - today.getDay() + 1);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      weeks.push({ start: s, end: e, label: `${s.getDate()}/${s.getMonth() + 1}` });
    }
    return { activeFactories, weeks };
  }, [factories]);

  const getFactoryCapacity = (factoryId: string) => {
    return factoryModels
      .filter(m => m.factory_id === factoryId && m.is_active)
      .reduce((s: number, m: any) => s + (m.units_per_week || 0), 0);
  };

  const getWeekLoad = (factoryId: string, weekStart: Date, weekEnd: Date) => {
    return batches
      .filter(b => {
        if (b.factory_id !== factoryId) return false;
        if (!b.planned_start || !b.planned_finish) return false;
        const bs = new Date(b.planned_start);
        const bf = new Date(b.planned_finish);
        return bs <= weekEnd && bf >= weekStart;
      })
      .reduce((s: number, b: any) => s + (b.planned_quantity || 0), 0);
  };

  // Global alerts
  const alerts = useMemo(() => {
    const today = new Date();
    const items: { type: "danger" | "warning"; msg: string; contextId?: string }[] = [];
    // Late batches
    batches.forEach(b => {
      if (b.planned_finish && !["delivered", "installed", "cancelled"].includes(b.status)) {
        if (new Date(b.planned_finish) < today) {
          const ctx = contexts.find(c => c.id === b.context_id);
          items.push({ type: "danger", msg: `Lote atrasado em "${ctx?.name || "?"}" — previsto até ${new Date(b.planned_finish).toLocaleDateString("pt-BR")}`, contextId: b.context_id });
        }
      }
    });
    // Advance payments due
    batches.forEach(b => {
      if (!b.ind_period_id) return;
      const period = periods.find(p => p.id === b.ind_period_id);
      if (!period) return;
      const factory = factories.find(f => f.id === b.factory_id);
      if (!factory || !factory.advance_payment_pct) return;
      const dueDate = new Date(period.start_date);
      dueDate.setDate(dueDate.getDate() - (factory.avg_lead_time_days || 0));
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
      if (daysUntil > 0 && daysUntil <= 15) {
        const val = (b.planned_quantity || 0) * (b.unit_value || 0) * (factory.advance_payment_pct / 100);
        items.push({
          type: daysUntil <= 7 ? "danger" : "warning",
          msg: `Entrada de ${BRL.format(val)} vence em ${daysUntil} dias (${factory.name})`,
          contextId: b.context_id,
        });
      }
    });
    return items.slice(0, 5);
  }, [batches, periods, factories, contexts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // ════════════════════════ DETAIL VIEW ════════════════════════
  if (view === "detail" && activeContext && companyId) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <button
          onClick={() => setView("dashboard")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ChevronLeft className="h-4 w-4" /> Todas as Obras
        </button>

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Factory className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-lg font-bold text-foreground">{activeContext.name}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-xs ${activeContext.context_type === "integrated" ? "bg-blue-500/10 text-blue-600 border-blue-200" : "bg-amber-500/10 text-amber-600 border-amber-200"}`}>
                  {activeContext.context_type === "integrated" ? "Integrado" : "Standalone"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {activeContext.total_units} unidades · {batches.filter(b => b.context_id === activeContext.id).reduce((s, b) => s + (b.planned_quantity || 0), 0)} planejadas · {batches.filter(b => b.context_id === activeContext.id && (b.status === 'installed' || b.status === 'completed')).reduce((s, b) => s + (b.actual_quantity || 0), 0)} instaladas
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="gap-1.5">🏗️ Visão Geral</TabsTrigger>
            <TabsTrigger value="factories" className="gap-1.5">🏭 Fábricas</TabsTrigger>
            <TabsTrigger value="batches" className="gap-1.5">📦 Lotes</TabsTrigger>
            <TabsTrigger value="logistics" className="gap-1.5">🚛 Logística</TabsTrigger>
            <TabsTrigger value="lifting" className="gap-1.5">🏗 Içamento</TabsTrigger>
            <TabsTrigger value="installation" className="gap-1.5">🔧 Montagem</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <OverviewTabContent
              companyId={companyId}
              contextId={activeContext.id}
              contextName={activeContext.name}
              contextType={activeContext.context_type}
              totalUnits={activeContext.total_units}
            />
          </TabsContent>
          <TabsContent value="factories" className="mt-4">
            <FactoriesTabContent companyId={companyId} contextId={activeContext.id} contextType={activeContext.context_type} />
          </TabsContent>
          <TabsContent value="batches" className="mt-4">
            <BatchesTabContent companyId={companyId} contextId={activeContext.id} />
          </TabsContent>
          <TabsContent value="logistics" className="mt-4">
            <LogisticsTabContent companyId={companyId} contextId={activeContext.id} />
          </TabsContent>
          <TabsContent value="lifting" className="mt-4">
            <LiftingTabContent companyId={companyId} contextId={activeContext.id} />
          </TabsContent>
          <TabsContent value="installation" className="mt-4">
            <InstallationTabContent companyId={companyId} contextId={activeContext.id} contextType={activeContext.context_type} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // ════════════════════════ DASHBOARD VIEW ════════════════════════
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Factory className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Industrialização & Logística</h1>
        </div>
        <Button size="sm" onClick={() => setNewContextDialog(true)} disabled={!canEdit}>
          <Plus className="h-4 w-4 mr-2" /> Nova Obra Industrial
        </Button>
      </div>

      {contexts.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <Factory className="h-16 w-16 mx-auto text-muted-foreground/50" />
          <h2 className="text-2xl font-bold text-foreground">Nenhuma obra industrial cadastrada</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Gerencie o fluxo completo de componentes industrializados: fábrica → lote → transporte → içamento → montagem.
          </p>
          <div className="flex items-center justify-center gap-3">
             <Button onClick={() => setNewContextDialog(true)} disabled={!canEdit}>
              <Plus className="h-4 w-4 mr-2" /> Nova Obra Industrial
            </Button>
            <Button variant="outline" onClick={criarDemonstracao} disabled={!canEdit || loadingDemo}>
              {loadingDemo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {loadingDemo ? "Criando..." : "Criar Demonstração"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Demo action buttons */}
          {isCompanyAdmin && contexts.some(c => c.name.includes("— DEMO")) && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={excluirDemonstracao} disabled={loadingDemo}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {loadingDemo ? "Excluindo..." : "Excluir Demonstração"}
              </Button>
            </div>
          )}

          {/* ── Alertas globais (acima da tabela) ── */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${
                  a.type === 'danger'
                    ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                    : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                }`}>
                  <AlertTriangle className='h-4 w-4 shrink-0' />
                  <span className='flex-1 text-xs font-medium'>{a.msg}</span>
                  {a.contextId && (
                    <Button variant='ghost' size='sm' className='h-6 text-[10px] px-2 shrink-0'
                      onClick={() => {
                        const ctx = contexts.find(c => c.id === a.contextId);
                        if (ctx) { setActiveContext(ctx); setView('detail'); }
                      }}>
                      Ver obra →
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Bloco 1: Multi-obra table ── */}
          <div className="rounded-lg border bg-card">
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Obras Industriais</h3>
              <span className="text-[10px] text-muted-foreground italic">Clique em qualquer obra para ver detalhes</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs min-w-[160px]">Obra</TableHead>
                    <TableHead className="text-xs text-center w-16">Casas</TableHead>
                    <TableHead className="text-xs text-center w-20">Tipo</TableHead>
                    <TableHead className="text-xs min-w-[120px]">Fábricas</TableHead>
                    {allPeriodsSorted.map(p => (
                      <TableHead key={p.id} className="text-xs text-center min-w-[80px]">
                        {p.name?.length > 10 ? p.name.slice(0, 10) + "…" : p.name}
                      </TableHead>
                    ))}
                    <TableHead className="text-xs text-center w-20">Plan.</TableHead>
                    <TableHead className="text-xs text-right min-w-[100px]">Custo Total</TableHead>
                    <TableHead className="text-xs text-right min-w-[100px]">Entrada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contexts.map(ctx => {
                    const ctxBatches = batches.filter(b => b.context_id === ctx.id);
                    const ctxPeriods = periods.filter(p => p.context_id === ctx.id);
                    const linkedFactoryIds = [...new Set(ctxBatches.map(b => b.factory_id))];
                    const linkedFactoryNames = linkedFactoryIds.map(id => factories.find(f => f.id === id)?.name).filter(Boolean).join(", ");
                    const totalPlanned = ctxBatches.reduce((s, b) => s + (b.planned_quantity || 0), 0);
                    const totalCost = ctxBatches.reduce((s, b) => s + ((b.planned_quantity || 0) * (b.unit_value || 0)), 0);
                    const totalAdvance = ctxBatches.reduce((s, b) => {
                      const fac = factories.find(f => f.id === b.factory_id);
                      return s + ((b.planned_quantity || 0) * (b.unit_value || 0) * ((fac?.advance_payment_pct || 0) / 100));
                    }, 0);

                    return (
                      <TableRow
                        key={ctx.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => { setActiveContext(ctx); setView("detail"); }}
                      >
                        <TableCell className="text-xs">
                          <div className="font-bold text-foreground">{ctx.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {ctx.context_type === "integrated" ? "Integrado — ObraMap" : `Standalone — ${ctx.total_units.toLocaleString("pt-BR")} un`}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-center font-medium">{ctx.total_units.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] ${ctx.context_type === "integrated" ? "bg-blue-500/10 text-blue-600 border-blue-200" : "bg-amber-500/10 text-amber-600 border-amber-200"}`}>
                            {ctx.context_type === "integrated" ? "Integrado" : "Standalone"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{linkedFactoryNames || "—"}</TableCell>
                        {allPeriodsSorted.map(period => {
                          const periodBatches = ctxBatches.filter(b => (period.period_type==='ind' ? b.ind_period_id===period.id : b.obramap_period_id===period.id));
                          const planned = periodBatches.reduce((s, b) => s + (b.planned_quantity || 0), 0);
                          const actual = periodBatches.reduce((s, b) => s + (b.actual_quantity || 0), 0);
                          const hasPeriod = ctxPeriods.some(p => p.id === period.id);
                          if (!hasPeriod) return <TableCell key={period.id} className="text-xs text-center text-muted-foreground/30">—</TableCell>;
                          const color = planned === 0
                            ? "text-muted-foreground"
                            : actual >= planned
                              ? "text-emerald-600"
                              : actual > 0
                                ? "text-amber-600"
                                : "text-muted-foreground";
                          return (
                            <TableCell key={period.id} className={`text-xs text-center font-medium ${color}`}>
                              {planned > 0 ? `${actual}/${planned}` : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-xs text-center font-medium">{totalPlanned}</TableCell>
                        <TableCell className="text-xs text-right">{totalCost > 0 ? BRL.format(totalCost) : "—"}</TableCell>
                        <TableCell className="text-xs text-right text-amber-600">{totalAdvance > 0 ? BRL.format(totalAdvance) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell className="text-xs">TOTAL</TableCell>
                    <TableCell className="text-xs text-center">{contexts.reduce((s, c) => s + c.total_units, 0)}</TableCell>
                    <TableCell />
                    <TableCell />
                    {allPeriodsSorted.map(period => {
                      const planned = batches.filter(b => (period.period_type==='ind' ? b.ind_period_id===period.id : b.obramap_period_id===period.id)).reduce((s, b) => s + (b.planned_quantity || 0), 0);
                      const actual = batches.filter(b => (period.period_type==='ind' ? b.ind_period_id===period.id : b.obramap_period_id===period.id)).reduce((s, b) => s + (b.actual_quantity || 0), 0);
                      return (
                        <TableCell key={period.id} className="text-xs text-center font-medium">
                          {planned > 0 ? `${actual}/${planned}` : "—"}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-xs text-center">{batches.reduce((s, b) => s + (b.planned_quantity || 0), 0)}</TableCell>
                    <TableCell className="text-xs text-right">{BRL.format(batches.reduce((s, b) => s + ((b.planned_quantity || 0) * (b.unit_value || 0)), 0))}</TableCell>
                    <TableCell className="text-xs text-right text-amber-600">
                      {BRL.format(batches.reduce((s, b) => {
                        const fac = factories.find(f => f.id === b.factory_id);
                        return s + ((b.planned_quantity || 0) * (b.unit_value || 0) * ((fac?.advance_payment_pct || 0) / 100));
                      }, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* ── Bloco 2: Capacity heatmap ── */}
          {capacityData.activeFactories.length > 0 && (
            <div className="rounded-lg border bg-card">
              <div className="p-3 border-b">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Capacidade Fábricas × Demanda Consolidada — Próximas 8 Semanas
                </h3>
              </div>
              <div className="overflow-x-auto p-3">
                <TooltipProvider>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs min-w-[140px]">FÁBRICA</TableHead>
                        <TableHead className="text-xs text-center w-20">CAP/SEM</TableHead>
                        {capacityData.weeks.map((w, i) => (
                          <TableHead key={i} className="text-xs text-center w-20">{w.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {capacityData.activeFactories.map(fac => {
                        const cap = getFactoryCapacity(fac.id);
                        return (
                          <TableRow key={fac.id}>
                            <TableCell className="text-xs">
                              <div className="font-bold text-foreground">{fac.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                Lead: {fac.avg_lead_time_days || 0}d | Entrada: {fac.advance_payment_pct || 0}%
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-center text-muted-foreground">{cap} un</TableCell>
                            {capacityData.weeks.map((w, i) => {
                              const load = getWeekLoad(fac.id, w.start, w.end);
                              const pct = cap > 0 ? (load / cap) * 100 : 0;
                              const bg = pct === 0
                                ? "bg-muted/30"
                                : pct < 70
                                  ? "bg-emerald-500/20 text-emerald-700"
                                  : pct <= 90
                                    ? "bg-amber-500/20 text-amber-700"
                                    : "bg-destructive/20 text-destructive";
                              const ctxNames = [...new Set(batches
                                .filter(b => {
                                  if (b.factory_id !== fac.id || !b.planned_start || !b.planned_finish) return false;
                                  return new Date(b.planned_start) <= w.end && new Date(b.planned_finish) >= w.start;
                                })
                                .map(b => contexts.find(c => c.id === b.context_id)?.name)
                                .filter(Boolean)
                              )];
                              return (
                                <TableCell key={i} className="p-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className={`rounded px-2 py-1.5 text-center text-xs font-bold ${bg}`}>
                                        {load > 0 ? load : "—"}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">{load} casas planejadas de {ctxNames.length} obra(s)</p>
                                      <p className="text-xs">{pct.toFixed(0)}% da capacidade ({cap}/sem)</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TooltipProvider>
                <div className='flex items-center gap-4 mt-2 text-[10px] text-muted-foreground'>
                  <span className='flex items-center gap-1.5'>
                    <span className='w-3 h-3 rounded bg-emerald-500/20 inline-block' /> {"<70% — OK"}
                  </span>
                  <span className='flex items-center gap-1.5'>
                    <span className='w-3 h-3 rounded bg-amber-500/20 inline-block' /> 70–90% — Atenção
                  </span>
                  <span className='flex items-center gap-1.5'>
                    <span className='w-3 h-3 rounded bg-destructive/20 inline-block' /> {">90% — Sobrecarga"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* alerts already shown above */}
        </>
      )}

      {/* ── Dialog: Nova Obra Industrial ── */}
      <Dialog open={newContextDialog} onOpenChange={setNewContextDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Obra Industrial</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={newContextForm.context_type}
                onValueChange={v => setNewContextForm(f => ({ ...f, context_type: v as any, obras_portfolio_id: "", obramap_project_id: "" }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standalone">Standalone — obra sem vínculo ObraMap</SelectItem>
                  <SelectItem value="integrated">Integrado — vinculado ao ObraMap</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Vincular à Holding (opcional)</Label>
              <Select
                value={newContextForm.obras_portfolio_id || "__none__"}
                onValueChange={v => {
                  const obra = obrasPortfolio.find(o => o.id === v);
                  setNewContextForm(f => ({
                    ...f,
                    obras_portfolio_id: v === "__none__" ? "" : v,
                    name: obra ? obra.nome : f.name,
                    total_units: obra?.uh || f.total_units,
                    obramap_project_id: obra?.obramap_project_id || f.obramap_project_id,
                  }));
                }}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar obra da Holding..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {obrasPortfolio.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome} {o.uh ? `— ${o.uh} casas` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Ao selecionar, os campos abaixo são preenchidos automaticamente</p>
            </div>

            <div>
              <Label className="text-xs">Nome da Obra *</Label>
              <Input
                value={newContextForm.name}
                onChange={e => {
                  if (!newContextForm.obras_portfolio_id && !newContextForm.obramap_project_id) {
                    setNewContextForm(f => ({ ...f, name: e.target.value }));
                  }
                }}
                readOnly={!!(newContextForm.obras_portfolio_id || newContextForm.obramap_project_id)}
                className={`h-8 text-xs ${newContextForm.obras_portfolio_id || newContextForm.obramap_project_id ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`}
                placeholder="Ex: El Dorado"
              />
              {(newContextForm.obras_portfolio_id || newContextForm.obramap_project_id) && (
                <p className="text-[10px] text-muted-foreground mt-0.5">🔒 Preenchido automaticamente pelo cadastro da obra</p>
              )}
            </div>

            <div>
              <Label className="text-xs">Total de Unidades</Label>
              <Input
                type="number"
                value={newContextForm.total_units}
                onChange={e => {
                  if (!newContextForm.obras_portfolio_id && !newContextForm.obramap_project_id) {
                    setNewContextForm(f => ({ ...f, total_units: parseInt(e.target.value) || 0 }));
                  }
                }}
                readOnly={!!(newContextForm.obras_portfolio_id || newContextForm.obramap_project_id)}
                className={`h-8 text-xs ${newContextForm.obras_portfolio_id || newContextForm.obramap_project_id ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}`}
              />
              {(newContextForm.obras_portfolio_id || newContextForm.obramap_project_id) && (
                <p className="text-[10px] text-muted-foreground mt-0.5">🔒 Definido pelo cadastro da obra</p>
              )}
            </div>

            {newContextForm.context_type === "integrated" && (
              <div>
                <Label className="text-xs">Projeto ObraMap</Label>
                <Select
                  value={newContextForm.obramap_project_id || "__none__"}
                  onValueChange={v => setNewContextForm(f => ({ ...f, obramap_project_id: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar projeto..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {projects.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — {p.totalHouses} casas</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewContextDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveNewContext}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
