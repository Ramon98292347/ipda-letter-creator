import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

let channelReady = false;

function toPermission(value: string): NotificationPermission {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "default";
}

export async function getLocalNotificationPermissionStatus(): Promise<NotificationPermission> {
  if (!Capacitor.isNativePlatform()) {
    return typeof Notification !== "undefined" ? Notification.permission : "default";
  }
  const status = await LocalNotifications.checkPermissions();
  return toPermission(String(status.display || "prompt"));
}

export async function requestLocalNotificationPermission(): Promise<NotificationPermission> {
  if (!Capacitor.isNativePlatform()) {
    if (typeof Notification === "undefined") return "denied";
    return Notification.requestPermission();
  }
  const status = await LocalNotifications.requestPermissions();
  return toPermission(String(status.display || "prompt"));
}

async function ensureAndroidChannel() {
  if (!Capacitor.isNativePlatform() || channelReady) return;
  await LocalNotifications.createChannel({
    id: "default",
    name: "Notificacoes",
    description: "Alertas do sistema",
    importance: 4,
    visibility: 1,
  });
  channelReady = true;
}

function buildNumericId(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || Date.now();
}

export async function showNativeLocalNotification(title: string, body: string, stableId: string) {
  if (!Capacitor.isNativePlatform()) return;
  await ensureAndroidChannel();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: buildNumericId(stableId),
        title,
        body,
        schedule: { at: new Date(Date.now() + 200) },
        channelId: "default",
      },
    ],
  });
}
