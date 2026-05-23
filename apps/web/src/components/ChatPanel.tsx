"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Bot, User, Sparkles } from "lucide-react";

interface Message {
  role: "USER" | "AI";
  content: string;
}

export default function ChatPanel({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "USER", content: userMsg }]);
    setIsLoading(true);

    // Placeholder for AI response
    setMessages((prev) => [...prev, { role: "AI", content: "" }]);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: userMsg }),
      });

      if (!res.body) throw new Error("No body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              setMessages((prev) => {
                const newMsgs = [...prev];
                const lastIdx = newMsgs.length - 1;
                newMsgs[lastIdx] = { 
                  ...newMsgs[lastIdx], 
                  content: newMsgs[lastIdx].content + data.text 
                };
                return newMsgs;
              });
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = "Sorry, an error occurred.";
        return newMsgs;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Sparkles size={20} color="var(--accent-cyan)" />
        <h2 style={styles.title}>AI Analysis</h2>
      </div>

      <div style={styles.messageList}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <p>Ready to analyze. Ask me anything about the engagement, hooks, or performance!</p>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} style={{ ...styles.messageWrapper, justifyContent: msg.role === "USER" ? "flex-end" : "flex-start" }}>
            <div style={{ ...styles.message, ...(msg.role === "USER" ? styles.userMessage : styles.aiMessage) }}>
              <div style={{...styles.avatar, ...(msg.role === "USER" ? styles.userAvatar : styles.aiAvatar)}}>
                {msg.role === "USER" ? <User size={16} color="#fff" /> : <Bot size={16} color="var(--accent-cyan)" />}
              </div>
              <div className="prose">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
                {isLoading && msg.role === "AI" && idx === messages.length - 1 && (
                  <span style={styles.cursor}>█</span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} style={styles.inputArea}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about these videos..."
          style={styles.input}
          disabled={isLoading}
        />
        <button type="submit" style={styles.sendButton} disabled={!input.trim() || isLoading}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  header: {
    padding: "1.5rem",
    borderBottom: "1px solid var(--border-light)",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  title: {
    fontSize: "1.2rem",
    fontWeight: 600,
  },
  messageList: {
    flex: 1,
    overflowY: "auto",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
  },
  emptyState: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-muted)",
    textAlign: "center",
    fontStyle: "italic",
  },
  messageWrapper: {
    display: "flex",
    width: "100%",
  },
  message: {
    maxWidth: "85%",
    display: "flex",
    gap: "1rem",
    padding: "1rem",
    borderRadius: "16px",
  },
  userMessage: {
    background: "rgba(34, 211, 238, 0.1)",
    border: "1px solid rgba(34, 211, 238, 0.2)",
    flexDirection: "row-reverse",
  },
  aiMessage: {
    background: "transparent",
  },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  userAvatar: {
    background: "var(--btn-bg)",
  },
  aiAvatar: {
    background: "rgba(34, 211, 238, 0.1)",
    border: "1px solid rgba(34, 211, 238, 0.2)",
  },
  cursor: {
    display: "inline-block",
    width: "8px",
    height: "1em",
    background: "var(--accent-cyan)",
    animation: "blink 1s step-end infinite",
    marginLeft: "4px",
    verticalAlign: "middle",
  },
  inputArea: {
    padding: "1.5rem",
    borderTop: "1px solid var(--border-light)",
    display: "flex",
    gap: "1rem",
  },
  input: {
    flex: 1,
    padding: "1rem",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid var(--border-light)",
    borderRadius: "12px",
    color: "var(--text-primary)",
    fontSize: "1rem",
    outline: "none",
  },
  sendButton: {
    padding: "0 1.25rem",
    background: "var(--btn-bg)",
    border: "none",
    borderRadius: "12px",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  }
};
