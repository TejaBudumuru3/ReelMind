"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STAGES = [
  "Connecting to platform APIs...",
  "Extracting video metadata and statistics...",
  "Downloading audio streams into memory...",
  "Running Whisper AI transcription...",
  "Chunking text into semantic segments...",
  "Generating NVIDIA Jina vector embeddings...",
  "Storing embeddings in pgvector database...",
  "Finalizing analysis pipeline..."
];

export default function ProcessingOverlay({ jobAStatus, jobBStatus }: { jobAStatus: string, jobBStatus: string }) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={styles.overlay}>
      <div className="glass-panel" style={styles.card}>
        <div style={styles.loader}></div>
        <h2 style={styles.title}>Analyzing Videos</h2>
        
        <div style={styles.statusContainer}>
          <div style={styles.statusRow}>
            <span>Video A:</span>
            <span style={{ color: jobAStatus === "COMPLETED" ? "var(--accent-cyan)" : "var(--text-muted)" }}>
              {jobAStatus}
            </span>
          </div>
          <div style={styles.statusRow}>
            <span>Video B:</span>
            <span style={{ color: jobBStatus === "COMPLETED" ? "var(--accent-cyan)" : "var(--text-muted)" }}>
              {jobBStatus}
            </span>
          </div>
        </div>

        <div style={styles.stageWrapper}>
          <AnimatePresence mode="wait">
            <motion.p
              key={stageIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              style={styles.stageText}
            >
              &gt; {STAGES[stageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(9, 9, 11, 0.8)",
    backdropFilter: "blur(4px)",
    zIndex: 50,
  },
  card: {
    padding: "3rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.5rem",
    width: "100%",
    maxWidth: "450px",
  },
  loader: {
    width: "48px",
    height: "48px",
    border: "3px solid var(--border-light)",
    borderTopColor: "var(--accent-cyan)",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 600,
  },
  statusContainer: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    background: "rgba(0,0,0,0.3)",
    padding: "1rem",
    borderRadius: "8px",
  },
  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.9rem",
    fontFamily: "monospace",
  },
  stageWrapper: {
    height: "2rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "1rem",
    width: "100%",
  },
  stageText: {
    color: "var(--accent-purple)",
    fontFamily: "monospace",
    fontSize: "0.85rem",
    textAlign: "center",
  }
};
