import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Building2, Users, LogOut, Plus, Settings } from "lucide-react";
import obraMapLogo from "@/assets/obramap-logo-new.png";
import CompanyManagement from "@/components/admin/CompanyManagement";
import SystemUserManagement from "@/components/admin/SystemUserManagement";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isSystemAdmin, isLoading: authLoading, signOut, mustChangePassword } = useAuth();
  const [companiesCount, setCompaniesCount] = useState(0);
  const [usersCount, setUsersCount] = useState(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigate("/auth");
        return;
      }
      if (mustChangePassword) {
        navigate("/change-password");
        return;
      }
      if (!isSystemAdmin) {
        navigate("/");
        return;
      }
    }
  }, [user, isSystemAdmin, authLoading, mustChangePassword, navigate]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!isSystemAdmin) return;

      try {
        const [companiesResult, usersResult] = await Promise.all([
          supabase.from("companies").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
        ]);

        setCompaniesCount(companiesResult.count || 0);
        setUsersCount(usersResult.count || 0);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    if (isSystemAdmin && !authLoading) {
      fetchStats();
    }
  }, [isSystemAdmin, authLoading]);

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
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
              <h1 className="text-xl font-bold">ObraMap Admin</h1>
              <p className="text-sm text-muted-foreground">Painel do Sistema</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
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
              <p className="text-xs text-muted-foreground">usuários no sistema</p>
            </CardContent>
          </Card>
        </div>

        {/* Management Tabs */}
        <Tabs defaultValue="companies" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="companies" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
          </TabsList>

          <TabsContent value="companies">
            <CompanyManagement />
          </TabsContent>

          <TabsContent value="users">
            <SystemUserManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}