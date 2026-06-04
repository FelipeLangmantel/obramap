import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type SystemRole = "system_admin" | "admin" | "editor" | "user";
export type AppRole = "admin" | "editor" | "viewer"; // Legacy - para compatibilidade

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
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
  can_edit: boolean | null; // null = herda do departamento
  holding_permissions: Record<string, boolean>;
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
  isViewer: boolean;
  canEdit: boolean;
  canSignDocuments: boolean;
  mustChangePassword: boolean;
  canAccessMenu: (menuId: string) => boolean;
  canAccessManagement: (sectionId: string) => boolean;
  canAccessProject: (projectId: string) => boolean;
  holdingCan: (acao: string) => boolean;
  requireEdit: () => boolean;
  refreshPermissions: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null; statusError?: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// DEFAULT restritivo: sem permissão cadastrada = só vê o painel inicial
const DEFAULT_MENUS = ["painel_inicial"];
// DEFAULT restritivo: sem permissão cadastrada = sem acesso a gerenciamento
const DEFAULT_MANAGEMENT: string[] = [];

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
      return;
    }
    if (hasFetchedUserData.current === userId) {
      return;
    }

    isFetchingUserData.current = true;

    // ⚡ BOOT OFFLINE INSTANTÂNEO: se offline, usar cache local do perfil
    // Evita esperar timeout de 3s antes de mostrar a tela
    const PROFILE_CACHE_KEY = `obramap_profile_${userId}`;
    const COMPANY_CACHE_KEY = `obramap_company_${userId}`;
    if (!navigator.onLine) {
      try {
        const cachedProfile = localStorage.getItem(PROFILE_CACHE_KEY);
        const cachedCompany = localStorage.getItem(COMPANY_CACHE_KEY);
        if (cachedProfile) {
          const p = JSON.parse(cachedProfile) as Profile;
          setProfile(p);
          setSystemRole(p.system_role);
          hasFetchedUserData.current = userId;
          if (cachedCompany) setCompany(JSON.parse(cachedCompany));
          isFetchingUserData.current = false;
          return; // Boot offline completo em <50ms
        }
      } catch { /* se cache corrompido, continua com fluxo normal */ }
    }

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
      // ⚡ Persistir perfil localmente para boot offline futuro (<50ms no próximo boot)
      try { localStorage.setItem(`obramap_profile_${userId}`, JSON.stringify(typedProfile)); } catch { /* quota */ }

      // ── Fase 2: Q2 + Q3 + Q4 em paralelo (todas independentes após profile) ──
      const parallelResults = await Promise.all([
        // Q2: company (precisa só de company_id do profile)
        typedProfile.company_id
          ? supabase.from("companies").select("id, name, slug, logo_url").eq("id", typedProfile.company_id).single()
          : Promise.resolve({ data: null, error: null }),
        // Q3: role via RPC (precisa só de userId)
        supabase.rpc("get_user_role", { _user_id: userId }),
        // Q4: permissions (precisa só de userId)
        supabase.from("user_permissions").select("*").eq("user_id", userId).maybeSingle(),
      ]);

      const companyData = parallelResults[0].data;
      const roleData    = parallelResults[1].data;
      const permData    = parallelResults[2].data;

      if (companyData) {
        setCompany(companyData as any);
        // ⚡ Cache company para boot offline
        try { localStorage.setItem(`obramap_company_${userId}`, JSON.stringify(companyData)); } catch { /* quota */ }
      }
      if (roleData)    setRole(roleData as AppRole);

      // ── Fase 3: Q5 condicional (depende de Q1.company_id + Q4.department) ──
      let deptPerm: any = null;
      const userDept     = permData?.department;
      const userCompanyId = typedProfile.company_id;

      if (userCompanyId && userDept && userDept !== 'geral') {
        const { data: deptData } = await supabase
          .from("department_permissions")
          .select("*")
          .eq("company_id", userCompanyId)
          .eq("department_name", userDept)
          .maybeSingle();
        deptPerm = deptData;
      }

      if (permData || deptPerm) {
        // Resolução: permissão individual tem prioridade, departamento é fallback
        const effectiveMenus =
          (permData?.visible_menus as string[])?.length > 0
            ? (permData.visible_menus as string[])
            : deptPerm?.visible_menus?.length > 0
              ? deptPerm.visible_menus as string[]
              : DEFAULT_MENUS;

        const effectiveMgmt =
          (permData?.visible_management_sections as string[])?.length > 0
            ? (permData.visible_management_sections as string[])
            : deptPerm?.visible_management_sections?.length > 0
              ? deptPerm.visible_management_sections as string[]
              : DEFAULT_MANAGEMENT;

        // can_edit: permissão individual sobrescreve, null herda do departamento
        const effectiveCanEdit: boolean | null =
          permData?.can_edit !== undefined && permData?.can_edit !== null
            ? (permData.can_edit as boolean)
            : deptPerm?.can_edit !== undefined && deptPerm?.can_edit !== null
              ? (deptPerm.can_edit as boolean)
              : null;

        setPermissions({
          id: permData?.id || "",
          user_id: userId,
          department: permData?.department || null,
          allowed_project_ids: permData?.allowed_project_ids || deptPerm?.allowed_project_ids || null,
          visible_menus: effectiveMenus,
          visible_management_sections: effectiveMgmt,
          can_edit: effectiveCanEdit,
          holding_permissions: (permData as any)?.holding_permissions || {},
        });
      } else {
        setPermissions(null);
      }

      hasFetchedUserData.current = userId;
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
      return;
    }
    authListenerRegistered.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {

        const sameLoadedUser = !!session?.user && hasFetchedUserData.current === session.user.id;
        const shouldSkipUiRebuild = sameLoadedUser && (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION" ||
          !isPageVisibleRef.current
        );

        if (shouldSkipUiRebuild && session?.user) {
          setSession(session);
          setUser(session.user);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setIsLoading(true);
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

    // Get initial session — com timeout para nunca travar o boot.
    // Se a rede estiver lenta/inexistente, liberamos isLoading em até 3s
    // (o onAuthStateChange completa o fluxo quando a sessão chegar).
    const sessionTimeout = setTimeout(() => {
      // Não travar a UI se o getSession() não responder
      // ⚡ 800ms (era 3000ms) — Supabase Auth usa localStorage, retorna rápido offline
      setIsLoading(false);
    }, 800);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(sessionTimeout);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          fetchUserData(session.user.id).finally(() => {
            setIsLoading(false);
          });
        } else {
          setIsLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(sessionTimeout);
        setIsLoading(false);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // ✅ Array vazio - nunca re-executa

  // Set up realtime subscription for permission changes
  useEffect(() => {
    if (!user?.id) return;


    const channel = supabase
      .channel(`user-permissions-changes:${user.id}`)
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
          table: 'user_roles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          hasFetchedUserData.current = null;
          if (user?.id) fetchUserData(user.id);
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'department_permissions',
          filter: `company_id=eq.${profile?.company_id}`,
        },
        () => {
          hasFetchedUserData.current = null;
          if (user?.id) fetchUserData(user.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_modules',
          filter: profile?.company_id ? `company_id=eq.${profile.company_id}` : undefined,
        },
        () => {
          hasFetchedUserData.current = null;
          if (user?.id) fetchUserData(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile?.company_id, refreshPermissions]);


  // Manter last_active_at atualizado a cada 5 minutos e verificar inatividade (20min)
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutos — alinhado com pg_cron cleanup
    const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos (era 2min — reduzido para diminuir tráfego Realtime)
    let lastActivity = Date.now();

    // Track user activity
    const trackActivity = () => { lastActivity = Date.now(); };
    window.addEventListener("mousemove", trackActivity, { passive: true });
    window.addEventListener("keydown", trackActivity, { passive: true });
    window.addEventListener("click", trackActivity, { passive: true });
    window.addEventListener("touchstart", trackActivity, { passive: true });

    const interval = setInterval(async () => {
      const now = Date.now();
      const inactiveDuration = now - lastActivity;

      if (inactiveDuration >= INACTIVITY_LIMIT_MS) {
        // Encerrar sessão por inatividade
        try {
          await supabase
            .from("user_sessions")
            .update({ 
              is_active: false, 
              logout_at: new Date().toISOString(),
              termination_reason: "inatividade",
            } as any)
            .eq("user_id", user.id)
            .eq("is_active", true);
        } catch { /* silencioso */ }
        await supabase.auth.signOut();
        return;
      }

      // Heartbeat — atualizar last_active_at
      await supabase
        .from("user_sessions")
        .update({ last_active_at: new Date().toISOString() } as any)
        .eq("user_id", user.id)
        .eq("is_active", true);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      window.removeEventListener("mousemove", trackActivity);
      window.removeEventListener("keydown", trackActivity);
      window.removeEventListener("click", trackActivity);
      window.removeEventListener("touchstart", trackActivity);
    };
  }, [user]);

  // Detectar se a sessão do usuário foi encerrada por um admin
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('my-session-terminated')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_sessions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const newRecord = payload.new;
          if (newRecord && newRecord.is_active === false && newRecord.termination_reason === 'admin') {
            supabase.auth.signOut();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    
    if (!error && data.user) {
      // Reset fetch flag for new login
      hasFetchedUserData.current = null;

      // ✅ Registro de sessão em background — não bloqueia o retorno do login
      const userId = data.user.id;
      const ua = navigator.userAgent;
      const browser = ua.includes("Chrome") && !ua.includes("Edg") ? "Chrome"
        : ua.includes("Firefox") ? "Firefox"
        : ua.includes("Safari") && !ua.includes("Chrome") ? "Safari"
        : ua.includes("Edg") ? "Edge"
        : "Outro";
      const deviceType = /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";

      // Fire-and-forget: não usa await — login retorna imediatamente
      (async () => {
        try {
          // Capturar IP com timeout curto (não bloqueia login)
          let ipData = { ip: null as string|null, city: null as string|null, region: null as string|null };
          try {
            const ipRes = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(2000) });
            if (ipRes.ok) {
              const ipJson = await ipRes.json();
              ipData = { ip: ipJson.ip || null, city: ipJson.city || null, region: ipJson.region || null };
            }
          } catch { /* silencioso */ }

          // Encerrar sessões anteriores
          await supabase
            .from("user_sessions")
            .update({ is_active: false, logout_at: new Date().toISOString(), termination_reason: "novo_login" })
            .eq("user_id", userId)
            .eq("is_active", true);

          await supabase.from("user_sessions").insert({
            user_id: userId,
            ip_address: ipData.ip,
            city: ipData.city,
            region: ipData.region,
            country: "BR",
            user_agent: ua,
            browser,
            device_type: deviceType,
            is_active: true,
            last_active_at: new Date().toISOString(),
          } as any);
        } catch { /* silencioso — registro de sessão não é crítico */ }
      })();
    }

    return { error };
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const normalizedEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
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
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (!error) {
      const { error: statusError } = await (supabase as any).rpc("mark_own_password_changed");
      if (statusError) {
        return { error: null, statusError };
      }
      
      // Refresh profile
      const updatedUserId = data.user?.id || user?.id;
      if (updatedUserId) {
        hasFetchedUserData.current = null;
        await fetchUserData(updatedUserId);
      }
    }

    return { error, statusError: null };
  };

  const isSystemAdmin = systemRole === "system_admin";
  // isCompanyAdmin: true se system_role="admin" OU se role legado="admin" (e não é system_admin)
  const isCompanyAdmin = (systemRole === "admin") || (role === "admin" && systemRole !== "system_admin");
  // isAdmin legacy: considera tanto system_role quanto role da tabela user_roles
  const isAdmin = role === "admin" || systemRole === "admin" || isSystemAdmin;
  const isEditor = role === "editor";
  // Regras de canEdit — hierarquia estrita:
  // 1. system_admin e company_admin: sempre podem editar
  // 2. role='user' (viewer): NUNCA pode editar, sem exceção
  // 3. role='editor' com can_edit explícito: respeita o valor
  // 4. role='editor' sem can_edit configurado: pode editar por padrão
  const isViewer = !isAdmin && !isCompanyAdmin && !isEditor;
  const canEdit =
    isViewer
      ? false  // viewer NUNCA edita
      : isAdmin || isCompanyAdmin
        ? true  // admin sempre edita
        : permissions?.can_edit === false
          ? false  // editor com can_edit=false explícito: bloqueado
          : true;  // editor sem restrição: pode editar
  // canSignDocuments: permissão específica para assinar Diário/RDO sem ganhar edição geral
  const canSignDocuments =
    canEdit || permissions?.holding_permissions?.can_sign_documents === true;
  const mustChangePassword = profile?.must_change_password || false;

  const { toast: showToast } = useToast();
  const requireEdit = useCallback((): boolean => {
    if (canEdit) return true;
    showToast({
      title: "Sem permissão",
      description: "Você tem acesso de visualização apenas. Contate o administrador para solicitar permissão de edição.",
      variant: "destructive",
    });
    return false;
  }, [canEdit, showToast]);

  const canAccessMenu = useCallback((menuId: string): boolean => {
    if (isSystemAdmin) return false;
    if (isCompanyAdmin) return true;
    // Sem permissão cadastrada: admin vê tudo, outros não veem nada
    if (!permissions) return isAdmin;
    // Respeita exatamente o que o admin configurou — sem exceções hardcoded
    return permissions.visible_menus.includes(menuId);
  }, [isSystemAdmin, isCompanyAdmin, isAdmin, permissions]);

  const canAccessManagement = useCallback((sectionId: string): boolean => {
    if (isSystemAdmin) return false;
    if (isCompanyAdmin) return true;
    // Sem permissão cadastrada: admin vê tudo, outros não veem nada
    if (!permissions) return isAdmin;
    return permissions.visible_management_sections.includes(sectionId);
  }, [isSystemAdmin, isCompanyAdmin, isAdmin, permissions]);

  const holdingCan = useCallback((acao: string): boolean => {
    if (isCompanyAdmin || isSystemAdmin) return true;
    return permissions?.holding_permissions?.[acao] === true;
  }, [isCompanyAdmin, isSystemAdmin, permissions]);

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
        isViewer,
        canEdit,
        mustChangePassword,
        canAccessMenu,
        canAccessManagement,
        canAccessProject,
        holdingCan,
        requireEdit,
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
