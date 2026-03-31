import { useEffect } from "react";
import { toast } from "sonner";

export function PwaUpdater() {
  useEffect(() => {
    // Apenas com suporte a SW
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // Existe uma versão nova esperando
                toast.info("Nova Atualização de Sistema!", {
                  description: "Uma nova versão mais rápida e com melhorias está pronta para uso.",
                  duration: Infinity, // Não fecha sozinho
                  action: {
                    label: "Atualizar Agora",
                    onClick: () => {
                      newWorker.postMessage({ type: "SKIP_WAITING" });
                    },
                  },
                });
              }
            });
          }
        });
      });

      // Recarrega a página automaticamente assim que a nova versão assumir o controle (após skip waiting)
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }, []);

  return null;
}
