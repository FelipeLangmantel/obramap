import { Building2, User } from "lucide-react";

export function Header() {
  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Loteamento TAPEJARA</h1>
          <p className="text-sm text-muted-foreground">Acompanhamento de Obras</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <User className="w-5 h-5" />
          <span className="text-sm font-medium">Usuário</span>
        </div>
      </div>
    </header>
  );
}
