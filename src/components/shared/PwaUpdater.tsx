import { useEffect } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

export function PwaUpdater() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    let intervalId: number | null = null;

    const forceActivate = (worker: ServiceWorker | null | undefined) => {
      if (!worker) return;
      worker.postMessage({ type: "SKIP_WAITING" });
    };

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.ready.then((reg) => {
      // If there is already an update waiting, apply it immediately.
      if (reg.waiting && navigator.serviceWorker.controller) {
        toast.info("Atualizando o sistema...", {
          description: "Nova versao encontrada. Recarregando automaticamente.",
          duration: 3000,
        });
        forceActivate(reg.waiting);
      }

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            toast.info("Atualizando o sistema...", {
              description: "Nova versao encontrada. Recarregando automaticamente.",
              duration: 3000,
            });
            forceActivate(newWorker);
          }
        });
      });

      // Check periodically to avoid stale cache for users that keep the app open.
      void reg.update();
      intervalId = window.setInterval(() => {
        void reg.update();
      }, 60 * 1000);
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
