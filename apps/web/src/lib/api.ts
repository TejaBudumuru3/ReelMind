const API_BASE = "http://localhost:8000";

export async function ingestVideo(url: string, sessionId: string, label?: string) {
  const res = await fetch(`${API_BASE}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, session_id: sessionId, label }),
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to ingest video");
  }
  return res.json();
}
