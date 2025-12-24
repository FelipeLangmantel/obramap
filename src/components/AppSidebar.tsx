import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
  Crown
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { UserPermissionsPanel } from "@/components/admin/UserPermissionsPanel";
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

type ViewType = "map" | "charts" | "production" | "costs" | "planning" | "interactive-map" | "3d-map" | "supplies" | "inputs" | "suppliers" | "financial-flow" | "board-decisions";

interface AppSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const { state, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, role, signOut, isAdmin, canEdit, canAccessMenu, canAccessManagement, canAccessProject } = useAuth();
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [projectsListOpen, setProjectsListOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [macrosDialogOpen, setMacrosDialogOpen] = useState(false);
  const [quadrasDialogOpen, setQuadrasDialogOpen] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = () => {
    if (role === "admin") return "Administrador";
    if (role === "editor") return "Editor";
    return "Visualizador";
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
  ];

  // Filter menu items based on user permissions
  const visibleMenuItems = mainMenuItems.filter(item => canAccessMenu(item.permissionId));

  const handleViewChange = (view: ViewType) => {
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
                {visibleMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      onClick={() => handleViewChange(item.view)}
                      isActive={activeView === item.view}
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-3 rounded-lg transition-all duration-150",
                        activeView === item.view 
                          ? "bg-primary text-primary-foreground font-semibold shadow-sm" 
                          : "text-foreground hover:bg-accent hover:text-accent-foreground font-medium"
                      )}
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className="text-sm">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
                      onClick={() => handleViewChange("inputs")}
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
                      onClick={() => handleViewChange("suppliers")}
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
                {isAdmin && canAccessManagement("usuarios") && (
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

      <ProjectsListDialog open={projectsListOpen} onOpenChange={setProjectsListOpen} />
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ManageMacrosDialog open={macrosDialogOpen} onOpenChange={setMacrosDialogOpen} />
      <ManageQuadrasDialog open={quadrasDialogOpen} onOpenChange={setQuadrasDialogOpen} />
    </>
  );
}
