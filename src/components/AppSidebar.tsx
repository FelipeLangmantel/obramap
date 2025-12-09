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
  Package
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { UserManagement } from "@/components/UserManagement";
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
import obraMapLogo from "@/assets/obramap-logo.png";

interface AppSidebarProps {
  activeView: "map" | "charts" | "production" | "costs" | "planning" | "interactive-map" | "3d-map" | "supplies";
  onViewChange: (view: "map" | "charts" | "production" | "costs" | "planning" | "interactive-map" | "3d-map" | "supplies") => void;
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const { state, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, role, signOut, isAdmin, canEdit } = useAuth();
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

  const mainMenuItems = [
    { 
      title: "Mapa de Obras", 
      view: "map" as const, 
      icon: LayoutDashboard 
    },
    { 
      title: "Mapa Interativo", 
      view: "interactive-map" as const, 
      icon: Map 
    },
    { 
      title: "Mapa 3D", 
      view: "3d-map" as const, 
      icon: Box 
    },
    { 
      title: "Gráficos", 
      view: "charts" as const, 
      icon: BarChart3 
    },
    { 
      title: "Produção Semanal", 
      view: "production" as const, 
      icon: ClipboardList 
    },
    { 
      title: "Planejamento", 
      view: "planning" as const, 
      icon: Target 
    },
    { 
      title: "Custos da Obra", 
      view: "costs" as const, 
      icon: DollarSign 
    },
    { 
      title: "Suprimentos", 
      view: "supplies" as const, 
      icon: Package 
    },
  ];

  const handleViewChange = (view: "map" | "charts" | "production" | "costs" | "planning" | "interactive-map" | "3d-map" | "supplies") => {
    onViewChange(view);
  };

  const handleToggleSidebar = () => {
    setOpen(!collapsed);
  };

  return (
    <>
      <Sidebar 
        className="border-r border-border/40 bg-card h-screen"
        collapsible="none"
      >
        {/* Header with Logo */}
        <SidebarHeader className="px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
              <img src={obraMapLogo} alt="ObraMap" className="h-9 w-9 object-contain" />
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">ObraMap</h1>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-3">
          {/* Menu Principal */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-muted-foreground/70 text-xs font-medium uppercase tracking-wider px-3 mb-1">
              Menu Principal
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-0.5">
                {mainMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      onClick={() => handleViewChange(item.view)}
                      isActive={activeView === item.view}
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-2.5 rounded-md transition-all duration-150",
                        activeView === item.view 
                          ? "bg-accent text-accent-foreground font-medium" 
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
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

          {/* Gerenciamento */}
          {canEdit && (
            <SidebarGroup className="mt-6">
              <SidebarGroupLabel className="text-muted-foreground/70 text-xs font-medium uppercase tracking-wider px-3 mb-1">
                Gerenciamento
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setNewProjectOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all duration-150"
                    >
                      <Plus className="h-5 w-5 shrink-0" />
                      <span className="text-sm">Nova Obra</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setProjectsListOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all duration-150"
                    >
                      <Building2 className="h-5 w-5 shrink-0" />
                      <span className="text-sm">Cadastro de Obras</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setQuadrasDialogOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all duration-150"
                    >
                      <Grid3X3 className="h-5 w-5 shrink-0" />
                      <span className="text-sm">Cadastro de Quadras</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setMacrosDialogOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all duration-150"
                    >
                      <Layers className="h-5 w-5 shrink-0" />
                      <span className="text-sm">Etapas e Serviços</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {isAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setUsersDialogOpen(true)}
                        className="w-full justify-start gap-3 px-3 py-2.5 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all duration-150"
                      >
                        <Users className="h-5 w-5 shrink-0" />
                        <span className="text-sm">Gerenciar Usuários</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setSettingsOpen(true)}
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all duration-150"
                    >
                      <Settings className="h-5 w-5 shrink-0" />
                      <span className="text-sm">Configurações</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        {/* Footer with User Info */}
        <SidebarFooter className="p-3 border-t border-border/40 mt-auto">
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Acessos</DialogTitle>
          </DialogHeader>
          <UserManagement />
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
