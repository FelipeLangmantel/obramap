import { useState, useEffect } from "react";
import { Moon, Sun, Monitor, Building2, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LogoUploader } from "@/components/diario/LogoUploader";
import { ContractTypesPanel } from "@/components/settings/ContractTypesPanel";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Theme = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "obramap_theme";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(_theme: Theme) {
  const root = document.documentElement;
  root.classList.add("dark");
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { company, isCompanyAdmin, isSystemAdmin, refreshPermissions } = useAuth();
  const canManageCompanyLogo = isCompanyAdmin || isSystemAdmin;

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || "light";
  });
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(company?.logo_url ?? null);

  useEffect(() => {
    setCompanyLogoUrl(company?.logo_url ?? null);
  }, [company?.logo_url, open]);

  const handleCompanyLogoChange = async (url: string | null) => {
    if (!company?.id) return;
    setCompanyLogoUrl(url);
    const { error } = await supabase
      .from("companies")
      .update({ logo_url: url })
      .eq("id", company.id);
    if (error) {
      toast.error("Erro ao salvar logo da empresa: " + error.message);
      return;
    }
    await refreshPermissions();
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system theme changes when "system" is selected
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  };

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Claro", icon: <Sun className="h-5 w-5" /> },
    { value: "dark", label: "Escuro", icon: <Moon className="h-5 w-5" /> },
    { value: "system", label: "Sistema", icon: <Monitor className="h-5 w-5" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Tema</Label>
            <p className="text-xs text-muted-foreground">
              Escolha o tema de aparência do sistema.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleThemeChange(opt.value)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                    theme === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {opt.icon}
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {company?.id && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Logo da empresa</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aparece nos diários de obra, relatórios e impressões. Cada projeto pode ter um logo próprio que sobrescreve este.
                </p>
                {canManageCompanyLogo ? (
                  <LogoUploader
                    currentLogoUrl={companyLogoUrl}
                    pathPrefix={company.id}
                    onChange={handleCompanyLogoChange}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden">
                      {companyLogoUrl ? (
                        <img src={companyLogoUrl} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Apenas administradores podem alterar o logo da empresa.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
