import { ProjectSelector } from "./ProjectSelector";

export function Header() {
  return (
    <header className="bg-card border-b border-border px-4 py-3 lg:px-6 lg:py-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">🏗️</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Acompanhamento de Obras</h1>
              <p className="text-sm text-muted-foreground">Sistema de Gestão</p>
            </div>
          </div>
        </div>
        
        <ProjectSelector />
      </div>
    </header>
  );
}
