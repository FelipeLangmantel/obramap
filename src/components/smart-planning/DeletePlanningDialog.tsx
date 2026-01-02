import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface DeletePlanningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planningName: string;
  onConfirm: () => Promise<void>;
}

export function DeletePlanningDialog({
  open,
  onOpenChange,
  planningName,
  onConfirm
}: DeletePlanningDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (confirmText !== 'EXCLUIR') return;
    
    setIsDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
      setConfirmText('');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-full">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <AlertDialogTitle className="text-lg">
              Excluir Planejamento
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-4 space-y-3">
            <p>
              Esta ação excluirá permanentemente o planejamento{' '}
              <strong className="text-foreground">"{planningName}"</strong> e{' '}
              <strong className="text-destructive">TODOS os dados associados</strong>, incluindo:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Medições associadas</li>
              <li>Produção semanal vinculada</li>
              <li>Vínculos com casas, etapas e serviços</li>
              <li>Lançamentos de produção</li>
              <li>Diário de obra</li>
              <li>Alertas e simulações</li>
            </ul>
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm font-medium text-destructive">
                ⚠️ Esta ação não pode ser desfeita!
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="py-4">
          <Label htmlFor="confirm-delete" className="text-sm text-muted-foreground">
            Digite <span className="font-mono font-bold">EXCLUIR</span> para confirmar:
          </Label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="EXCLUIR"
            className="mt-2"
          />
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={confirmText !== 'EXCLUIR' || isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? 'Excluindo...' : 'Excluir Permanentemente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
