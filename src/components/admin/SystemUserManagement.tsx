import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Users, Search, KeyRound, UserX, UserCheck, Copy } from "lucide-react";
import { z } from "zod";

interface Company {
  id: string;
  name: string;
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
  company?: Company;
}

const userSchema = z.object({
  display_name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email: z.string().email("Email inválido"),
  company_id: z.string().uuid("Selecione uma empresa"),
  system_role: z.enum(["admin", "user"], { required_error: "Selecione um perfil" }),
});

export default function SystemUserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    display_name: "",
    email: "",
    company_id: "",
    system_role: "user" as "admin" | "user",
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
          .select("id, name")
          .order("name"),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (companiesResult.error) throw companiesResult.error;

      // Map users with companies
      const usersWithCompany = (usersResult.data || []).map((user) => ({
        ...user,
        status: (user as any).status || 'active',
        system_role: (user as any).system_role || 'user',
        must_change_password: (user as any).must_change_password || false,
        company: companiesResult.data?.find((c) => c.id === user.company_id),
      })) as UserProfile[];

      setUsers(usersWithCompany);
      setCompanies(companiesResult.data || []);
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
      const result = userSchema.safeParse(formData);
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
        .eq("email", formData.email.trim().toLowerCase())
        .single();

      if (existingUser) {
        setErrors({ email: "Este email já está cadastrado" });
        setIsSubmitting(false);
        return;
      }

      // Gerar senha temporária
      const password = generateTempPassword();

      // Criar usuário no Auth
      const { data: authData, error: authError } = await supabase.auth.admin?.createUser?.({
        email: formData.email.trim().toLowerCase(),
        password: password,
        email_confirm: true,
        user_metadata: {
          display_name: formData.display_name.trim(),
        },
      }) || { data: null, error: new Error("Admin API não disponível") };

      // Se não tiver admin API, usar signup normal
      if (authError || !authData) {
        // Usar signup normal como fallback
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email.trim().toLowerCase(),
          password: password,
          options: {
            data: {
              display_name: formData.display_name.trim(),
            },
          },
        });

        if (signUpError) throw signUpError;
        if (!signUpData.user) throw new Error("Falha ao criar usuário");

        // Aguardar um pouco para o trigger criar o profile
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Atualizar o profile com os dados corretos
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            company_id: formData.company_id,
            system_role: formData.system_role,
            must_change_password: true,
            status: 'active',
          } as any)
          .eq("user_id", signUpData.user.id);

        if (updateError) throw updateError;
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
    if (!confirm(`Deseja gerar uma nova senha temporária para ${user.display_name}?`)) {
      return;
    }

    try {
      const password = generateTempPassword();

      // Usar a API de reset (envia email)
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/change-password`,
      });

      if (error) throw error;

      // Marcar que precisa trocar senha
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

  const resetForm = () => {
    setFormData({
      display_name: "",
      email: "",
      company_id: "",
      system_role: "user",
    });
    setErrors({});
    setTempPassword(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  const filteredUsers = users.filter(
    (u) =>
      u.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.company?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "system_admin":
        return <Badge variant="destructive">System Admin</Badge>;
      case "admin":
        return <Badge variant="default">Admin</Badge>;
      default:
        return <Badge variant="secondary">Usuário</Badge>;
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
              <CardTitle>Usuários</CardTitle>
              <CardDescription>Gerencie os usuários do sistema</CardDescription>
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
                placeholder="Buscar usuários..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {user.display_name}
                          {user.must_change_password && (
                            <Badge variant="outline" className="text-xs">
                              Senha temp.
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>{user.company?.name || "-"}</TableCell>
                      <TableCell>{getRoleBadge(user.system_role)}</TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
                <div className="flex items-center gap-2 bg-white p-2 rounded border">
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
                <Label htmlFor="system_role">Perfil *</Label>
                <Select
                  value={formData.system_role}
                  onValueChange={(value: "admin" | "user") => setFormData({ ...formData, system_role: value })}
                >
                  <SelectTrigger className={errors.system_role ? "border-destructive" : ""}>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin (Administrador da empresa)</SelectItem>
                    <SelectItem value="user">Usuário (Acesso normal)</SelectItem>
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
    </>
  );
}