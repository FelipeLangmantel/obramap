import { useSystemModules, SystemModule } from "@/hooks/useSystemModules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Package, Shield, Beaker, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SystemModulesPage() {
  const { modules, isLoading, error, updateModule, refetch } = useSystemModules();

  const handleToggleEnabled = async (module: SystemModule) => {
    await updateModule(module.id, { is_enabled: !module.is_enabled });
  };

  const handleToggleBeta = async (module: SystemModule) => {
    await updateModule(module.id, { is_beta: !module.is_beta });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando módulos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Erro ao carregar</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={refetch} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const enabledCount = modules.filter(m => m.is_enabled).length;
  const betaCount = modules.filter(m => m.is_beta).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              Governança de Módulos
            </h1>
            <p className="text-muted-foreground mt-1">
              Controle quais funcionalidades estão disponíveis para os usuários do sistema.
            </p>
          </div>
          <Button onClick={refetch} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{modules.length}</p>
                  <p className="text-sm text-muted-foreground">Total de Módulos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-emerald-500/10">
                  <Eye className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{enabledCount}</p>
                  <p className="text-sm text-muted-foreground">Módulos Ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-amber-500/10">
                  <Beaker className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{betaCount}</p>
                  <p className="text-sm text-muted-foreground">Em Beta</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info card */}
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="shrink-0">
                <Shield className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Sobre a Governança de Módulos</p>
                <p className="text-sm text-muted-foreground">
                  Módulos <strong>desativados</strong> ficam invisíveis para usuários comuns e suas rotas são bloqueadas.
                  Módulos em <strong>beta</strong> são exibidos com um badge de aviso. 
                  Como System Admin, você sempre verá todos os módulos com seus respectivos status.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Modules List */}
        <div className="space-y-3">
          {modules.map((module) => (
            <Card 
              key={module.id}
              className={cn(
                "transition-all",
                !module.is_enabled && "opacity-60 bg-muted/30"
              )}
            >
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  {/* Icon/Status */}
                  <div className={cn(
                    "p-2.5 rounded-lg shrink-0",
                    module.is_enabled ? "bg-primary/10" : "bg-muted"
                  )}>
                    {module.is_enabled ? (
                      <Eye className="h-5 w-5 text-primary" />
                    ) : (
                      <EyeOff className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{module.name}</h3>
                      {module.is_beta && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                          <Beaker className="h-3 w-3 mr-1" />
                          Beta
                        </Badge>
                      )}
                      {!module.is_enabled && (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          Desativado
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {module.description || `Módulo: ${module.key}`}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {module.is_enabled 
                        ? "✓ Usuários verão este módulo" 
                        : "✗ Usuários NÃO verão este módulo"}
                    </p>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-6 shrink-0">
                    {/* Beta Toggle */}
                    <div className="flex flex-col items-center gap-1">
                      <Switch
                        checked={module.is_beta}
                        onCheckedChange={() => handleToggleBeta(module)}
                        className="data-[state=checked]:bg-amber-500"
                      />
                      <span className="text-xs text-muted-foreground">Beta</span>
                    </div>

                    {/* Enabled Toggle */}
                    <div className="flex flex-col items-center gap-1">
                      <Switch
                        checked={module.is_enabled}
                        onCheckedChange={() => handleToggleEnabled(module)}
                        className="data-[state=checked]:bg-emerald-500"
                      />
                      <span className="text-xs text-muted-foreground">Ativo</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
