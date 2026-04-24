import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SystemModule {
  id: string;
  key: string;
  name: string;
  description: string | null;
  display_order: number;
}

interface ProjectModulesSelectorProps {
  /** Map module_key -> enabled. Controlado pelo pai. */
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  /** Quando true, marca todos como ativos por padrão na primeira carga. */
  defaultAllEnabled?: boolean;
  /**
   * Filtra apenas módulos ativos para a empresa (company_modules).
   * Quando passado, somente esses aparecem.
   */
  companyId?: string | null;
}

/**
 * UI compacta de checkboxes para escolher quais módulos uma obra terá.
 * Reutilizado no LinkPortfolioDialog e em telas de configuração da obra.
 */
export function ProjectModulesSelector({
  value,
  onChange,
  defaultAllEnabled = true,
  companyId,
}: ProjectModulesSelectorProps) {
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Carrega módulos do sistema
        const { data: sysMods } = await supabase
          .from("system_modules")
          .select("id, key, name, description, display_order, is_enabled")
          .eq("is_enabled", true)
          .order("display_order");

        let list = (sysMods || []) as any[];

        // Filtra por empresa se necessário (apenas ativos)
        if (companyId) {
          const { data: cm } = await supabase
            .from("company_modules")
            .select("module_key, status")
            .eq("company_id", companyId);
          const disabledForCompany = new Set(
            (cm || [])
              .filter((m: any) => m.status === "disabled")
              .map((m: any) => m.module_key)
          );
          list = list.filter((m) => !disabledForCompany.has(m.key));
        }

        setModules(list as SystemModule[]);

        // Se nenhum valor inicial e defaultAllEnabled, marca todos
        if (defaultAllEnabled && Object.keys(value).length === 0) {
          const next: Record<string, boolean> = {};
          list.forEach((m) => {
            next[m.key] = true;
          });
          onChange(next);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const toggle = (key: string) => {
    onChange({ ...value, [key]: !value[key] });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando módulos...
      </div>
    );
  }

  if (modules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Nenhum módulo disponível para configurar.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Package className="h-4 w-4" />
        Módulos disponíveis para esta obra
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-lg border p-3 bg-muted/20 max-h-[280px] overflow-y-auto">
        {modules.map((m) => (
          <label
            key={m.key}
            className="flex items-start gap-2 p-2 rounded-md hover:bg-background cursor-pointer transition-colors"
          >
            <Checkbox
              checked={value[m.key] ?? false}
              onCheckedChange={() => toggle(m.key)}
              className="mt-0.5"
            />
            <div className="space-y-0.5 min-w-0">
              <div className="text-sm font-medium truncate">{m.name}</div>
              {m.description && (
                <div className="text-[11px] text-muted-foreground line-clamp-2">
                  {m.description}
                </div>
              )}
            </div>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Apenas administradores podem alterar esta configuração depois.
      </p>
    </div>
  );
}

export default ProjectModulesSelector;
