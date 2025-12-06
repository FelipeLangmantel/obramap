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
  ChevronRight,
  Building,
  Plus,
  Settings,
  PanelLeftClose,
  PanelLeft
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UserManagement } from "@/components/UserManagement";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectSettingsDialog } from "@/components/ProjectSettingsDialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import obraMapLogo from "@/assets/obramap-logo.png";

interface AppSidebarProps {
  activeView: "map" | "charts" | "production";
  onViewChange: (view: "map" | "charts" | "production") => void;
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const { state, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, role, signOut, isAdmin } = useAuth();
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

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
      title: "Gráficos", 
      view: "charts" as const, 
      icon: BarChart3 
    },
    { 
      title: "Produção Semanal", 
      view: "production" as const, 
      icon: ClipboardList 
    },
  ];

  const handleViewChange = (view: "map" | "charts" | "production") => {
    onViewChange(view);
  };

  const handleToggleSidebar = () => {
    setOpen(!collapsed);
  };

  return (
    <>
      <div className="relative flex">
        <Sidebar 
          className="border-r border-sidebar-border bg-sidebar transition-all duration-300"
          collapsible="icon"
        >
          <SidebarHeader className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                <img src={obraMapLogo} alt="ObraMap" className="h-8 w-8 object-contain" />
              </div>
              {!collapsed && (
                <div className="overflow-hidden">
                  <h1 className="text-lg font-bold text-sidebar-foreground truncate">ObraMap</h1>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="px-2 py-4">
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-3 mb-2">
                Menu Principal
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainMenuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        onClick={() => handleViewChange(item.view)}
                        isActive={activeView === item.view}
                        tooltip={collapsed ? item.title : undefined}
                        className={cn(
                          "w-full justify-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                          activeView === item.view 
                            ? "bg-primary/10 text-primary font-medium" 
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="truncate">{item.title}</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-6">
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-3 mb-2">
                Gerenciamento
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setNewProjectOpen(true)}
                      tooltip={collapsed ? "Nova Obra" : undefined}
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                    >
                      <Plus className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="truncate">Nova Obra</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setSettingsOpen(true)}
                      tooltip={collapsed ? "Cadastro de Obras" : undefined}
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                    >
                      <Building className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="truncate">Cadastro de Obras</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {isAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => setUsersDialogOpen(true)}
                        tooltip={collapsed ? "Gerenciar Usuários" : undefined}
                        className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                      >
                        <Users className="h-5 w-5 shrink-0" />
                        {!collapsed && <span className="truncate">Gerenciar Usuários</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setSettingsOpen(true)}
                      tooltip={collapsed ? "Configurações" : undefined}
                      className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                    >
                      <Settings className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="truncate">Configurações</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border">
            {profile && (
              <div className={cn(
                "flex items-center gap-3 p-2 rounded-lg",
                collapsed ? "justify-center" : ""
              )}>
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/20 text-primary text-sm">
                    {getInitials(profile.display_name)}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-sidebar-foreground truncate">
                      {profile.display_name}
                    </p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-sidebar-foreground/60 border-sidebar-border">
                      {getRoleLabel()}
                    </Badge>
                  </div>
                )}
                {!collapsed && (
                  <button
                    onClick={() => signOut()}
                    className="p-1.5 rounded-md text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Sair"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </SidebarFooter>
        </Sidebar>

        {/* Toggle Bar */}
        <button
          onClick={handleToggleSidebar}
          className="h-full w-4 flex items-center justify-center bg-sidebar border-r border-sidebar-border hover:bg-sidebar-accent transition-colors cursor-pointer group"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          <div className="h-8 w-1 rounded-full bg-sidebar-border group-hover:bg-primary/50 transition-colors" />
        </button>
      </div>

      <Dialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Acessos</DialogTitle>
          </DialogHeader>
          <UserManagement />
        </DialogContent>
      </Dialog>

      <ProjectSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </>
  );
}
