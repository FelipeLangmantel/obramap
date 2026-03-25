import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Loader2, 
  UserPlus, 
  Shield, 
  Pencil, 
  Eye, 
  Trash2, 
  Settings,
  Building2,
  Menu,
  FolderCog,
  Plus,
  X,
  Save,
  Users,
  Clock,
  Globe,
  LogOut,
  ChevronDown,
  ChevronUp,
  MapPin,
  Monitor,
  Smartphone,
} from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";

type AppRole = "admin" | "editor" | "viewer";

// Mapeamento de roles para labels corretos da empresa
const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Usuário", // Corrigido de "Visualizador" para "Usuário"
};

interface UserWithRole {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: AppRole;
  created_at: string;
}

interface UserPermission {
  id: string;
  user_id: string;
  department: string;
  allowed_project_ids: string[] | null;
  visible_menus: string[];
  visible_management_sections: string[];
}

interface Department {
  id: string;
  name: string;
  display_order: number;
}

interface DepartmentPermission {
  id?: string;
  department_name: string;
  visible_menus: string[];
  visible_management_sections: string[];
  can_edit: boolean;
  allowed_project_ids: string[] | null;
}

interface Project {
  id: string;
  name: string;
}

interface UserSession {
  id: string;
  user_id: string;
  login_at: string;
  logout_at: string | null;
  ip_address: string | null;
  city: string | null;
  region: string | null;
  browser: string | null;
  device_type: string | null;
  user_agent: string | null;
  is_active: boolean;
  last_active_at: string | null;
  inactivity_timeout_min: number | null;
  termination_reason: string | null;
}

// ✅ Importado da fonte única de verdade – novos módulos aparecem automaticamente
import { MENU_MODULES, MANAGEMENT_MODULES, MENU_TO_MODULE_KEY, getDefaultPermissions, getAllModuleIds, getAllManagementIds } from "@/constants/modulePermissions";

// Aliases para compatibilidade interna
const MENU_OPTIONS = MENU_MODULES;
const MANAGEMENT_OPTIONS = MANAGEMENT_MODULES;

const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  displayName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  role: z.enum(["admin", "editor", "viewer"]),
});

