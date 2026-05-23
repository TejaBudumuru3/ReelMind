"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ingestVideo } from "@/lib/api";
import VideoCard, { VideoData } from "@/components/VideoCard";
import ChatPanel from "@/components/ChatPanel";
import ProcessingOverlay from "@/components/ProcessingOverlay";

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

  useEffect(() => {
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
    } catch (e) {
      console.error("Retry failed:", e);
      if (jobKey === "jobA") setJobAStatus("FAILED");
      if (jobKey === "jobB") setJobBStatus("FAILED");
    }
  };

  const isProcessing = 
    (jobAStatus !== "NONE" && !["COMPLETED", "FAILED"].includes(jobAStatus)) || 
    (jobBStatus !== "NONE" && !["COMPLETED", "FAILED"].includes(jobBStatus));

  return (
    <div style={styles.layout}>
      {isProcessing && <ProcessingOverlay jobAStatus={jobAStatus} jobBStatus={jobBStatus} />}
      
      <div style={styles.leftPane}>
        <div style={styles.videoGrid}>
          <VideoCard data={videoA || undefined} status={jobAStatus} onRetry={(newUrl) => handleRetry("jobA", newUrl)} />
          <VideoCard data={videoB || undefined} status={jobBStatus} onRetry={(newUrl) => handleRetry("jobB", newUrl)} />
        </div>
      </div>

      <div style={styles.rightPane} className="glass-panel">
        <ChatPanel sessionId={sessionId} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: "flex",
    height: "100vh",
    width: "100vw",
    padding: "1rem",
    gap: "1rem",
    position: "relative",
  },
  leftPane: {
    width: "40%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  videoGrid: {
    display: "grid",
    gridTemplateRows: "1fr 1fr",
    gap: "1rem",
    height: "100%",
  },
  rightPane: {
    width: "60%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }
};
