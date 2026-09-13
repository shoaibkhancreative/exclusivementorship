import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { UnlockModal } from "../components/UnlockModal";

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
      {open && <UnlockModal onClose={close} />}
    </UnlockModalContext.Provider>
  );
}

export function useUnlockModal() {
  return useContext(UnlockModalContext);
}
