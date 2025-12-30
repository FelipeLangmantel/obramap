import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Home,
  ClipboardCheck,
  AlertTriangle,
  BarChart3,
  Settings,
  Plus,
  Search,
  FileText
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DeliveryDashboard } from "./delivery/DeliveryDashboard";
import { InspectionChecklistDialog } from "./delivery/InspectionChecklistDialog";
import { IssueManagementDialog } from "./delivery/IssueManagementDialog";
import { ChecklistTemplateManager } from "./delivery/ChecklistTemplateManager";

type DeliveryStatus = 'em_vistoria' | 'entrega_agendada' | 'entregue_sem_pendencias' | 'entregue_com_pendencias' | 'pos_obra_em_atendimento' | 'unidade_encerrada';
type IssueStatus = 'aberta' | 'em_execucao' | 'aguardando_validacao' | 'encerrada';

const DeliveryView: React.FC = () => {
  const { selectedProject } = useConstruction();
  const { isAdmin, canEdit } = useAuth();
  
  const [activeTab, setActiveTab] = useState("dashboard");
  const [inspections, setInspections] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [houses, setHouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspections, setInspections] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const [selectedInspection, setSelectedInspection] = useState<any>(null);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);

  const statusLabels: Record<DeliveryStatus, { label: string; color: string }> = {
    em_vistoria: { label: 'Em Vistoria', color: 'bg-blue-500' },
    entrega_agendada: { label: 'Entrega Agendada', color: 'bg-purple-500' },
    entregue_sem_pendencias: { label: 'Entregue s/ Pendências', color: 'bg-green-500' },
    entregue_com_pendencias: { label: 'Entregue c/ Pendências', color: 'bg-amber-500' },
    pos_obra_em_atendimento: { label: 'Pós-Obra em Atendimento', color: 'bg-orange-500' },
    unidade_encerrada: { label: 'Unidade Encerrada', color: 'bg-emerald-600' }
  };

  const issueStatusLabels: Record<IssueStatus, { label: string; color: string }> = {
    aberta: { label: 'Aberta', color: 'bg-red-500' },
    em_execucao: { label: 'Em Execução', color: 'bg-blue-500' },
    aguardando_validacao: { label: 'Aguardando Validação', color: 'bg-amber-500' },
    encerrada: { label: 'Encerrada', color: 'bg-green-500' }
  };

  const severityLabels: Record<string, { label: string; color: string }> = {
    critica: { label: 'Crítica', color: 'bg-red-500' },
    media: { label: 'Média', color: 'bg-amber-500' },
    leve: { label: 'Leve', color: 'bg-blue-500' }
  };

  useEffect(() => {
    if (selectedProject) {
      loadData();
    }
  }, [selectedProject]);

  const loadData = async () => {
    if (!selectedProject) return;
    
    setLoading(true);
    try {
      const [inspectionsRes, issuesRes, templatesRes, housesRes] = await Promise.all([
        supabase
          .from('delivery_inspections')
          .select('*')
          .eq('project_id', selectedProject.id)
          .order('house_number'),
        supabase
          .from('delivery_issues')
          .select('*')
          .eq('project_id', selectedProject.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('delivery_checklist_templates')
          .select('*')
          .eq('project_id', selectedProject.id)
          .order('category, display_order'),
        supabase
          .from('houses')
          .select('*')
          .eq('project_id', selectedProject.id)
          .order('house_number')
      ]);

      setInspections(inspectionsRes.data || []);
      setIssues(issuesRes.data || []);
      setTemplates(templatesRes.data || []);
      setHouses(housesRes.data || []);
    } catch (error) {
      console.error('Error loading delivery data:', error);
    } finally {
      setLoading(false);
    }
  };

  const startInspection = async (house: any) => {
    try {
      // Check if inspection already exists
      const existing = inspections.find(i => i.house_id === house.id);
      
      if (existing) {
        setSelectedInspection(existing);
        setChecklistDialogOpen(true);
        return;
      }

      // Create new inspection
      const { data, error } = await supabase
        .from('delivery_inspections')
        .insert({
          project_id: selectedProject!.id,
          house_id: house.id,
          house_number: house.house_number,
          status: 'em_vistoria' as DeliveryStatus
        })
        .select()
        .single();

      if (error) throw error;

      setSelectedInspection(data);
      setChecklistDialogOpen(true);
      loadData();
    } catch (error: any) {
      toast.error('Erro ao iniciar vistoria: ' + error.message);
    }
  };

  const filteredInspections = inspections.filter(inspection => {
    const matchesSearch = inspection.house_number.toString().includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || inspection.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredIssues = issues.filter(issue => {
    const matchesSearch = 
      issue.house_number.toString().includes(searchTerm) ||
      issue.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || issue.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Houses available for inspection (not yet started)
  const availableHouses = houses.filter(house => 
    !inspections.some(i => i.house_id === house.id)
  );

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecione um projeto para continuar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="dashboard" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Painel</span>
          </TabsTrigger>
          <TabsTrigger value="inspections" className="gap-2">
            <ClipboardCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Vistorias</span>
          </TabsTrigger>
          <TabsTrigger value="issues" className="gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden sm:inline">Pendências</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Configurar</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <DeliveryDashboard inspections={inspections} issues={issues} />
        </TabsContent>

        <TabsContent value="inspections" className="mt-6 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número da casa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(statusLabels).map(([value, { label }]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Start new inspection */}
          {canEdit && availableHouses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Iniciar Nova Vistoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {availableHouses.slice(0, 20).map(house => (
                    <Button
                      key={house.id}
                      variant="outline"
                      size="sm"
                      onClick={() => startInspection(house)}
                    >
                      <Home className="w-4 h-4 mr-1" />
                      Casa {house.house_number}
                    </Button>
                  ))}
                  {availableHouses.length > 20 && (
                    <span className="text-sm text-muted-foreground self-center">
                      +{availableHouses.length - 20} casas
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Inspections list */}
          <Card>
            <CardHeader>
              <CardTitle>Vistorias Realizadas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Casa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Data Vistoria</TableHead>
                    <TableHead className="hidden md:table-cell">Data Entrega</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInspections.map(inspection => {
                    const status = statusLabels[inspection.status as DeliveryStatus];
                    return (
                      <TableRow key={inspection.id}>
                        <TableCell className="font-medium">
                          Casa {inspection.house_number}
                        </TableCell>
                        <TableCell>
                          <Badge className={status?.color || 'bg-gray-500'}>
                            {status?.label || inspection.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {inspection.inspection_date 
                            ? format(new Date(inspection.inspection_date), "dd/MM/yyyy", { locale: ptBR })
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {inspection.delivery_date 
                            ? format(new Date(inspection.delivery_date), "dd/MM/yyyy", { locale: ptBR })
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {canEdit && inspection.status === 'em_vistoria' && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedInspection(inspection);
                                  setChecklistDialogOpen(true);
                                }}
                              >
                                <ClipboardCheck className="w-4 h-4 mr-1" />
                                Vistoriar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedInspection(inspection);
                                setChecklistDialogOpen(true);
                              }}
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredInspections.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma vistoria encontrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="mt-6 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar pendência..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(issueStatusLabels).map(([value, { label }]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Issues list */}
          <Card>
            <CardHeader>
              <CardTitle>Pendências</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Casa</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="hidden md:table-cell">Descrição</TableHead>
                    <TableHead>Gravidade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Prazo</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIssues.map(issue => {
                    const status = issueStatusLabels[issue.status as IssueStatus];
                    const severity = severityLabels[issue.severity] || severityLabels.media;
                    const isOverdue = issue.due_date && new Date(issue.due_date) < new Date() && issue.status !== 'encerrada';
                    
                    return (
                      <TableRow key={issue.id}>
                        <TableCell className="font-medium">
                          Casa {issue.house_number}
                        </TableCell>
                        <TableCell>{issue.category}</TableCell>
                        <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                          {issue.description}
                        </TableCell>
                        <TableCell>
                          <Badge className={severity.color}>{severity.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge className={status?.color || 'bg-gray-500'}>
                              {status?.label || issue.status}
                            </Badge>
                            {isOverdue && (
                              <Badge variant="destructive" className="text-xs">Atrasada</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {issue.due_date 
                            ? format(new Date(issue.due_date), "dd/MM/yyyy", { locale: ptBR })
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedIssue(issue);
                                setIssueDialogOpen(true);
                              }}
                            >
                              Gerenciar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredIssues.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhuma pendência encontrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="settings" className="mt-6">
            <ChecklistTemplateManager
              projectId={selectedProject.id}
              templates={templates}
              onUpdate={loadData}
              isAdmin={isAdmin}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      {selectedInspection && (
        <InspectionChecklistDialog
          open={checklistDialogOpen}
          onOpenChange={setChecklistDialogOpen}
          inspection={selectedInspection}
          templates={templates}
          onSave={loadData}
        />
      )}

      {selectedIssue && (
        <IssueManagementDialog
          open={issueDialogOpen}
          onOpenChange={setIssueDialogOpen}
          issue={selectedIssue}
          onSave={loadData}
        />
      )}
    </div>
  );
};

export default DeliveryView;
