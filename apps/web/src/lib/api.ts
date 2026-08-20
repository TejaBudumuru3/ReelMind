const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
