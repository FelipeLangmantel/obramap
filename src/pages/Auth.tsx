import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, CheckCircle2, ArrowRight } from "lucide-react";
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

  useEffect(() => {
    const hashParams = new URLSearchParams(location.hash.substring(1));
    const type = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    if (type === "recovery" && accessToken) {
      navigate(`/change-password${location.hash}`);
      return;
    }
  }, [location, navigate]);

  useEffect(() => {
    if (user && !authLoading) {
      if (mustChangePassword) {
        navigate("/change-password", { replace: true });
      } else if (isSystemAdmin) {
        navigate("/system/dashboard", { replace: true });
      } else {
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
        toast.success("Login realizado com sucesso!");
      }
    } catch (error) {
      toast.error("Erro inesperado. Tente novamente.");
    }

    setIsLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#e67e22]" />
      </div>
    );
  }

  const features = [
    "Cronograma inteligente com ajuste automático",
    "Medições por unidade automatizadas",
    "Controle de produtividade de equipes",
    "Gestão financeira integrada",
  ];

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-16 items-center">
          {/* ══════ LEFT SIDE ══════ */}
          <div className="hidden lg:flex flex-col gap-8">
            {/* Brand header */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                <img
                  src={obraMapLogo}
                  alt="ObraMap Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-white text-xl font-bold leading-tight">ObraMap</h2>
                <p className="text-[#8a8a9a] text-xs font-semibold tracking-widest uppercase">
                  Plataforma de Gestão de Obras
                </p>
              </div>
            </div>

            {/* Headline */}
            <div>
              <h1 className="text-white text-4xl xl:text-5xl font-bold leading-tight">
                Gestão <span className="text-[#e67e22]">inteligente</span>
                <br />
                de obras habitacionais
              </h1>
              <p className="mt-4 text-[#8a8a9a] text-base leading-relaxed max-w-md">
                Controle planejamento, medições e custos em uma única plataforma.
              </p>
            </div>

            {/* Features */}
            <div className="flex flex-col gap-3">
              {features.map((feat) => (
                <div key={feat} className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#e67e22] flex-shrink-0" />
                  <span className="text-[#b0b0c0] text-sm">{feat}</span>
                </div>
              ))}
            </div>

          </div>

          {/* ══════ RIGHT SIDE — LOGIN FORM ══════ */}
          <div className="w-full max-w-md mx-auto lg:mx-0">
            {/* Mobile logo */}
            <div className="flex lg:hidden items-center justify-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl overflow-hidden">
                <img src={obraMapLogo} alt="ObraMap" className="w-full h-full object-contain" />
              </div>
              <span className="text-white text-lg font-bold">ObraMap</span>
            </div>

            <div className="mb-8">
              <h2 className="text-white text-3xl font-bold">Bem-vindo de volta</h2>
              <p className="text-[#8a8a9a] mt-1 text-base italic">Acesse sua conta para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[#8a8a9a] text-xs font-semibold tracking-widest uppercase">
                  E-mail
                </label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className={`h-12 bg-[#2a2a45]/50 border-[#3a3a55] text-white placeholder:text-[#5a5a70] rounded-lg text-base focus-visible:ring-[#e67e22] ${errors.email ? "border-red-500" : ""}`}
                />
                {errors.email && <p className="text-sm text-red-400">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-[#8a8a9a] text-xs font-semibold tracking-widest uppercase">
                  Senha
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className={`h-12 bg-[#2a2a45]/50 border-[#3a3a55] text-white placeholder:text-[#5a5a70] rounded-lg text-base pr-12 focus-visible:ring-[#e67e22] ${errors.password ? "border-red-500" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a5a70] hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-red-400">{errors.password}</p>}
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-[#e67e22] hover:bg-[#d35400] text-white font-semibold text-base rounded-lg transition-colors"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Entrar na plataforma
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </form>

            <button className="w-full mt-4 text-center text-[#8a8a9a] hover:text-[#e67e22] text-sm transition-colors">
              Esqueci minha senha
            </button>

            <div className="mt-6 rounded-xl border border-[#2a2a45] bg-[#16213e]/40 px-5 py-4 text-center">
              <p className="text-[#8a8a9a] text-sm">
                Para obter acesso, entre em contato com o{" "}
                <span className="text-[#e67e22] font-medium">administrador do sistema</span>.
              </p>
            </div>

            <p className="mt-6 text-center text-[#5a5a70] text-xs">
              © ObraMap — Plataforma de gestão de obras
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
