export interface MetricData {
  views: number;
  likes: number;
  comments: number;
  engagementRate: number;
  followerCount: number;
  thumbnailUrl?: string;
}

export interface TimelineMarker {
  id: string;
  seconds: number;
  timecode: string; // "00:00:02:00"
  label: string;
  type: 'hook' | 'dropoff' | 'peak';
}

export interface TranscriptLine {
  id: string;
  seconds: number;
  timecode: string;
  speaker: string;
  text: string;
  type?: 'hook' | 'dropoff' | 'peak';
}

export interface VideoItem {
  id: string;
  title: string;
  channel: string;
  durationSeconds: number;
  thumbnailUrl: string;
  views: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  actionableTimecodes?: Array<{
    seconds: number;
    label: string;
  }>;
}

export interface SessionState {
  sessionId: string;
  monitorMode: 'single' | 'dual';
  activeVideoId: string;
  currentTimeSeconds: number;
  isPlaying: boolean;
  playbackSpeed: number;
  mobileTab: 'transcript' | 'stage' | 'copilot';
  commandPaletteOpen: boolean;
}
