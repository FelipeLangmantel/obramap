import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useSystemModules } from "@/hooks/useSystemModules";
import { supabase } from "@/integrations/supabase/client";
import { useSupplyOverdueCount } from "@/components/supplies/hooks/useSupplyOverdueCount";
import { useNotifications } from "@/hooks/useNotifications";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, AlertTriangle as AlertTriangleIcon, CheckCircle2, FileText as FileTextIcon, Clock as ClockIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, 
  ClipboardList,
  BarChart3,
  Users,
  LogOut,
  Sun,
  Moon,
  Building2,
  Plus,
  Settings,
  Layers,
  DollarSign,
  Grid3X3,
  Target,
  Map,
  Box,
  Package,
  Truck,
  Wallet,
  FileText,
  Crown,
  ClipboardCheck,
  Calculator,
  Calendar,
  Beaker,
  EyeOff,
  ChevronDown,
  Check,
  Factory,
  TrendingUp,
  Receipt,
  FolderOpen,
  Sparkles,
  ShoppingCart,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { UserPermissionsPanel } from "@/components/admin/UserPermissionsPanel";
import { ModuleUnderDevelopmentDialog } from "@/components/ModuleUnderDevelopmentDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectsListDialog } from "@/components/ProjectsListDialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { ManageMacrosDialog } from "@/components/ManageMacrosDialog";
import { ManageQuadrasDialog } from "@/components/ManageQuadrasDialog";
import obraMapLogoDark from "@/assets/obramap-logo-new.png";
import obraMapLogoLight from "@/assets/obramap-logo-light.png";

type ViewType = "home" | "map" | "charts" | "production" | "costs" | "planning" | "interactive-map" | "3d-map" | "supplies" | "inputs" | "suppliers" | "financial-flow" | "board-decisions" | "delivery" | "smart-planning" | "productivity" | "contractors" | "industrialization" | "holding-dashboard";

type RouteViewType = "measurement-planning" | "long-term-planning" | "project-contract" | "ple-measurements" | "holding-receitas" | "holding-despesas" | "holding-documentos" | "holding-prd" | "holding-insights" | "holding-config" | "cashflow-simulator" | "purchase-panel";
type MenuViewType = ViewType | RouteViewType;

// Rotas dedicadas (navegam para páginas separadas)
const DEDICATED_ROUTE_MAP: Record<RouteViewType, string> = {
  "measurement-planning": "/measurement-planning",
  "long-term-planning": "/long-term-planning",
  "project-contract": "/project-contract",
  "ple-measurements": "/ple-measurements",
  "holding-receitas": "/holding-receitas",
  "holding-despesas": "/holding-despesas",
  "holding-documentos": "/holding-documentos",
  "holding-prd": "/holding-prd",
  "holding-insights": "/holding-insights",
  "holding-config": "/holding-config",
  "cashflow-simulator": "/cashflow-simulator",
  "purchase-panel": "/purchase-panel",
};

interface AppSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

interface CompanyModule {
  module_key: string;
  module_name: string;
  status: "active" | "development" | "disabled";
  description: string | null;
  expected_benefits: string | null;
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  useSidebar(); // Hook mantido para funcionalidade interna
  
  // ✅ CORREÇÃO CRÍTICA: Derivar item ativo da rota atual, não do estado
  const getActiveView = (): MenuViewType => {
    const pathname = location.pathname;
    
    if (pathname === "/measurement-planning") return "measurement-planning";
    if (pathname === "/long-term-planning") return "long-term-planning";
    if (pathname === "/project-contract") return "project-contract";
    if (pathname === "/ple-measurements") return "ple-measurements";
    if (pathname === "/holding-receitas") return "holding-receitas";
    if (pathname === "/holding-despesas") return "holding-despesas";
    if (pathname === "/holding-documentos") return "holding-documentos";
    if (pathname === "/holding-prd") return "holding-prd";
    if (pathname === "/holding-insights") return "holding-insights";
    if (pathname === "/holding-config") return "holding-config";
    if (pathname === "/cashflow-simulator") return "cashflow-simulator";
    if (pathname === "/purchase-panel") return "purchase-panel";
    
    return activeView;
  };
  
  const currentActiveView = getActiveView();
  const { profile, company, signOut, isAdmin, canEdit, canAccessMenu, canAccessManagement, systemRole, isCompanyAdmin, isSystemAdmin, canAccessProject } = useAuth();
  const { projects, currentProject, setCurrentProject } = useConstruction();
  const supplyOverdueCount = useSupplyOverdueCount(currentProject?.id);
  const notif = useNotifications();

  // ✅ Hook para governança global de módulos
  const { isModuleEnabled, isModuleBeta } = useSystemModules();
  
