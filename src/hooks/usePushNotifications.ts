import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";
import { post } from "@/lib/api";
import { getLocalNotificationPermissionStatus, requestLocalNotificationPermission } from "@/lib/native/localNotifications";

// Chave pública VAPID gerada para este projeto.
// A chave privada correspondente deve ser configurada como variável de ambiente
// VAPID_PRIVATE_KEY no Supabase (Edge Functions).
// Gerar novo par: npx web-push generate-vapid-keys
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

  useEffect(() => {
    if (!supported) return;

    if (isNativeApp) {
      void getLocalNotificationPermissionStatus().then((perm) => {
        setPermission(perm);
        const enabled = localStorage.getItem(nativeEnabledKey) === "1";
        const hasToken = Boolean(localStorage.getItem(nativeTokenKey));
        setSubscribed(perm === "granted" && enabled && hasToken);
      });
      return;
    }

    // Comentario: verifica permissao e subscrição ao carregar
    const checkSubscription = async () => {
      setPermission(Notification.permission);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    };

    void checkSubscription();

    // Comentario: revalida subscrição após permissão mudar (polling rápido)
    const timerId = setTimeout(() => {
      void checkSubscription();
    }, 500);

    return () => clearTimeout(timerId);
  }, [supported, isNativeApp]);

  useEffect(() => {
    if (!supported || !isNativeApp) return;

    const onRegistration = PushNotifications.addListener("registration", (token) => {
      const fcmToken = String(token?.value || "").trim();
      if (!fcmToken) return;
      localStorage.setItem(nativeTokenKey, fcmToken);
      if (userId) {
        post("notifications-api", {
          action: "subscribe-native-push",
          token: fcmToken,
          platform: "android",
        }).catch((err) => console.warn("[push-native] erro ao salvar token:", err));
      }
      setSubscribed(true);
    });

    const onRegistrationError = PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push-native] registrationError:", err);
    });

    return () => {
      void onRegistration.then((h) => h.remove());
      void onRegistrationError.then((h) => h.remove());
    };
  }, [supported, isNativeApp, userId]);

  useEffect(() => {
    if (!supported || !isNativeApp) return;
    const enabled = localStorage.getItem(nativeEnabledKey) === "1";
    if (!enabled) return;
    void PushNotifications.register().catch(() => undefined);
  }, [supported, isNativeApp]);

  // Comentario: salva dados do usuario no SW para validar escopo de notificacoes
  useEffect(() => {
    if (userRole && scopeTotvsIds) {
      void salvarUserNoSW({ role: userRole, scope_totvs_ids: scopeTotvsIds });
    }
  }, [userRole, scopeTotvsIds]);

  const subscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      if (isNativeApp) {
        // Android 13+ precisa desta permissao para exibir notificacoes.
        const localPerm = await requestLocalNotificationPermission();
        const pushPerm = await PushNotifications.requestPermissions();
        const granted = localPerm === "granted" && pushPerm.receive === "granted";
        setPermission(granted ? "granted" : "denied");
        if (granted) {
          localStorage.setItem(nativeEnabledKey, "1");
          await PushNotifications.register();
        } else {
          localStorage.setItem(nativeEnabledKey, "0");
          setSubscribed(false);
        }
        return;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        if (typeof window !== "undefined" && (window as any).toast) {
          (window as any).toast.error("Notificações bloqueadas! Libere no cadeado ao lado do site (barra de endereços).");
        } else {
          alert("Notificações bloqueadas! Libere no cadeado ao lado do site (barra de endereços).");
        }
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        // Comentario: userVisibleOnly: true é OBRIGATÓRIO pelo Chrome
        // O Service Worker ainda pode processar eventos em background
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // Comentario: marca como inscrito localmente (browser ja tem a subscription)
      setSubscribed(true);

      // Comentario: salva no backend em background — se falhar, nao impede o botao de sumir
      if (userId) {
        const p256dh = sub.getKey("p256dh");
        const auth = sub.getKey("auth");
        post("notifications-api", {
          action: "subscribe-push",
          subscription: {
            endpoint: sub.endpoint,
            keys: {
              p256dh: p256dh ? btoa(String.fromCharCode(...new Uint8Array(p256dh))) : "",
              auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : "",
            },
          },
        }).catch((err) => console.warn("[push] falha ao salvar no backend:", err));
      }
    } catch (err) {
      // Erro silencioso - pode ocorrer em algumas situações, mas não impede o funcionamento
    } finally {
      setLoading(false);
    }
  }, [supported, userId, isNativeApp]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      if (isNativeApp) {
        const token = localStorage.getItem(nativeTokenKey) || "";
        if (token && userId) {
          await post("notifications-api", {
            action: "unsubscribe-native-push",
            token,
          }).catch(() => undefined);
        }
        localStorage.setItem(nativeEnabledKey, "0");
        localStorage.removeItem(nativeTokenKey);
        setSubscribed(false);
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
    } finally {
      setLoading(false);
    }
  }, [supported, userId, isNativeApp]);

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
