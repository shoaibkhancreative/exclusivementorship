import React, { Suspense, createContext, lazy, useCallback, useContext, useMemo, useState } from "react";

const UnlockModal = lazy(() => import("../components/UnlockModal").then((m) => ({ default: m.UnlockModal })));

interface UnlockModalContextValue {
  openUnlockModal: () => void;
}

const UnlockModalContext = createContext<UnlockModalContextValue>({
  openUnlockModal: () => {}
});

export function UnlockModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const openUnlockModal = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ openUnlockModal }), [openUnlockModal]);

  return (
    <UnlockModalContext.Provider value={value}>
      {children}
      {open && (
        <Suspense fallback={null}>
          <UnlockModal onClose={close} />
        </Suspense>
      )}
    </UnlockModalContext.Provider>
  );
}

export function useUnlockModal() {
  return useContext(UnlockModalContext);
}
