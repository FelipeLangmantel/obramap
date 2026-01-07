import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SystemRole = "system_admin" | "admin" | "user";
export type AppRole = "admin" | "editor" | "viewer"; // Legacy - para compatibilidade

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  company_id: string | null;
  status: string;
  must_change_password: boolean;
  system_role: SystemRole;
}

interface UserPermission {
  id: string;
  user_id: string;
  department: string | null;
  allowed_project_ids: string[] | null;
  visible_menus: string[];
  visible_management_sections: string[];
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  company: Company | null;
  systemRole: SystemRole | null;
  role: AppRole | null; // Legacy
  permissions: UserPermission | null;
  isLoading: boolean;
  isSystemAdmin: boolean;
  isCompanyAdmin: boolean;
  isAdmin: boolean; // Legacy
  isEditor: boolean; // Legacy
  canEdit: boolean;
  mustChangePassword: boolean;
  canAccessMenu: (menuId: string) => boolean;
  canAccessManagement: (sectionId: string) => boolean;
  canAccessProject: (projectId: string) => boolean;
  refreshPermissions: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_MENUS = ["dashboard", "producao", "financeiro", "suprimentos", "planejamento", "mapa", "graficos"];
const DEFAULT_MANAGEMENT = ["projetos", "quadras", "macros", "escopos", "insumos", "fornecedores", "mao_de_obra", "usuarios"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [systemRole, setSystemRole] = useState<SystemRole | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<UserPermission | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      // Fetch profile with new fields
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        return;
      }

      if (profileData) {
        const typedProfile: Profile = {
          id: profileData.id,
          user_id: profileData.user_id,
          display_name: profileData.display_name,
          email: profileData.email,
          company_id: profileData.company_id,
          status: (profileData as any).status || 'active',
          must_change_password: (profileData as any).must_change_password || false,
          system_role: (profileData as any).system_role || 'user',
        };
        setProfile(typedProfile);
        setSystemRole(typedProfile.system_role);

        // Fetch company if user has company_id
        if (typedProfile.company_id) {
          const { data: companyData } = await supabase
            .from("companies")
            .select("id, name, slug")
            .eq("id", typedProfile.company_id)
            .single();

          if (companyData) {
            setCompany(companyData);
          }
        }
      }

      // Fetch legacy role using RPC (para compatibilidade)
      const { data: roleData } = await supabase.rpc("get_user_role", {
        _user_id: userId,
      });

      if (roleData) {
        setRole(roleData as AppRole);
      }

      // Fetch permissions
      const { data: permData } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (permData) {
        setPermissions({
          id: permData.id,
          user_id: permData.user_id,
          department: permData.department,
          allowed_project_ids: permData.allowed_project_ids,
          visible_menus: (permData.visible_menus as string[]) || DEFAULT_MENUS,
          visible_management_sections: (permData.visible_management_sections as string[]) || DEFAULT_MANAGEMENT,
        });
      } else {
        setPermissions(null);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  }, []);

  const refreshPermissions = useCallback(async () => {
    if (user?.id) {
      await fetchUserData(user.id);
    }
  }, [user?.id, fetchUserData]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setCompany(null);
          setSystemRole(null);
          setRole(null);
          setPermissions(null);
        }

        if (event === "SIGNED_OUT") {
          setProfile(null);
          setCompany(null);
          setSystemRole(null);
          setRole(null);
          setPermissions(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  // Set up realtime subscription for permission changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('user-permissions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_permissions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          refreshPermissions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          refreshPermissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshPermissions]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (!error && data.user) {
      try {
        await supabase.from("user_sessions").insert({
          user_id: data.user.id,
          ip_address: null,
          user_agent: navigator.userAgent,
          is_active: true,
        });
      } catch (sessionError) {
        console.error("Error registering session:", sessionError);
      }
    }
    
    return { error };
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    if (user?.id) {
      try {
        await supabase
          .from("user_sessions")
          .update({ is_active: false, logout_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("is_active", true);
      } catch (error) {
        console.error("Error updating session on logout:", error);
      }
    }
    
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setCompany(null);
    setSystemRole(null);
    setRole(null);
    setPermissions(null);
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (!error && user?.id) {
      // Atualizar flag must_change_password
      await supabase
        .from("profiles")
        .update({ must_change_password: false } as any)
        .eq("user_id", user.id);
      
      // Refresh profile
      await fetchUserData(user.id);
    }

    return { error };
  };

  const isSystemAdmin = systemRole === "system_admin";
  // isCompanyAdmin: true se system_role="admin" OU se role legado="admin" (e não é system_admin)
  const isCompanyAdmin = (systemRole === "admin") || (role === "admin" && systemRole !== "system_admin");
  // isAdmin legacy: considera tanto system_role quanto role da tabela user_roles
  const isAdmin = role === "admin" || systemRole === "admin" || isSystemAdmin;
  const isEditor = role === "editor";
  const canEdit = isAdmin || isEditor || isCompanyAdmin;
  const mustChangePassword = profile?.must_change_password || false;

  const canAccessMenu = useCallback((menuId: string): boolean => {
    if (isSystemAdmin) return false; // System admin não acessa menus da empresa
    if (isCompanyAdmin) return true;
    if (!permissions) return true;
    return permissions.visible_menus.includes(menuId);
  }, [isSystemAdmin, isCompanyAdmin, permissions]);

  const canAccessManagement = useCallback((sectionId: string): boolean => {
    if (isSystemAdmin) return false;
    if (isCompanyAdmin) return true;
    if (!permissions) return true;
    return permissions.visible_management_sections.includes(sectionId);
  }, [isSystemAdmin, isCompanyAdmin, permissions]);

  const canAccessProject = useCallback((projectId: string): boolean => {
    if (isSystemAdmin) return false;
    if (isCompanyAdmin) return true;
    if (!permissions) return true;
    if (!permissions.allowed_project_ids || permissions.allowed_project_ids.length === 0) return true;
    return permissions.allowed_project_ids.includes(projectId);
  }, [isSystemAdmin, isCompanyAdmin, permissions]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        company,
        systemRole,
        role,
        permissions,
        isLoading,
        isSystemAdmin,
        isCompanyAdmin,
        isAdmin,
        isEditor,
        canEdit,
        mustChangePassword,
        canAccessMenu,
        canAccessManagement,
        canAccessProject,
        refreshPermissions,
        signIn,
        signUp,
        signOut,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}