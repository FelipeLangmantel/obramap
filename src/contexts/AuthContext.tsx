import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "editor" | "viewer";

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
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
  role: AppRole | null;
  permissions: UserPermission | null;
  isLoading: boolean;
  isAdmin: boolean;
  isEditor: boolean;
  canEdit: boolean;
  canAccessMenu: (menuId: string) => boolean;
  canAccessManagement: (sectionId: string) => boolean;
  canAccessProject: (projectId: string) => boolean;
  refreshPermissions: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_MENUS = ["dashboard", "producao", "financeiro", "suprimentos", "planejamento", "mapa", "graficos"];
const DEFAULT_MANAGEMENT = ["projetos", "quadras", "macros", "escopos", "insumos", "fornecedores", "mao_de_obra", "usuarios"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<UserPermission | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // Fetch role using RPC
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
        // No permissions set = full access
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
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer Supabase calls with setTimeout to prevent deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setPermissions(null);
        }

        if (event === "SIGNED_OUT") {
          setProfile(null);
          setRole(null);
          setPermissions(null);
        }
      }
    );

    // THEN check for existing session
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
        (payload) => {
          console.log('Permissions changed:', payload);
          refreshPermissions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Role changed:', payload);
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
    
    // Register session on successful login
    if (!error && data.user) {
      try {
        await supabase.from("user_sessions").insert({
          user_id: data.user.id,
          ip_address: null, // Could be fetched from an external service if needed
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
    // Mark current session as inactive before signing out
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
    setRole(null);
    setPermissions(null);
  };

  const isAdmin = role === "admin";
  const isEditor = role === "editor";
  const canEdit = isAdmin || isEditor;

  // Permission check functions
  const canAccessMenu = useCallback((menuId: string): boolean => {
    if (isAdmin) return true; // Admins have full access
    if (!permissions) return true; // No permissions set = full access
    return permissions.visible_menus.includes(menuId);
  }, [isAdmin, permissions]);

  const canAccessManagement = useCallback((sectionId: string): boolean => {
    if (isAdmin) return true; // Admins have full access
    if (!permissions) return true; // No permissions set = full access
    return permissions.visible_management_sections.includes(sectionId);
  }, [isAdmin, permissions]);

  const canAccessProject = useCallback((projectId: string): boolean => {
    if (isAdmin) return true; // Admins have full access
    if (!permissions) return true; // No permissions set = full access
    if (!permissions.allowed_project_ids || permissions.allowed_project_ids.length === 0) return true; // No restriction
    return permissions.allowed_project_ids.includes(projectId);
  }, [isAdmin, permissions]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        permissions,
        isLoading,
        isAdmin,
        isEditor,
        canEdit,
        canAccessMenu,
        canAccessManagement,
        canAccessProject,
        refreshPermissions,
        signIn,
        signUp,
        signOut,
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
