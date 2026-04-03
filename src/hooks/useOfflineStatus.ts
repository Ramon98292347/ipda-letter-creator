import { useEffect, useState } from "react";

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [lastChangedAt, setLastChangedAt] = useState<string>(new Date().toISOString());

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastChangedAt(new Date().toISOString());
    };
    const handleOffline = () => {
      setIsOnline(false);
      setLastChangedAt(new Date().toISOString());
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
    lastChangedAt,
  };
}

