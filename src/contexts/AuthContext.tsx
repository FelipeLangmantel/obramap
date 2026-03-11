import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SystemRole = "system_admin" | "admin" | "editor" | "user";
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

const DEFAULT_MENUS = ["mapa", "planejamento", "smart-planning", "producao", "custos", "suprimentos", "financeiro", "entrega", "diretoria", "graficos"];
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

  // ✅ Flags para controlar execução única
  const authListenerRegistered = useRef(false);
  const isFetchingUserData = useRef(false);
  const hasFetchedUserData = useRef<string | null>(null);
  const isPageVisibleRef = useRef(typeof document === "undefined" ? true : !document.hidden);

  const fetchUserData = useCallback(async (userId: string) => {
    // ✅ Proteção contra execução duplicada
    if (isFetchingUserData.current) {
      console.log("[AUTH EFFECT] fetchUserData already in progress, skipping");
      return;
    }
    if (hasFetchedUserData.current === userId) {
      console.log("[AUTH EFFECT] fetchUserData already completed for user:", userId);
      return;
    }

    isFetchingUserData.current = true;
    console.log("[AUTH EFFECT] fetchUserData starting for user:", userId);

    try {
      // Fetch profile with new fields
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      // If profile doesn't exist (user deleted) or is inaccessible, force sign out
      if (profileError) {
        console.error("Error fetching profile:", profileError);
        await supabase.auth.signOut();
        return;
      }

      if (!profileData) {
        // Profile removed => user must lose access immediately
        await supabase.auth.signOut();
        return;
      }

      // Block inactive users
      const status = ((profileData as any).status || "active") as string;
      if (status !== "active") {
        await supabase.auth.signOut();
        return;
      }

      const typedProfile: Profile = {
        id: profileData.id,
        user_id: profileData.user_id,
        display_name: profileData.display_name,
        email: profileData.email,
        company_id: profileData.company_id,
        status,
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

      hasFetchedUserData.current = userId;
      console.log("[AUTH EFFECT] fetchUserData completed for user:", userId);
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      isFetchingUserData.current = false;
    }
  }, []);

  const refreshPermissions = useCallback(async () => {
    if (user?.id) {
      // Reset flag to allow re-fetch
      hasFetchedUserData.current = null;
      await fetchUserData(user.id);
    }
  }, [user?.id, fetchUserData]);

  // ✅ Monitorar visibilidade da aba para evitar reconstrução visual indevida
  useEffect(() => {
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // ✅ Listener registrado APENAS UMA VEZ com array vazio
  useEffect(() => {
    if (authListenerRegistered.current) {
      console.log("[AUTH EFFECT] Listener already registered, skipping");
      return;
    }
    authListenerRegistered.current = true;
    console.log("[AUTH EFFECT] Registering auth listener");

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[AUTH EFFECT] Auth state changed:", event);
        
        // ✅ Ignorar eventos que não exigem reconstrução da UI
        // TOKEN_REFRESHED e INITIAL_SESSION com dados já carregados não devem causar flash
        if (session?.user && hasFetchedUserData.current === session.user.id) {
          if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
            console.log("[AUTH EFFECT] Skipping refetch - data already loaded, event:", event);
            // Apenas atualizar session/user sem disparar loading
            setSession(session);
            setUser(session.user);
            return;
          }
        }
        
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // ✅ Manter isLoading=true enquanto fetchUserData roda
          // Evita flash de "Acesso Negado" no CompanyUserGuard
          setIsLoading(true);
          // Defer to avoid race conditions
          setTimeout(() => {
            fetchUserData(session.user.id).finally(() => {
              setIsLoading(false);
            });
          }, 0);
        } else {
          setProfile(null);
          setCompany(null);
          setSystemRole(null);
          setRole(null);
          setPermissions(null);
          hasFetchedUserData.current = null;
        }

        if (event === "SIGNED_OUT") {
          setProfile(null);
          setCompany(null);
          setSystemRole(null);
          setRole(null);
          setPermissions(null);
          hasFetchedUserData.current = null;
        }
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[AUTH EFFECT] Initial session check");
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

    return () => {
      console.log("[AUTH EFFECT] Unsubscribing auth listener");
      subscription.unsubscribe();
    };
  }, []); // ✅ Array vazio - nunca re-executa

  // Set up realtime subscription for permission changes
  useEffect(() => {
    if (!user?.id) return;

    console.log("[AUTH EFFECT] Setting up realtime for user:", user.id);

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
          console.log("[AUTH EFFECT] Permission change detected");
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
          console.log("[AUTH EFFECT] Profile change detected");
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
      // Reset fetch flag for new login
      hasFetchedUserData.current = null;
      
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
    
    // Reset all flags
    hasFetchedUserData.current = null;
    
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
      hasFetchedUserData.current = null;
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
