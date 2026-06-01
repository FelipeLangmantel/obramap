import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, CheckCircle2, ArrowRight, Shield } from "lucide-react";
import { z } from "zod";
import obraMapIcon from "@/assets/obramap-icon-dark.png";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

const translateAuthError = (message: string) => {
  if (message.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  return message;
};

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, isLoading: authLoading, mustChangePassword, isSystemAdmin } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

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
        navigate("/dashboard", { replace: true });
      }
    }
  }, [user, authLoading, mustChangePassword, isSystemAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = loginSchema.safeParse({ email: normalizedEmail, password });
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

      const { error } = await signIn(normalizedEmail, password);
      if (error) {
        toast.error(translateAuthError(error.message));
      } else {
        toast.success("Login realizado com sucesso!");
      }
    } catch {
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
    "Planejamento que se ajusta automaticamente",
    "Controle visual com mapa e 3D por unidade",
    "Dimensionamento automático de equipes",
    "Integração total: planejamento, execução e custos",
  ];

  return (
    <div className="min-h-screen bg-[#1a1a2e] relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#e67e22]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#0f3460]/30 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 flex-1 flex items-center justify-center min-h-screen p-4 md:p-8">
        <div className="w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">

          {/* ══════ LEFT SIDE — BRANDING ══════ */}
          <div className="hidden lg:flex flex-col gap-8">
            {/* Brand header */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 flex-shrink-0">
                <img
                  src={obraMapIcon}
                  alt="ObraMap"
                  className="w-full h-full object-contain drop-shadow-lg"
                />
              </div>
              <div>
                <h2 className="text-white text-2xl font-bold leading-tight tracking-tight">ObraMap</h2>
                <p className="text-[#e67e22]/80 text-xs font-semibold tracking-[0.2em] uppercase">
                  Plataforma de Gestão de Obras
                </p>
              </div>
            </div>

            {/* Headline */}
            <div>
              <h1 className="text-white text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
                Controle total da{" "}
                <span className="text-[#e67e22]">produção</span>
                <br />
                de obras habitacionais
              </h1>
              <p className="mt-5 text-[#8a8a9a] text-base leading-relaxed max-w-md">
                Planeje, execute e controle sua obra com visão real da produção, equipes e custos — tudo integrado.
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

          {/* ══════ RIGHT SIDE — LOGIN CARD ══════ */}
          <div className="w-full max-w-md mx-auto lg:mx-0">
            {/* Glass card */}
            <div className="rounded-2xl border border-[#2a2a45]/80 bg-[#16213e]/40 backdrop-blur-xl p-8 shadow-2xl shadow-black/20">
              {/* Mobile logo */}
              <div className="flex lg:hidden items-center justify-center gap-3 mb-8">
                <img src={obraMapIcon} alt="ObraMap" className="w-12 h-12 object-contain" />
                <span className="text-white text-xl font-bold">ObraMap</span>
              </div>

              <div className="mb-8">
                <h2 className="text-white text-2xl font-bold tracking-tight">Bem-vindo de volta</h2>
                <p className="text-[#8a8a9a] mt-1.5 text-sm">Acesse sua conta para continuar</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[#8a8a9a] text-[11px] font-semibold tracking-[0.15em] uppercase">
                    E-mail
                  </label>
                  <Input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className={`h-12 bg-[#1a1a2e]/80 border-[#3a3a55] text-white placeholder:text-[#5a5a70] rounded-lg text-sm
                      focus-visible:ring-2 focus-visible:ring-[#e67e22] focus-visible:border-[#e67e22]
                      hover:border-[#4a4a65] transition-colors
                      ${errors.email ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  />
                  {errors.email && <p className="text-xs text-red-400">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-[#8a8a9a] text-[11px] font-semibold tracking-[0.15em] uppercase">
                    Senha
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className={`h-12 bg-[#1a1a2e]/80 border-[#3a3a55] text-white placeholder:text-[#5a5a70] rounded-lg text-sm pr-12
                        focus-visible:ring-2 focus-visible:ring-[#e67e22] focus-visible:border-[#e67e22]
                        hover:border-[#4a4a65] transition-colors
                        ${errors.password ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a5a70] hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-[#e67e22] hover:bg-[#d35400] text-white font-semibold text-base rounded-lg transition-all shadow-lg shadow-[#e67e22]/20 hover:shadow-[#e67e22]/30"
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

              <button className="w-full mt-4 text-center text-[#6a6a7a] hover:text-[#e67e22] text-sm transition-colors">
                Esqueci minha senha
              </button>
            </div>

            {/* Info card outside glass */}
            <div className="mt-5 rounded-xl border border-[#2a2a45]/50 bg-[#16213e]/20 backdrop-blur-sm px-5 py-4 flex items-center gap-3">
              <Shield className="w-5 h-5 text-[#e67e22]/60 flex-shrink-0" />
              <p className="text-[#6a6a7a] text-xs leading-relaxed">
                Para obter acesso, entre em contato com o{" "}
                <span className="text-[#e67e22] font-medium">administrador do sistema</span>.
              </p>
            </div>

            <p className="mt-5 text-center text-[#3a3a55] text-xs">
              © {new Date().getFullYear()} ObraMap — Plataforma de gestão de obras
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
