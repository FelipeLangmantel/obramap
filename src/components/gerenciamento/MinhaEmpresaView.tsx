import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Building2, Loader2, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { LogoUploader } from "@/components/diario/LogoUploader";
import { toast } from "sonner";

export function MinhaEmpresaView() {
  const { company, isCompanyAdmin, isSystemAdmin, refreshPermissions } = useAuth();
  const canEdit = isCompanyAdmin || isSystemAdmin;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    razao_social: "",
    nome_fantasia: "",
    cnpj: "",
    endereco_rua: "",
    endereco_numero: "",
    endereco_cidade: "",
    endereco_estado: "",
    endereco_cep: "",
    telefone: "",
    email: "",
    logo_url: "" as string | null,
  });

  useEffect(() => {
    const load = async () => {
      if (!company?.id) return;
      const { data } = await supabase
        .from("companies")
        .select("*")
        .eq("id", company.id)
        .maybeSingle();
      if (data) {
        setForm({
          name: data.name || "",
          razao_social: (data as any).razao_social || "",
          nome_fantasia: (data as any).nome_fantasia || "",
          cnpj: data.cnpj || "",
          endereco_rua: (data as any).endereco_rua || "",
          endereco_numero: (data as any).endereco_numero || "",
          endereco_cidade: (data as any).endereco_cidade || "",
          endereco_estado: (data as any).endereco_estado || "",
          endereco_cep: (data as any).endereco_cep || "",
          telefone: (data as any).telefone || "",
          email: (data as any).email || "",
          logo_url: data.logo_url || null,
        });
      }
      setLoading(false);
    };
    load();
  }, [company?.id]);

  const handleSave = async () => {
    if (!company?.id || !canEdit) return;
    if (!form.razao_social.trim() || !form.cnpj.trim()) {
      toast.error("Razão Social e CNPJ são obrigatórios.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: form.name || form.razao_social,
        razao_social: form.razao_social,
        nome_fantasia: form.nome_fantasia || null,
        cnpj: form.cnpj,
        endereco_rua: form.endereco_rua || null,
        endereco_numero: form.endereco_numero || null,
        endereco_cidade: form.endereco_cidade || null,
        endereco_estado: form.endereco_estado || null,
        endereco_cep: form.endereco_cep || null,
        telefone: form.telefone || null,
        email: form.email || null,
      } as any)
      .eq("id", company.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Dados da empresa atualizados.");
    await refreshPermissions();
  };

  const handleLogoChange = async (url: string | null) => {
    if (!company?.id) return;
    setForm((f) => ({ ...f, logo_url: url }));
    await supabase.from("companies").update({ logo_url: url }).eq("id", company.id);
    await refreshPermissions();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Minha Empresa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Logo da Empresa</Label>
            <LogoUploader
              currentLogoUrl={form.logo_url}
              pathPrefix={company?.id || "company"}
              onChange={handleLogoChange}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Razão Social *</Label>
              <Input
                value={form.razao_social}
                onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome Fantasia</Label>
              <Input
                value={form.nome_fantasia}
                onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>CNPJ *</Label>
              <Input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
                disabled={!canEdit}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Endereço</Label>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="space-y-2 md:col-span-4">
                <Label className="text-xs">Rua</Label>
                <Input value={form.endereco_rua} onChange={(e) => setForm({ ...form, endereco_rua: e.target.value })} disabled={!canEdit} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs">Número</Label>
                <Input value={form.endereco_numero} onChange={(e) => setForm({ ...form, endereco_numero: e.target.value })} disabled={!canEdit} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label className="text-xs">Cidade</Label>
                <Input value={form.endereco_cidade} onChange={(e) => setForm({ ...form, endereco_cidade: e.target.value })} disabled={!canEdit} />
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label className="text-xs">UF</Label>
                <Input value={form.endereco_estado} maxLength={2} onChange={(e) => setForm({ ...form, endereco_estado: e.target.value.toUpperCase() })} disabled={!canEdit} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs">CEP</Label>
                <Input value={form.endereco_cep} onChange={(e) => setForm({ ...form, endereco_cep: e.target.value })} disabled={!canEdit} />
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} disabled={!canEdit} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} />
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar alterações
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MinhaEmpresaView;
