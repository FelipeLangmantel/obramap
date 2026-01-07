import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ArrowRight, Building2, Plus, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface Step3SelectCompanyProps {
  onCompanySelected: (companyId: string, companyName: string) => void;
  selectedCompanyId: string | null;
  onNext: () => void;
  onBack: () => void;
}

export const Step3SelectCompany: React.FC<Step3SelectCompanyProps> = ({
  onCompanySelected,
  selectedCompanyId,
  onNext,
  onBack
}) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('select');

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, slug')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
      
      // If no companies, switch to create tab
      if (!data || data.length === 0) {
        setActiveTab('create');
      }
    } catch (err) {
      console.error('Error fetching companies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }

    setIsCreating(true);

    try {
      // Generate slug using the RPC function
      const { data: slug, error: slugError } = await supabase
        .rpc('generate_unique_slug', { company_name: newCompanyName });

      if (slugError) throw slugError;

      // Create the company
      const { data, error } = await supabase
        .from('companies')
        .insert({ 
          name: newCompanyName.trim(),
          slug: slug 
        })
        .select('id, name, slug')
        .single();

      if (error) throw error;

      toast.success('Empresa criada com sucesso!');
      setCompanies(prev => [...prev, data]);
      onCompanySelected(data.id, data.name);
      setNewCompanyName('');
      setActiveTab('select');
    } catch (err: any) {
      console.error('Error creating company:', err);
      toast.error(err.message || 'Erro ao criar empresa');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelectCompany = (company: Company) => {
    onCompanySelected(company.id, company.name);
  };

  const canProceed = !!selectedCompanyId;

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="select" disabled={companies.length === 0}>
            Selecionar Existente
          </TabsTrigger>
          <TabsTrigger value="create">
            <Plus className="h-4 w-4 mr-2" />
            Criar Nova
          </TabsTrigger>
        </TabsList>

        <TabsContent value="select" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : companies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma empresa cadastrada. Crie uma nova empresa para continuar.
            </div>
          ) : (
            <div className="grid gap-3">
              {companies.map((company) => (
                <Card 
                  key={company.id}
                  className={`cursor-pointer transition-all hover:border-primary/50 ${
                    selectedCompanyId === company.id 
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20' 
                      : ''
                  }`}
                  onClick={() => handleSelectCompany(company)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      selectedCompanyId === company.id 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted'
                    }`}>
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{company.name}</p>
                      <p className="text-sm text-muted-foreground">/{company.slug}</p>
                    </div>
                    {selectedCompanyId === company.id && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="create" className="space-y-4">
          <form onSubmit={handleCreateCompany} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Nome da Empresa</Label>
              <Input
                id="companyName"
                placeholder="Ex: Construtora ABC"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                disabled={isCreating}
              />
              <p className="text-sm text-muted-foreground">
                O slug será gerado automaticamente a partir do nome.
              </p>
            </div>

            <Button type="submit" className="w-full gap-2" disabled={isCreating || !newCompanyName.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Criar Empresa
                </>
              )}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {selectedCompanyId && (
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-sm font-medium text-primary">
            Empresa selecionada: {companies.find(c => c.id === selectedCompanyId)?.name}
          </p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="gap-2">
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
