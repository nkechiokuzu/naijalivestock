import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Request } from "express";

export const localUploadStorageEnabled =
  process.env.NODE_ENV !== "production" &&
  (process.env.LOCAL_UPLOAD_STORAGE === "true" ||
    !process.env.REPLIT_SIDECAR_ENDPOINT);

const uploadDirectory = path.resolve(
  process.env.LOCAL_UPLOAD_DIR ?? ".local-uploads",
);

function uploadFilePath(grantId: string): string {
  return path.join(uploadDirectory, `${grantId}.bin`);
}

export async function saveLocalUpload(
  req: Request,
  grantId: string,
  expectedSize: number,
): Promise<void> {
  await mkdir(uploadDirectory, { recursive: true });
  const filePath = uploadFilePath(grantId);
  try {
    await pipeline(req, createWriteStream(filePath, { flags: "wx" }));
    const fileInfo = await stat(filePath);
    if (fileInfo.size !== expectedSize) {
      await unlink(filePath);
      throw new Error("Uploaded file size did not match the signed request.");
    }
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
}

export async function localUploadExists(
  grantId: string,
  expectedSize: number,
): Promise<boolean> {
  try {
    const fileInfo = await stat(uploadFilePath(grantId));
    return fileInfo.isFile() && fileInfo.size === expectedSize;
  } catch {
    return false;
  }
}

export function localUploadReadStream(grantId: string) {
  return createReadStream(uploadFilePath(grantId));
}
