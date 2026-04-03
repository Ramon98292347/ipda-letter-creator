import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

async function fileFromWebPath(webPath: string, filenamePrefix: string): Promise<File> {
  const response = await fetch(webPath);
  const blob = await response.blob();
  const extension = blob.type?.split("/")[1] || "jpg";
  const filename = `${filenamePrefix}-${Date.now()}.${extension}`;
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

export async function captureNativeImage() {
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 90,
    correctOrientation: true,
  });

  if (!photo.webPath) return null;
  return fileFromWebPath(photo.webPath, "camera");
}

export async function pickNativeImage() {
  const photo = await Camera.getPhoto({
    source: CameraSource.Photos,
    resultType: CameraResultType.Uri,
    quality: 90,
    correctOrientation: true,
  });

  if (!photo.webPath) return null;
  return fileFromWebPath(photo.webPath, "gallery");
}
