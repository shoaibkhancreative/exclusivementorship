import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../../lib/api";

interface AdminMeResponse {
  authenticated: boolean;
  email?: string;
}

interface AdminSessionContextValue {
  admin: AdminMeResponse | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionContextValue>({
  admin: null,
  loading: true,
  refresh: async () => {}
});

/**
 * Deliberately separate from the student SessionContext — it reads
 * /api/admin/me (the em_admin_session cookie), never /api/auth/me. Never
 * nest this inside, or alongside code that assumes, the student session.
 */
export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminMeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AdminMeResponse>("/admin/me");
      setAdmin(data);
    } catch {
      setAdmin({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AdminSessionContext.Provider value={{ admin, loading, refresh }}>{children}</AdminSessionContext.Provider>
  );
}

export function useAdminSession() {
  return useContext(AdminSessionContext);
}
