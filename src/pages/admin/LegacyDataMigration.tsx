import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Loader2, AlertTriangle, Building2, Users, CheckCircle2, 
  ArrowRight, Home, Layers, Calendar, DollarSign, Truck, 
  ClipboardCheck, XCircle, ArrowLeft, Shield, LogOut
} from "lucide-react";
import obraMapLogo from "@/assets/obramap-logo-new.png";

interface LegacyDataStatus {
  has_system_admin: boolean;
  system_admin_email: string | null;
  orphan_projects_count: number;
  has_orphan_data: boolean;
  companies_count: number;
  needs_migration: boolean;
}

interface OrphanCounts {
  projects: number;
  houses: number;
  quadras: number;
  planning_stages: number;
  weekly_productions: number;
  planned_productions: number;
  scope_costs: number;
  suppliers: number;
  financial_entries: number;
  delivery_inspections: number;
}

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface MigrationStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'pending' | 'running' | 'success' | 'error';
  count?: number;
}

type WizardStep = 'detection' | 'company' | 'admin' | 'confirm' | 'migration' | 'complete';

export default function LegacyDataMigration() {
  const navigate = useNavigate();
  const { user, isSystemAdmin, isLoading: authLoading, signOut } = useAuth();
  
  // State
  const [currentStep, setCurrentStep] = useState<WizardStep>('detection');
  const [isLoading, setIsLoading] = useState(true);
  const [legacyStatus, setLegacyStatus] = useState<LegacyDataStatus | null>(null);
  const [orphanCounts, setOrphanCounts] = useState<OrphanCounts | null>(null);
  
  // Company
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);
  const [companyTab, setCompanyTab] = useState<'select' | 'create'>('create');
  
  // Admin
  const [adminEmail, setAdminEmail] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [useSystemAdminEmail, setUseSystemAdminEmail] = useState(true);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [adminCreated, setAdminCreated] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  
  // Confirmation
  const [confirmMigration, setConfirmMigration] = useState(false);
  
  // Migration
  const [migrationSteps, setMigrationSteps] = useState<MigrationStep[]>([
    { id: 'projects', label: 'Obras', icon: <Building2 className="h-4 w-4" />, status: 'pending' },
    { id: 'houses', label: 'Unidades', icon: <Home className="h-4 w-4" />, status: 'pending' },
    { id: 'quadras', label: 'Quadras', icon: <Layers className="h-4 w-4" />, status: 'pending' },
    { id: 'planning', label: 'Planejamento', icon: <Calendar className="h-4 w-4" />, status: 'pending' },
    { id: 'production', label: 'Produção', icon: <ClipboardCheck className="h-4 w-4" />, status: 'pending' },
    { id: 'costs', label: 'Custos', icon: <DollarSign className="h-4 w-4" />, status: 'pending' },
    { id: 'suppliers', label: 'Fornecedores', icon: <Truck className="h-4 w-4" />, status: 'pending' },
    { id: 'financial', label: 'Financeiro', icon: <DollarSign className="h-4 w-4" />, status: 'pending' },
    { id: 'delivery', label: 'Entregas', icon: <ClipboardCheck className="h-4 w-4" />, status: 'pending' },
  ]);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [migrationComplete, setMigrationComplete] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigate("/auth");
        return;
      }
      if (!isSystemAdmin) {
        navigate("/");
        return;
      }
    }
  }, [user, isSystemAdmin, authLoading, navigate]);

  // Load initial data
  useEffect(() => {
    if (isSystemAdmin && !authLoading) {
      loadData();
    }
  }, [isSystemAdmin, authLoading]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Check legacy data status
      const { data: status, error: statusError } = await supabase.rpc('check_legacy_data_status');
      if (statusError) throw statusError;
      
      const typedStatus = status as unknown as LegacyDataStatus;
      setLegacyStatus(typedStatus);
      
      // If no migration needed, redirect
      if (!typedStatus.needs_migration) {
        toast.info("Nenhum dado legado para migrar.");
        navigate('/admin/dashboard');
        return;
      }
      
      // Get detailed orphan counts
      const { data: counts, error: countsError } = await supabase.rpc('get_orphan_data_counts');
      if (countsError) throw countsError;
      setOrphanCounts(counts as unknown as OrphanCounts);
      
      // Load existing companies
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('id, name, slug')
        .order('name');
      if (companiesError) throw companiesError;
      setCompanies(companiesData || []);
      
      // Pre-fill admin email with system admin email
      if (typedStatus.system_admin_email) {
        setAdminEmail(typedStatus.system_admin_email);
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error('Informe o nome da empresa');
      return;
    }
    
    setIsCreatingCompany(true);
    try {
      const { data, error } = await supabase.rpc('admin_create_company', {
        company_name: newCompanyName.trim()
      });
      
      if (error) throw error;
      
      const result = data as unknown as { success: boolean; error?: string; code?: string; company?: Company };
      
      if (!result.success) {
        if (result.code === 'DUPLICATE_NAME') {
          toast.error('Já existe uma empresa com este nome');
        } else {
          toast.error(result.error || 'Erro ao criar empresa');
        }
        return;
      }
      
      if (result.company) {
        setSelectedCompanyId(result.company.id);
        setSelectedCompanyName(result.company.name);
        setCompanies(prev => [...prev, result.company!]);
        toast.success('Empresa criada com sucesso!');
      }
    } catch (error: any) {
      console.error('Error creating company:', error);
      toast.error('Erro ao criar empresa');
    } finally {
      setIsCreatingCompany(false);
    }
  };

  const handleSelectCompany = (company: Company) => {
    setSelectedCompanyId(company.id);
    setSelectedCompanyName(company.name);
  };

  const handleCreateAdmin = async () => {
    const email = useSystemAdminEmail ? legacyStatus?.system_admin_email : adminEmail;
    const displayName = adminDisplayName.trim() || email?.split('@')[0] || 'Admin';
    
    if (!email || !selectedCompanyId) {
      toast.error('Informe todos os dados');
      return;
    }
    
    setIsCreatingAdmin(true);
    try {
      const { data, error } = await supabase.rpc('admin_create_company_admin', {
        target_company_id: selectedCompanyId,
        admin_email: email,
        admin_display_name: displayName
      });
      
      if (error) throw error;
      
      const result = data as unknown as { 
        success: boolean; 
        error?: string; 
        code?: string;
        action?: string;
        temp_password?: string;
        message?: string;
      };
      
      if (!result.success) {
        toast.error(result.error || 'Erro ao criar administrador');
        return;
      }
      
      // If user already exists, they were promoted
      if (result.action === 'updated') {
        toast.success('Usuário existente promovido a administrador da empresa!');
        setAdminCreated(true);
      } else if (result.action === 'needs_creation') {
        // Need to create new user via auth.signUp
        const tempPass = result.temp_password!;
        
        const { error: signUpError } = await supabase.auth.signUp({
          email: email,
          password: tempPass,
          options: {
            data: {
              display_name: displayName
            }
          }
        });
        
        if (signUpError) {
          // If user already exists in auth, just update profile
          if (signUpError.message.includes('already registered')) {
            toast.info('Usuário já existe no sistema');
          } else {
            throw signUpError;
          }
        }
        
        // Update the profile to link to company
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            company_id: selectedCompanyId,
            system_role: 'admin',
            status: 'active',
            must_change_password: true
          })
          .eq('email', email.toLowerCase());
          
        if (updateError) {
          console.error('Error updating profile:', updateError);
        }
        
        setTempPassword(tempPass);
        toast.success('Administrador criado! Guarde a senha temporária.');
        setAdminCreated(true);
      }
    } catch (error: any) {
      console.error('Error creating admin:', error);
      toast.error('Erro ao criar administrador');
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const runMigration = async () => {
    if (!selectedCompanyId) return;
    
    setMigrationProgress(0);
    setMigrationError(null);
    
    const updateStep = (id: string, status: MigrationStep['status'], count?: number) => {
      setMigrationSteps(prev => prev.map(s => 
        s.id === id ? { ...s, status, count } : s
      ));
    };
    
    try {
      // Step 1: Migrate projects
      updateStep('projects', 'running');
      const { data, error } = await supabase.rpc('complete_orphan_data_migration', {
        target_company_id: selectedCompanyId
      });
      
      if (error) throw error;
      
      const result = data as unknown as { 
        success: boolean; 
        error?: string; 
        counts?: { projects: number };
      };
      
      if (!result.success) {
        throw new Error(result.error || 'Erro na migração');
      }
      
      updateStep('projects', 'success', result.counts?.projects || orphanCounts?.projects || 0);
      setMigrationProgress(11);
      
      // Steps 2-9: Auto-linked data (visual feedback)
      const steps = [
        { id: 'houses', count: orphanCounts?.houses || 0 },
        { id: 'quadras', count: orphanCounts?.quadras || 0 },
        { id: 'planning', count: orphanCounts?.planning_stages || 0 },
        { id: 'production', count: (orphanCounts?.weekly_productions || 0) + (orphanCounts?.planned_productions || 0) },
        { id: 'costs', count: orphanCounts?.scope_costs || 0 },
        { id: 'suppliers', count: orphanCounts?.suppliers || 0 },
        { id: 'financial', count: orphanCounts?.financial_entries || 0 },
        { id: 'delivery', count: orphanCounts?.delivery_inspections || 0 },
      ];
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        updateStep(step.id, 'running');
        await new Promise(resolve => setTimeout(resolve, 300));
        updateStep(step.id, 'success', step.count);
        setMigrationProgress(11 + ((i + 1) / steps.length) * 89);
      }
      
      setMigrationComplete(true);
      toast.success('Migração concluída com sucesso!');
      
    } catch (error: any) {
      console.error('Migration error:', error);
      setMigrationError(error.message || 'Erro durante a migração');
      toast.error('Erro na migração');
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleComplete = () => {
    navigate('/admin/dashboard');
  };

  // Render loading
  if (authLoading || isLoading || !isSystemAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando dados legados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={obraMapLogo} alt="ObraMap" className="h-10" />
            <div>
              <h1 className="text-xl font-bold">Migração de Dados Legados</h1>
              <p className="text-sm text-muted-foreground">Assistente de Configuração Multiempresa</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Step Indicators */}
        <div className="flex items-center justify-center mb-8 gap-2">
          {(['detection', 'company', 'admin', 'confirm', 'migration', 'complete'] as WizardStep[]).map((step, idx) => {
            const stepOrder = ['detection', 'company', 'admin', 'confirm', 'migration', 'complete'];
            const currentIdx = stepOrder.indexOf(currentStep);
            const stepIdx = idx;
            const isActive = currentStep === step;
            const isComplete = stepIdx < currentIdx;
            
            return (
              <div key={step} className="flex items-center">
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${isActive ? 'bg-primary text-primary-foreground' : ''}
                  ${isComplete ? 'bg-primary/20 text-primary' : ''}
                  ${!isActive && !isComplete ? 'bg-muted text-muted-foreground' : ''}
                `}>
                  {isComplete ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                </div>
                {idx < 5 && <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        {/* Step: Detection */}
        {currentStep === 'detection' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <CardTitle>Dados Legados Detectados</CardTitle>
              </div>
              <CardDescription>
                O sistema detectou dados que precisam ser vinculados a uma empresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>
                  Para operar em modo multiempresa, todos os dados precisam estar vinculados a uma empresa.
                  Este assistente irá guiá-lo no processo de migração.
                </AlertDescription>
              </Alert>

              {orphanCounts && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: 'Obras', count: orphanCounts.projects, icon: <Building2 className="h-4 w-4" /> },
                    { label: 'Unidades', count: orphanCounts.houses, icon: <Home className="h-4 w-4" /> },
                    { label: 'Quadras', count: orphanCounts.quadras, icon: <Layers className="h-4 w-4" /> },
                    { label: 'Etapas', count: orphanCounts.planning_stages, icon: <Calendar className="h-4 w-4" /> },
                    { label: 'Produções', count: (orphanCounts.weekly_productions || 0) + (orphanCounts.planned_productions || 0), icon: <ClipboardCheck className="h-4 w-4" /> },
                    { label: 'Custos', count: orphanCounts.scope_costs, icon: <DollarSign className="h-4 w-4" /> },
                    { label: 'Fornecedores', count: orphanCounts.suppliers, icon: <Truck className="h-4 w-4" /> },
                    { label: 'Financeiro', count: orphanCounts.financial_entries, icon: <DollarSign className="h-4 w-4" /> },
                    { label: 'Entregas', count: orphanCounts.delivery_inspections, icon: <ClipboardCheck className="h-4 w-4" /> },
                  ].map(item => (
                    <Card key={item.label} className={item.count > 0 ? 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${item.count > 0 ? 'bg-amber-100 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                          {item.icon}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-lg font-bold">{item.count}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setCurrentStep('company')}>
                  Iniciar Migração
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Company */}
        {currentStep === 'company' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                <CardTitle>Empresa de Destino</CardTitle>
              </div>
              <CardDescription>
                Selecione ou crie a empresa para onde os dados serão migrados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs value={companyTab} onValueChange={(v) => setCompanyTab(v as 'select' | 'create')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="create">Criar Nova Empresa</TabsTrigger>
                  <TabsTrigger value="select" disabled={companies.length === 0}>
                    Usar Existente ({companies.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="create" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Nome da Empresa</Label>
                    <Input
                      id="companyName"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="Ex: Construtora ABC"
                    />
                    <p className="text-sm text-muted-foreground">
                      O slug será gerado automaticamente.
                    </p>
                  </div>
                  <Button 
                    onClick={handleCreateCompany} 
                    disabled={!newCompanyName.trim() || isCreatingCompany}
                  >
                    {isCreatingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Criar Empresa
                  </Button>
                </TabsContent>

                <TabsContent value="select" className="space-y-4">
                  <div className="grid gap-2">
                    {companies.map(company => (
                      <Card
                        key={company.id}
                        className={`cursor-pointer transition-all ${selectedCompanyId === company.id ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/30'}`}
                        onClick={() => handleSelectCompany(company)}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="font-medium">{company.name}</p>
                            <p className="text-sm text-muted-foreground">{company.slug}</p>
                          </div>
                          {selectedCompanyId === company.id && (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              {selectedCompanyId && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle>Empresa selecionada</AlertTitle>
                  <AlertDescription>
                    <strong>{selectedCompanyName}</strong> receberá todos os dados legados.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep('detection')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button onClick={() => setCurrentStep('admin')} disabled={!selectedCompanyId}>
                  Continuar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Admin */}
        {currentStep === 'admin' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                <CardTitle>Administrador da Empresa</CardTitle>
              </div>
              <CardDescription>
                Defina quem será o administrador operacional de <strong>{selectedCompanyName}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertTitle>Separação de Papéis</AlertTitle>
                <AlertDescription>
                  O <strong>SYSTEM_ADMIN</strong> ({legacyStatus?.system_admin_email}) gerencia a plataforma.
                  O <strong>ADMIN da empresa</strong> acessa os dados operacionais.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="useSystemAdmin"
                    checked={useSystemAdminEmail}
                    onCheckedChange={(checked) => setUseSystemAdminEmail(checked === true)}
                  />
                  <Label htmlFor="useSystemAdmin">
                    Usar o mesmo e-mail do SYSTEM_ADMIN ({legacyStatus?.system_admin_email})
                  </Label>
                </div>

                {!useSystemAdminEmail && (
                  <div className="space-y-4 p-4 border rounded-lg">
                    <div className="space-y-2">
                      <Label htmlFor="adminEmail">E-mail do Administrador</Label>
                      <Input
                        id="adminEmail"
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@empresa.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adminName">Nome de Exibição</Label>
                      <Input
                        id="adminName"
                        value={adminDisplayName}
                        onChange={(e) => setAdminDisplayName(e.target.value)}
                        placeholder="Nome do Administrador"
                      />
                    </div>
                  </div>
                )}

                {!adminCreated ? (
                  <Button 
                    onClick={handleCreateAdmin}
                    disabled={isCreatingAdmin || (!useSystemAdminEmail && !adminEmail)}
                  >
                    {isCreatingAdmin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Configurar Administrador
                  </Button>
                ) : (
                  <Alert className="border-green-500/50 bg-green-50/50 dark:bg-green-950/10">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertTitle>Administrador configurado!</AlertTitle>
                    <AlertDescription>
                      {tempPassword ? (
                        <div className="mt-2">
                          <p>Senha temporária: <code className="bg-muted px-2 py-1 rounded">{tempPassword}</code></p>
                          <p className="text-sm mt-1">Guarde esta senha! O usuário deverá alterá-la no primeiro acesso.</p>
                        </div>
                      ) : (
                        <p>O usuário existente foi promovido a administrador da empresa.</p>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep('company')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button onClick={() => setCurrentStep('confirm')} disabled={!adminCreated}>
                  Continuar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Confirm */}
        {currentStep === 'confirm' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <CardTitle>Confirmação Final</CardTitle>
              </div>
              <CardDescription>
                Revise as informações antes de executar a migração.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ação Irreversível</AlertTitle>
                <AlertDescription>
                  Esta operação irá vincular <strong>todos os dados legados</strong> à empresa <strong>{selectedCompanyName}</strong>.
                  Esta ação não pode ser desfeita.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h4 className="font-medium">Resumo da Migração:</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <strong>{orphanCounts?.projects || 0}</strong> obras serão migradas
                  </li>
                  <li className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <strong>{orphanCounts?.houses || 0}</strong> unidades serão vinculadas
                  </li>
                  <li className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Admin: <strong>{useSystemAdminEmail ? legacyStatus?.system_admin_email : adminEmail}</strong>
                  </li>
                </ul>
              </div>

              <div className="flex items-center space-x-2 p-4 border rounded-lg bg-muted/30">
                <Checkbox
                  id="confirmMigration"
                  checked={confirmMigration}
                  onCheckedChange={(checked) => setConfirmMigration(checked === true)}
                />
                <Label htmlFor="confirmMigration" className="text-sm">
                  Eu entendo que esta ação é irreversível e desejo prosseguir com a migração.
                </Label>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep('admin')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button 
                  onClick={() => { setCurrentStep('migration'); runMigration(); }}
                  disabled={!confirmMigration}
                  variant="destructive"
                >
                  Executar Migração
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Migration */}
        {currentStep === 'migration' && (
          <Card>
            <CardHeader>
              <CardTitle>
                {migrationComplete ? 'Migração Concluída' : 'Migração em Andamento'}
              </CardTitle>
              <CardDescription>
                {migrationComplete 
                  ? 'Todos os dados foram migrados com sucesso!'
                  : 'Aguarde enquanto os dados são migrados...'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Progress value={migrationProgress} className="h-3" />

              <div className="grid gap-2">
                {migrationSteps.map(step => (
                  <Card
                    key={step.id}
                    className={`
                      transition-all
                      ${step.status === 'running' ? 'border-primary bg-primary/5' : ''}
                      ${step.status === 'success' ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/10' : ''}
                      ${step.status === 'error' ? 'border-red-500/50 bg-red-50/50 dark:bg-red-950/10' : ''}
                    `}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={`
                        p-2 rounded-lg
                        ${step.status === 'pending' ? 'bg-muted text-muted-foreground' : ''}
                        ${step.status === 'running' ? 'bg-primary/20 text-primary' : ''}
                        ${step.status === 'success' ? 'bg-green-100 text-green-600' : ''}
                        ${step.status === 'error' ? 'bg-red-100 text-red-600' : ''}
                      `}>
                        {step.icon}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{step.label}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {step.count !== undefined && step.status === 'success' && (
                          <span className="text-sm text-muted-foreground">{step.count} item(ns)</span>
                        )}
                        {step.status === 'pending' && <div className="w-5 h-5 rounded-full bg-muted" />}
                        {step.status === 'running' && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
                        {step.status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                        {step.status === 'error' && <XCircle className="h-5 w-5 text-red-600" />}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {migrationError && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Erro na Migração</AlertTitle>
                  <AlertDescription>{migrationError}</AlertDescription>
                </Alert>
              )}

              {migrationComplete && (
                <div className="flex justify-center">
                  <Button onClick={() => setCurrentStep('complete')} size="lg">
                    Continuar
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Complete */}
        {currentStep === 'complete' && (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <CardTitle className="text-2xl">Migração Concluída!</CardTitle>
              <CardDescription>
                O sistema está pronto para operar em modo multiempresa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <h4 className="font-medium">Próximos Passos:</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Todos os dados foram vinculados a <strong>{selectedCompanyName}</strong>
                  </li>
                  <li className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Você continua como <strong>SYSTEM_ADMIN</strong> (sem acesso operacional)
                  </li>
                  <li className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    O administrador da empresa pode acessar <strong>/app</strong>
                  </li>
                </ul>
              </div>

              <div className="flex justify-center">
                <Button onClick={handleComplete} size="lg">
                  Ir para o Painel Admin
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