export function UserPermissionsPanel() {
  const { isAdmin, user, company } = useAuth();
  const { projects } = useConstruction();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [permissions, setPermissions] = useState<Record<string, UserPermission>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [companyModules, setCompanyModules] = useState<{module_key: string; status: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("users");
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showAllSessions, setShowAllSessions] = useState(false);
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newDepartment, setNewDepartment] = useState("");
  
  // Form state for new user
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AppRole>("viewer");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  
  // Permission editing state
  const [editingPermission, setEditingPermission] = useState<UserPermission | null>(null);
  const [deptPermissions, setDeptPermissions] = useState<Record<string, DepartmentPermission>>({});
  const [editingDeptPerm, setEditingDeptPerm] = useState<DepartmentPermission | null>(null);
  const [isDeptPermDialogOpen, setIsDeptPermDialogOpen] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [profilesRes, rolesRes, permissionsRes, departmentsRes, sessionsRes, deptPermRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("*"),
        supabase.from("user_permissions").select("*"),
        supabase.from("departments").select("*").order("display_order"),
        supabase.from("user_sessions").select("*").order("login_at", { ascending: false }).limit(100),
        supabase.from("department_permissions").select("*").eq("company_id", company!.id),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (departmentsRes.error) throw departmentsRes.error;

      // Fetch company modules separately
      if (company?.id) {
        const { data: modulesData } = await supabase
          .from("company_modules")
          .select("module_key, status")
          .eq("company_id", company.id);
        setCompanyModules(modulesData || []);
      }

      const usersWithRoles: UserWithRole[] = (profilesRes.data || []).map((profile) => {
        const userRole = rolesRes.data?.find((r) => r.user_id === profile.user_id);
        return {
          id: profile.id,
          user_id: profile.user_id,
          display_name: profile.display_name,
          email: profile.email,
          role: (userRole?.role as AppRole) || "viewer",
          created_at: profile.created_at,
        };
      });

      const permissionsMap: Record<string, UserPermission> = {};
      (permissionsRes.data || []).forEach((p) => {
        permissionsMap[p.user_id] = {
          id: p.id,
          user_id: p.user_id,
          department: p.department || "geral",
          allowed_project_ids: p.allowed_project_ids,
          visible_menus: (p.visible_menus as string[]) || [],
          visible_management_sections: (p.visible_management_sections as string[]) || [],
        };
      });

      // Sincronizar modulos para admins
      const allModuleIds = getAllModuleIds();
      const allMgmtIds = getAllManagementIds();

      for (const u of usersWithRoles) {
        if (u.role !== 'admin') continue;
        const perm = permissionsMap[u.user_id];
        if (!perm) continue;

        const missingMenus = allModuleIds.filter(id => !perm.visible_menus.includes(id));
        const missingMgmt = allMgmtIds.filter(id => !perm.visible_management_sections.includes(id));

        if (missingMenus.length > 0 || missingMgmt.length > 0) {
          const updatedMenus = [...perm.visible_menus, ...missingMenus];
          const updatedMgmt = [...perm.visible_management_sections, ...missingMgmt];

          await supabase.from('user_permissions')
            .update({ visible_menus: updatedMenus, visible_management_sections: updatedMgmt })
            .eq('user_id', u.user_id);

          perm.visible_menus = updatedMenus;
          perm.visible_management_sections = updatedMgmt;
        }
      }

      const deptPermMap: Record<string, DepartmentPermission> = {};
      (deptPermRes.data || []).forEach((dp: any) => {
        deptPermMap[dp.department_name] = {
          id: dp.id,
          department_name: dp.department_name,
          visible_menus: dp.visible_menus || [],
          visible_management_sections: dp.visible_management_sections || [],
          can_edit: dp.can_edit ?? true,
          allowed_project_ids: dp.allowed_project_ids,
        };
      });

      setUsers(usersWithRoles);
      setPermissions(permissionsMap);
      setDepartments(departmentsRes.data || []);
      setSessions((sessionsRes.data || []) as UserSession[]);
      setDeptPermissions(deptPermMap);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Erro ao carregar dados");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = createUserSchema.safeParse({ email, password, displayName, role });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_company_user', {
        p_email: email,
        p_display_name: displayName,
        p_temp_password: password,
        p_role: role,
        p_company_id: company!.id,
      });

      if (error) throw error;

      toast.success(`Usuário criado! Senha temporária definida. O usuário deverá trocar no primeiro login.`);
      setIsCreateDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      if (error.message?.includes('ja cadastrado')) {
        toast.error('Este email já está cadastrado');
      } else if (error.message?.includes('Sem permissao')) {
        toast.error('Sem permissão para criar usuários nesta empresa');
      } else {
        toast.error(error.message || 'Erro ao criar usuário');
      }
    }
    setIsCreating(false);
  };

  const handleUpdateRole = async (userId: string, newRole: AppRole) => {
    try {
      const { error } = await supabase.from("user_roles").update({ role: newRole }).eq("user_id", userId);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)));
      toast.success("Função atualizada!");
    } catch (error) {
      console.error("Error updating role:", error);
      toast.error("Erro ao atualizar função");
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (userId === user?.id) {
      toast.error("Você não pode excluir sua própria conta");
      return;
    }
    if (!confirm(`Tem certeza que deseja excluir ${userEmail}?`)) return;

    try {
      const { error } = await supabase.from("profiles").delete().eq("user_id", userId);
      if (error) throw error;
      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
      toast.success("Usuário removido");
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Erro ao excluir usuário");
    }
  };


  const openPermissionDialog = (userId: string) => {
    setSelectedUserId(userId);
    const existingPermission = permissions[userId];
    const user = users.find(u => u.user_id === userId);
    const defaults = user ? getDefaultPermissions(user.role as 'admin' | 'editor' | 'viewer') : { visible_menus: [], visible_management_sections: [] };
    setEditingPermission(existingPermission || { id: '', user_id: userId, department: 'geral', allowed_project_ids: null, ...defaults });
    setIsPermissionDialogOpen(true);
  };

  const handleSavePermission = async () => {
    if (!editingPermission || !selectedUserId) return;

    try {
      const existingPermission = permissions[selectedUserId];
      
      const permissionData = {
        department: editingPermission.department || "geral",
        allowed_project_ids: editingPermission.allowed_project_ids && editingPermission.allowed_project_ids.length > 0 
          ? editingPermission.allowed_project_ids 
          : null,
        visible_menus: editingPermission.visible_menus,
        visible_management_sections: editingPermission.visible_management_sections,
        updated_at: new Date().toISOString(),
      };

      console.log("Saving permissions for user:", selectedUserId, permissionData);

      if (existingPermission?.id) {
        // Update existing permission
        const { error } = await supabase
          .from("user_permissions")
          .update(permissionData)
          .eq("id", existingPermission.id);
        if (error) throw error;
      } else {
        // Insert new permission
        const { error } = await supabase.from("user_permissions").insert({
          user_id: selectedUserId,
          ...permissionData,
        });
        if (error) throw error;
      }

      toast.success("Permissões salvas com sucesso!");
      setIsPermissionDialogOpen(false);
      await fetchData();
    } catch (error) {
      console.error("Error saving permission:", error);
      toast.error("Erro ao salvar permissões");
    }
  };

  const handleAddDepartment = async () => {
    if (!newDepartment.trim()) return;
    
    try {
      const { error } = await supabase.from("departments").insert({
        name: newDepartment.trim(),
        display_order: departments.length,
        company_id: company!.id,
      });
      if (error) throw error;
      toast.success("Departamento adicionado!");
      setNewDepartment("");
      fetchData();
    } catch (error: any) {
      if (error.message?.includes("duplicate")) {
        toast.error("Este departamento já existe");
      } else {
        toast.error("Erro ao adicionar departamento");
      }
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    try {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
      toast.success("Departamento removido");
      fetchData();
    } catch (error) {
      console.error("Error deleting department:", error);
      toast.error("Erro ao remover departamento");
    }
  };

  const handleSaveDeptPermission = async () => {
    if (!editingDeptPerm || !company) return;
    try {
      const payload = {
        company_id: company.id,
        department_name: editingDeptPerm.department_name,
        visible_menus: editingDeptPerm.visible_menus,
        visible_management_sections: editingDeptPerm.visible_management_sections,
        can_edit: editingDeptPerm.can_edit,
        allowed_project_ids: editingDeptPerm.allowed_project_ids,
        updated_at: new Date().toISOString(),
      };
      if (editingDeptPerm.id) {
        await supabase.from("department_permissions").update(payload).eq("id", editingDeptPerm.id);
      } else {
        await supabase.from("department_permissions").insert(payload);
      }
      toast.success(`Permissões de "${editingDeptPerm.department_name}" salvas!`);
      setIsDeptPermDialogOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setRole("viewer");
    setErrors({});
  };

  const toggleMenu = (menuId: string) => {
    if (!editingPermission) return;
    const current = editingPermission.visible_menus;
    const updated = current.includes(menuId)
      ? current.filter(m => m !== menuId)
      : [...current, menuId];
    setEditingPermission({ ...editingPermission, visible_menus: updated });
  };

  const toggleManagement = (sectionId: string) => {
    if (!editingPermission) return;
    const current = editingPermission.visible_management_sections;
    const updated = current.includes(sectionId)
      ? current.filter(m => m !== sectionId)
      : [...current, sectionId];
    setEditingPermission({ ...editingPermission, visible_management_sections: updated });
  };

  const toggleProject = (projectId: string) => {
    if (!editingPermission) return;
    const current = editingPermission.allowed_project_ids || [];
    const updated = current.includes(projectId)
      ? current.filter(p => p !== projectId)
      : [...current, projectId];
    setEditingPermission({ 
      ...editingPermission, 
      allowed_project_ids: updated.length > 0 ? updated : null 
    });
  };

  const handleTerminateSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from("user_sessions")
        .update({ is_active: false, logout_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;
      toast.success("Sessão encerrada!");
      fetchData();
    } catch (error) {
      console.error("Error terminating session:", error);
      toast.error("Erro ao encerrar sessão");
    }
  };

  const formatSessionDuration = (loginAt: string, logoutAt: string | null) => {
    const start = new Date(loginAt);
    const end = logoutAt ? new Date(logoutAt) : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 1000 / 60);
    if (diff < 60) return `${diff} min`;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hours}h ${mins}min`;
  };

  const getUserName = (userId: string) => {
    return users.find(u => u.user_id === userId)?.display_name || "Desconhecido";
  };

  const getRoleBadge = (role: AppRole) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-primary/20 text-primary"><Shield className="h-3 w-3 mr-1" />Administrador</Badge>;
      case "editor":
        return <Badge className="bg-amber-500/20 text-amber-600"><Pencil className="h-3 w-3 mr-1" />Editor</Badge>;
      case "viewer":
        return <Badge className="bg-muted text-muted-foreground"><Eye className="h-3 w-3 mr-1" />Usuário</Badge>;
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <p>Você não tem permissão para acessar esta seção.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="departments" className="gap-2">
              <Building2 className="h-4 w-4" />
              Departamentos
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2">
              <Clock className="h-4 w-4" />
              Sessões
            </TabsTrigger>
          </TabsList>

          {activeTab === "users" && (
            <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true); }}>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          )}
        </div>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Usuários do Sistema</CardTitle>
              <CardDescription>
                Gerencie acessos, funções e permissões detalhadas de cada usuário
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.display_name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{getRoleBadge(u.role)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {permissions[u.user_id]?.department || "Geral"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Select
                            value={u.role}
                            onValueChange={(v) => handleUpdateRole(u.user_id, v as AppRole)}
                            disabled={u.user_id === user?.id}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Usuário</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="admin">Administrador</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openPermissionDialog(u.user_id)}
                            title="Configurar permissões"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteUser(u.user_id, u.email)}
                            disabled={u.user_id === user?.id}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <h4 className="font-semibold mb-3">Perfis da Empresa</h4>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-background rounded-lg border-l-4 border-l-primary">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="font-medium">Administrador</span>
                  </div>
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    <li>• Gerenciar usuários da empresa</li>
                    <li>• Definir perfis e acessos por módulo</li>
                    <li>• Acesso total às obras da empresa</li>
                  </ul>
                </div>
                <div className="p-3 bg-background rounded-lg border-l-4 border-l-amber-500">
                  <div className="flex items-center gap-2 mb-2">
                    <Pencil className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">Editor</span>
                  </div>
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    <li>• Editar dados operacionais</li>
                    <li>• Lançar produção, custos, planejamento</li>
                    <li>• Não gerencia usuários</li>
                  </ul>
                </div>
                <div className="p-3 bg-background rounded-lg border-l-4 border-l-muted-foreground">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Usuário</span>
                  </div>
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    <li>• Apenas visualização</li>
                    <li>• Acesso a dashboards e relatórios</li>
                    <li>• <strong>Não pode salvar alterações</strong></li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Departamentos / Categorias</CardTitle>
              <CardDescription>
                Crie e gerencie os departamentos que podem ser atribuídos aos usuários
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Nome do novo departamento"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()}
                />
                <Button onClick={handleAddDepartment}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {departments.map((dept) => {
                  const perm = deptPermissions[dept.name];
                  return (
                    <div key={dept.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border/40">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">{dept.name}</span>
                        <span className={`text-[10px] mt-0.5 ${perm ? "text-emerald-600" : "text-amber-600"}`}>
                          {perm
                            ? `${perm.visible_menus.length} módulos · ${perm.can_edit ? "Editor" : "Visualizador"}`
                            : "Sem permissões definidas"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Configurar permissões do departamento"
                          onClick={() => {
                            const defaults = getDefaultPermissions('editor');
                            setEditingDeptPerm(perm || {
                              department_name: dept.name,
                              visible_menus: defaults.visible_menus,
                              visible_management_sections: defaults.visible_management_sections,
                              can_edit: true,
                              allowed_project_ids: null,
                            });
                            setIsDeptPermDialogOpen(true);
                          }}>
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteDepartment(dept.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Clique em ⚙️ para configurar quais módulos cada departamento pode acessar.
                Usuários novos herdam automaticamente as permissões do departamento em que estão locados.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Sessões Ativas e Histórico
              </CardTitle>
              <CardDescription>
                Monitore logins, IPs, duração e encerre sessões se necessário
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{getUserName(session.user_id)}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(session.login_at).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {session.ip_address || "N/A"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatSessionDuration(session.login_at, session.logout_at)}
                      </TableCell>
                      <TableCell>
                        {session.is_active ? (
                          <Badge className="bg-green-500/20 text-green-600">Ativa</Badge>
                        ) : (
                          <Badge variant="outline">Encerrada</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {session.is_active && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleTerminateSession(session.id)}
                            title="Encerrar sessão"
                          >
                            <LogOut className="h-4 w-4 mr-1" />
                            Encerrar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {sessions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhuma sessão registrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-500/10 rounded-full">
                  <Shield className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Segurança de Sessões</h4>
                  <p className="text-sm text-muted-foreground">
                    Use o botão "Encerrar" para desconectar sessões travadas ou suspeitas. 
                    O usuário precisará fazer login novamente.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
            <DialogDescription>Preencha os dados do novo usuário</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={errors.displayName ? "border-destructive" : ""}
              />
              {errors.displayName && <p className="text-sm text-destructive">{errors.displayName}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={errors.password ? "border-destructive" : ""}
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Usuário (apenas visualização)</SelectItem>
                  <SelectItem value="editor">Editor (pode editar dados)</SelectItem>
                  <SelectItem value="admin">Administrador (acesso total)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Usuário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permission Dialog - Professional Redesign */}
      <Dialog open={isPermissionDialogOpen} onOpenChange={setIsPermissionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Configurar Permissões</DialogTitle>
            <DialogDescription className="text-sm">
              <span className="font-medium text-foreground">
                {users.find(u => u.user_id === selectedUserId)?.display_name}
              </span>
              {" · "}
              {getRoleBadge(users.find(u => u.user_id === selectedUserId)?.role || "viewer")}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {/* Department */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  Departamento
                </Label>
                <Select
                  value={editingPermission?.department || "geral"}
                  onValueChange={(v) => setEditingPermission(prev => prev ? { ...prev, department: v } : null)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Geral</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.name}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Allowed Projects */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  Obras Permitidas
                </Label>
                <p className="text-xs text-muted-foreground">
                  Se nenhuma obra for selecionada, o usuário terá acesso a todas.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {projects.map((project) => {
                    const isChecked = editingPermission?.allowed_project_ids?.includes(project.id) || false;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => toggleProject(project.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors",
                          isChecked
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-muted-foreground/30"
                        )}
                      >
                        <div className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isChecked ? "bg-primary border-primary" : "border-muted-foreground/30"
                        )}>
                          {isChecked && <Settings className="h-2.5 w-2.5 text-primary-foreground" />}
                        </div>
                        <span className="truncate">{project.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Menu Visibility - Filtered by active company modules */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Menu className="h-3.5 w-3.5" />
                  Módulos do Sistema
                </Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {MENU_OPTIONS.filter((menu) => {
                    // Filtrar módulos desativados pela empresa
                    const moduleKey = MENU_TO_MODULE_KEY[menu.id];
                    if (moduleKey) {
                      const companyModule = companyModules.find(m => m.module_key === moduleKey);
                      if (companyModule?.status === "disabled") return false;
                    }
                    return true;
                  }).map((menu) => {
                    const isChecked = editingPermission?.visible_menus?.includes(menu.id) || false;
                    return (
                      <button
                        key={menu.id}
                        type="button"
                        onClick={() => toggleMenu(menu.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm text-left transition-colors",
                          isChecked
                            ? "border-primary bg-primary/5 text-foreground font-medium"
                            : "border-border bg-background text-muted-foreground hover:border-muted-foreground/30"
                        )}
                      >
                        <div className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isChecked ? "bg-primary border-primary" : "border-muted-foreground/30"
                        )}>
                          {isChecked && <Settings className="h-2.5 w-2.5 text-primary-foreground" />}
                        </div>
                        <span className="truncate">{menu.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Management Sections */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <FolderCog className="h-3.5 w-3.5" />
                  Seções de Gerenciamento
                </Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {MANAGEMENT_OPTIONS.map((section) => {
                    const isChecked = editingPermission?.visible_management_sections?.includes(section.id) || false;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => toggleManagement(section.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm text-left transition-colors",
                          isChecked
                            ? "border-primary bg-primary/5 text-foreground font-medium"
                            : "border-border bg-background text-muted-foreground hover:border-muted-foreground/30"
                        )}
                      >
                        <div className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isChecked ? "bg-primary border-primary" : "border-muted-foreground/30"
                        )}>
                          {isChecked && <Settings className="h-2.5 w-2.5 text-primary-foreground" />}
                        </div>
                        <span className="truncate">{section.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsPermissionDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const user = users.find(u => u.user_id === selectedUserId);
              if (!user) return;
              const defaults = getDefaultPermissions(user.role as 'admin' | 'editor' | 'viewer');
              setEditingPermission(prev => prev ? { ...prev, ...defaults } : prev);
              toast.success('Permissões padrão carregadas. Salve para confirmar.');
            }}>
              Restaurar Padrão do Perfil
            </Button>
            <Button onClick={handleSavePermission}>
              <Save className="h-4 w-4 mr-2" />
              Salvar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Department Permission Dialog */}
      <Dialog open={isDeptPermDialogOpen} onOpenChange={setIsDeptPermDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissões — {editingDeptPerm?.department_name}</DialogTitle>
            <DialogDescription>
              Defina o que usuários deste departamento podem ver e editar.
              Cada usuário novo locado aqui herda estas permissões automaticamente.
            </DialogDescription>
          </DialogHeader>

          {editingDeptPerm && (
            <div className="space-y-4">
              {/* Toggle pode editar */}
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">Modo de acesso padrão</p>
                  <p className="text-xs text-muted-foreground">
                    {editingDeptPerm.can_edit
                      ? "Pode criar, editar e excluir registros"
                      : "Somente visualização — não pode editar nada"}
                  </p>
                </div>
                <Switch
                  checked={editingDeptPerm.can_edit}
                  onCheckedChange={v => setEditingDeptPerm(p => p ? { ...p, can_edit: v } : null)}
                />
              </div>

              {/* Módulos visíveis */}
              <div>
                <Label className="text-sm font-semibold">Módulos visíveis no menu</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-64 overflow-y-auto">
                  {MENU_MODULES.map(mod => (
                    <div key={mod.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`dept-menu-${mod.id}`}
                        checked={editingDeptPerm.visible_menus.includes(mod.id)}
                        onCheckedChange={checked => {
                          setEditingDeptPerm(p => !p ? null : {
                            ...p,
                            visible_menus: checked
                              ? [...p.visible_menus, mod.id]
                              : p.visible_menus.filter(m => m !== mod.id)
                          });
                        }}
                      />
                      <label htmlFor={`dept-menu-${mod.id}`} className="text-xs cursor-pointer">{mod.label}</label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seções de gerenciamento */}
              <div>
                <Label className="text-sm font-semibold">Seções de gerenciamento</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {MANAGEMENT_MODULES.map(mod => (
                    <div key={mod.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`dept-mgmt-${mod.id}`}
                        checked={editingDeptPerm.visible_management_sections.includes(mod.id)}
                        onCheckedChange={checked => {
                          setEditingDeptPerm(p => !p ? null : {
                            ...p,
                            visible_management_sections: checked
                              ? [...p.visible_management_sections, mod.id]
                              : p.visible_management_sections.filter(m => m !== mod.id)
                          });
                        }}
                      />
                      <label htmlFor={`dept-mgmt-${mod.id}`} className="text-xs cursor-pointer">{mod.label}</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeptPermDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveDeptPermission}>Salvar Permissões</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
