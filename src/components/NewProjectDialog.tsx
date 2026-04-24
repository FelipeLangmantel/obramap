import { ObraFormDialog } from "@/components/shared/ObraFormDialog";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated?: (projectId: string) => void;
}

/**
 * Wrapper de compatibilidade — agora delega para o ObraFormDialog unificado
 * (mesmos campos do Painel de Gestão / Holding) que salva em obras_portfolio
 * e cria/vincula automaticamente o projects.
 */
export function NewProjectDialog({ open, onOpenChange, onProjectCreated }: NewProjectDialogProps) {
  return (
    <ObraFormDialog
      open={open}
      onOpenChange={onOpenChange}
      onSaved={(_obraId, projectId) => {
        if (projectId) onProjectCreated?.(projectId);
      }}
    />
  );
}

export default NewProjectDialog;
