import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, Cloud, Users, Wrench, Activity, AlertTriangle,
  CheckSquare, MessageSquare, Camera, Video, Paperclip, FileSignature,
} from "lucide-react";
import type { RdoCounts, RdoSectionKey } from "./types";

interface Props {
  counts: RdoCounts;
  active: RdoSectionKey;
  onNavigate: (key: RdoSectionKey) => void;
}

const ITEMS: { key: RdoSectionKey; label: string; icon: any; countKey?: keyof RdoCounts }[] = [
  { key: "detalhes", label: "Detalhes do relatório", icon: ClipboardList },
  { key: "clima", label: "Condição climática", icon: Cloud },
  { key: "mao-obra", label: "Mão de obra", icon: Users, countKey: "labor" },
  { key: "equipamentos", label: "Equipamentos", icon: Wrench, countKey: "equipment" },
  { key: "atividades", label: "Atividades", icon: Activity, countKey: "activities" },
  { key: "ocorrencias", label: "Ocorrências", icon: AlertTriangle, countKey: "occurrences" },
  { key: "checklist", label: "Checklist", icon: CheckSquare, countKey: "checklist" },
  { key: "comentarios", label: "Comentários", icon: MessageSquare, countKey: "comments" },
  { key: "fotos", label: "Fotos", icon: Camera, countKey: "photos" },
  { key: "videos", label: "Vídeos", icon: Video, countKey: "videos" },
  { key: "anexos", label: "Anexos", icon: Paperclip, countKey: "attachments" },
  { key: "aprovacao", label: "Aprovação", icon: FileSignature },
];

export function RdoSidebar({ counts, active, onNavigate }: Props) {
  return (
    <nav className="sticky top-4 space-y-1 max-h-[calc(100vh-2rem)] overflow-y-auto pr-2">
      {ITEMS.map(it => {
        const Icon = it.icon;
        const count = it.countKey != null ? counts[it.countKey] : undefined;
        const isActive = active === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onNavigate(it.key)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
              isActive
                ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{it.label}</span>
            {count != null && count > 0 && (
              <Badge variant="secondary" className="h-5 text-[10px] px-1.5">{count}</Badge>
            )}
          </button>
        );
      })}
    </nav>
  );
}
