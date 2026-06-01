import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Lock } from "lucide-react";
import { z } from "zod";
import obraMapLogo from "@/assets/obramap-logo-new.png";

const MIN_PASSWORD_LENGTH = 8;

const passwordSchema = z.object({
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

const translatePasswordError = (message: string) => {
  const lower = message.toLowerCase();
  if (message.includes("New password should be different from the old password")) {
    return "A nova senha precisa ser diferente da senha atual ou temporária.";
  }
  if (lower.includes("password should be at least") || lower.includes("password must be at least")) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (message.includes("Auth session missing") || lower.includes("session")) {
    return "Sessão expirada. Solicite um novo acesso.";
  }
  if (lower.includes("invalid") || lower.includes("expired")) {
    return "Link expirado ou inválido. Solicite um novo acesso.";
  }
  return message;
};

export default function ChangePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { updatePassword, isSystemAdmin, signOut, session, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Detectar se veio de link de recuperação de senha
  useEffect(() => {
    const hashParams = new URLSearchParams(location.hash.substring(1));
    const type = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    
    if (type === 'recovery' && accessToken) {
      setIsRecoveryMode(true);
      // Estabelecer sessão com os tokens do link de recuperação
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || '',
      }).then(({ error }) => {
        if (error) {
          console.error('Erro ao estabelecer sessão de recuperação:', error);
          toast.error('Link expirado ou inválido. Solicite um novo acesso.');
          navigate('/auth');
        }
      });
    }
  }, [location, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      const result = passwordSchema.safeParse({ newPassword, confirmPassword });
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
        setIsLoading(false);
        return;
      }

      // Verificar se há sessão ativa
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession) {
        toast.error("Sessão expirada. Por favor, faça login novamente ou solicite novo link de recuperação.");
        navigate('/auth');
        setIsLoading(false);
        return;
      }

      const { error, statusError } = await updatePassword(newPassword);
      if (error) {
        const friendlyError = translatePasswordError(error.message);
        toast.error("Erro ao alterar senha: " + friendlyError);
        if (friendlyError.includes("Sessão expirada") || friendlyError.includes("Link expirado")) {
          navigate('/auth');
        }
      } else if (statusError) {
        console.error("Erro ao atualizar status interno da senha:", statusError);
        toast.error("Senha alterada, mas não foi possível atualizar o status interno. Avise o administrador.");
      } else {
        toast.success("Senha alterada com sucesso!");
        // Redirecionar baseado no papel
        if (isSystemAdmin) {
          navigate("/admin");
        } else {
          navigate("/dashboard");
        }
      }
    } catch (error) {
      toast.error("Erro inesperado. Tente novamente.");
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-border/50">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">
                Alterar Senha
              </CardTitle>
              <CardDescription className="mt-2">
                Por segurança, você precisa criar uma nova senha para continuar.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Antes de continuar</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>A nova senha deve ser diferente da senha temporária ou atual.</li>
                  <li>Use uma senha segura, com pelo menos {MIN_PASSWORD_LENGTH} caracteres.</li>
                  <li>Confirme a nova senha exatamente igual no segundo campo.</li>
                </ul>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isLoading}
                    className={errors.newPassword ? "border-destructive pr-10" : "pr-10"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.newPassword && (
                  <p className="text-sm text-destructive">{errors.newPassword}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    className={errors.confirmPassword ? "border-destructive pr-10" : "pr-10"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Alterar Senha
              </Button>
            </form>

            <Button
              variant="ghost"
              className="w-full mt-4"
              onClick={() => signOut()}
            >
              Cancelar e Sair
            </Button>
          </CardContent>
        </Card>
      </div>

      <footer className="py-4 text-center text-sm text-muted-foreground border-t border-border/50">
        <div className="flex items-center justify-center gap-2">
          <img src={obraMapLogo} alt="ObraMap" className="h-6" />
          <span>ObraMap</span>
        </div>
      </footer>
    </div>
  );
}
