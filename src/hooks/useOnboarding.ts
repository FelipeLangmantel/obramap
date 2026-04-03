import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useOnboarding(actionKey: string) {
  const { user } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    
    supabase
      .from("user_onboarding")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("action_key", actionKey)
      .maybeSingle()
      .then(({ data }) => {
        setShouldShow(!data);
        setLoading(false);
      });
  }, [user?.id, actionKey]);

  const markAsSeen = async () => {
    if (!user?.id) return;
    await supabase.from("user_onboarding").insert({
      user_id: user.id,
      action_key: actionKey,
    } as any);
    setShouldShow(false);
  };

  return { shouldShow: !loading && shouldShow, markAsSeen };
}
