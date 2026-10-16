import { jwtVerify, SignJWT } from "jose";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const JWT = new TextEncoder().encode(process.env.JWT_SECRET)


export async function createPayload(payload: { userId: string, email: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT)

}

export async function verifyToken(token?: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const data = await jwtVerify(token, JWT);
    return (data.payload.userId as string) || null;
  } catch {
    return null;
  }
}
export async function parseApiError(res: Response): Promise<string> {
  try {
    const err = await res.json();
    if (typeof err.detail === "string") {
      return err.detail;
    }
    if (Array.isArray(err.detail)) {
      let msg = err.detail[0]?.msg || "Failed request";
      if (msg.startsWith("Value error, ")) {
        msg = msg.replace("Value error, ", "");
      }
      return msg;
    }
    return err.message || "An unexpected error occurred";
  } catch {
    return "Failed to communicate with the server";
  }
}

export async function ingestVideo(url: string, sessionId: string, label?: string) {
  const res = await fetch(`${API_BASE}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, session_id: sessionId, label }),
  });

  if (!res.ok) {
    const errMsg = await parseApiError(res);
    throw new Error(errMsg);
  }
  return res.json();
}

export interface VideoFormatOption {
  format_id: string;
  type: 'audio' | 'video_combined' | 'video_hd';
  label: string;
  quality: string;
  ext: string;
  filesize_mb?: number | null;
  has_audio: boolean;
  has_video: boolean;
  note?: string;
}

export interface VideoDownloadFormatsResponse {
  title: string;
  thumbnail?: string;
  duration?: number;
  formats: VideoFormatOption[];
}

export async function getVideoDownloadFormats(url: string): Promise<VideoDownloadFormatsResponse> {
  const res = await fetch(`${API_BASE}/video/formats?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const errMsg = await parseApiError(res);
    throw new Error(errMsg);
  }
  return res.json();
}

export function getVideoDownloadUrl(url: string, formatId: string, ext?: string, title?: string): string {
  let endpoint = `${API_BASE}/video/download?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(formatId)}`;
  if (ext) endpoint += `&ext=${encodeURIComponent(ext)}`;
  if (title) endpoint += `&title=${encodeURIComponent(title)}`;
  return endpoint;
}

export async function ingestDownloadOnly(url: string, sessionId: string, label?: string) {
  const res = await fetch(`${API_BASE}/ingest/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, session_id: sessionId, label }),
  });

  if (!res.ok) {
    const errMsg = await parseApiError(res);
    throw new Error(errMsg);
  }
  return res.json();
}

