import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Loader2, 
  Plus, 
  Users, 
  Search, 
  KeyRound, 
  UserX, 
  UserCheck, 
  Copy, 
  Building2, 
  ChevronRight, 
  ChevronDown,
  Shield,
  User as UserIcon,
  Trash2,
  Pencil
} from "lucide-react";
import { z } from "zod";

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  company_id: string | null;
  status: string;
  system_role: string;
  must_change_password: boolean;
  created_at: string;
}

interface CompanyWithUsers extends Company {
  users: UserProfile[];
}

const userSchema = z.object({
  display_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email: z.string().email("Email inválido"),
  company_id: z.string().uuid("Selecione uma empresa"),
  system_role: z.enum(["admin", "editor", "user"], { required_error: "Selecione um perfil" }),
});

export default function SystemUserManagement() {
  const [companiesWithUsers, setCompaniesWithUsers] = useState<CompanyWithUsers[]>([]);
  const [orphanUsers, setOrphanUsers] = useState<UserProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  
  const [formData, setFormData] = useState({
    display_name: "",
    email: "",
    company_id: "",
    system_role: "user" as "admin" | "editor" | "user",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchData = async () => {
    try {
      const [usersResult, companiesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .order("display_name"),
        supabase
          .from("companies")
          .select("id, name, slug")
          .order("name"),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (companiesResult.error) throw companiesResult.error;

      const users = (usersResult.data || []).map((user) => ({
        ...user,
        status: (user as any).status || 'active',
        system_role: (user as any).system_role || 'user',
        must_change_password: (user as any).must_change_password || false,
      })) as UserProfile[];

      const companiesData = companiesResult.data || [];
      setCompanies(companiesData);

      // Organizar usuários por empresa
      const companiesMap = new Map<string, CompanyWithUsers>();
      companiesData.forEach((company) => {
        companiesMap.set(company.id, { ...company, users: [] });
      });

      const orphans: UserProfile[] = [];
      users.forEach((user) => {
        // Ignorar SYSTEM_ADMIN (não aparece agrupado em empresa)
        if (user.system_role === 'system_admin') {
          orphans.push(user);
          return;
        }

        if (user.company_id && companiesMap.has(user.company_id)) {
          companiesMap.get(user.company_id)!.users.push(user);
        } else {
          orphans.push(user);
        }
      });

      setCompaniesWithUsers(Array.from(companiesMap.values()));
      setOrphanUsers(orphans);

      // Expandir todas as empresas por padrão
      setExpandedCompanies(new Set(companiesData.map(c => c.id)));
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generateTempPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let password = "Temp";
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password + "!";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      const normalizedEmail = formData.email.trim().toLowerCase();
      const result = userSchema.safeParse({ ...formData, email: normalizedEmail });
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
        setIsSubmitting(false);
        return;
      }

      // Verificar se email já existe
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .single();

      if (existingUser) {
        setErrors({ email: "Este email já está cadastrado" });
        setIsSubmitting(false);
        return;
      }

      // Gerar senha temporária
      const password = generateTempPassword();

      // Usar edge function para não alterar a sessão atual
      const { data, error: fnError } = await supabase.functions.invoke("create-user", {
        body: {
          email: normalizedEmail,
          password: password,
          display_name: formData.display_name.trim(),
          role: formData.system_role === "admin" ? "admin" : formData.system_role === "editor" ? "editor" : "viewer",
          company_id: formData.company_id,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const newUserId = data?.user_id;

      if (newUserId) {
        // Aguardar trigger criar o profile
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Atualizar o profile com system_role correto
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            company_id: formData.company_id,
            system_role: formData.system_role,
            must_change_password: true,
            status: 'active',
          } as any)
          .eq("user_id", newUserId);

        if (updateError) console.error("Error updating profile:", updateError);
      }

      setTempPassword(password);
      toast.success("Usuário criado com sucesso!");
      fetchData();
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast.error(error.message || "Erro ao criar usuário");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    const newStatus = user.status === "active" ? "inactive" : "active";
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: newStatus } as any)
        .eq("id", user.id);

      if (error) throw error;
      toast.success(`Usuário ${newStatus === "active" ? "ativado" : "desativado"} com sucesso!`);
      fetchData();
    } catch (error) {
      console.error("Error updating user status:", error);
      toast.error("Erro ao atualizar status do usuário");
    }
  };

  const handleResetPassword = async (user: UserProfile) => {
    if (!confirm(`Deseja enviar email de redefinição de senha para ${user.display_name}?`)) {
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/change-password`,
      });

      if (error) throw error;

      await supabase
        .from("profiles")
        .update({ must_change_password: true } as any)
        .eq("id", user.id);

      toast.success("Email de redefinição de senha enviado!");
    } catch (error) {
      console.error("Error resetting password:", error);
      toast.error("Erro ao redefinir senha");
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.system_role === 'system_admin') {
      toast.error("Não é possível excluir um SYSTEM_ADMIN");
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir ${user.display_name}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      // Call edge function to delete user from auth.users (which cascades to profiles)
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: user.user_id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Usuário excluído com sucesso!");
      fetchData();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error.message || "Erro ao excluir usuário");
    }
  };

  const handleEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      display_name: user.display_name,
      email: user.email,
      company_id: user.company_id || "",
      system_role: user.system_role as "admin" | "editor" | "user",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setErrors({});
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: formData.display_name.trim(),
          company_id: formData.company_id || null,
          system_role: formData.system_role,
        } as any)
        .eq("id", editingUser.id);

      if (error) throw error;

      toast.success("Usuário atualizado com sucesso!");
      setIsEditDialogOpen(false);
      setEditingUser(null);
      fetchData();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast.error(error.message || "Erro ao atualizar usuário");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      display_name: "",
      email: "",
      company_id: "",
      system_role: "user" as "admin" | "editor" | "user",
    });
    setErrors({});
    setTempPassword(null);
    setEditingUser(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  const toggleCompany = (companyId: string) => {
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const filteredCompaniesWithUsers = companiesWithUsers
    .map(company => ({
      ...company,
      users: company.users.filter(u => 
        u.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }))
    .filter(company => 
      company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.users.length > 0
    );

  const filteredOrphanUsers = orphanUsers.filter(u =>
    u.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "system_admin":
        return <Badge variant="destructive" className="gap-1"><Shield className="h-3 w-3" />System Admin</Badge>;
      case "admin":
        return <Badge className="bg-primary/20 text-primary gap-1"><Shield className="h-3 w-3" />Administrador</Badge>;
      case "editor":
        return <Badge className="bg-blue-500/20 text-blue-600 gap-1"><Pencil className="h-3 w-3" />Editor</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><UserIcon className="h-3 w-3" />Usuário</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    return status === "active" ? (
      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
        Ativo
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">
        Inativo
      </Badge>
    );
  };

  const UserRow = ({ user }: { user: UserProfile }) => (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 border-b last:border-b-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <UserIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{user.display_name}</span>
            {user.must_change_password && (
              <Badge variant="outline" className="text-xs shrink-0">Senha temp.</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {getRoleBadge(user.system_role)}
        {getStatusBadge(user.status)}
        <div className="flex items-center gap-1">
          {user.system_role !== 'system_admin' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEditUser(user)}
                title="Editar usuário"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleResetPassword(user)}
                title="Redefinir senha"
              >
                <KeyRound className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleToggleStatus(user)}
                title={user.status === "active" ? "Desativar" : "Ativar"}
              >
                {user.status === "active" ? (
                  <UserX className="h-4 w-4 text-destructive" />
                ) : (
                  <UserCheck className="h-4 w-4 text-green-600" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteUser(user)}
                title="Excluir usuário"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Usuários por Empresa
              </CardTitle>
              <CardDescription>
                Gerencie os usuários do sistema organizados por empresa
              </CardDescription>
            </div>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuários ou empresas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {filteredCompaniesWithUsers.map((company) => (
                <Collapsible
                  key={company.id}
                  open={expandedCompanies.has(company.id)}
                  onOpenChange={() => toggleCompany(company.id)}
                >
                  <div className="rounded-lg border">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-4 hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          {expandedCompanies.has(company.id) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div className="text-left">
                            <h3 className="font-semibold">{company.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {company.users.length} usuário{company.users.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">{company.slug}</Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t">
                        {company.users.length === 0 ? (
                          <div className="py-6 text-center text-muted-foreground text-sm">
                            Nenhum usuário nesta empresa
                          </div>
                        ) : (
                          company.users.map((user) => (
                            <UserRow key={user.id} user={user} />
                          ))
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}

              {/* Usuários sem empresa (System Admins e órfãos) */}
              {filteredOrphanUsers.length > 0 && (
                <div className="rounded-lg border border-dashed">
                  <div className="p-4 border-b">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <Shield className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Administradores do Sistema</h3>
                        <p className="text-sm text-muted-foreground">
                          Usuários com acesso global à plataforma
                        </p>
                      </div>
                    </div>
                  </div>
                  <div>
                    {filteredOrphanUsers.map((user) => (
                      <UserRow key={user.id} user={user} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Dialog de Novo Usuário */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>
              Preencha os dados para criar um novo usuário. Uma senha temporária será gerada automaticamente.
            </DialogDescription>
          </DialogHeader>

          {tempPassword ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-medium mb-2">Usuário criado com sucesso!</p>
                <p className="text-sm text-green-700 mb-3">
                  Envie a senha temporária abaixo para o usuário:
                </p>
                <div className="flex items-center gap-2 bg-card p-2 rounded border">
                  <code className="flex-1 font-mono text-sm">{tempPassword}</code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(tempPassword)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display_name">Nome Completo *</Label>
                <Input
                  id="display_name"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="Nome do usuário"
                  className={errors.display_name ? "border-destructive" : ""}
                />
                {errors.display_name && (
                  <p className="text-sm text-destructive">{errors.display_name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@empresa.com"
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_id">Empresa *</Label>
                <Select
                  value={formData.company_id}
                  onValueChange={(value) => setFormData({ ...formData, company_id: value })}
                >
                  <SelectTrigger className={errors.company_id ? "border-destructive" : ""}>
                    <SelectValue placeholder="Selecione uma empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.company_id && (
                  <p className="text-sm text-destructive">{errors.company_id}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="system_role">Perfil na Empresa *</Label>
                <Select
                  value={formData.system_role}
                  onValueChange={(value: "admin" | "editor" | "user") => setFormData({ ...formData, system_role: value })}
                >
                  <SelectTrigger className={errors.system_role ? "border-destructive" : ""}>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador (gerencia a empresa)</SelectItem>
                    <SelectItem value="editor">Editor (edita dados, sem gerenciar usuários)</SelectItem>
                    <SelectItem value="user">Usuário (apenas visualização)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.system_role && (
                  <p className="text-sm text-destructive">{errors.system_role}</p>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Usuário
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Editar Usuário */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Altere os dados do usuário {editingUser?.email}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_display_name">Nome Completo *</Label>
              <Input
                id="edit_display_name"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="Nome do usuário"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_company_id">Empresa</Label>
              <Select
                value={formData.company_id}
                onValueChange={(value) => setFormData({ ...formData, company_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_system_role">Perfil na Empresa *</Label>
              <Select
                value={formData.system_role}
                onValueChange={(value: "admin" | "editor" | "user") => setFormData({ ...formData, system_role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador (gerencia a empresa)</SelectItem>
                  <SelectItem value="editor">Editor (edita dados, sem gerenciar usuários)</SelectItem>
                  <SelectItem value="user">Usuário (apenas visualização)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
