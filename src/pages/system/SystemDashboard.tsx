import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Building2, Users, LogOut, Package, Download } from "lucide-react";
import { toast } from "sonner";
import obraMapLogo from "@/assets/obramap-logo-new.png";
import CompanyManagement from "@/components/admin/CompanyManagement";
import SystemUserManagement from "@/components/admin/SystemUserManagement";
import CompanyModulesManagement from "@/components/admin/CompanyModulesManagement";

export default function SystemDashboard() {
  const navigate = useNavigate();
  const { user, isSystemAdmin, isLoading: authLoading, signOut, mustChangePassword } = useAuth();
  const [companiesCount, setCompaniesCount] = useState(0);
  const [usersCount, setUsersCount] = useState(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!isSystemAdmin) return;

    try {
      const [companiesResult, usersResult] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).neq("system_role", "system_admin"),
      ]);

      setCompaniesCount(companiesResult.count || 0);
      setUsersCount(usersResult.count || 0);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate("/auth");
      return;
    }
    if (mustChangePassword) {
      navigate("/change-password");
      return;
    }
    if (!isSystemAdmin) {
      console.log("[SystemDashboard] Non-admin user, redirecting to /");
      navigate("/dashboard");
      return;
    }
    console.log("[SystemDashboard] System admin access granted");
  }, [user, isSystemAdmin, authLoading, mustChangePassword, navigate]);

  useEffect(() => {
    if (isSystemAdmin && !authLoading) {
      fetchStats();
    }
  }, [isSystemAdmin, authLoading, fetchStats]);

  // Realtime subscription para atualizar stats automaticamente
  useEffect(() => {
    if (!isSystemAdmin) return;

    const companiesChannel = supabase
      .channel('system-companies-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'companies' },
        () => fetchStats()
      )
      .subscribe();

    const profilesChannel = supabase
      .channel('system-profiles-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => fetchStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(companiesChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, [isSystemAdmin, fetchStats]);

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const [isBackingUp, setIsBackingUp] = useState(false);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/backup-database`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao gerar backup");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Backup baixado com sucesso!");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error(`Falha no backup: ${msg}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  if (authLoading || !isSystemAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
              <h1 className="text-xl font-bold">ObraMap System</h1>
              <p className="text-sm text-muted-foreground">Administração Global</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Empresas</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{companiesCount}</div>
              )}
              <p className="text-xs text-muted-foreground">empresas cadastradas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="text-2xl font-bold">{usersCount}</div>
              )}
              <p className="text-xs text-muted-foreground">usuários nas empresas</p>
            </CardContent>
          </Card>
        </div>

        {/* Management Tabs */}
        <Tabs defaultValue="companies" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="companies" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="modules" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Módulos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="companies">
            <CompanyManagement />
          </TabsContent>

          <TabsContent value="users">
            <SystemUserManagement />
          </TabsContent>

          <TabsContent value="modules">
            <CompanyModulesManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
