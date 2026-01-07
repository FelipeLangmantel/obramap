import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { Shield, AlertTriangle, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface Step1CreateAdminProps {
  onAdminCreated: (userId: string) => void;
  onNext: () => void;
  isComplete: boolean;
}

export const Step1CreateAdmin: React.FC<Step1CreateAdminProps> = ({
  onAdminCreated,
  onNext,
  isComplete
}) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validateForm = () => {
    if (!formData.fullName.trim()) {
      setError('Nome completo é obrigatório');
      return false;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('E-mail válido é obrigatório');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('As senhas não coincidem');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // 1. Create the user in Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            display_name: formData.fullName
          }
        }
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('Falha ao criar usuário');

      // 2. Update the profile to be a system_admin using the RPC function
      const { error: rpcError } = await supabase.rpc('create_system_admin', {
        admin_user_id: authData.user.id,
        admin_email: formData.email,
        admin_display_name: formData.fullName
      });

      if (rpcError) throw rpcError;

      setSuccess(true);
      toast.success('SYSTEM_ADMIN criado com sucesso!');
      onAdminCreated(authData.user.id);
    } catch (err: any) {
      console.error('Error creating admin:', err);
      setError(err.message || 'Erro ao criar administrador');
    } finally {
      setIsLoading(false);
    }
  };

  if (isComplete || success) {
    return (
      <div className="space-y-6 text-center py-8">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-foreground">
            SYSTEM_ADMIN Criado com Sucesso!
          </h3>
          <p className="text-muted-foreground mt-2">
            O administrador do sistema foi configurado e já pode gerenciar o ObraMap.
          </p>
        </div>
        <Button onClick={onNext} className="gap-2">
          Continuar
          <Shield className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          <strong>Atenção:</strong> Este usuário terá controle total do sistema, 
          mas <strong>não acessará dados operacionais</strong> das empresas. 
          Ele será responsável por criar empresas e usuários.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Nome Completo</Label>
          <Input
            id="fullName"
            type="text"
            placeholder="Digite o nome completo"
            value={formData.fullName}
            onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="admin@empresa.com"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Mínimo 6 caracteres"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              disabled={isLoading}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar Senha</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Repita a senha"
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              disabled={isLoading}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full gap-2" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando...
            </>
          ) : (
            <>
              <Shield className="h-4 w-4" />
              Criar SYSTEM_ADMIN e Continuar
            </>
          )}
        </Button>
      </form>
    </div>
  );
};
