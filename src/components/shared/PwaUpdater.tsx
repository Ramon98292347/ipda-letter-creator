import { useEffect } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const LAST_CHECK_AT_KEY = "ipda_sw_last_check_at";
const HANDLED_VERSION_KEY = "ipda_sw_handled_version";

function normalizeWorkerVersion(worker: ServiceWorker | null | undefined): string {
  return String(worker?.scriptURL || "").split("?")[0] || "";
}

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

    const shouldHandleWorker = (worker: ServiceWorker | null | undefined) => {
      const nextVersion = normalizeWorkerVersion(worker);
      if (!nextVersion) return false;

      const currentVersion = normalizeWorkerVersion(navigator.serviceWorker.controller || null);
      if (currentVersion && nextVersion === currentVersion) return false;

      const lastHandled = sessionStorage.getItem(HANDLED_VERSION_KEY) || "";
      if (lastHandled === nextVersion) return false;

      sessionStorage.setItem(HANDLED_VERSION_KEY, nextVersion);
      return true;
    };

    const maybeCheckForUpdate = async (reg: ServiceWorkerRegistration) => {
      const now = Date.now();
      const lastCheck = Number(localStorage.getItem(LAST_CHECK_AT_KEY) || "0");
      if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
      localStorage.setItem(LAST_CHECK_AT_KEY, String(now));
      await reg.update();
    };

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.ready.then((reg) => {
      // If there is already an update waiting, apply it immediately.
      if (reg.waiting && navigator.serviceWorker.controller && shouldHandleWorker(reg.waiting)) {
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
          if (newWorker.state === "installed" && navigator.serviceWorker.controller && shouldHandleWorker(newWorker)) {
            toast.info("Atualizando o sistema...", {
              description: "Nova versao encontrada. Recarregando automaticamente.",
              duration: 3000,
            });
            forceActivate(newWorker);
          }
        });
      });

      // Check periodically to avoid stale cache for users that keep the app open.
      void maybeCheckForUpdate(reg);
      intervalId = window.setInterval(() => {
        void maybeCheckForUpdate(reg);
      }, UPDATE_CHECK_INTERVAL_MS);
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
