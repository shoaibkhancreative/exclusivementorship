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

  return <AdminSessionContext.Provider value={{ admin, loading, refresh }}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  return useContext(AdminSessionContext);
}
