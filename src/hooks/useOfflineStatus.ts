import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [lastChangedAt, setLastChangedAt] = useState<string>(new Date().toISOString());

  useEffect(() => {
    let active = true;
    let nativeListener: { remove: () => Promise<void> } | null = null;

    const updateOnlineState = (online: boolean) => {
      setIsOnline(online);
      setLastChangedAt(new Date().toISOString());
    };

    const handleOnline = () => {
      updateOnlineState(true);
    };
    const handleOffline = () => {
      updateOnlineState(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (Capacitor.isNativePlatform()) {
      void Network.getStatus().then((status) => {
        if (!active) return;
        updateOnlineState(Boolean(status.connected));
      });

      void Network.addListener("networkStatusChange", (status) => {
        if (!active) return;
        updateOnlineState(Boolean(status.connected));
      }).then((listener) => {
        nativeListener = listener;
      });
    }

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (nativeListener) {
        void nativeListener.remove();
      }
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
    lastChangedAt,
  };
}