  // Filtrar projetos acessíveis pelo usuário
  const accessibleProjects = projects.filter(project => canAccessProject(project.id));
  
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [projectsListOpen, setProjectsListOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [macrosDialogOpen, setMacrosDialogOpen] = useState(false);
  const [quadrasDialogOpen, setQuadrasDialogOpen] = useState(false);
  const [companyModules, setCompanyModules] = useState<CompanyModule[]>([]);
  const [devModuleDialog, setDevModuleDialog] = useState<CompanyModule | null>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Buscar módulos da empresa do usuário
  useEffect(() => {
    const fetchModules = async () => {
      if (!company?.id) return;

      const { data, error } = await supabase
        .from("company_modules")
        .select("module_key, module_name, status, description, expected_benefits")
        .eq("company_id", company.id);

      if (!error && data) {
        setCompanyModules(data as CompanyModule[]);
      }
    };

    fetchModules();
  }, [company?.id]);

  const getModuleStatus = (viewKey: string): "active" | "development" | "disabled" | null => {
    // Agora as chaves são iguais entre system_modules e company_modules
    const module = companyModules.find(m => m.module_key === viewKey);
    return module?.status || "active"; // Default ativo se não configurado
  };

  const getModuleInfo = (viewKey: string): CompanyModule | null => {
    return companyModules.find(m => m.module_key === viewKey) || null;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = () => {
    // Priorizar system_role para exibição
    if (systemRole === "admin" || isCompanyAdmin) return "Administrador";
    if (systemRole === "editor") return "Editor";
    return "Usuário";
  };

  // ✅ Menu items organizados por contexto de uso
  type MenuItem = { title: string; view: MenuViewType; icon: any; permissionId: string; badge?: string };
  
  const menuGroups: { label: string; items: MenuItem[] }[] = [
    {
      label: "Painel & Mapas",
      items: [
        { title: "Painel Inicial", view: "home", icon: LayoutDashboard, permissionId: "painel_inicial" },
        { title: "Mapa de Obras", view: "map", icon: Map, permissionId: "mapa" },
        { title: "Mapa Interativo", view: "interactive-map", icon: Map, permissionId: "mapa_interativo" },
        { title: "Mapa 3D", view: "3d-map", icon: Box, permissionId: "mapa_3d" },
        { title: "Gráficos", view: "charts", icon: BarChart3, permissionId: "graficos" },
        { title: "Painel Diretoria", view: "board-decisions", icon: Crown, permissionId: "diretoria" },
      ],
    },
    {
      label: "Produção & Planejamento",
      items: [
        { title: "Produção Semanal", view: "production", icon: ClipboardList, permissionId: "producao" },
        { title: "Produtividade e Equipes", view: "productivity", icon: Users, permissionId: "productivity" },
        { title: "Planej. Semanal", view: "planning", icon: Target, permissionId: "planejamento_semanal" },
        { title: "Planej. Período", view: "measurement-planning", icon: Calculator, permissionId: "planejamento_periodo" },
        { title: "Planej. Estratégico", view: "long-term-planning", icon: Calendar, permissionId: "planejamento_estrategico" },
        { title: "Planej. Inteligente", view: "smart-planning", icon: Target, permissionId: "smart_planning" },
        { title: "Entrega & Pós-Obra", view: "delivery", icon: ClipboardCheck, permissionId: "entrega" },
        { title: "Simulador Desembolsos", view: "cashflow-simulator", icon: Wallet, permissionId: "simulador_desembolsos" },
      ],
    },
    {
      label: "Financeiro & Operações",
      items: [
        { title: "Contrato da Obra", view: "project-contract", icon: FileText, permissionId: "contrato" },
        { title: "Custos da Obra", view: "costs", icon: DollarSign, permissionId: "custos" },
        { title: "Fluxo Financeiro", view: "financial-flow", icon: Wallet, permissionId: "financeiro" },
        { title: "Painel de Compras", view: "purchase-panel", icon: ShoppingCart, permissionId: "painel_compras" },
        { title: "Suprimentos", view: "supplies", icon: Package, permissionId: "suprimentos" },
        { title: "Empreiteiros", view: "contractors", icon: Truck, permissionId: "empreiteiros" },
        { title: "Industrialização", view: "industrialization", icon: Factory, permissionId: "industrializacao", badge: "BETA" },
      ],
    },
    {
      label: "Holding",
      items: [
        { title: "Painel da Holding", view: "holding-dashboard", icon: Crown, permissionId: "holding" },
        { title: "Receitas & Medições", view: "holding-receitas", icon: TrendingUp, permissionId: "holding_receitas" },
        { title: "Medições PLE", view: "ple-measurements", icon: ClipboardList, permissionId: "ple_medicoes" },
        { title: "Despesas & Custos", view: "holding-despesas", icon: Receipt, permissionId: "holding_despesas" },
        { title: "Documentação", view: "holding-documentos", icon: FolderOpen, permissionId: "holding_documentos" },
        { title: "PRD — Cronograma", view: "holding-prd", icon: BarChart3, permissionId: "holding_prd" },
        { title: "IA — Insights", view: "holding-insights", icon: Sparkles, permissionId: "holding_insights", badge: "BETA" },
        { title: "Configurações", view: "holding-config", icon: Settings, permissionId: "holding" },
      ],
    },
  ];

  const handleViewChange = (view: MenuViewType) => {
    if (view in DEDICATED_ROUTE_MAP) {
      navigate(DEDICATED_ROUTE_MAP[view as RouteViewType]);
      return;
    }
    const moduleStatus = getModuleStatus(view);
    if (moduleStatus === "development") {
      const moduleInfo = getModuleInfo(view);
      if (moduleInfo) {
        setDevModuleDialog(moduleInfo);
        return;
      }
    }
    if (location.pathname !== "/dashboard" && location.pathname !== "/") {
      navigate("/dashboard", { state: { targetView: view } });
      return;
    }
    onViewChange(view as ViewType);
  };

  // Filter menu items based on permissions, company modules, and system governance
  const getVisibleItems = (items: MenuItem[]) => items.filter(item => {
    if (!canAccessMenu(item.permissionId)) return false;
    if (!isSystemAdmin && !isModuleEnabled(item.view)) return false;
    const moduleStatus = getModuleStatus(item.view);
    if (moduleStatus === "disabled") return false;
    return true;
  });

  // Helper to render a menu item
  const renderMenuItem = (item: MenuItem) => {
    const moduleStatus = getModuleStatus(item.view);
    const isDevelopment = moduleStatus === "development";
    const isActive = currentActiveView === item.view;
    const isBeta = isModuleBeta(item.view);
    const isDisabledGlobally = !isModuleEnabled(item.view);

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          onClick={() => handleViewChange(item.view)}
          isActive={isActive}
          className={cn(
            "w-full justify-start gap-3 px-3 py-3 rounded-lg transition-all duration-150",
            isActive
              ? "bg-primary text-primary-foreground font-semibold shadow-sm"
              : "text-foreground hover:bg-accent hover:text-accent-foreground font-medium",
            isDevelopment && "opacity-70",
            isDisabledGlobally && isSystemAdmin && "opacity-50"
          )}
        >
          <item.icon className="h-5 w-5 shrink-0" />
          <span className="text-sm">{item.title}</span>

          <div className="ml-auto flex items-center gap-1">
            {item.view === 'supplies' && supplyOverdueCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 min-w-[16px] justify-center">
                {supplyOverdueCount}
              </Badge>
            )}
            {item.badge && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                {item.badge}
              </span>
            )}
            {isSystemAdmin && isBeta && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-amber-500/10 text-amber-600 border-amber-500/30">
                <Beaker className="h-2.5 w-2.5 mr-0.5" />
                Beta
              </Badge>
            )}
            {isSystemAdmin && isDisabledGlobally && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                <EyeOff className="h-2.5 w-2.5 mr-0.5" />
                Off
              </Badge>
            )}
            {isDevelopment && !isSystemAdmin && (
              <span className="text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                Em breve
              </span>
            )}
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <>
      <Sidebar 
        className="border-r border-border bg-background h-screen"
        collapsible="offcanvas"
      >
        {/* Header with Logo */}
        <SidebarHeader className="px-4 py-4 border-b border-border bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 flex items-center justify-center shrink-0">
                <img src={isDark ? obraMapLogoDark : obraMapLogoLight} alt="ObraMap" className="h-10 w-10 object-contain drop-shadow-sm" />
              </div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">ObraMap</h1>
            </div>
            <button
              className="relative h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
              onClick={() => { notif.setIsOpen(true); notif.loadNotifications(); }}
              title="Notificações"
            >
              <Bell className="h-4 w-4 text-foreground" />
              {notif.count > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {notif.count > 99 ? "99+" : notif.count}
                </span>
              )}
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-3 overflow-y-auto scrollbar-none bg-background">
          {/* Grouped menu sections */}
          {menuGroups.map((group) => {
            const visibleItems = getVisibleItems(group.items);
            if (visibleItems.length === 0) return null;

            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="text-xs font-bold uppercase tracking-wider px-3 mb-2 mt-3 text-primary">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {visibleItems.map(renderMenuItem)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}

          {/* Gerenciamento - só renderiza se ao menos 1 item estiver visível */}
          {(canAccessManagement("projetos") || canAccessManagement("quadras") ||
            canAccessManagement("macros") || canAccessManagement("insumos") ||
            canAccessManagement("fornecedores") ||
            ((isAdmin || isCompanyAdmin) && canAccessManagement("usuarios"))) && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="text-primary text-xs font-bold uppercase tracking-wider px-3 mb-2">
              Gerenciamento
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {canEdit && canAccessManagement("projetos") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setNewProjectOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
                    >
                      <Plus className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">Nova Obra</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canAccessManagement("projetos") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setProjectsListOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
                    >
                      <Building2 className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">Cadastro de Obras</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canAccessManagement("quadras") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setQuadrasDialogOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
                    >
                      <Grid3X3 className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">Cadastro de Quadras</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canAccessManagement("macros") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setMacrosDialogOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
                    >
                      <Layers className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">Etapas e Serviços</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canAccessManagement("insumos") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => onViewChange("inputs")}
                      isActive={currentActiveView === "inputs"}
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-3 rounded-lg transition-all duration-150",
                        currentActiveView === "inputs" 
                          ? "bg-primary text-primary-foreground font-medium shadow-sm" 
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Box className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">Cadastro de Insumos</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canAccessManagement("fornecedores") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => onViewChange("suppliers")}
                      isActive={currentActiveView === "suppliers"}
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-3 rounded-lg transition-all duration-150",
                        currentActiveView === "suppliers" 
                          ? "bg-primary text-primary-foreground font-medium shadow-sm" 
                          : "text-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Truck className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">Cadastro de Fornecedores</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {(isAdmin || isCompanyAdmin) && canAccessManagement("usuarios") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setUsersDialogOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
                    >
                      <Users className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">Gerenciar Usuários</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          )}
        </SidebarContent>

        {/* Footer with User Info */}
        <SidebarFooter className="p-3 border-t border-border mt-auto bg-background">
          {profile && (
            <div className="flex items-center gap-2 p-2 rounded-lg">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {getInitials(profile.display_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {profile.display_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getRoleLabel()}
                </p>
              </div>
              <button
                onClick={() => {
                  const root = document.documentElement;
                  if (root.classList.contains("dark")) {
                    root.classList.remove("dark");
                    localStorage.setItem("theme", "light");
                    setIsDark(false);
                  } else {
                    root.classList.add("dark");
                    localStorage.setItem("theme", "dark");
                    setIsDark(true);
                  }
                }}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
              >
                {isDark
                  ? <Sun className="h-4 w-4" />
                  : <Moon className="h-4 w-4" />
                }
              </button>
              <button
                onClick={() => signOut()}
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      <Dialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Painel de Gerenciamento de Usuários</DialogTitle>
          </DialogHeader>
          <UserPermissionsPanel />
        </DialogContent>
      </Dialog>

      <ModuleUnderDevelopmentDialog 
        open={!!devModuleDialog}
        onOpenChange={(open) => !open && setDevModuleDialog(null)}
        module={devModuleDialog}
      />

      <ProjectsListDialog open={projectsListOpen} onOpenChange={setProjectsListOpen} />
      <NewProjectDialog 
        open={newProjectOpen} 
        onOpenChange={setNewProjectOpen}
        onProjectCreated={() => {
          // Abrir dialog de etapas após criar obra
          setMacrosDialogOpen(true);
        }}
      />
      <ManageMacrosDialog open={macrosDialogOpen} onOpenChange={setMacrosDialogOpen} />
      <ManageQuadrasDialog open={quadrasDialogOpen} onOpenChange={setQuadrasDialogOpen} />

      {/* Notifications Sheet */}
      <Sheet open={notif.isOpen} onOpenChange={notif.setIsOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                Notificações
                {notif.count > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 h-5">
                    {notif.count}
                  </Badge>
                )}
              </span>
              {notif.count > 0 && (
                <button
                  onClick={notif.markAllAsRead}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" /> Marcar todas como lidas
                </button>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {notif.notifications.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notificação.</p>
            )}
            {notif.notifications.map((n) => {
              const iconMap: Record<string, React.ReactNode> = {
                despesa_pendente_link: <AlertTriangleIcon className="h-4 w-4 text-amber-500" />,
                medicao_aprovada_despesa: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
                despesa_fechamento: <FileTextIcon className="h-4 w-4 text-blue-500" />,
              };
              const icon = iconMap[n.tipo] || <ClockIcon className="h-4 w-4 text-muted-foreground" />;
              const timeAgo = formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR });
              return (
                <button
                  key={n.id}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    n.lida ? "bg-background" : "bg-accent/50 border-primary/20"
                  )}
                  onClick={() => {
                    notif.markAsRead(n.id);
                    notif.setIsOpen(false);
                    navigate("/holding-despesas");
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">{icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.titulo}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{n.mensagem}</p>
                      {n.obra_nome && (
                        <p className="text-[10px] text-primary mt-1">{n.obra_nome}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo}</p>
                    </div>
                    {!n.lida && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
