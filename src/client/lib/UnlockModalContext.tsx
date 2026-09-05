import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { UnlockModal } from "../components/UnlockModal";

interface UnlockModalContextValue {
  /** Opens the checkout popup. Safe to call from anywhere in the app. */
  openUnlockModal: () => void;
}

const UnlockModalContext = createContext<UnlockModalContextValue>({
  openUnlockModal: () => {}
});

/**
 * Mounted once near the root of the app. Every trigger — the Class 6 play
 * button, the profile card's Unlock button — shares this single modal
 * instance instead of each page building its own checkout, so there's only
 * ever one payment flow in the whole product.
 */
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
