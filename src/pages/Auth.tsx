import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import obraMapLogo from "@/assets/obramap-logo-new.png";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { mustChangePassword, isSystemAdmin } = useAuth();

  // Detectar se veio de link de recuperação e redirecionar
  useEffect(() => {
    const hashParams = new URLSearchParams(location.hash.substring(1));
    const type = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    
    if (type === 'recovery' && accessToken) {
      // Redirecionar para change-password mantendo os parâmetros do hash
      navigate(`/change-password${location.hash}`);
      return;
    }
  }, [location, navigate]);

  useEffect(() => {
    if (user && !authLoading) {
      if (mustChangePassword) {
        navigate("/change-password", { replace: true });
      } else if (isSystemAdmin) {
        // System Admin → área de sistema
        navigate("/system/dashboard", { replace: true });
      } else {
        // Usuário de empresa → mapa de obras
        navigate("/", { replace: true });
      }
    }
  }, [user, authLoading, mustChangePassword, isSystemAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      const result = loginSchema.safeParse({ email, password });
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

      const { error } = await signIn(email, password);
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("Email ou senha incorretos");
        } else {
          toast.error(error.message);
        }
      } else {
        // Redirecionamento é feito no useEffect acima, após carregar perfil/permissões
        toast.success("Login realizado com sucesso!");
      }
    } catch (error) {
      toast.error("Erro inesperado. Tente novamente.");
    }

    setIsLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl bg-[#16213e] border-[#0f3460]/50">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-32 h-32 flex items-center justify-center">
              <img 
                src={obraMapLogo} 
                alt="ObraMap Logo" 
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <CardDescription className="mt-1 text-gray-400">
                Sistema de Gestão de Obras
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className={`bg-[#1a1a2e] border-[#0f3460] text-white placeholder:text-gray-500 ${errors.email ? "border-destructive" : ""}`}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className={`bg-[#1a1a2e] border-[#0f3460] text-white placeholder:text-gray-500 ${errors.password ? "border-destructive pr-10" : "pr-10"}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              <Button type="submit" className="w-full bg-[#e67e22] hover:bg-[#d35400] text-white font-semibold" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar
              </Button>
            </form>

            <p className="mt-6 text-xs text-gray-500 text-center">
              Para obter acesso, entre em contato com o administrador do sistema.
            </p>
          </CardContent>
        </Card>
      </div>

      <footer className="py-4 text-center text-sm text-gray-500 border-t border-[#0f3460]/30">
        <p>Desenvolvido e produzido por <span className="font-semibold text-gray-300">Felipe Langmantel</span></p>
      </footer>
    </div>
  );
}
