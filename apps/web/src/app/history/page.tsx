"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Video, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { getHistoryAction } from "../actions";

export default function HistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const data = await getHistoryAction();
        setSessions(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const handleSessionClick = (session: any) => {
    let query = "";
    const jobs = session.jobs || [];
    
    // Sort jobs to ensure we get the latest ones if there are more than 2
    const sortedJobs = [...jobs].reverse(); 

    if (sortedJobs.length >= 2) {
      query = `?jobA=${sortedJobs[0].id}&jobB=${sortedJobs[1].id}`;
    } else if (sortedJobs.length === 1) {
      query = `?jobA=${sortedJobs[0].id}`;
    }
    router.push(`/session/${session.id}${query}`);
  };

  return (
    <main style={styles.main}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={styles.container}
      >
        <div style={styles.header}>
          <button onClick={() => router.push("/")} style={styles.backBtn}>
            <ArrowLeft size={20} />
            Back to Home
          </button>
          <h1 style={styles.title}>Your <span className="text-gradient">History</span></h1>
        </div>

        {loading ? (
          <div style={styles.loadingState}>
            <Activity className="animate-spin" size={32} color="var(--accent-cyan)" />
            <p>Loading your past sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div style={styles.emptyState}>
            <Clock size={48} color="var(--text-muted)" />
            <p>No analysis history found.</p>
            <button onClick={() => router.push("/")} style={styles.primaryBtn}>
              Start New Analysis
            </button>
          </div>
        ) : (
          <div style={styles.grid}>
            {sessions.map((session, i) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                style={styles.card}
                className="glass-panel"
                onClick={() => handleSessionClick(session)}
              >
                <div style={styles.cardHeader}>
                  <p style={styles.date}>
                    {new Date(session.created_at).toLocaleDateString(undefined, { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })}
                  </p>
                  <span style={styles.badge}>{session.jobs.length} Videos</span>
                </div>
                
                <div style={styles.jobsList}>
                  {session.jobs.map((job: any) => (
                    <div key={job.id} style={styles.jobRow}>
                      <Video size={16} color="var(--text-muted)" />
                      <span style={styles.jobTitle} title={job.title || "Processing..."}>
                        {job.title || "Processing..."}
                      </span>
                      <span style={{
                        ...styles.statusBadge, 
                        color: job.status === 'COMPLETED' ? '#4ade80' : 
                               job.status === 'FAILED' ? '#ef4444' : '#facc15'
                      }}>
                        {job.status}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    padding: "2rem",
    display: "flex",
    justifyContent: "center",
  },
  container: {
    width: "100%",
    maxWidth: "800px",
    display: "flex",
    flexDirection: "column",
    gap: "2rem",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "1rem",
    marginBottom: "1rem",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
    fontSize: "1rem",
    cursor: "pointer",
    padding: "0.5rem 0",
    transition: "color 0.2s",
  },
  title: {
    fontSize: "2.5rem",
    letterSpacing: "-0.02em",
  },
  loadingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "4rem",
    gap: "1rem",
    color: "var(--text-muted)",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "4rem",
    gap: "1.5rem",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "16px",
    border: "1px dashed rgba(255,255,255,0.1)",
  },
  primaryBtn: {
    padding: "0.75rem 1.5rem",
    background: "var(--btn-bg)",
    border: "none",
    borderRadius: "12px",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "1.5rem",
  },
  card: {
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "0.75rem",
  },
  date: {
    color: "var(--text-muted)",
    fontSize: "0.85rem",
  },
  badge: {
    background: "rgba(34, 211, 238, 0.1)",
    color: "var(--accent-cyan)",
    padding: "0.25rem 0.5rem",
    borderRadius: "8px",
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  jobsList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  jobRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  jobTitle: {
    color: "var(--text-primary)",
    fontSize: "0.9rem",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flex: 1,
  },
  statusBadge: {
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.05em",
  }
};
