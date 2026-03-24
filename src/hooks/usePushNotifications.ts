import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { post } from "@/lib/api";

// Chave pública VAPID gerada para este projeto.
// A chave privada correspondente deve ser configurada como variável de ambiente
// VAPID_PRIVATE_KEY na Edge Function "send-push".
const VAPID_PUBLIC_KEY =
  "BCL79BMzLEMZQ27ywC1VC0Ya6I78gJAOdougXxpxUnIKbvneOnzMWu7hxjoTy1VAAkQiXCdmND8fD5xI18asdns";

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

export function usePushNotifications(userId?: string) {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : "denied",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission);
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub));
    });
  }, [supported]);

  async function subscribe() {
    if (!supported) return;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      if (userId) {
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
        });
      }

      setSubscribed(true);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    if (!supported) return;
    setLoading(true);
    try {
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
  }

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
