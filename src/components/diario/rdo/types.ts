// Tipos compartilhados do RDO
export interface RdoLabor {
  id: string;
  nome: string;
  categoria: "propria" | "terceiros";
  quantidade: number;
}

export interface RdoEquipment {
  id: string;
  nome: string;
  quantidade: number;
}

export interface RdoActivity {
  id: string;
  descricao: string;
  localizacao: string | null;
}

export interface RdoOccurrence {
  id: string;
  descricao: string;
  tags: string[];
}

export interface RdoChecklistItem {
  id: string;
  item: string;
  concluido: boolean;
}

export interface RdoComment {
  id: string;
  texto: string;
  autor_nome: string | null;
  created_at: string;
}

export interface RdoAttachment {
  id: string;
  tipo: "video" | "anexo";
  storage_path: string;
  nome_original: string | null;
  tamanho_bytes: number | null;
  url?: string;
}

export interface LaborType {
  id: string;
  nome: string;
  categoria: "propria" | "terceiros";
}

export interface EquipmentType {
  id: string;
  nome: string;
}

export interface OccurrenceTag {
  id: string;
  nome: string;
}

export type RdoSectionKey =
  | "detalhes"
  | "clima"
  | "mao-obra"
  | "equipamentos"
  | "atividades"
  | "producao"
  | "ocorrencias"
  | "checklist"
  | "comentarios"
  | "fotos"
  | "videos"
  | "anexos"
  | "aprovacao";

export interface RdoCounts {
  labor: number;
  equipment: number;
  activities: number;
  occurrences: number;
  checklist: number;
  comments: number;
  photos: number;
  videos: number;
  attachments: number;
}
