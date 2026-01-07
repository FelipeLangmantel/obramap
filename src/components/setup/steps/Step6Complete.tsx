import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, LogIn } from 'lucide-react';

interface Step6CompleteProps {
  migrationResults: Record<string, number> | null;
  onComplete: () => void;
}

export const Step6Complete: React.FC<Step6CompleteProps> = ({
  migrationResults,
  onComplete
}) => {
  const totalMigrated = migrationResults 
    ? Object.values(migrationResults).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-8 text-center py-8">
      <div className="flex justify-center">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center animate-bounce">
          <CheckCircle2 className="h-14 w-14 text-green-600" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">
          Sistema Inicializado com Sucesso!
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          O ObraMap agora opera em <strong>modo multiempresa</strong>. 
          Todos os dados estão isolados e protegidos por empresa.
        </p>
      </div>

      {migrationResults && totalMigrated > 0 && (
        <div className="bg-muted/50 rounded-lg p-4 max-w-sm mx-auto">
          <p className="text-sm font-medium text-muted-foreground">
            Resumo da Migração
          </p>
          <p className="text-3xl font-bold text-primary mt-1">
            {totalMigrated} registros
          </p>
          <p className="text-sm text-muted-foreground">
            migrados com sucesso
          </p>
        </div>
      )}

      <div className="space-y-3">
        <Button size="lg" onClick={onComplete} className="gap-2">
          <LogIn className="h-5 w-5" />
          Entrar no Sistema
        </Button>
        <p className="text-xs text-muted-foreground">
          Este painel não será exibido novamente.
        </p>
      </div>
    </div>
  );
};
