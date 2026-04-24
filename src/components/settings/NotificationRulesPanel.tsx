import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Pencil, Trash2, Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";

type EventType = {
  tipo: string;
  modulo: string;
  label: string;
  descricao: string | null;
};

type NotificationRule = {
  id: string;
  company_id: string;
  nome: string;
  descricao: string | null;
  event_type: string;
  target_user_ids: string[];
  target_department_names: string[];
  scope: "all" | "specific";
  scope_obra_ids: string[];
  channel_inapp: boolean;
  channel_email: boolean;
  ativa: boolean;
};

type UserOption = { user_id: string; display_name: string; email: string };
type DeptOption = { name: string };
type ObraOption = { id: string; nome: string };

const SCOPE_LABEL: Record<string, string> = {
  all: "Todas as obras",
  specific: "Obras específicas",
};

export function NotificationRulesPanel() {
  const { company } = useAuth();
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [obras, setObras] = useState<ObraOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationRule | null>(null);

  const loadAll = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    const [rulesRes, eventsRes, usersRes, deptsRes, obrasRes] = await Promise.all([
      supabase
        .from("notification_rules" as any)
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("notification_event_types" as any)
        .select("*")
        .order("display_order"),
      supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .eq("company_id", company.id)
        .eq("status", "active"),
      supabase
        .from("departments")
        .select("name")
        .eq("company_id", company.id)
        .order("display_order"),
      supabase
        .from("obras_portfolio")
        .select("id, nome")
        .eq("company_id", company.id)
        .order("nome"),
    ]);
    setRules((rulesRes.data as any) || []);
    setEventTypes((eventsRes.data as any) || []);
    setUsers((usersRes.data as any) || []);
    setDepartments((deptsRes.data as any) || []);
    setObras((obrasRes.data as any) || []);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openNew = () => {
    setEditing({
      id: "",
      company_id: company?.id || "",
      nome: "",
      descricao: "",
      event_type: eventTypes[0]?.tipo || "",
      target_user_ids: [],
      target_department_names: [],
      scope: "all",
      scope_obra_ids: [],
      channel_inapp: true,
      channel_email: false,
      ativa: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (r: NotificationRule) => {
    setEditing({ ...r });
    setDialogOpen(true);
  };

  const toggleActive = async (r: NotificationRule) => {
    const { error } = await supabase
      .from("notification_rules" as any)
      .update({ ativa: !r.ativa })
      .eq("id", r.id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success(r.ativa ? "Regra desativada" : "Regra ativada");
    loadAll();
  };

  const deleteRule = async (r: NotificationRule) => {
    if (!confirm(`Excluir a regra "${r.nome}"?`)) return;
    const { error } = await supabase
      .from("notification_rules" as any)
      .delete()
      .eq("id", r.id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Regra excluída");
    loadAll();
  };

  const save = async () => {
    if (!editing || !company?.id) return;
    if (!editing.nome.trim()) return toast.error("Informe um nome para a regra");
    if (!editing.event_type) return toast.error("Selecione um evento");
    if (
      editing.target_user_ids.length === 0 &&
      editing.target_department_names.length === 0
    ) {
      return toast.error("Selecione ao menos um destinatário (usuário ou departamento)");
    }
    if (editing.scope === "specific" && editing.scope_obra_ids.length === 0) {
      return toast.error("Selecione ao menos uma obra no escopo");
    }

    const payload = {
      company_id: company.id,
      nome: editing.nome.trim(),
      descricao: editing.descricao?.trim() || null,
      event_type: editing.event_type,
      target_user_ids: editing.target_user_ids,
      target_department_names: editing.target_department_names,
      scope: editing.scope,
      scope_obra_ids: editing.scope === "specific" ? editing.scope_obra_ids : [],
      channel_inapp: editing.channel_inapp,
      channel_email: editing.channel_email,
      ativa: editing.ativa,
    };

    const { error } = editing.id
      ? await supabase.from("notification_rules" as any).update(payload).eq("id", editing.id)
      : await supabase.from("notification_rules" as any).insert(payload);

    if (error) return toast.error("Erro ao salvar: " + error.message);
    toast.success(editing.id ? "Regra atualizada" : "Regra criada");
    setDialogOpen(false);
    setEditing(null);
    loadAll();
  };

  const eventLabel = (tipo: string) =>
    eventTypes.find((e) => e.tipo === tipo)?.label || tipo;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Configure quem recebe cada tipo de notificação do sistema.
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova regra
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nenhuma regra cadastrada. Crie a primeira para começar a notificar usuários.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <Card key={r.id} className={r.ativa ? "" : "opacity-60"}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      {r.nome}
                      {!r.ativa && <Badge variant="outline">Inativa</Badge>}
                    </CardTitle>
                    {r.descricao && (
                      <p className="text-xs text-muted-foreground mt-1">{r.descricao}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={r.ativa}
                      onCheckedChange={() => toggleActive(r)}
                    />
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteRule(r)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1 text-xs">
                  <Badge variant="secondary">Quando: {eventLabel(r.event_type)}</Badge>
                  <Badge variant="secondary">Escopo: {SCOPE_LABEL[r.scope]}</Badge>
                  {r.target_user_ids.length > 0 && (
                    <Badge variant="secondary">
                      {r.target_user_ids.length} usuário(s)
                    </Badge>
                  )}
                  {r.target_department_names.length > 0 && (
                    <Badge variant="secondary">
                      Depts: {r.target_department_names.join(", ")}
                    </Badge>
                  )}
                  {r.channel_inapp && <Badge>In-app</Badge>}
                  {r.channel_email && <Badge>Email</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar regra" : "Nova regra de notificação"}</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome da regra *</Label>
                <Input
                  value={editing.nome}
                  onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                  placeholder="Ex: Avisar coordenadores de medições vencidas"
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={editing.descricao || ""}
                  onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
                  placeholder="Opcional"
                  maxLength={500}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Quando ocorrer *</Label>
                <Select
                  value={editing.event_type}
                  onValueChange={(v) => setEditing({ ...editing, event_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((e) => (
                      <SelectItem key={e.tipo} value={e.tipo}>
                        <span className="flex flex-col items-start">
                          <span>{e.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {e.modulo} • {e.descricao}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notificar usuários</Label>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                  {users.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">
                      Nenhum usuário ativo.
                    </p>
                  ) : (
                    users.map((u) => (
                      <label
                        key={u.user_id}
                        className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-muted/40 rounded cursor-pointer"
                      >
                        <Checkbox
                          checked={editing.target_user_ids.includes(u.user_id)}
                          onCheckedChange={(c) => {
                            const set = new Set(editing.target_user_ids);
                            if (c) set.add(u.user_id);
                            else set.delete(u.user_id);
                            setEditing({ ...editing, target_user_ids: Array.from(set) });
                          }}
                        />
                        <span className="flex-1">{u.display_name || u.email}</span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notificar departamentos</Label>
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                  {departments.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">
                      Nenhum departamento cadastrado.
                    </p>
                  ) : (
                    departments.map((d) => (
                      <label
                        key={d.name}
                        className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-muted/40 rounded cursor-pointer"
                      >
                        <Checkbox
                          checked={editing.target_department_names.includes(d.name)}
                          onCheckedChange={(c) => {
                            const set = new Set(editing.target_department_names);
                            if (c) set.add(d.name);
                            else set.delete(d.name);
                            setEditing({
                              ...editing,
                              target_department_names: Array.from(set),
                            });
                          }}
                        />
                        <span>{d.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Escopo das obras</Label>
                <Select
                  value={editing.scope}
                  onValueChange={(v: "all" | "specific") =>
                    setEditing({ ...editing, scope: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as obras da empresa</SelectItem>
                    <SelectItem value="specific">Obras específicas</SelectItem>
                  </SelectContent>
                </Select>

                {editing.scope === "specific" && (
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {obras.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        Nenhuma obra cadastrada.
                      </p>
                    ) : (
                      obras.map((o) => (
                        <label
                          key={o.id}
                          className="flex items-center gap-2 text-sm py-1 px-1 hover:bg-muted/40 rounded cursor-pointer"
                        >
                          <Checkbox
                            checked={editing.scope_obra_ids.includes(o.id)}
                            onCheckedChange={(c) => {
                              const set = new Set(editing.scope_obra_ids);
                              if (c) set.add(o.id);
                              else set.delete(o.id);
                              setEditing({
                                ...editing,
                                scope_obra_ids: Array.from(set),
                              });
                            }}
                          />
                          <span>{o.nome}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Canais</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editing.channel_inapp}
                      onCheckedChange={(c) =>
                        setEditing({ ...editing, channel_inapp: !!c })
                      }
                    />
                    No app (sino)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editing.channel_email}
                      onCheckedChange={(c) =>
                        setEditing({ ...editing, channel_email: !!c })
                      }
                    />
                    E-mail
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.ativa}
                  onCheckedChange={(c) => setEditing({ ...editing, ativa: c })}
                />
                <Label>Regra ativa</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
