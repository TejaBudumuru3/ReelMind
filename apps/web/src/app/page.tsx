"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Video, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { createSessionAction } from "./actions";
import { ingestVideo } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlA && !urlB) {
      setError("Please provide at least one video URL.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const sessionId = await createSessionAction();
      
      const jobs = [];
      if (urlA) jobs.push(ingestVideo(urlA, sessionId, "A"));
      if (urlB) jobs.push(ingestVideo(urlB, sessionId, "B"));
      
      const results = await Promise.all(jobs);
      
      let query = "";
      if (urlA && urlB) {
          query = `?jobA=${results[0].job_id}&jobB=${results[1].job_id}`;
      } else if (urlA) {
          query = `?jobA=${results[0].job_id}`;
      } else if (urlB) {
          query = `?jobB=${results[0].job_id}`;
      }
      
      router.push(`/session/${sessionId}${query}`);
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  };

  return (
    <main style={styles.main}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={styles.container}
        className="glass-panel"
      >
        <div style={styles.header}>
          <div style={styles.iconWrapper}>
            <Sparkles size={32} color="var(--accent-cyan)" />
          </div>
          <h1 style={styles.title}>Reel<span className="text-gradient">Mind</span></h1>
          <p style={styles.subtitle}>AI-Powered Video Performance Comparison</p>
        </div>

        <form onSubmit={handleAnalyze} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Video A URL</label>
            <div style={styles.inputWrapper}>
              <Video size={20} color="var(--text-muted)" style={styles.inputIcon} />
              <input
                type="url"
                value={urlA}
                onChange={(e) => setUrlA(e.target.value)}
                placeholder="https://youtube.com/shorts/..."
                style={styles.input}
                disabled={loading}
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Video B URL</label>
            <div style={styles.inputWrapper}>
              <Video size={20} color="var(--text-muted)" style={styles.inputIcon} />
              <input
                type="url"
                value={urlB}
                onChange={(e) => setUrlB(e.target.value)}
                placeholder="https://tiktok.com/..."
                style={styles.input}
                disabled={loading}
              />
            </div>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button 
            type="submit" 
            style={{...styles.button, opacity: loading ? 0.7 : 1}}
            disabled={loading}
          >
            {loading ? "Initializing..." : "Analyze Videos"}
            {!loading && <ArrowRight size={20} />}
          </button>
        </form>
      </motion.div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "2rem",
  },
  container: {
    width: "100%",
    maxWidth: "500px",
    padding: "3rem 2rem",
    display: "flex",
    flexDirection: "column",
    gap: "2rem",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "0.5rem",
  },
  iconWrapper: {
    background: "rgba(34, 211, 238, 0.1)",
    padding: "1rem",
    borderRadius: "50%",
    marginBottom: "1rem",
  },
  title: {
    fontSize: "2.5rem",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: "1.1rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  label: {
    fontSize: "0.9rem",
    color: "var(--text-muted)",
    fontWeight: 500,
  },
  inputWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  inputIcon: {
    position: "absolute",
    left: "1rem",
  },
  input: {
    width: "100%",
    padding: "1rem 1rem 1rem 3rem",
    background: "rgba(0,0,0,0.2)",
    border: "1px solid var(--border-light)",
    borderRadius: "12px",
    color: "var(--text-primary)",
    fontSize: "1rem",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  button: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    padding: "1rem",
    background: "var(--btn-bg)",
    border: "none",
    borderRadius: "12px",
    color: "#fff",
    fontSize: "1.1rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "transform 0.1s, box-shadow 0.2s",
    marginTop: "1rem",
    boxShadow: "var(--accent-glow)",
  },
  error: {
    color: "#ef4444",
    fontSize: "0.9rem",
    textAlign: "center",
  },
};
