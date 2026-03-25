import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Camera, 
  Save,
  AlertTriangle,
  Clock,
  User
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface IssueManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issue: any;
  onSave: () => void;
}

export const IssueManagementDialog: React.FC<IssueManagementDialogProps> = ({
  open,
  onOpenChange,
  issue,
  onSave
}) => {
  const { canEdit, requireEdit } = useAuth();
  const [status, setStatus] = useState(issue?.status || 'aberta');
  const [responsibleName, setResponsibleName] = useState(issue?.responsible_name || '');
  const [photoAfterUrl, setPhotoAfterUrl] = useState(issue?.photo_after_url || '');
  const [resolutionNotes, setResolutionNotes] = useState(issue?.resolution_notes || '');
  const [saving, setSaving] = useState(false);

  const severityLabels: Record<string, { label: string; color: string }> = {
    critica: { label: 'Crítica', color: 'bg-red-500' },
    media: { label: 'Média', color: 'bg-amber-500' },
    leve: { label: 'Leve', color: 'bg-blue-500' }
  };

  const statusLabels: Record<string, string> = {
    aberta: 'Aberta',
    em_execucao: 'Em Execução',
    aguardando_validacao: 'Aguardando Validação',
    encerrada: 'Encerrada'
  };

  const handleSave = async () => {
    if (status === 'encerrada' && !photoAfterUrl) {
      toast.error('Foto de resolução é obrigatória para encerrar a pendência');
      return;
    }

    setSaving(true);
    try {
      const updateData: any = {
        status,
        responsible_name: responsibleName || null,
        photo_after_url: photoAfterUrl || null,
        resolution_notes: resolutionNotes || null
      };

      if (status === 'encerrada') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('delivery_issues')
        .update(updateData)
        .eq('id', issue.id);

      if (error) throw error;

      // Check if all issues for this inspection are resolved
      const { data: remainingIssues } = await supabase
        .from('delivery_issues')
        .select('id, status')
        .eq('inspection_id', issue.inspection_id)
        .neq('status', 'encerrada');

      // If no open issues remain, update inspection status
      if (!remainingIssues || remainingIssues.length === 0 || 
          (remainingIssues.length === 1 && remainingIssues[0].id === issue.id && status === 'encerrada')) {
        await supabase
          .from('delivery_inspections')
          .update({ status: 'unidade_encerrada' })
          .eq('id', issue.inspection_id);
      } else if (status !== 'encerrada') {
        await supabase
          .from('delivery_inspections')
          .update({ status: 'pos_obra_em_atendimento' })
          .eq('id', issue.inspection_id);
      }

      toast.success('Pendência atualizada com sucesso!');
      onSave();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar pendência: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!issue) return null;

  const severity = severityLabels[issue.severity] || severityLabels.media;
  const isOverdue = issue.due_date && new Date(issue.due_date) < new Date() && status !== 'encerrada';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Gerenciar Pendência - Casa {issue.house_number}
            <Badge className={severity.color}>{severity.label}</Badge>
            {isOverdue && (
              <Badge variant="destructive">
                <Clock className="w-3 h-3 mr-1" />
                Atrasada
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <span className="text-sm text-muted-foreground">Categoria</span>
              <p className="font-medium">{issue.category}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Prazo</span>
              <p className="font-medium">
                {issue.due_date 
                  ? format(new Date(issue.due_date), "dd/MM/yyyy", { locale: ptBR })
                  : 'Não definido'
                }
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-sm text-muted-foreground">Descrição</span>
              <p className="font-medium">{issue.description}</p>
            </div>
          </div>

          {issue.photo_before_url && (
            <div>
              <label className="text-sm font-medium">Foto Antes</label>
              <div className="mt-1 p-2 border rounded-lg">
                <img 
                  src={issue.photo_before_url} 
                  alt="Antes" 
                  className="max-h-32 rounded object-cover"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium flex items-center gap-1">
              <User className="w-4 h-4" />
              Responsável
            </label>
            <Input
              placeholder="Nome do responsável pela correção"
              value={responsibleName}
              onChange={(e) => setResponsibleName(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium flex items-center gap-1">
              <Camera className="w-4 h-4" />
              Foto Depois {status === 'encerrada' && '(obrigatório)'}
            </label>
            <Input
              placeholder="https://..."
              value={photoAfterUrl}
              onChange={(e) => setPhotoAfterUrl(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Notas de Resolução</label>
            <Textarea
              placeholder="Descreva a solução aplicada..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
