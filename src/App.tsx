import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Image as ImageIcon,
  Smile,
  LogOut,
  Users,
  UserPlus,
  Search,
  MessageCircle,
  Circle,
  Check,
  CheckCheck,
  Menu,
  X,
  Sparkles,
  Plus,
  Moon,
  Sun,
  Phone,
  Video,
  MapPin,
  Lock,
  ArrowLeft,
  FileText,
  Clock,
  HelpCircle,
  Info
} from "lucide-react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  User as FirebaseUser
} from "firebase/auth";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { UserProfile, ChatSession, ChatMessage, AIMessageHistory } from "./types";
import AvatarPicker from "./components/AvatarPicker";
import EmojiPicker from "./components/EmojiPicker";
import FilePreview from "./components/FilePreview";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarSeed, setAvatarSeed] = useState("Buster");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // App settings
  const [darkMode, setDarkMode] = useState(true);

  // Layout state
  const [activeTab, setActiveTab] = useState<"chats" | "users">("chats");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);

  // Data lists
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [filteredUserSearch, setFilteredUserSearch] = useState("");
  const [filteredChatSearch, setFilteredChatSearch] = useState("");

  // Input states
  const [messageInput, setMessageInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isAILoading, setIsAILoading] = useState(false);

  // File sharing states
  const [selectedFile, setSelectedFile] = useState<{
    dataUrl: string;
    name: string;
    type: string;
    size: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Auth & Presence Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Set online status in Firestore
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
          status: "online",
          lastSeen: serverTimestamp()
        }).catch(async () => {
          // If profile document doesn't exist yet, make it
          await setDoc(userRef, {
            uid: user.uid,
            displayName: user.displayName || "User",
            email: user.email || "",
            photoURL: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${avatarSeed}`,
            status: "online",
            lastSeen: serverTimestamp(),
            typingIn: null
          });
        });

        // Listen to own user profile changes
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          }
        });

        // Setup beforeunload to set status to offline
        const handleUnload = () => {
          updateDoc(userRef, {
            status: "offline",
            lastSeen: serverTimestamp()
          });
        };
        window.addEventListener("beforeunload", handleUnload);

        // Ensure Gemini AI assistant room exists
        createAIAssistantChat(user);

        return () => {
          window.removeEventListener("beforeunload", handleUnload);
        };
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch Active Chats & Active Users Real-Time
  useEffect(() => {
    if (!currentUser) return;

    // Sub to all chats user is member of
    const chatsQuery = query(
      collection(db, "chats"),
      where("members", "array-contains", currentUser.uid)
    );

    const unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
      const chatsList: ChatSession[] = [];
      snapshot.forEach((docSnap) => {
        chatsList.push(docSnap.data() as ChatSession);
      });
      // Sort by lastMessage timestamp or createdAt desc
      chatsList.sort((a, b) => {
        const timeA = a.lastMessage?.timestamp?.seconds || a.createdAt?.seconds || 0;
        const timeB = b.lastMessage?.timestamp?.seconds || b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setChats(chatsList);
    });

    // Sub to all registered users
    const usersQuery = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersList: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (data.uid !== currentUser.uid) {
          usersList.push(data);
        }
      });
      setUsers(usersList);
    });

    return () => {
      unsubscribeChats();
      unsubscribeUsers();
    };
  }, [currentUser]);

  // 3. Fetch Selected Chat's Messages
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, "chats", activeChatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        msgs.push(docSnap.data() as ChatMessage);
      });
      setMessages(msgs);
      scrollToBottom();
    });

    return () => unsubscribeMessages();
  }, [activeChatId]);

  // Scroll Helper
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // 4. Ensure AI assistant chat room exists
  const createAIAssistantChat = async (user: FirebaseUser) => {
    const aiChatId = `ai-assistant-${user.uid}`;
    const aiChatRef = doc(db, "chats", aiChatId);
    const docSnap = await getDoc(aiChatRef);

    if (!docSnap.exists()) {
      await setDoc(aiChatRef, {
        id: aiChatId,
        name: "Gemini AI Companion",
        isGroup: false,
        members: [user.uid, "gemini-bot-id"],
        createdAt: serverTimestamp(),
        createdBy: "system",
        lastMessage: {
          text: "Hi! I am your AI chat companion. Send me a message and let's talk!",
          senderId: "gemini-bot-id",
          senderName: "Gemini AI Companion",
          timestamp: new Date()
        }
      });

      // Insert first message
      await addDoc(collection(db, "chats", aiChatId, "messages"), {
        id: `msg-welcome-${Date.now()}`,
        text: "Hi! I am your AI chat companion, powered by Gemini 2.5. Send me a message and let's talk in real-time!",
        senderId: "gemini-bot-id",
        senderName: "Gemini AI Companion",
        senderPhoto: "https://api.dicebear.com/7.x/bottts/svg?seed=gemini",
        timestamp: serverTimestamp()
      });
    }
  };

  // Handle Authentication
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    if (!email || !password) {
      setAuthError("Email and Password are required.");
      setAuthLoading(false);
      return;
    }

    try {
      if (authMode === "signup") {
        if (!displayName) {
          setAuthError("Display name is required.");
          setAuthLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const photoURL = `https://api.dicebear.com/7.x/adventurer/svg?seed=${avatarSeed}`;

        await updateProfile(user, { displayName, photoURL });

        // Save profile in Firestore
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          displayName: displayName,
          email: email,
          photoURL: photoURL,
          status: "online",
          lastSeen: serverTimestamp(),
          typingIn: null
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setAuthError("This email is already in use.");
      } else if (err.code === "auth/invalid-credential") {
        setAuthError("Invalid email or password.");
      } else {
        setAuthError(err.message || "An authentication error occurred.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (currentUser) {
      // Mark offline before signout
      await updateDoc(doc(db, "users", currentUser.uid), {
        status: "offline",
        lastSeen: serverTimestamp()
      });
      await signOut(auth);
      setActiveChatId(null);
    }
  };

  // Start or open 1-on-1 private chat
  const startPrivateChat = async (targetUser: UserProfile) => {
    if (!currentUser) return;

    // Sort UIDs deterministically to prevent duplicate chats
    const sortedIds = [currentUser.uid, targetUser.uid].sort();
    const chatId = `private-${sortedIds.join("-")}`;

    const chatRef = doc(db, "chats", chatId);
    const docSnap = await getDoc(chatRef);

    if (!docSnap.exists()) {
      await setDoc(chatRef, {
        id: chatId,
        isGroup: false,
        members: [currentUser.uid, targetUser.uid],
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
        lastMessage: null
      });
    }

    setActiveChatId(chatId);
    setShowMobileSidebar(false);
  };

  // Create Group Chat
  const handleCreateGroup = async () => {
    if (!currentUser || !groupName.trim() || selectedGroupMembers.length === 0) return;

    const groupChatId = `group-${Date.now()}`;
    const allMembers = [currentUser.uid, ...selectedGroupMembers];

    await setDoc(doc(db, "chats", groupChatId), {
      id: groupChatId,
      name: groupName.trim(),
      isGroup: true,
      members: allMembers,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid,
      lastMessage: {
        text: `${currentUser.displayName} created this group chat`,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        timestamp: new Date()
      }
    });

    // Write initial message
    await addDoc(collection(db, "chats", groupChatId, "messages"), {
      id: `msg-group-init-${Date.now()}`,
      text: `${currentUser.displayName} created the group "${groupName}" and added ${selectedGroupMembers.length} participants. Welcome!`,
      senderId: "system",
      senderName: "System",
      timestamp: serverTimestamp()
    });

    setGroupName("");
    setSelectedGroupMembers([]);
    setShowGroupModal(false);
    setActiveChatId(groupChatId);
    setShowMobileSidebar(false);
  };

  // Handle Typing Status update
  const handleMessageTyping = () => {
    if (!currentUser || !activeChatId) return;

    // Set typingIn state to current active chat
    updateDoc(doc(db, "users", currentUser.uid), {
      typingIn: activeChatId
    });

    // Clear typing state after 3s of inactivity
    if (typingTimeout) clearTimeout(typingTimeout);

    const timeout = setTimeout(() => {
      updateDoc(doc(db, "users", currentUser.uid), {
        typingIn: null
      });
    }, 3000);

    setTypingTimeout(timeout);
  };

  // File selection and Base64 conversion
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Restrict size to 600KB for Firestore storage
    if (file.size > 600000) {
      alert("To comply with Firestore document size limits, shared files must be under 600 KB. Please select a smaller file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedFile({
          dataUrl: event.target.result as string,
          name: file.name,
          type: file.type,
          size: file.size
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeChatId) return;

    const textToSend = messageInput.trim();
    if (!textToSend && !selectedFile) return;

    // Clear inputs immediately for rapid UI response
    setMessageInput("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowEmojiPicker(false);

    // Cancel typing indicator
    if (typingTimeout) clearTimeout(typingTimeout);
    await updateDoc(doc(db, "users", currentUser.uid), { typingIn: null });

    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const messagePayload: any = {
      id: msgId,
      senderId: currentUser.uid,
      senderName: currentUser.displayName || "Anonymous",
      senderPhoto: currentUser.photoURL || "",
      timestamp: serverTimestamp()
    };

    if (textToSend) {
      messagePayload.text = textToSend;
    }

    if (selectedFile) {
      messagePayload.fileUrl = selectedFile.dataUrl;
      messagePayload.fileName = selectedFile.name;
      messagePayload.fileType = selectedFile.type;
    }

    // Save message to chat's messages subcollection
    const messagesCollectionRef = collection(db, "chats", activeChatId, "messages");
    await addDoc(messagesCollectionRef, messagePayload);

    // Update chat lastMessage
    const chatRef = doc(db, "chats", activeChatId);
    await updateDoc(chatRef, {
      lastMessage: {
        text: selectedFile ? `📎 Sent a file: ${selectedFile.name}` : textToSend,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || "Anonymous",
        timestamp: new Date()
      }
    });

    // If chat is the Gemini assistant, trigger response
    if (activeChatId === `ai-assistant-${currentUser.uid}` && textToSend) {
      triggerAIResponse(textToSend);
    }
  };

  // Gemini AI Chat trigger
  const triggerAIResponse = async (userText: string) => {
    if (!currentUser) return;
    setIsAILoading(true);

    const aiChatId = `ai-assistant-${currentUser.uid}`;

    // Update typing state for AI Bot
    // We will simulate the AI companion typing in state
    const aiBotTypingDoc = doc(db, "users", "gemini-bot-id");
    await setDoc(aiBotTypingDoc, {
      uid: "gemini-bot-id",
      displayName: "Gemini AI Companion",
      status: "online",
      typingIn: aiChatId
    }, { merge: true });

    try {
      // Compile message history (excluding the very recent one for simplicity)
      // Grab up to last 10 messages from current state list
      const historyContext: AIMessageHistory[] = messages
        .filter(m => m.senderId !== "system")
        .slice(-10)
        .map(m => ({
          role: m.senderId === "gemini-bot-id" ? "model" : "user",
          text: m.text || ""
        }));

      const response = await fetch("/api/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          history: historyContext
        })
      });

      if (!response.ok) {
        throw new Error("Failed to reach AI assistant service.");
      }

      const data = await response.json();
      const aiReply = data.text;

      // Add AI response to subcollection
      const messagesCollectionRef = collection(db, "chats", aiChatId, "messages");
      await addDoc(messagesCollectionRef, {
        id: `msg-ai-${Date.now()}`,
        text: aiReply,
        senderId: "gemini-bot-id",
        senderName: "Gemini AI Companion",
        senderPhoto: "https://api.dicebear.com/7.x/bottts/svg?seed=gemini",
        timestamp: serverTimestamp()
      });

      // Update chat lastMessage
      await updateDoc(doc(db, "chats", aiChatId), {
        lastMessage: {
          text: aiReply,
          senderId: "gemini-bot-id",
          senderName: "Gemini AI Companion",
          timestamp: new Date()
        }
      });
    } catch (err) {
      console.error("AI Error:", err);
      // Fallback
      const messagesCollectionRef = collection(db, "chats", aiChatId, "messages");
      await addDoc(messagesCollectionRef, {
        id: `msg-ai-err-${Date.now()}`,
        text: "I'm having a small connection issue right now. Make sure your GEMINI_API_KEY is active and try again!",
        senderId: "gemini-bot-id",
        senderName: "Gemini AI Companion",
        senderPhoto: "https://api.dicebear.com/7.x/bottts/svg?seed=gemini",
        timestamp: serverTimestamp()
      });
    } finally {
      setIsAILoading(false);
      // Clear typing
      await updateDoc(aiBotTypingDoc, { typingIn: null });
    }
  };

  // Toggle group participant select
  const toggleGroupMember = (uid: string) => {
    if (selectedGroupMembers.includes(uid)) {
      setSelectedGroupMembers(selectedGroupMembers.filter(m => m !== uid));
    } else {
      setSelectedGroupMembers([...selectedGroupMembers, uid]);
    }
  };

  // Helpers to render chat name & avatar for 1-on-1 chats
  const getChatDetails = (chat: ChatSession) => {
    if (chat.isGroup) {
      return {
        name: chat.name || "Group Chat",
        photo: "https://api.dicebear.com/7.x/identicon/svg?seed=" + encodeURIComponent(chat.name || "group"),
        status: "group"
      };
    }

    // AI companion check
    if (chat.id === `ai-assistant-${currentUser?.uid}`) {
      const aiBot = users.find(u => u.uid === "gemini-bot-id");
      return {
        name: "Gemini AI Companion",
        photo: "https://api.dicebear.com/7.x/bottts/svg?seed=gemini",
        status: aiBot?.typingIn === chat.id ? "typing" : "online"
      };
    }

    // 1-on-1 private chat
    const otherMemberId = chat.members.find(m => m !== currentUser?.uid);
    const otherUser = users.find(u => u.uid === otherMemberId);

    if (otherUser) {
      return {
        name: otherUser.displayName,
        photo: otherUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${otherUser.displayName}`,
        status: otherUser.typingIn === chat.id ? "typing" : otherUser.status
      };
    }

    return {
      name: "Chat Companion",
      photo: `https://api.dicebear.com/7.x/adventurer/svg?seed=companion`,
      status: "offline"
    };
  };

  // Filters
  const filteredUsers = users.filter(u =>
    u.uid !== "gemini-bot-id" && (
      u.displayName.toLowerCase().includes(filteredUserSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(filteredUserSearch.toLowerCase())
    )
  );

  const filteredChats = chats.filter(c => {
    const details = getChatDetails(c);
    return details.name.toLowerCase().includes(filteredChatSearch.toLowerCase());
  });

  // Render Login state if not authenticated
  if (!currentUser) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-300 ${
        darkMode ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-900"
      }`}>
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2.5 rounded-xl transition-all border ${
              darkMode ? "bg-slate-900 border-slate-800 text-yellow-400 hover:bg-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`w-full max-w-md rounded-3xl p-8 border shadow-2xl transition-all duration-300 ${
            darkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200/80"
          }`}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-6 space-y-2">
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/20">
              <MessageCircle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Real-Time Chat</h1>
            <p className={`text-xs text-center ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Instant full-stack chats with real-time Firestore database & integrated AI Companion
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-4">
            {authError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
                {authError}
              </div>
            )}

            {authMode === "signup" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                      darkMode ? "bg-slate-800/50 border-slate-700 text-white focus:border-indigo-500 focus:bg-slate-800" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500 focus:bg-white"
                    }`}
                  />
                </div>

                <AvatarPicker selectedSeed={avatarSeed} onSelect={setAvatarSeed} />
              </>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Email Address</label>
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                  darkMode ? "bg-slate-800/50 border-slate-700 text-white focus:border-indigo-500 focus:bg-slate-800" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500 focus:bg-white"
                }`}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                  darkMode ? "bg-slate-800/50 border-slate-700 text-white focus:border-indigo-500 focus:bg-slate-800" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500 focus:bg-white"
                }`}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all duration-150 flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span>{authMode === "signin" ? "Sign In" : "Create Account"}</span>
              )}
            </button>
          </form>

          {/* Toggle Tab */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setAuthMode(authMode === "signin" ? "signup" : "signin");
                setAuthError("");
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              {authMode === "signin"
                ? "Don't have an account? Sign Up"
                : "Already have an account? Sign In"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const activeChat = chats.find(c => c.id === activeChatId);
  const activeChatDetails = activeChat ? getChatDetails(activeChat) : null;

  return (
    <div className={`h-screen flex overflow-hidden font-sans transition-colors duration-300 ${
      darkMode ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"
    }`}>
      {/* 1. Sidebar Panel */}
      <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col shrink-0 h-full transition-all duration-300 ${
        darkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"
      } ${
        showMobileSidebar ? "flex" : "hidden md:flex"
      }`}>
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          darkMode ? "border-slate-800" : "border-slate-100"
        }`}>
          <div className="flex items-center space-x-3">
            <img
              src={userProfile?.photoURL || currentUser.photoURL || ""}
              alt="My Avatar"
              className="w-10 h-10 rounded-full bg-slate-800 border-2 border-indigo-500/50"
              referrerPolicy="no-referrer"
            />
            <div>
              <p className="text-sm font-semibold truncate max-w-[130px]">{userProfile?.displayName || currentUser.displayName}</p>
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Online</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-xl transition-colors ${
                darkMode ? "text-yellow-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"
              }`}
              title="Toggle Theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action tabs: Chats or Users */}
        <div className={`p-2 flex space-x-1 border-b ${darkMode ? "border-slate-800/50" : "border-slate-100"}`}>
          <button
            onClick={() => setActiveTab("chats")}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === "chats"
                ? (darkMode ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" : "bg-indigo-50 text-indigo-600")
                : (darkMode ? "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700")
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Conversations</span>
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === "users"
                ? (darkMode ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" : "bg-indigo-50 text-indigo-600")
                : (darkMode ? "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700")
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Contacts</span>
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === "chats" ? (
            <div className="p-3 space-y-3">
              {/* Search chats */}
              <div className="relative">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={filteredChatSearch}
                  onChange={(e) => setFilteredChatSearch(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs outline-none border transition-all ${
                    darkMode ? "bg-slate-800/40 border-slate-800 text-white focus:bg-slate-800 focus:border-indigo-500" : "bg-slate-100 border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500"
                  }`}
                />
              </div>

              {/* Group Chat Creator shortcut */}
              <button
                onClick={() => setShowGroupModal(true)}
                className="w-full py-2.5 px-3 rounded-xl border border-dashed flex items-center justify-center space-x-2 text-xs font-medium transition-all duration-150 hover:border-indigo-500/50 hover:text-indigo-400 bg-indigo-500/5 border-slate-800 text-slate-300"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Group Chat</span>
              </button>

              {/* List of active rooms */}
              <div className="space-y-1">
                {filteredChats.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No active conversations found
                  </div>
                ) : (
                  filteredChats.map((chat) => {
                    const details = getChatDetails(chat);
                    const isSelected = chat.id === activeChatId;
                    return (
                      <button
                        key={chat.id}
                        onClick={() => {
                          setActiveChatId(chat.id);
                          setShowMobileSidebar(false);
                        }}
                        className={`w-full p-3 rounded-2xl flex items-center space-x-3 text-left transition-all relative ${
                          isSelected
                            ? (darkMode ? "bg-indigo-600/90 text-white" : "bg-indigo-50 text-indigo-600")
                            : (darkMode ? "hover:bg-slate-800/40 text-slate-300" : "hover:bg-slate-100 text-slate-700")
                        }`}
                      >
                        {/* Avatar & Presence indicator */}
                        <div className="relative shrink-0">
                          <img
                            src={details.photo}
                            alt={details.name}
                            className="w-11 h-11 rounded-full bg-slate-800"
                            referrerPolicy="no-referrer"
                          />
                          {details.status === "online" && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900" />
                          )}
                          {details.status === "typing" && (
                            <span className="absolute -bottom-1 -right-1 px-1 py-0.5 bg-indigo-500 text-[8px] text-white rounded-full font-bold animate-pulse">
                              ...
                            </span>
                          )}
                        </div>

                        {/* Text details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline">
                            <h3 className="text-xs font-semibold truncate pr-2">{details.name}</h3>
                            {chat.lastMessage && (
                              <span className="text-[9px] text-slate-400 shrink-0">
                                {new Date(chat.lastMessage.timestamp?.seconds * 1000 || chat.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <p className={`text-[11px] truncate mt-0.5 ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                            {details.status === "typing" ? (
                              <span className="text-indigo-400 font-semibold animate-pulse">typing...</span>
                            ) : (
                              chat.lastMessage ? chat.lastMessage.text : "No messages yet"
                            )}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {/* Search contacts */}
              <div className="relative">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={filteredUserSearch}
                  onChange={(e) => setFilteredUserSearch(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs outline-none border transition-all ${
                    darkMode ? "bg-slate-800/40 border-slate-800 text-white focus:bg-slate-800 focus:border-indigo-500" : "bg-slate-100 border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500"
                  }`}
                />
              </div>

              {/* List of other users */}
              <div className="space-y-1">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No contacts found
                  </div>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u.uid}
                      onClick={() => startPrivateChat(u)}
                      className={`w-full p-3 rounded-2xl flex items-center space-x-3 text-left transition-all ${
                        darkMode ? "hover:bg-slate-800/40 text-slate-300" : "hover:bg-slate-100 text-slate-700"
                      }`}
                    >
                      <div className="relative shrink-0">
                        <img
                          src={u.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.displayName}`}
                          alt={u.displayName}
                          className="w-11 h-11 rounded-full bg-slate-800"
                          referrerPolicy="no-referrer"
                        />
                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                          u.status === "online" ? "bg-green-500" : "bg-slate-500"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold truncate">{u.displayName}</h4>
                        <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Chat Panel */}
      <div className={`flex-1 flex flex-col h-full ${
        !showMobileSidebar ? "flex" : "hidden md:flex"
      }`}>
        {activeChat && activeChatDetails ? (
          <>
            {/* Active chat header */}
            <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
              darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <div className="flex items-center space-x-3 min-w-0">
                {/* Mobile back button */}
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className="md:hidden p-1 rounded-lg text-slate-400 hover:bg-slate-800"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Avatar and Presence status */}
                <div className="relative shrink-0">
                  <img
                    src={activeChatDetails.photo}
                    alt={activeChatDetails.name}
                    className="w-10 h-10 rounded-full bg-slate-800"
                    referrerPolicy="no-referrer"
                  />
                  {activeChatDetails.status === "online" && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-slate-900" />
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="text-sm font-semibold truncate leading-tight">{activeChatDetails.name}</h2>
                  <div className="flex items-center space-x-1 mt-0.5">
                    {activeChatDetails.status === "typing" ? (
                      <span className="text-[10px] text-indigo-400 font-semibold animate-pulse">typing...</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 capitalize">
                        {activeChat.isGroup ? `${activeChat.members.length} members` : activeChatDetails.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Header icons */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => alert("Simulating a voice call...")}
                  className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors"
                  title="Start Voice Call"
                >
                  <Phone className="w-4.5 h-4.5" />
                </button>
                <button
                  onClick={() => alert("Simulating a video call...")}
                  className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors"
                  title="Start Video Call"
                >
                  <Video className="w-4.5 h-4.5" />
                </button>
                <button
                  onClick={() => alert("Simulating Location Sharing...")}
                  className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors"
                  title="Share Location"
                >
                  <MapPin className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-4 min-h-0 ${
              darkMode ? "bg-slate-950" : "bg-slate-100/45"
            }`}>
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 text-center">
                  <MessageCircle className="w-12 h-12 text-slate-700 animate-pulse" />
                  <p className="text-sm">No messages yet in this conversation</p>
                  <p className="text-xs">Type a message below to start chatting instantly!</p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isMe = msg.senderId === currentUser.uid;
                  const isSys = msg.senderId === "system";

                  if (isSys) {
                    return (
                      <div key={msg.id} className="flex justify-center my-2">
                        <span className="px-3 py-1 rounded-full text-[10px] bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20 shadow-sm uppercase tracking-wider">
                          {msg.text}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? "justify-end" : "justify-start"} items-end space-x-2.5 max-w-2xl ${
                        isMe ? "ml-auto" : "mr-auto"
                      }`}
                    >
                      {/* Avatar on other person's side */}
                      {!isMe && (
                        <img
                          src={msg.senderPhoto || `https://api.dicebear.com/7.x/adventurer/svg?seed=${msg.senderName}`}
                          alt={msg.senderName}
                          className="w-8 h-8 rounded-full bg-slate-800"
                          referrerPolicy="no-referrer"
                        />
                      )}

                      <div className="flex flex-col space-y-1 max-w-[85%]">
                        {/* Name for group chats */}
                        {!isMe && activeChat.isGroup && (
                          <span className="text-[10px] font-bold text-indigo-400 ml-1">{msg.senderName}</span>
                        )}

                        <div
                          className={`p-3.5 rounded-2xl relative group ${
                            isMe
                              ? "bg-indigo-600 text-white rounded-br-none shadow-lg shadow-indigo-600/10"
                              : (darkMode ? "bg-slate-800 text-slate-100 rounded-bl-none" : "bg-white text-slate-800 rounded-bl-none border border-slate-200")
                          }`}
                        >
                          {/* Text message */}
                          {msg.text && <p className="text-xs leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>}

                          {/* File attachments */}
                          {msg.fileUrl && (
                            <FilePreview
                              fileUrl={msg.fileUrl}
                              fileName={msg.fileName || "file"}
                              fileType={msg.fileType}
                              isCurrentUser={isMe}
                            />
                          )}

                          {/* Info footer inside bubble */}
                          <div className={`flex items-center space-x-1.5 justify-end mt-1.5 text-[8px] ${
                            isMe ? "text-indigo-200/80" : "text-slate-400"
                          }`}>
                            <span>
                              {msg.timestamp ? (
                                new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              ) : (
                                "just now"
                              )}
                            </span>
                            {isMe && <CheckCheck className="w-3.5 h-3.5 text-indigo-200" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Area */}
            <div className={`p-4 border-t ${
              darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
            }`}>
              {/* Attachment Preview */}
              {selectedFile && (
                <div className="mb-3 p-3 bg-slate-800/50 rounded-2xl border border-indigo-500/20 flex items-center justify-between">
                  <div className="flex items-center space-x-3 truncate">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="truncate text-left">
                      <p className="text-xs font-semibold truncate text-white">{selectedFile.name}</p>
                      <p className="text-[10px] text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSendMessage} className="flex items-center space-x-2 relative">
                {/* Emoji Picker Popover */}
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={(emoji) => setMessageInput(messageInput + emoji)}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                )}

                {/* File input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`p-2.5 rounded-xl transition-colors ${
                      showEmojiPicker ? "bg-indigo-500/15 text-indigo-400" : "text-slate-400 hover:bg-slate-800"
                    }`}
                    title="Insert Emoji"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors"
                    title="Share File"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Text input */}
                <input
                  type="text"
                  placeholder={
                    activeChatId === `ai-assistant-${currentUser.uid}`
                      ? "Chat with Gemini AI companion..."
                      : "Type your message..."
                  }
                  value={messageInput}
                  onChange={(e) => {
                    setMessageInput(e.target.value);
                    handleMessageTyping();
                  }}
                  className={`flex-1 px-4 py-3 rounded-2xl text-xs outline-none border transition-all ${
                    darkMode ? "bg-slate-800/40 border-slate-800 text-white focus:bg-slate-800 focus:border-indigo-500" : "bg-slate-100 border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500"
                  }`}
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!messageInput.trim() && !selectedFile}
                  className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-md shadow-indigo-600/10 active:scale-95 disabled:opacity-40 transition-all shrink-0"
                  title="Send Message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="p-4 bg-indigo-500/10 text-indigo-500 rounded-3xl border border-indigo-500/10">
              <MessageCircle className="w-12 h-12" />
            </div>
            <div className="max-w-md space-y-1">
              <h2 className="text-lg font-bold">Your Real-Time Hub</h2>
              <p className="text-xs text-slate-500">
                Choose an existing conversation from the sidebar, search registered contacts to chat, or try your dedicated real-time Gemini AI Companion!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 pt-2">
              <button
                onClick={() => {
                  const aiChatId = `ai-assistant-${currentUser.uid}`;
                  setActiveChatId(aiChatId);
                  setShowMobileSidebar(false);
                }}
                className="py-2.5 px-4 rounded-xl bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/10 text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <Sparkles className="w-4.5 h-4.5" />
                <span>Chat with Gemini AI</span>
              </button>
              <button
                onClick={() => setActiveTab("users")}
                className="py-2.5 px-4 rounded-xl bg-slate-800/40 text-slate-300 hover:bg-slate-800 border border-slate-800 text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <Users className="w-4.5 h-4.5" />
                <span>Browse Active Contacts</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Group Chat Creation Modal */}
      <AnimatePresence>
        {showGroupModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md rounded-3xl p-6 border shadow-2xl transition-all duration-200 ${
                darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
              }`}
            >
              <div className="flex items-center justify-between border-b pb-3 border-slate-800/50">
                <h3 className="text-sm font-semibold flex items-center space-x-2">
                  <Users className="w-4.5 h-4.5 text-indigo-500" />
                  <span>Create Group Chat</span>
                </h3>
                <button
                  onClick={() => setShowGroupModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              <div className="py-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Group Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter group name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl border text-xs outline-none transition-all ${
                      darkMode ? "bg-slate-800/50 border-slate-700 text-white focus:border-indigo-500 focus:bg-slate-800" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500 focus:bg-white"
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Select Members</label>
                  <div className={`max-h-48 overflow-y-auto border rounded-xl p-2 space-y-1 ${
                    darkMode ? "bg-slate-800/30 border-slate-800" : "bg-slate-50 border-slate-200"
                  }`}>
                    {users.length === 0 ? (
                      <p className="text-xs text-center py-4 text-slate-500">No contacts available to add</p>
                    ) : (
                      users.map((u) => {
                        const isSelected = selectedGroupMembers.includes(u.uid);
                        return (
                          <button
                            key={u.uid}
                            type="button"
                            onClick={() => toggleGroupMember(u.uid)}
                            className={`w-full p-2 rounded-xl flex items-center justify-between text-left transition-all ${
                              isSelected
                                ? (darkMode ? "bg-indigo-600/10 text-indigo-400" : "bg-indigo-50 text-indigo-600")
                                : (darkMode ? "hover:bg-slate-800 text-slate-300" : "hover:bg-slate-100 text-slate-700")
                            }`}
                          >
                            <div className="flex items-center space-x-2.5 truncate">
                              <img
                                src={u.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.displayName}`}
                                alt={u.displayName}
                                className="w-8 h-8 rounded-full bg-slate-800"
                                referrerPolicy="no-referrer"
                              />
                              <span className="text-xs font-semibold truncate">{u.displayName}</span>
                            </div>
                            <span className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-500 text-transparent"
                            }`}>
                              ✓
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 border-t pt-3 border-slate-800/50">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="py-2 px-4 rounded-xl text-xs font-semibold hover:bg-slate-800 transition-all text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!groupName.trim() || selectedGroupMembers.length === 0}
                  onClick={handleCreateGroup}
                  className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all disabled:opacity-40"
                >
                  Create Group
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
