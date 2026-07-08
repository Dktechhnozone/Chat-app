export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  status: "online" | "offline";
  lastSeen?: any; // Firestore Timestamp
  typingIn?: string | null;
}

export interface ChatSession {
  id: string;
  name?: string;
  isGroup: boolean;
  members: string[];
  createdAt: any; // Firestore Timestamp
  createdBy: string;
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    timestamp: any;
  } | null;
}

export interface ChatMessage {
  id: string;
  text?: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  timestamp: any; // Firestore Timestamp
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
}

export interface AIMessageHistory {
  role: "user" | "model";
  text: string;
}
