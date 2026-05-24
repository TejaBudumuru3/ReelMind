"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ingestVideo } from "@/lib/api";
import VideoCard, { VideoData } from "@/components/VideoCard";
import ChatPanel from "@/components/ChatPanel";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import { getHistoryAction } from "@/app/actions";
import { Clock, Video, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.id;
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobA = searchParams.get("jobA");
  const jobB = searchParams.get("jobB");

  const [jobAStatus, setJobAStatus] = useState(jobA ? "PENDING" : "NONE");
  const [jobBStatus, setJobBStatus] = useState(jobB ? "PENDING" : "NONE");
  const [videoA, setVideoA] = useState<VideoData | null>(null);
  const [videoB, setVideoB] = useState<VideoData | null>(null);
  const [jobAError, setJobAError] = useState<string | null>(null);
  const [jobBError, setJobBError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    getHistoryAction().then(data => setHistory(data)).catch(console.error);
    const pollJob = async (jobId: string, setStatus: (s: string) => void, setVideo: (v: VideoData) => void) => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/job/${jobId}/status`);
        const data = await res.json();
        setStatus(data.status);
        if (data.status === "COMPLETED" && data.job_data) {
          setVideo(data.job_data);
        }
        return data.status;
      } catch {
        return null;
      }
    };

    const interval = setInterval(async () => {
      let aDone = !jobA || ["COMPLETED", "FAILED", "NONE"].includes(jobAStatus);
      let bDone = !jobB || ["COMPLETED", "FAILED", "NONE"].includes(jobBStatus);

      if (!aDone && jobA) {
        const s = await pollJob(jobA, setJobAStatus, setVideoA);
        if (s && ["COMPLETED", "FAILED"].includes(s)) aDone = true;
      }
      if (!bDone && jobB) {
        const s = await pollJob(jobB, setJobBStatus, setVideoB);
        if (s && ["COMPLETED", "FAILED"].includes(s)) bDone = true;
      }

      if (aDone && bDone) clearInterval(interval);
    }, 3000);

    // Immediate first poll
    if (jobA && !["COMPLETED", "FAILED", "NONE"].includes(jobAStatus)) {
      pollJob(jobA, setJobAStatus, setVideoA);
    }
    if (jobB && !["COMPLETED", "FAILED", "NONE"].includes(jobBStatus)) {
      pollJob(jobB, setJobBStatus, setVideoB);
    }

    return () => clearInterval(interval);
  }, [jobA, jobB]);

  const handleRetry = async (jobKey: "jobA" | "jobB", newUrl: string) => {
    try {
      if (jobKey === "jobA") setJobAStatus("PENDING");
      if (jobKey === "jobB") setJobBStatus("PENDING");
      
      const res = await ingestVideo(newUrl, sessionId, jobKey === "jobA" ? "A" : "B");
      
      const newQuery = new URLSearchParams(searchParams.toString());
      newQuery.set(jobKey, res.job_id);
      router.replace(`/session/${sessionId}?${newQuery.toString()}`);
    } catch (e: any) {
      console.error("Retry failed:", e);
      if (jobKey === "jobA") {
        setJobAStatus("FAILED");
        setJobAError(e.message);
      }
      if (jobKey === "jobB") {
        setJobBStatus("FAILED");
        setJobBError(e.message);
      }
    }
  };

  const isProcessing = 
    (jobAStatus !== "NONE" && !["COMPLETED", "FAILED"].includes(jobAStatus)) || 
    (jobBStatus !== "NONE" && !["COMPLETED", "FAILED"].includes(jobBStatus));

  return (
    <div className="session-layout">
      {isProcessing && <ProcessingOverlay jobAStatus={jobAStatus} jobBStatus={jobBStatus} />}
      
      <div 
        className="history-sidebar" 
        style={{ 
          width: isSidebarOpen ? '250px' : '0px', 
          opacity: isSidebarOpen ? 1 : 0, 
          transition: 'all 0.3s ease',
          padding: isSidebarOpen ? undefined : 0,
          border: 'none',
          pointerEvents: isSidebarOpen ? 'auto' : 'none'
        }}
      >
        <div style={{ minWidth: '230px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ ...styles.sidebarTitle, marginBottom: 0 }}><Clock size={16} /> History</h2>
            <button 
              onClick={() => router.push('/')}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: 'var(--accent-cyan)', color: 'black', 
                border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                boxShadow: '0 2px 10px rgba(34, 211, 238, 0.2)'
              }}
            >
              <Plus size={14} /> New Chat
            </button>
          </div>
          {history.length === 0 ? (
            <p style={styles.emptyHistory}>No previous sessions.</p>
          ) : (
            history.map(session => (
              <div 
                key={session.id} 
                style={{
                  ...styles.historyItem, 
                  borderColor: session.id === sessionId ? 'var(--accent-cyan)' : 'var(--border-light)',
                  background: session.id === sessionId ? 'rgba(34, 211, 238, 0.05)' : 'transparent'
                }}
                onClick={() => {
                  let q = "";
                  const sortedJobs = [...(session.jobs || [])].reverse();
                  if (sortedJobs.length >= 2) q = `?jobA=${sortedJobs[0].id}&jobB=${sortedJobs[1].id}`;
                  else if (sortedJobs.length === 1) q = `?jobA=${sortedJobs[0].id}`;
                  router.push(`/session/${session.id}${q}`);
                }}
              >
                <div style={styles.historyDate}>
                  {new Date(session.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
                <div style={styles.historyMeta}>
                  <Video size={12} /> {session.jobs?.length || 0} videos
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="session-left">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={styles.toggleBtn}
          title="Toggle History Sidebar"
        >
          {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <div style={styles.videoGrid}>
          <VideoCard data={videoA || undefined} status={jobAStatus} onRetry={(newUrl) => handleRetry("jobA", newUrl)} errorMsg={jobAError} />
          <VideoCard data={videoB || undefined} status={jobBStatus} onRetry={(newUrl) => handleRetry("jobB", newUrl)} errorMsg={jobBError} />
        </div>
      </div>

      <div className="session-right glass-panel">
        <ChatPanel 
          sessionId={sessionId} 
          hasVideos={jobAStatus === "COMPLETED" || jobBStatus === "COMPLETED"} 
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toggleBtn: {
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: "0.25rem 0",
    marginBottom: "0.75rem",
    transition: "color 0.2s",
  },
  videoGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  sidebarTitle: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "var(--text-primary)",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.5rem",
  },
  emptyHistory: {
    color: "var(--text-muted)",
    fontSize: "0.85rem",
  },
  historyItem: {
    padding: "0.75rem",
    border: "1px solid var(--border-light)",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "border-color 0.2s, background 0.2s",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  historyDate: {
    fontSize: "0.9rem",
    color: "var(--text-primary)",
    fontWeight: 500,
  },
  historyMeta: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
  }
};
