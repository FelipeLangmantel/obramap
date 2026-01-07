import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
import { 
  LayoutDashboard, 
  ClipboardList,
  BarChart3,
  Users,
  LogOut,
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
  Crown,
  ClipboardCheck
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
import { ProjectsListDialog } from "@/components/ProjectsListDialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ManageMacrosDialog } from "@/components/ManageMacrosDialog";
import { ManageQuadrasDialog } from "@/components/ManageQuadrasDialog";
import obraMapLogo from "@/assets/obramap-logo-new.png";

type ViewType = "map" | "charts" | "production" | "costs" | "planning" | "interactive-map" | "3d-map" | "supplies" | "inputs" | "suppliers" | "financial-flow" | "board-decisions" | "delivery" | "smart-planning";

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

// Mapear views para module_keys do banco
const VIEW_TO_MODULE_KEY: Record<string, string> = {
  "map": "mapa_obras",
  "interactive-map": "mapa_obras",
  "3d-map": "mapa_obras",
  "charts": "mapa_obras",
  "production": "producao",
  "planning": "planejamento_inteligente",
  "smart-planning": "planejamento_inteligente",
  "costs": "custos",
  "supplies": "suprimentos",
  "financial-flow": "financeiro",
  "board-decisions": "diretoria",
  "delivery": "entrega",
};

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const { state, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, company, role, signOut, isAdmin, canEdit, canAccessMenu, canAccessManagement, canAccessProject, systemRole, isCompanyAdmin } = useAuth();
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [projectsListOpen, setProjectsListOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [macrosDialogOpen, setMacrosDialogOpen] = useState(false);
  const [quadrasDialogOpen, setQuadrasDialogOpen] = useState(false);
  const [companyModules, setCompanyModules] = useState<CompanyModule[]>([]);
  const [devModuleDialog, setDevModuleDialog] = useState<CompanyModule | null>(null);

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
    const moduleKey = VIEW_TO_MODULE_KEY[viewKey];
    if (!moduleKey) return "active"; // Se não mapeado, considera ativo
    
    const module = companyModules.find(m => m.module_key === moduleKey);
    return module?.status || "active";
  };

  const getModuleInfo = (viewKey: string): CompanyModule | null => {
    const moduleKey = VIEW_TO_MODULE_KEY[viewKey];
    if (!moduleKey) return null;
    return companyModules.find(m => m.module_key === moduleKey) || null;
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
    if (systemRole === "editor" || role === "editor") return "Editor";
    return "Usuário";
  };

  // Menu items mapped to permission IDs
  const mainMenuItems = [
    { 
      title: "Mapa de Obras", 
      view: "map" as const, 
      icon: LayoutDashboard,
      permissionId: "dashboard"
    },
    { 
      title: "Mapa Interativo", 
      view: "interactive-map" as const, 
      icon: Map,
      permissionId: "mapa"
    },
    { 
      title: "Mapa 3D", 
      view: "3d-map" as const, 
      icon: Box,
      permissionId: "mapa"
    },
    { 
      title: "Gráficos", 
      view: "charts" as const, 
      icon: BarChart3,
      permissionId: "graficos"
    },
    { 
      title: "Produção Semanal", 
      view: "production" as const, 
      icon: ClipboardList,
      permissionId: "producao"
    },
    { 
      title: "Planejamento", 
      view: "planning" as const, 
      icon: Target,
      permissionId: "planejamento"
    },
    { 
      title: "Custos da Obra", 
      view: "costs" as const, 
      icon: DollarSign,
      permissionId: "financeiro"
    },
    { 
      title: "Suprimentos", 
      view: "supplies" as const, 
      icon: Package,
      permissionId: "suprimentos"
    },
    { 
      title: "Fluxo Financeiro", 
      view: "financial-flow" as const, 
      icon: Wallet,
      permissionId: "financeiro"
    },
    { 
      title: "Painel da Diretoria", 
      view: "board-decisions" as const, 
      icon: Crown,
      permissionId: "financeiro"
    },
    { 
      title: "Entrega & Pós-Obra", 
      view: "delivery" as const, 
      icon: ClipboardCheck,
      permissionId: "producao"
    },
    { 
      title: "Planejamento Inteligente", 
      view: "smart-planning" as const, 
      icon: Target,
      permissionId: "planejamento"
    },
  ];

  // Filter menu items based on user permissions AND module status
  const visibleMenuItems = mainMenuItems.filter(item => {
    // Primeiro verificar permissões do usuário
    if (!canAccessMenu(item.permissionId)) return false;
    
    // Depois verificar status do módulo da empresa
    const moduleStatus = getModuleStatus(item.view);
    // Ocultar módulos desativados
    if (moduleStatus === "disabled") return false;
    
    return true;
  });

  const handleViewChange = (view: ViewType) => {
    const moduleStatus = getModuleStatus(view);
    
    // Se módulo em desenvolvimento, mostrar modal
    if (moduleStatus === "development") {
      const moduleInfo = getModuleInfo(view);
      if (moduleInfo) {
        setDevModuleDialog(moduleInfo);
        return;
      }
    }
    
    onViewChange(view);
  };

  const handleToggleSidebar = () => {
    setOpen(!collapsed);
  };

  return (
    <>
      <Sidebar 
        className="border-r border-border bg-background h-screen"
        collapsible="offcanvas"
      >
        {/* Header with Logo */}
        <SidebarHeader className="px-4 py-5 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 flex items-center justify-center shrink-0">
              <img src={obraMapLogo} alt="ObraMap" className="h-12 w-12 object-contain drop-shadow-sm" />
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">ObraMap</h1>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-3 overflow-y-auto bg-background">
          {/* Menu Principal */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-primary text-xs font-bold uppercase tracking-wider px-3 mb-2 mt-3">
              Menu Principal
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {visibleMenuItems.map((item) => {
                  const moduleStatus = getModuleStatus(item.view);
                  const isDevelopment = moduleStatus === "development";
                  
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        onClick={() => handleViewChange(item.view)}
                        isActive={activeView === item.view}
                        className={cn(
                          "w-full justify-start gap-3 px-3 py-3 rounded-lg transition-all duration-150",
                          activeView === item.view 
                            ? "bg-primary text-primary-foreground font-semibold shadow-sm" 
                            : "text-foreground hover:bg-accent hover:text-accent-foreground font-medium",
                          isDevelopment && "opacity-70"
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className="text-sm">{item.title}</span>
                        {isDevelopment && (
                          <span className="ml-auto text-xs bg-yellow-500/20 text-yellow-600 px-1.5 py-0.5 rounded">
                            Em breve
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Gerenciamento - Filtrado por permissões */}
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
                      isActive={activeView === "inputs"}
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-3 rounded-lg transition-all duration-150",
                        activeView === "inputs" 
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
                      isActive={activeView === "suppliers"}
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-3 rounded-lg transition-all duration-150",
                        activeView === "suppliers" 
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
                {canEdit && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setSettingsOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
                    >
                      <Settings className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">Configurações</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer with User Info */}
        <SidebarFooter className="p-3 border-t border-border mt-auto bg-background">
          {profile && (
            <div className="flex items-center gap-3 p-2 rounded-lg">
              <Avatar className="h-9 w-9 shrink-0">
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
                onClick={() => signOut()}
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ManageMacrosDialog open={macrosDialogOpen} onOpenChange={setMacrosDialogOpen} />
      <ManageQuadrasDialog open={quadrasDialogOpen} onOpenChange={setQuadrasDialogOpen} />
    </>
  );
}
