"use client";

import { Play, Heart, MessageCircle, TrendingUp, Calendar, Clock, Users } from "lucide-react";

export interface VideoData {
  label: string;
  creator: string;
  title: string;
  platform: string;
  thumbnail_url: string;
  views: number;
  likes: number;
  comments: number;
  engagement_rate: number;
  follower_count: number;
  duration: number;
}

import { useState } from "react";

export default function VideoCard({ data, status, onRetry }: { data?: VideoData, status?: string, onRetry?: (url: string) => void }) {
  const [newUrl, setNewUrl] = useState("");

  if (status === "NONE") {
    return (
      <div className="glass-panel" style={styles.skeleton}>
        <div style={{textAlign: "center", padding: "20px", width: "100%"}}>
          <h3 style={{color: "#fff", marginBottom: "10px"}}>Add Video</h3>
          <p style={{fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "15px"}}>
            Compare another video to see which one performs better.
          </p>
          <div style={{display: "flex", flexDirection: "column", gap: "10px", marginTop: "15px", padding: "0 10%"}}>
            <input 
              type="url" 
              placeholder="Paste video URL here..." 
              value={newUrl} 
              onChange={e => setNewUrl(e.target.value)}
              style={{width: "100%", padding: "10px", borderRadius: "8px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-light)", color: "#fff", outline: "none"}}
            />
            <button 
              onClick={() => {
                if (newUrl && onRetry) onRetry(newUrl);
              }}
              style={{padding: "10px", background: "var(--btn-bg)", borderRadius: "8px", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold"}}
            >
              Analyze Video
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="glass-panel" style={styles.skeleton}>
        <div style={{textAlign: "center", padding: "20px", width: "100%"}}>
          <h3 style={{color: "#ef4444", marginBottom: "10px"}}>Analysis Failed</h3>
          <p style={{fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "15px"}}>
            The video format or platform is not supported. Please try another link.
          </p>
          <div style={{display: "flex", flexDirection: "column", gap: "10px", marginTop: "15px", padding: "0 10%"}}>
            <input 
              type="url" 
              placeholder="Paste new URL here..." 
              value={newUrl} 
              onChange={e => setNewUrl(e.target.value)}
              style={{width: "100%", padding: "10px", borderRadius: "8px", background: "rgba(0,0,0,0.4)", border: "1px solid var(--border-light)", color: "#fff", outline: "none"}}
            />
            <button 
              onClick={() => {
                if (newUrl && onRetry) onRetry(newUrl);
              }}
              style={{padding: "10px", background: "var(--btn-bg)", borderRadius: "8px", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold"}}
            >
              Analyze New Video
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <div className="glass-panel" style={styles.skeleton}>Loading...</div>;

  return (
    <div className="glass-panel" style={styles.card}>
      <div style={{ ...styles.thumbnail, backgroundImage: `url(${data.thumbnail_url || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop'})` }}>
        <div style={styles.thumbnailOverlay}>
          <span style={styles.labelBadge}>Video {data.label}</span>
          <span style={styles.duration}><Clock size={12} style={{marginRight: '4px'}}/> {data.duration}s</span>
        </div>
      </div>
      
      <div style={styles.content}>
        <h3 style={styles.title}>{data.title?.slice(0, 50) || "Video Title"}{data.title?.length > 50 ? '...' : ''}</h3>
        <p style={styles.creator}>@{data.creator}</p>
        
        <div style={styles.metricsGrid}>
          <Metric icon={<Play size={16} />} value={formatNumber(data.views)} label="Views" />
          <Metric icon={<Heart size={16} />} value={formatNumber(data.likes)} label="Likes" />
          <Metric icon={<MessageCircle size={16} />} value={formatNumber(data.comments)} label="Comments" />
          <Metric 
            icon={<TrendingUp size={16} color={data.engagement_rate > 5 ? '#4ade80' : 'var(--accent-cyan)'} />} 
            value={`${data.engagement_rate}%`} 
            label="Engagement" 
            highlight
          />
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, value, label, highlight = false }: { icon: React.ReactNode, value: string | number, label: string, highlight?: boolean }) {
  return (
    <div style={styles.metric}>
      <div style={{ ...styles.metricIcon, color: highlight ? '#4ade80' : 'var(--text-muted)' }}>{icon}</div>
      <div style={styles.metricData}>
        <span style={styles.metricValue}>{value}</span>
        <span style={styles.metricLabel}>{label}</span>
      </div>
    </div>
  );
}

function formatNumber(num: number) {
  if (!num) return "0";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    height: "100%",
  },
  skeleton: {
    height: "300px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
  },
  thumbnail: {
    height: "160px",
    backgroundSize: "cover",
    backgroundPosition: "center",
    position: "relative",
  },
  thumbnailOverlay: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.8))",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: "1rem",
  },
  labelBadge: {
    background: "var(--btn-bg)",
    padding: "4px 12px",
    borderRadius: "12px",
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "#fff",
  },
  duration: {
    display: "flex",
    alignItems: "center",
    fontSize: "0.8rem",
    background: "rgba(0,0,0,0.6)",
    padding: "4px 8px",
    borderRadius: "4px",
  },
  content: {
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    flex: 1,
  },
  title: {
    fontSize: "1.1rem",
    fontWeight: 600,
    marginBottom: "0.25rem",
    lineHeight: 1.3,
  },
  creator: {
    color: "var(--accent-purple)",
    fontSize: "0.9rem",
    marginBottom: "1.25rem",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1rem",
    marginTop: "auto",
  },
  metric: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  metricIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "8px",
  },
  metricData: {
    display: "flex",
    flexDirection: "column",
  },
  metricValue: {
    fontSize: "1rem",
    fontWeight: 600,
  },
  metricLabel: {
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  }
};
