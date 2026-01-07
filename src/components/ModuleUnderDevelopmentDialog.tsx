import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Construction, Sparkles, Clock } from "lucide-react";

interface ModuleInfo {
  module_name: string;
  description: string | null;
  expected_benefits: string | null;
}

interface ModuleUnderDevelopmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: ModuleInfo | null;
}

export function ModuleUnderDevelopmentDialog({ 
  open, 
  onOpenChange, 
  module 
}: ModuleUnderDevelopmentDialogProps) {
  if (!module) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-yellow-100 flex items-center justify-center">
            <Construction className="h-8 w-8 text-yellow-600" />
          </div>
          <DialogTitle className="text-xl">{module.module_name}</DialogTitle>
          <DialogDescription className="text-base">
            Este módulo está em desenvolvimento
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {module.description && (
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">O que será entregue</p>
                <p className="text-sm text-muted-foreground">{module.description}</p>
              </div>
            </div>
          )}

          {module.expected_benefits && (
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg">
              <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Benefícios esperados</p>
                <p className="text-sm text-muted-foreground">{module.expected_benefits}</p>
              </div>
            </div>
          )}

          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">
              Estamos trabalhando para disponibilizar essa funcionalidade em breve.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full">
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
