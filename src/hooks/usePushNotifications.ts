import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";
import { post } from "@/lib/api";
import { toast } from "sonner";

// Chave publica VAPID gerada para este projeto.
const VAPID_PUBLIC_KEY =
  "BPjB7Z77SSXtXOn2i2Cf1BjoStG0rzXf6_xb4oTBVyoyaF6udxa20x677X99L99Sqtj3tE_2wusQ9MhhdBkkskg";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Comentario: salva dados do usuario no IndexedDB para o service worker validar escopo
async function salvarUserNoSW(userData: { role?: string; scope_totvs_ids?: string[] }) {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("ipda-user-db", 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("user")) {
          db.createObjectStore("user");
        }
      };
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("user", "readwrite");
      const store = tx.objectStore("user");
      const req = store.put(userData, "user");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn("[push] erro ao salvar user no SW:", err);
  }
}

export function usePushNotifications(userId?: string, userRole?: string, scopeTotvsIds?: string[]) {
  const isNativeApp = Capacitor.isNativePlatform();
  const nativeEnabledKey = "native_notifications_enabled";
  const nativeTokenKey = "native_push_token";
  const supported =
    isNativeApp ||
    (typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window);

  const [permission, setPermission] = useState<NotificationPermission>(
    !supported ? "denied" : isNativeApp ? "default" : Notification.permission,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const mapNativePermission = useCallback((receive: string): NotificationPermission => {
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "default";
  }, []);

  const persistSubscription = useCallback(async (sub: PushSubscription) => {
    if (!userId) return;
    const p256dh = sub.getKey("p256dh");
    const auth = sub.getKey("auth");
    await post("notifications-api", {
      action: "subscribe-push",
      subscription: {
        endpoint: sub.endpoint,
        keys: {
          p256dh: p256dh ? btoa(String.fromCharCode(...new Uint8Array(p256dh))) : "",
          auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : "",
        },
      },
    }).catch((err) => console.warn("[push] falha ao sincronizar assinatura no backend:", err));
  }, [userId]);

  useEffect(() => {
    if (!supported) return;

    if (isNativeApp) {
      let cancelled = false;

      void (async () => {
        const status = await PushNotifications.checkPermissions();
        if (cancelled) return;

        const perm = mapNativePermission(status.receive);
        setPermission(perm);

        const enabled = localStorage.getItem(nativeEnabledKey) === "1";
        const savedToken = localStorage.getItem(nativeTokenKey);
        setSubscribed(perm === "granted" && enabled && Boolean(savedToken));

        await PushNotifications.removeAllListeners();

        await PushNotifications.addListener("registration", async (token) => {
          localStorage.setItem(nativeTokenKey, token.value);
          localStorage.setItem(nativeEnabledKey, "1");
          setPermission("granted");
          setSubscribed(true);
          await post("notifications-api", {
            action: "subscribe-native-push",
            token: token.value,
            platform: "android",
          }).catch((err) => console.warn("[push-native] falha ao registrar token no backend:", err));
        });

        await PushNotifications.addListener("registrationError", (error) => {
          console.warn("[push-native] registration error:", error);
        });

        await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
          const data = (event as { notification?: { data?: Record<string, unknown> } }).notification?.data || {};
          const url = String(data.url || "").trim();
          if (url) window.location.href = url;
        });

        if (enabled && perm === "granted") {
          await PushNotifications.register().catch((err) => {
            console.warn("[push-native] erro ao atualizar registro:", err);
          });
        }
      })();

      return () => {
        cancelled = true;
        void PushNotifications.removeAllListeners();
      };
    }

    // Comentario: verifica permissao e subscricao ao carregar
    const checkSubscription = async () => {
      setPermission(Notification.permission);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
      // Comentario: garante que a assinatura existente no navegador esteja salva no backend.
      // Isso recupera push com app fechado quando a linha foi removida da tabela por limpeza.
      if (sub) {
        await persistSubscription(sub);
      }
    };

    void checkSubscription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, isNativeApp, userId]);

  // Comentario: salva dados do usuario no SW para validar escopo de notificacoes
  const scopeKey = scopeTotvsIds ? scopeTotvsIds.join(",") : "";
  useEffect(() => {
    if (userRole && scopeTotvsIds) {
      void salvarUserNoSW({ role: userRole, scope_totvs_ids: scopeTotvsIds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole, scopeKey]);

  const subscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      if (isNativeApp) {
        const status = await PushNotifications.requestPermissions();
        const perm = mapNativePermission(status.receive);
        setPermission(perm);
        if (perm !== "granted") {
          localStorage.setItem(nativeEnabledKey, "0");
          setSubscribed(false);
          toast.error("Permissao de notificacao negada.");
          return;
        }

        localStorage.setItem(nativeEnabledKey, "1");
        await PushNotifications.register();
        toast.success("Notificacoes ativadas!");
        return;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Notificacoes bloqueadas! Libere no cadeado ao lado do site.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      setSubscribed(true);

      await persistSubscription(sub);
    } catch (err) {
      console.warn("[push] subscribe error:", err);
      toast.error("Nao foi possivel ativar as notificacoes.");
    } finally {
      setLoading(false);
    }
  }, [supported, isNativeApp, persistSubscription, mapNativePermission]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      if (isNativeApp) {
        const token = String(localStorage.getItem(nativeTokenKey) || "").trim();
        if (token) {
          await post("notifications-api", {
            action: "unsubscribe-native-push",
            token,
          }).catch((err) => console.warn("[push-native] falha ao remover token no backend:", err));
        }
        localStorage.removeItem(nativeTokenKey);
        localStorage.setItem(nativeEnabledKey, "0");
        setSubscribed(false);
        toast.success("Notificacoes desativadas.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        if (supabase && userId) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
      setSubscribed(false);
      toast.success("Notificacoes desativadas.");
    } finally {
      setLoading(false);
    }
  }, [supported, userId, isNativeApp]);

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
