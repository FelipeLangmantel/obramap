import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DiaryLegalConfig {
  id?: string;
  project_id: string;
  company_id?: string;

  contratante_tipo: "publico" | "privado" | "misto";
  contratante_nome: string | null;
  contratante_cnpj_cpf: string | null;
  contratante_orgao: string | null;
  contratante_endereco: string | null;
  contratante_municipio: string | null;
  contratante_estado: string | null;

  contratada_razao_social: string | null;
  contratada_cnpj: string | null;
  contratada_endereco: string | null;
  contratada_municipio: string | null;
  contratada_estado: string | null;

  contrato_numero: string | null;
  contrato_data_assinatura: string | null;
  contrato_objeto: string | null;
  contrato_valor: number | null;
  contrato_prazo_dias: number | null;
  contrato_modalidade: string | null;
  processo_licitatorio: string | null;

  responsavel_tecnico_nome: string | null;
  responsavel_tecnico_crea: string | null;
  responsavel_tecnico_art: string | null;
  responsavel_dia_nome: string | null;

  pdf_template: "orgao_publico" | "corporativo_moderno";
  rodape_observacoes: string | null;
}

export const EMPTY_LEGAL_CONFIG: Omit<DiaryLegalConfig, "project_id"> = {
  contratante_tipo: "privado",
  contratante_nome: null,
  contratante_cnpj_cpf: null,
  contratante_orgao: null,
  contratante_endereco: null,
  contratante_municipio: null,
  contratante_estado: null,
  contratada_razao_social: null,
  contratada_cnpj: null,
  contratada_endereco: null,
  contratada_municipio: null,
  contratada_estado: null,
  contrato_numero: null,
  contrato_data_assinatura: null,
  contrato_objeto: null,
  contrato_valor: null,
  contrato_prazo_dias: null,
  contrato_modalidade: null,
  processo_licitatorio: null,
  responsavel_tecnico_nome: null,
  responsavel_tecnico_crea: null,
  responsavel_tecnico_art: null,
  responsavel_dia_nome: null,
  pdf_template: "orgao_publico",
  rodape_observacoes: null,
};

export function useDiaryLegalConfig(projectId: string | null | undefined) {
  const [config, setConfig] = useState<DiaryLegalConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) { setConfig(null); return; }
    setLoading(true);
    const { data } = await (supabase as any)
      .from("diary_legal_config")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    setConfig(data ?? { project_id: projectId, ...EMPTY_LEGAL_CONFIG });
    setLoading(false);
  }, [projectId]);

  useEffect(() => { reload(); }, [reload]);

  return { config, loading, reload, setConfig };
}
