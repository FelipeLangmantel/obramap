import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Users, 
  Plus, 
  Trash2, 
  User, 
  HardHat,
  Zap,
  Edit2,
  MoreVertical
} from 'lucide-react';
import { PlanningStage, PlanningTeam } from './types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TeamManagementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: PlanningStage[];
  teams: PlanningTeam[];
  onAddTeam: (stageId: string, professionals: number, helpers: number) => Promise<void>;
  onRemoveTeam: (teamId: string) => Promise<void>;
  onUpdateTeam: (teamId: string, updates: Partial<PlanningTeam>) => Promise<void>;
}

export function TeamManagementPanel({
  open,
  onOpenChange,
  stages,
  teams,
  onAddTeam,
  onRemoveTeam,
  onUpdateTeam
}: TeamManagementPanelProps) {
  const [addingToStage, setAddingToStage] = useState<string | null>(null);
  const [newTeamProfessionals, setNewTeamProfessionals] = useState(1);
  const [newTeamHelpers, setNewTeamHelpers] = useState(1);
  const [editingTeam, setEditingTeam] = useState<PlanningTeam | null>(null);

  const getTeamsForStage = (stageId: string) => 
    teams.filter(t => t.stage_id === stageId);

  const handleAddTeam = async (stageId: string) => {
    await onAddTeam(stageId, newTeamProfessionals, newTeamHelpers);
    setAddingToStage(null);
    setNewTeamProfessionals(1);
    setNewTeamHelpers(1);
  };

  const handleUpdateTeam = async () => {
    if (!editingTeam) return;
    await onUpdateTeam(editingTeam.id, {
      name: editingTeam.name,
      professionals_count: editingTeam.professionals_count,
      helpers_count: editingTeam.helpers_count,
      is_active: editingTeam.is_active
    });
    setEditingTeam(null);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Gerenciar Equipes
            </SheetTitle>
            <SheetDescription>
              Adicione, remova ou edite equipes por etapa. Cada equipe pode ter composição e produtividade diferentes.
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-150px)] mt-6 pr-4">
            <div className="space-y-6">
              {stages.map(stage => {
                const stageTeams = getTeamsForStage(stage.id);
                return (
                  <Card key={stage.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          <CardTitle className="text-sm font-medium">
                            {stage.name}
                          </CardTitle>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {stageTeams.length} equipe{stageTeams.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {stageTeams.map(team => (
                        <div 
                          key={team.id}
                          className={`flex items-center justify-between p-2 rounded-lg border ${
                            team.is_active ? 'bg-background' : 'bg-muted/50 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{team.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {team.professionals_count} prof.
                                </span>
                                <span className="flex items-center gap-1">
                                  <HardHat className="h-3 w-3" />
                                  {team.helpers_count} aj.
                                </span>
                              </div>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditingTeam(team)}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => onUpdateTeam(team.id, { is_active: !team.is_active })}
                              >
                                {team.is_active ? 'Desativar' : 'Ativar'}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => onRemoveTeam(team.id)}
                                className="text-destructive"
                                disabled={stageTeams.length <= 1}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remover
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}

                      {/* Add Team Section */}
                      {addingToStage === stage.id ? (
                        <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Profissionais</Label>
                              <Select
                                value={newTeamProfessionals.toString()}
                                onValueChange={(v) => setNewTeamProfessionals(parseInt(v))}
                              >
                                <SelectTrigger className="mt-1 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5].map(n => (
                                    <SelectItem key={n} value={n.toString()}>
                                      {n}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Ajudantes</Label>
                              <Select
                                value={newTeamHelpers.toString()}
                                onValueChange={(v) => setNewTeamHelpers(parseInt(v))}
                              >
                                <SelectTrigger className="mt-1 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[0, 1, 2, 3, 4, 5].map(n => (
                                    <SelectItem key={n} value={n.toString()}>
                                      {n}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleAddTeam(stage.id)}
                              className="flex-1"
                            >
                              Adicionar
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setAddingToStage(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddingToStage(stage.id)}
                          className="w-full gap-1"
                        >
                          <Plus className="h-4 w-4" />
                          Adicionar Equipe
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Edit Team Dialog */}
      <Dialog open={!!editingTeam} onOpenChange={() => setEditingTeam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Equipe</DialogTitle>
          </DialogHeader>
          {editingTeam && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Nome da Equipe</Label>
                <Input
                  value={editingTeam.name}
                  onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Profissionais</Label>
                  <Select
                    value={editingTeam.professionals_count.toString()}
                    onValueChange={(v) => setEditingTeam({ 
                      ...editingTeam, 
                      professionals_count: parseInt(v) 
                    })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(n => (
                        <SelectItem key={n} value={n.toString()}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ajudantes</Label>
                  <Select
                    value={editingTeam.helpers_count.toString()}
                    onValueChange={(v) => setEditingTeam({ 
                      ...editingTeam, 
                      helpers_count: parseInt(v) 
                    })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5].map(n => (
                        <SelectItem key={n} value={n.toString()}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTeam(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateTeam}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
