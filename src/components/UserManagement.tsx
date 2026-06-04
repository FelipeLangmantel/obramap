import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, UserPlus, Shield, Pencil, Eye, Trash2, Phone } from "lucide-react";
import { z } from "zod";
import { maskPhoneInputBR, toE164BR, formatPhoneBR } from "@/lib/phone";

interface UserWithRole {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  phone: string | null;
  role: AppRole;
  created_at: string;
}

const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  displayName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  phone: z.string().refine((v) => !v || /^\+55[1-9]{2}9?[0-9]{8}$/.test(v), {
    message: "Telefone inválido. Use DDD + número (ex: 11 98765-4321)",
  }),
  role: z.enum(["admin", "editor", "viewer"]),
});

export function UserManagement() {
  const { isAdmin, user } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [role, setRole] = useState<AppRole>("viewer");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      // Combine data
      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile: any) => {
        const userRole = roles?.find((r) => r.user_id === profile.user_id);
        return {
          id: profile.id,
          user_id: profile.user_id,
          display_name: profile.display_name,
          email: profile.email,
          phone: profile.phone ?? null,
          role: (userRole?.role as AppRole) || "viewer",
          created_at: profile.created_at,
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Erro ao carregar usuários");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const phoneE164 = phoneRaw ? toE164BR(phoneRaw) ?? "" : "";
    const result = createUserSchema.safeParse({ email, password, displayName, phone: phoneE164, role });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsCreating(true);

    try {
      // Create user via edge function (does NOT change current session)
      const { data, error: fnError } = await supabase.functions.invoke("create-user", {
        body: {
          email,
          password,
          display_name: displayName,
          role,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      // Salva telefone no profile (se informado)
      if (phoneE164 && data?.user_id) {
        await supabase.from("profiles").update({ phone: phoneE164 } as any).eq("user_id", data.user_id);
      }

      toast.success("Usuário criado com sucesso!");
      setIsCreateDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      if (error.message?.includes("already") || error.message?.includes("already registered")) {
        toast.error("Este email já está cadastrado");
      } else {
        toast.error(error.message || "Erro ao criar usuário");
      }
    }

    setIsCreating(false);
  };

  const handleUpdateRole = async (userId: string, newRole: AppRole) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u))
      );

      toast.success("Função atualizada com sucesso!");
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

    if (!confirm(`Excluir definitivamente ${userEmail}?\n\nEsta ação remove o usuário do painel E do sistema de login (Auth). Não pode ser desfeita.`)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setUsers((prev) => prev.filter((u) => u.user_id !== userId));
      toast.success(data?.message || "Usuário excluído definitivamente");
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast.error(error?.message || "Erro ao excluir usuário");
    }
  };


  const resetForm = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setPhoneRaw("");
    setRole("viewer");
    setErrors({});
  };

  const handleSavePhone = async (userId: string, raw: string) => {
    const e164 = raw ? toE164BR(raw) : null;
    if (raw && !e164) {
      toast.error("Telefone inválido");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ phone: e164 } as any)
      .eq("user_id", userId);
    if (error) {
      toast.error("Erro ao salvar telefone");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, phone: e164 } : u)));
    toast.success("Telefone atualizado");
  };

  const getRoleBadge = (role: AppRole) => {
    switch (role) {
      case "admin":
        return (
          <Badge className="bg-primary/20 text-primary border-primary/30">
            <Shield className="h-3 w-3 mr-1" />
            Administrador
          </Badge>
        );
      case "editor":
        return (
          <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
            <Pencil className="h-3 w-3 mr-1" />
            Editor
          </Badge>
        );
      case "viewer":
        return (
          <Badge className="bg-muted text-muted-foreground border-border">
            <Eye className="h-3 w-3 mr-1" />
            Visualizador
          </Badge>
        );
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <p>Você não tem permissão para acessar esta seção.</p>
        <p className="text-sm mt-1">Apenas administradores podem gerenciar usuários.</p>
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Usuários do Sistema</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie os acessos e permissões dos usuários
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
              <DialogDescription>
                Preencha os dados para criar um novo usuário no sistema.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Nome Completo</Label>
                <Input
                  id="create-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nome do usuário"
                  className={errors.displayName ? "border-destructive" : ""}
                />
                {errors.displayName && (
                  <p className="text-sm text-destructive">{errors.displayName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-password">Senha</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={errors.password ? "border-destructive" : ""}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-phone" className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" /> Telefone (WhatsApp)
                </Label>
                <Input
                  id="create-phone"
                  value={phoneRaw}
                  onChange={(e) => setPhoneRaw(maskPhoneInputBR(e.target.value))}
                  placeholder="(11) 9 8765-4321"
                  className={errors.phone ? "border-destructive" : ""}
                />
                <p className="text-xs text-muted-foreground">
                  Necessário para receber alertas via WhatsApp.
                </p>
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-role">Função</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger className={errors.role ? "border-destructive" : ""}>
                    <SelectValue placeholder="Selecione a função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Visualizador
                      </div>
                    </SelectItem>
                    <SelectItem value="editor">
                      <div className="flex items-center gap-2">
                        <Pencil className="h-4 w-4" />
                        Editor
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Administrador
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Usuário
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Função</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.display_name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <PhoneCell
                    initial={u.phone}
                    onSave={(raw) => handleSavePhone(u.user_id, raw)}
                  />
                </TableCell>
                <TableCell>{getRoleBadge(u.role)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Select
                      value={u.role}
                      onValueChange={(v) => handleUpdateRole(u.user_id, v as AppRole)}
                      disabled={u.user_id === user?.id}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Visualizador</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
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
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum usuário cadastrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">Níveis de Acesso</h4>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Administrador:</span> Acesso
            total ao sistema, pode criar usuários, editar configurações e gerenciar
            obras.
          </p>
          <p>
            <span className="font-medium text-foreground">Editor:</span> Pode editar
            avanços semanais e atualizar progresso das casas.
          </p>
          <p>
            <span className="font-medium text-foreground">Visualizador:</span> Pode
            apenas visualizar informações, sem permissão de edição.
          </p>
        </div>
      </div>
    </div>
  );
}

interface PhoneCellProps {
  initial: string | null;
  onSave: (raw: string) => Promise<void>;
}

function PhoneCell({ initial, onSave }: PhoneCellProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formatPhoneBR(initial) || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setValue(formatPhoneBR(initial) || "");
  }, [initial, editing]);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-sm text-left hover:underline"
        title="Clique para editar"
      >
        {initial ? formatPhoneBR(initial) : <span className="text-muted-foreground italic">Adicionar telefone</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(maskPhoneInputBR(e.target.value))}
        placeholder="(11) 9 8765-4321"
        className="h-8 w-44"
        disabled={saving}
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(value);
            setEditing(false);
          } finally {
            setSaving(false);
          }
        }}
      >
        OK
      </Button>
      <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
        ✕
      </Button>
    </div>
  );
}
