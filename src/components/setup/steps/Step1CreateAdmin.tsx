import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { Shield, AlertTriangle, CheckCircle2, Loader2, Eye, EyeOff, UserCheck } from 'lucide-react';
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
  const [wasPromoted, setWasPromoted] = useState(false);

  const validateForm = () => {
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('E-mail válido é obrigatório');
      return false;
    }
    return true;
  };

  const validateFormForNewUser = () => {
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

  const tryPromoteExistingUser = async (): Promise<{ success: boolean; userId?: string }> => {
    const { data, error: rpcError } = await supabase.rpc('promote_to_system_admin', {
      admin_email: formData.email
    });

    if (rpcError) {
      console.error('Error promoting user:', rpcError);
      return { success: false };
    }

    const result = data as { success: boolean; user_id?: string; error?: string; code?: string };
    
    if (result.success && result.user_id) {
      return { success: true, userId: result.user_id };
    }

    return { success: false };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // First, try to promote existing user
      const promoteResult = await tryPromoteExistingUser();
      
      if (promoteResult.success && promoteResult.userId) {
        // User existed and was promoted
        setWasPromoted(true);
        setSuccess(true);
        toast.success('Usuário existente promovido para SYSTEM_ADMIN com sucesso!');
        onAdminCreated(promoteResult.userId);
        return;
      }

      // User doesn't exist, validate full form for new user creation
      if (!validateFormForNewUser()) {
        setIsLoading(false);
        return;
      }

      // Create new user
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

      if (signUpError) {
        // Check if user already exists error
        if (signUpError.message.includes('already registered') || signUpError.message.includes('already been registered')) {
          setError('Usuário já existe mas não foi encontrado no sistema. Entre em contato com suporte.');
        } else {
          throw signUpError;
        }
        return;
      }
      
      if (!authData.user) throw new Error('Falha ao criar usuário');

      // Update the profile to be a system_admin using the RPC function
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
            {wasPromoted ? (
              <UserCheck className="h-10 w-10 text-green-600" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            )}
          </div>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-foreground">
            {wasPromoted ? 'Usuário Promovido com Sucesso!' : 'SYSTEM_ADMIN Criado com Sucesso!'}
          </h3>
          <p className="text-muted-foreground mt-2">
            {wasPromoted 
              ? 'Usuário existente encontrado. Papel atualizado para SYSTEM_ADMIN com sucesso.'
              : 'O administrador do sistema foi configurado e já pode gerenciar o ObraMap.'
            }
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

      <Alert className="border-blue-500/50 bg-blue-50 dark:bg-blue-950/20">
        <UserCheck className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          <strong>Dica:</strong> Se você informar um e-mail de usuário já existente, 
          ele será automaticamente promovido para SYSTEM_ADMIN sem criar registro duplicado.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <p className="text-xs text-muted-foreground">
            Informe o e-mail. Se o usuário já existir, será promovido automaticamente.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">Nome Completo <span className="text-muted-foreground">(apenas para novos usuários)</span></Label>
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
          <Label htmlFor="password">Senha <span className="text-muted-foreground">(apenas para novos usuários)</span></Label>
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
          <Label htmlFor="confirmPassword">Confirmar Senha <span className="text-muted-foreground">(apenas para novos usuários)</span></Label>
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
              Processando...
            </>
          ) : (
            <>
              <Shield className="h-4 w-4" />
              Criar ou Promover SYSTEM_ADMIN
            </>
          )}
        </Button>
      </form>
    </div>
  );
};
