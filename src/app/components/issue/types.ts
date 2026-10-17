export type Worklog = {
  id: string;
  minutes: number;
  startedAt: string;
  comment: string | null;
  author: string;
  userId: string | null;
  createdAt: string;
};

export type AttachmentSummary = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  userId: string | null;
  author: string | null;
  createdAt: string;
  url: string;
};

export type WatcherSummary = {
  userId: string;
  memberId: string | null;
  name: string;
  email: string;
};

export type RemainingEstimateMode = "AUTO" | "LEAVE" | "SET";
