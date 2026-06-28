import React, { useState, useEffect, useRef } from "react";
import { ChatMessage, Task } from "../types";
import Markdown from "react-markdown";
import { 
  Send, Sparkles, Loader2, Heart, RefreshCw, X, Save, History, 
  Trash2, ArrowLeft, Check, AlertCircle, Volume2, VolumeX, Mic, 
  MicOff, Play, Square, Info, Sparkle, AlertTriangle, MessageSquare, CheckSquare, Calendar, Clock
} from "lucide-react";
import { collection, addDoc, query, orderBy, onSnapshot, getDocs, deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import * as motion from "motion/react-client";

interface ChatInterfaceProps {
  user: any;
  userProfile?: any;
  tasks?: Task[];
  currentMood: string;
  currentEnergy: string;
  userEnergyState?: "Normal" | "Overwhelmed" | "Unmotivated";
  isMoodyMode?: boolean;
  initialTaskToBreakdown?: Task | null;
  onTaskBreakdownHandled?: () => void;
  onTaskUpdated?: () => void;
  triggerMoodyGreeting?: boolean;
  onMoodyGreetingTriggered?: () => void;
  onClose?: () => void;
}

interface SavedChat {
  id: string;
  title: string;
  createdAt: string;
  messages: Omit<ChatMessage, "id">[];
}

const formatScheduleDate = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch (e) {
    console.error("Error formatting date", e);
  }
  return dateStr;
};

export default function ChatInterface({ 
  user, 
  userProfile,
  tasks,
  currentMood,
  currentEnergy, 
  userEnergyState,
  isMoodyMode,
  initialTaskToBreakdown,
  onTaskBreakdownHandled,
  onTaskUpdated,
  triggerMoodyGreeting, 
  onMoodyGreetingTriggered, 
  onClose 
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [lockedTaskIds, setLockedTaskIds] = useState<Record<string, boolean>>({});
  const [lockingTargets, setLockingTargets] = useState(false);
  const [focusedTask, setFocusedTask] = useState<Task | null>(null);
  
  // Saved chats & Navigation state
  const [viewMode, setViewMode] = useState<"chat" | "saved_list" | "view_saved">("chat");
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [selectedSavedChat, setSelectedSavedChat] = useState<SavedChat | null>(null);
  const [loadingSavedChats, setLoadingSavedChats] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Custom Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Custom Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Voice output states (TTS)
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Voice input states (STT)
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const promptChips = [
    { label: "I'm feeling overwhelmed today", text: "I'm feeling overwhelmed by my tasks today. Can you help me find a gentle way forward?" },
    { label: "Break down a big goal", text: "I have a big goal but I'm procrastinating because it feels too large. Can you help me deconstruct it?" },
    { label: "Help me reschedule guilt-free", text: "I missed a few deadlines yesterday and I'm feeling guilty. How should I approach today?" },
    { label: "Give me a breathing space", text: "I need a quick mindful breathing exercise to calm down." },
    { label: "✨ Start a New Chat", text: "", action: "clear" }
  ];

  // Helper to map friendly task IDs (e.g., task_1) to real Tasks
  const getTaskFromFriendlyId = (friendlyId: string): Task | null => {
    if (!tasks || !Array.isArray(tasks)) return null;
    const match = friendlyId.match(/task_(\d+)/i);
    if (!match) return null;
    const index = parseInt(match[1]) - 1;
    if (index >= 0 && index < tasks.length) {
      return tasks[index];
    }
    return null;
  };

  // Agentic task execution handler
  const handleExecuteAction = async (action: "DELETE" | "RESCHEDULE", taskId: string, newDate?: string) => {
    if (!user) return;
    try {
      if (action === "DELETE") {
        await deleteDoc(doc(db, "users", user.uid, "tasks", taskId));
        showToast("Task dismissed successfully", "success");
      } else if (action === "RESCHEDULE" && newDate) {
        await updateDoc(doc(db, "users", user.uid, "tasks", taskId), {
          dueDate: newDate
        });
        showToast(`Task rescheduled to ${newDate}`, "success");
      }
      if (onTaskUpdated) {
        onTaskUpdated();
      }
    } catch (err) {
      console.error("Error executing agentic command:", err);
      showToast("An update error occurred. Please try again.", "error");
    }
  };

  // Automated background command checker (now intercepts with an agentic confirmation gateway!)
  const checkForAutomaticCommands = async (replyText: string) => {
    if (!user) return;
    
    // Check for [COMMAND: DELETE: task_x]
    const delMatch = replyText.match(/\[COMMAND:\s*DELETE:\s*(task_\d+)\]/i);
    if (delMatch) {
      const friendlyId = delMatch[1];
      const realTask = getTaskFromFriendlyId(friendlyId);
      if (realTask) {
        setConfirmModal({
          isOpen: true,
          title: "Rumi Proposes: Dismiss Task",
          message: `Rumi intends to dismiss the task "${realTask.title}". Would you like to proceed with this modification?`,
          onConfirm: async () => {
            try {
              await deleteDoc(doc(db, "users", user.uid, "tasks", realTask.id));
              showToast(`Task "${realTask.title}" dismissed successfully`, "success");
              if (onTaskUpdated) onTaskUpdated();
            } catch (e) {
              console.error("Auto delete failed", e);
              showToast("An update error occurred. Please try again.", "error");
            } finally {
              setConfirmModal(null);
            }
          }
        });
      }
    }

    // Check for [COMMAND: RESCHEDULE: task_x: YYYY-MM-DD]
    const reschedMatch = replyText.match(/\[COMMAND:\s*RESCHEDULE:\s*(task_\d+):\s*([\d\-]+)\]/i);
    if (reschedMatch) {
      const friendlyId = reschedMatch[1];
      const newDate = reschedMatch[2];
      const realTask = getTaskFromFriendlyId(friendlyId);
      if (realTask && newDate) {
        setConfirmModal({
          isOpen: true,
          title: "Rumi Proposes: Reschedule Task",
          message: `Rumi intends to reschedule the task "${realTask.title}" from ${realTask.dueDate || "No Date"} to ${newDate}. Would you like to proceed?`,
          onConfirm: async () => {
            try {
              await updateDoc(doc(db, "users", user.uid, "tasks", realTask.id), {
                dueDate: newDate
              });
              showToast(`Task "${realTask.title}" rescheduled to ${newDate}`, "success");
              if (onTaskUpdated) onTaskUpdated();
            } catch (e) {
              console.error("Auto reschedule failed", e);
              showToast("An update error occurred. Please try again.", "error");
            } finally {
              setConfirmModal(null);
            }
          }
        });
      }
    }
  };

  // Show customized toaster notifications
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // 1. Fetch active conversation messages
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "users", user.uid, "chats"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setMessages(msgs);
      setLoadingHistory(false);
    }, (error) => {
      console.error("Error fetching chats:", error);
      setLoadingHistory(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 1b. Automatic Moody Greeting Generator
  useEffect(() => {
    if (!triggerMoodyGreeting || !user) return;

    const generateAutomaticMoodyGreeting = async () => {
      setSending(true);
      try {
        // Fetch user's profile name from Firestore
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        const userName = docSnap.exists() ? docSnap.data().name : (user.displayName || "Friend");

        // Fetch the empathetic greeting from our server
        const response = await fetch("/api/moody-greeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userName })
        });
        const data = await response.json();
        const greetingText = data.response || `I can feel that things might be heavy right now, and I'm right here with you. Take a slow, deep breath... what is on your mind today?`;

        // Save this greeting to Firestore chats so it displays instantly
        const assistantMessage: Omit<ChatMessage, "id"> = {
          userId: user.uid,
          role: "model",
          content: greetingText,
          createdAt: new Date().toISOString()
        };
        const savedDocRef = await addDoc(collection(db, "users", user.uid, "chats"), assistantMessage);

        if (voiceEnabled) {
          speakText(greetingText, savedDocRef.id);
        }
      } catch (error) {
        console.error("Error generating automatic moody greeting:", error);
      } finally {
        setSending(false);
        // Call parent callback to reset state
        if (onMoodyGreetingTriggered) {
          onMoodyGreetingTriggered();
        }
      }
    };

    generateAutomaticMoodyGreeting();
  }, [triggerMoodyGreeting, user]);

  // Effect to handle "Ask Rumi" button click from the Dashboard
  useEffect(() => {
    if (initialTaskToBreakdown && user) {
      const task = initialTaskToBreakdown;
      setFocusedTask(task);
      if (onTaskBreakdownHandled) {
        onTaskBreakdownHandled();
      }
      
      const triggerBreakdown = async () => {
        // Wait briefly for history to finish loading
        if (loadingHistory) {
          setTimeout(triggerBreakdown, 500);
          return;
        }
        
        // Clear existing chats to start completely fresh
        await handleClearActiveSession(true);
        
        const promptText = `Hello Rumi! Please introduce the task "${task.title}" and provide a warm, empathetic, and brief overview of its details. Here is the task information / description / mail context: "${task.description || "No description provided"}".
Please read the contents of the mail/task/event in question, and give a clear, gentle overview. If Moody Mode is already on, please be extra soft, soothing, and supportive. At this stage, do NOT suggest subtasks or output any [BREAKDOWN_JSON] blocks yet—just explain the task calmly and ask me how we should proceed.`;
        handleSend(promptText, true, task);
      };
      
      triggerBreakdown();
    }
  }, [initialTaskToBreakdown, user, loadingHistory]);

  // Smart Scheduling and Subtask Insertion Algorithm ("Lock Targets")
  const handleLockTargets = async (parentTaskId: string, subtasks: (string | { title: string; dueDate?: string })[]) => {
    if (!user || lockingTargets) return;
    setLockingTargets(true);
    try {
      // Find parent task
      const parentTask = tasks?.find(t => t.id === parentTaskId);
      const parentTitle = parentTask ? parentTask.title : "Parent Task";
      const parentType = parentTask ? parentTask.type : "Session";
      const parentCategory = parentTask ? parentTask.category : "Work";
      
      const datesToChoose: string[] = [];
      const today = new Date();
      
      // Determine candidate schedule days
      let maxDays = 3;
      if (parentTask && parentTask.dueDate) {
        const parentDue = new Date(parentTask.dueDate);
        const diffTime = parentDue.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          maxDays = Math.min(7, diffDays); // cap range to 7 days
        }
      }
      
      // Generate list of dates
      for (let i = 0; i <= maxDays; i++) {
        const d = new Date();
        d.setDate(today.getDate() + i);
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - offset * 60 * 1000);
        datesToChoose.push(localDate.toISOString().split("T")[0]);
      }
      
      // Count active task counts for each candidate date to avoid overloading
      const dayLoad: Record<string, number> = {};
      datesToChoose.forEach(date => {
        dayLoad[date] = tasks?.filter(t => !t.completed && t.dueDate === date).length || 0;
      });
      
      // Insert subtasks sequentially to the chosen or least-busy days
      for (const item of subtasks) {
        let title = "";
        let chosenDate = "";
        
        if (typeof item === "string") {
          title = item;
          const sortedDates = [...datesToChoose].sort((a, b) => dayLoad[a] - dayLoad[b]);
          chosenDate = sortedDates[0];
        } else {
          title = item.title;
          if (item.dueDate) {
            chosenDate = item.dueDate;
          } else {
            const sortedDates = [...datesToChoose].sort((a, b) => dayLoad[a] - dayLoad[b]);
            chosenDate = sortedDates[0];
          }
        }
        
        dayLoad[chosenDate] = (dayLoad[chosenDate] || 0) + 1; // Increment count for subsequent checks
        
        const newTask = {
          userId: user.uid,
          title: title,
          description: `[Subtask of ${parentTitle}] Generated by Rumi to bypass starting friction.`,
          type: parentType,
          category: parentCategory,
          priority: isMoodyMode ? "Not Urgent" : "Priority",
          dueDate: chosenDate,
          completed: false,
          createdAt: new Date().toISOString(),
          timeSpentMs: 0
        };
        
        await addDoc(collection(db, "users", user.uid, "tasks"), newTask);
      }
      
      // Update parent task interventions
      if (parentTask && parentTaskId) {
        const parentRef = doc(db, "users", user.uid, "tasks", parentTaskId);
        const titles = subtasks.map(item => typeof item === "string" ? item : item.title);
        await updateDoc(parentRef, {
          pomodoroInterventions: titles
        });
      }
      
      setLockedTaskIds(prev => ({ ...prev, [parentTaskId]: true }));
      showToast("Targets Locked! Sub-tasks scheduled on your calendar successfully.", "success");
      
      if (onTaskUpdated) {
        onTaskUpdated();
      }
    } catch (err) {
      console.error("Error locking targets:", err);
      showToast("Could not lock targets. Please try again.", "error");
    } finally {
      setLockingTargets(false);
    }
  };

  // 2. Fetch saved chats list when switching modes
  const fetchSavedChats = async () => {
    if (!user) return;
    setLoadingSavedChats(true);
    try {
      const q = query(
        collection(db, "users", user.uid, "saved_chats"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const saved: SavedChat[] = [];
      snapshot.forEach((doc) => {
        saved.push({ id: doc.id, ...doc.data() } as SavedChat);
      });
      setSavedChats(saved);
    } catch (err) {
      console.error("Error loading saved chats:", err);
      showToast("Unable to load saved conversations. Please verify your connection.", "error");
    } finally {
      setLoadingSavedChats(false);
    }
  };

  useEffect(() => {
    if (viewMode === "saved_list") {
      fetchSavedChats();
    }
  }, [viewMode, user]);

  // Load available Speech Synthesis Voices (dynamic for each browser)
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      const allVoices = window.speechSynthesis.getVoices();
      setVoices(allVoices);
      
      // Filter all British English (en-GB) voices
      const ukVoices = allVoices.filter(v => 
        v.lang === "en-GB" || 
        v.lang.toLowerCase() === "en-gb" ||
        v.lang.replace("-", "_").toLowerCase() === "en_gb" ||
        v.name.toLowerCase().includes("united kingdom") ||
        v.name.toLowerCase().includes("uk ") ||
        v.name.toLowerCase().includes("british")
      );

      // Look for natural female British voice keywords (Sonia, Libby, Mia, Serena, Hazel, Fiona, Susan, Female)
      const femaleKeywords = ["google uk english female", "sonia", "libby", "mia", "serena", "hazel", "fiona", "susan", "victoria", "female", "zira", "stephanie"];
      
      let bestVoice = ukVoices.find(v => 
        femaleKeywords.some(kw => v.name.toLowerCase().includes(kw))
      );

      // Exclude standard male names/keywords to find female voice if no explicit match
      if (!bestVoice) {
        const maleKeywords = ["male", "daniel", "george", "oliver", "harry", "peter", "david", "james"];
        bestVoice = ukVoices.find(v => 
          !maleKeywords.some(kw => v.name.toLowerCase().includes(kw))
        );
      }

      // Fallback to first British voice
      if (!bestVoice) {
        bestVoice = ukVoices[0];
      }

      // General fallback to any female English voice
      if (!bestVoice) {
        bestVoice = allVoices.find(v => 
          v.lang.startsWith("en") && 
          femaleKeywords.some(kw => v.name.toLowerCase().includes(kw))
        );
      }

      // Absolute fallback to any English voice
      if (!bestVoice) {
        bestVoice = allVoices.find(v => v.lang.startsWith("en"));
      }
      
      if (bestVoice) {
        setSelectedVoice(bestVoice);
      }
    };

    loadVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Scroll to bottom helper
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, viewMode]);

  // TTS Reader
  const speakText = (text: string, msgId: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      showToast("Speech synthesis is not supported on this device/browser.", "info");
      return;
    }

    // Toggle off if currently speaking this message
    if (speakingId === msgId && isPlayingVoice) {
      window.speechSynthesis.cancel();
      setIsPlayingVoice(false);
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Clean text of markdown styles so it sounds fully natural
    const cleanText = text
      .replace(/[\*\#\_\`\>]/g, "") // remove formatting characters
      .replace(/\-\s+/g, "") // list items
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // link replacements
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    } else {
      // Direct backup search
      const backupVoices = window.speechSynthesis.getVoices();
      const brBackup = backupVoices.find(v => v.lang.toLowerCase().includes("gb") || v.name.toLowerCase().includes("uk"));
      if (brBackup) utterance.voice = brBackup;
    }

    // Set soothing & grounding parameters (British English)
    utterance.rate = 0.9; // Peaceful, relaxing cadence but natural
    utterance.pitch = 1.0; // Standard natural frequency

    utterance.onstart = () => {
      setSpeakingId(msgId);
      setIsPlayingVoice(true);
    };

    utterance.onend = () => {
      setIsPlayingVoice(false);
      setSpeakingId(null);
    };

    utterance.onerror = (e) => {
      console.warn("Speech Synthesis error:", e);
      setIsPlayingVoice(false);
      setSpeakingId(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error("Error stopping recognition on unmount:", e);
        }
      }
    };
  }, []);

  // STT Microphone Recognition
  const startSpeechRecognition = async () => {
    const SpeechReq = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechReq) {
      showToast("Speech recognition (STT) is not supported in this browser. Try Chrome or Safari.", "info");
      return;
    }

    if (listening) {
      // If already listening, stop it (it will trigger onend)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error("Error stopping speech recognition:", e);
        }
      }
      return;
    }

    try {
      // Explicitly request microphone permissions first to trigger browser prompt inside the sandbox
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately, we only needed permissions resolved
      stream.getTracks().forEach(track => track.stop());
    } catch (err: any) {
      console.error("Microphone permission prompt failed:", err);
      showToast("Microphone permission was denied. Please allow microphone access in your browser settings.", "error");
      return;
    }

    const recognition = new SpeechReq();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      showToast("Listening... Speak clearly to Rumi", "info");
    };

    recognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      setInputText(prev => prev ? prev + " " + speechToText : speechToText);
      showToast("Voice captured!", "success");
    };

    recognition.onerror = (err: any) => {
      console.error("Speech recognition error:", err);
      setListening(false);
      if (err.error === 'not-allowed') {
        showToast("Microphone access denied. Please grant microphone permission in your browser.", "error");
      } else if (err.error === 'service-not-allowed') {
        showToast("Speech recognition is blocked inside iframes by browser policies. Click the 'Open in New Tab' icon at the top-right of your preview to use your microphone!", "error");
      } else if (err.error === 'no-speech') {
        showToast("No speech detected. Please speak closer to the microphone.", "info");
      } else {
        showToast(`Microphone error: ${err.error || "Unable to capture input"}`, "error");
      }
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (e: any) {
      console.error("Failed to start speech recognition:", e);
      showToast("Could not start microphone. Check browser permissions or if another app is using it.", "error");
      setListening(false);
    }
  };

  const handleSend = async (textToSend?: string, isFreshStart = false, taskOverride?: Task | null) => {
    const text = textToSend || inputText;
    if (!text.trim() || sending) return;

    setInputText("");
    setSending(true);

    const userMessage: Omit<ChatMessage, "id"> = {
      userId: user.uid,
      role: "user",
      content: text,
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Add to Firestore active session
      await addDoc(collection(db, "users", user.uid, "chats"), userMessage);

      // 2. Prepare payload for server
      const chatContext = isFreshStart ? [] : messages.slice(-5).map(m => ({
        role: m.role,
        content: m.content
      }));
      chatContext.push({ role: "user", content: text });

      // 3. Post to Express backend
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatContext,
          mood: currentMood,
          energyLevel: currentEnergy,
          userEnergyState: userEnergyState || "Normal",
          isMoodyMode: !!isMoodyMode,
          tasks: tasks || [],
          selectedTask: taskOverride !== undefined ? taskOverride : focusedTask,
          preferredName: userProfile?.name || user?.displayName || "Anonymous User"
        })
      });

      const data = await response.json();
      const reply = data.response || "I am here with you. Let's take it one step at a time.";

      // Check for automated agentic task commands
      await checkForAutomaticCommands(reply);

      // 4. Save model reply to Firestore
      const assistantMessage: Omit<ChatMessage, "id"> = {
        userId: user.uid,
        role: "model",
        content: reply,
        createdAt: new Date().toISOString()
      };
      
      const savedDocRef = await addDoc(collection(db, "users", user.uid, "chats"), assistantMessage);

      // 5. Speak reply automatically if voice is enabled!
      if (voiceEnabled) {
        speakText(reply, savedDocRef.id);
      }

    } catch (error) {
      console.error("Error sending message:", error);
      const errorContent = "I want to listen, but I'm having trouble connecting to my creative center right now. Let's pause, take a deep breath together, and try again in a moment.";
      const fallbackMsg: Omit<ChatMessage, "id"> = {
        userId: user.uid,
        role: "model",
        content: errorContent,
        createdAt: new Date().toISOString()
      };
      const savedDocRef = await addDoc(collection(db, "users", user.uid, "chats"), fallbackMsg);
      if (voiceEnabled) {
        speakText(errorContent, savedDocRef.id);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSaveSession = async () => {
    if (messages.length === 0 || !user) return;
    setIsSaving(true);
    try {
      const finalTitle = saveTitle.trim() || `Session on ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      const savedDoc: Omit<SavedChat, "id"> = {
        title: finalTitle,
        createdAt: new Date().toISOString(),
        messages: messages.map(m => ({
          userId: m.userId || user.uid || "",
          role: m.role || "user",
          content: m.content || "",
          createdAt: m.createdAt || new Date().toISOString()
        }))
      };

      await addDoc(collection(db, "users", user.uid, "saved_chats"), savedDoc);
      setShowSaveDialog(false);
      setSaveTitle("");
      
      // Immediately refresh list of saved chats so they can find it
      await fetchSavedChats();
      
      showToast("Conversation saved to Saved Conversations!", "success");
    } catch (err) {
      console.error("Error saving conversation:", err);
      showToast("Failed to save the conversation. Please try again.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSavedChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setConfirmModal({
      isOpen: true,
      title: "Delete Saved Chat?",
      message: "This will permanently remove this saved dialogue from your cloud storage. This action is irreversible.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "users", user.uid, "saved_chats", id));
          setSavedChats(prev => prev.filter(c => c.id !== id));
          showToast("Conversation deleted successfully.", "info");
        } catch (err) {
          console.error("Error deleting saved chat:", err);
          showToast("Failed to delete saved conversation.", "error");
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  const handleClearActiveSession = async (silent = false) => {
    if (messages.length === 0) {
      if (!silent) {
        showToast("Your active session is already fresh!", "info");
      }
      return;
    }

    const performClear = async () => {
      setClearing(true);
      try {
        const q = query(collection(db, "users", user.uid, "chats"));
        const snapshot = await getDocs(q);
        for (const docSnapshot of snapshot.docs) {
          await deleteDoc(docSnapshot.ref);
        }
        setMessages([]);
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        if (!silent) {
          showToast("Started a completely fresh chat space!", "success");
        }
      } catch (err) {
        console.error("Error clearing chats:", err);
        if (!silent) {
          showToast("Failed to clear current conversation.", "error");
        }
      } finally {
        setClearing(false);
        setConfirmModal(null);
      }
    };

    if (silent) {
      await performClear();
    } else {
      setConfirmModal({
        isOpen: true,
        title: "Start a Fresh Conversation?",
        message: "This will clear your active conversation thread. If there are valuable insights, remember to save them first using the Save button!",
        onConfirm: performClear
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      {/* Backdrop click closes drawer */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 border ${
              toast.type === "success" 
                ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                : toast.type === "error" 
                ? "bg-red-50 border-red-100 text-red-800" 
                : "bg-amber-50 border-amber-100 text-amber-800"
            }`}
          >
            {toast.type === "success" ? (
              <Check className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
            ) : toast.type === "error" ? (
              <AlertTriangle className="h-4.5 w-4.5 text-red-600 shrink-0" />
            ) : (
              <Info className="h-4.5 w-4.5 text-amber-600 shrink-0" />
            )}
            <span className="text-xs font-semibold tracking-wide font-sans">{toast.message}</span>
          </motion.div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="absolute inset-0" onClick={() => setConfirmModal(null)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md bg-white border border-[#E5E2D9] rounded-3xl p-6 shadow-2xl space-y-4 z-10"
          >
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold font-serif text-[#1A2B32]">{confirmModal.title}</h4>
                <p className="text-xs text-[#8A958E] mt-1.5 leading-relaxed font-sans">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 border border-[#E5E2D9] hover:bg-[#E9E7DF]/20 text-xs font-semibold text-[#8A958E] rounded-xl transition"
              >
                No, cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
              >
                Yes, proceed
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Drawer content */}
      <motion.div 
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-[#E5E2D9] z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#D1D5DB] shrink-0 bg-white">
          <div className="flex items-center gap-3">
            {viewMode !== "chat" ? (
              <button 
                onClick={() => setViewMode("chat")}
                className="p-1.5 hover:bg-[#E5E7EB]/40 rounded-lg text-[#2C7A7B] transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <motion.div 
                className="h-10 w-10 rounded-full flex items-center justify-center border border-[#5AA9A7]/30 relative overflow-hidden"
                animate={sending ? { 
                  boxShadow: [
                    "0 0 0px rgba(90, 169, 167, 0.4)", 
                    "0 0 15px rgba(90, 169, 167, 0.8)", 
                    "0 0 0px rgba(90, 169, 167, 0.4)"
                  ],
                  scale: [1, 1.05, 1]
                } : {}}
                transition={sending ? { repeat: Infinity, duration: 2 } : {}}
              >
                <svg viewBox="0 0 100 100" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="50" cy="50" r="50" fill="#00606E" />
                  <rect x="34" y="34" width="32" height="32" rx="9" fill="#FCFBF7" transform="rotate(45 50 50)" />
                </svg>
              </motion.div>
            )}
            <div>
              <h3 className="font-serif font-semibold text-sm text-[#2C7A7B]">
                {viewMode === "chat" ? "Chat with Rumi" : viewMode === "saved_list" ? "Saved Conversations" : selectedSavedChat?.title}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" />
                <p className="text-[10px] text-[#6B7280] font-serif italic">
                  {viewMode === "chat" ? "Grounding British voice active" : "Your cloud-persisted guidance archive"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Soothing British Voice auto-speech toggle */}
            {viewMode === "chat" && (
              <button
                onClick={() => {
                  const val = !voiceEnabled;
                  setVoiceEnabled(val);
                  if (!val && typeof window !== "undefined" && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                    setIsPlayingVoice(false);
                    setSpeakingId(null);
                  }
                  showToast(val ? "Rumi voice output enabled" : "Rumi voice output muted", "info");
                }}
                className={`p-2 rounded-xl transition flex items-center justify-center ${
                  voiceEnabled 
                    ? "bg-[#5AA9A7]/20 text-[#2C7A7B] hover:bg-[#5AA9A7]/30" 
                    : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                }`}
                title={voiceEnabled ? "Mute Rumi Voice" : "Unmute Rumi Voice"}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            )}

            {viewMode === "chat" && messages.length > 0 && (
              <>
                <button
                  onClick={() => setShowSaveDialog(true)}
                  title="Save conversation"
                  className="p-2 hover:bg-[#E5E7EB]/50 text-[#2C7A7B] rounded-xl transition"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleClearActiveSession(false)}
                  disabled={clearing}
                  title="Clear conversation"
                  className="p-2 hover:bg-red-50 text-red-600 rounded-xl transition disabled:opacity-50"
                >
                  {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </button>
              </>
            )}

            {viewMode === "chat" && (
              <button
                onClick={() => {
                  setViewMode("saved_list");
                  setShowSaveDialog(false);
                }}
                title="View saved conversations"
                className="p-2 hover:bg-[#E5E7EB]/50 text-[#2C7A7B] rounded-xl transition"
              >
                <History className="h-4 w-4" />
              </button>
            )}

            {onClose && (
              <button 
                onClick={onClose}
                className="p-2 hover:bg-[#E9E7DF]/50 rounded-xl text-[#8A958E] transition"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Save Title Dialog Dropdown */}
        {showSaveDialog && (
          <div className="bg-[#F8F7F2] border-b border-[#E5E2D9] p-4 flex flex-col gap-3 shrink-0">
            <div className="text-xs font-semibold text-[#1A2B32]">Name your saved conversation</div>
            <div className="flex gap-2">
              <input 
                type="text"
                placeholder={`Session on ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                className="flex-1 bg-white border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] rounded-xl px-3 py-2 text-xs"
              />
              <button 
                onClick={handleSaveSession}
                disabled={isSaving}
                className="bg-[#5AA9A7] hover:bg-[#2C7A7B] text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </button>
              <button 
                onClick={() => setShowSaveDialog(false)}
                className="border border-[#E5E2D9] hover:bg-[#E5E2D9]/40 rounded-xl px-3 py-2 text-xs transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          
          {/* VIEW: Active Chat Screen */}
          {viewMode === "chat" && (
            <>
              {focusedTask && (
                <div className="mb-4 p-4 bg-[#F0F7F6] border border-[#DCEBE9] rounded-2xl shadow-xs relative overflow-hidden transition-all duration-300">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-[#5AA9A7]/5 rounded-full blur-xl pointer-events-none"></div>
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-[9px] font-bold tracking-wider text-[#00606E] uppercase bg-[#E0ECEB] px-2 py-0.5 rounded-md">
                          Task Focus
                        </span>
                        {focusedTask.priority && (
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase ${
                            focusedTask.priority === "High-Priority" 
                              ? "bg-rose-50 text-rose-600" 
                              : focusedTask.priority === "Priority" 
                              ? "bg-amber-50 text-amber-600" 
                              : "bg-emerald-50 text-emerald-600"
                          }`}>
                            {focusedTask.priority}
                          </span>
                        )}
                        {focusedTask.dueDate && (
                          <span className="text-[9px] text-[#8A958E] flex items-center gap-1 font-mono">
                            <Clock className="h-2.5 w-2.5" /> {focusedTask.dueDate}
                          </span>
                        )}
                      </div>
                      <h4 className="font-serif font-semibold text-xs text-[#1A2B32] mt-1.5">
                        {focusedTask.title}
                      </h4>
                      {focusedTask.description && (
                        <p className="text-[10px] text-[#4A5568] leading-relaxed line-clamp-2 mt-0.5">
                          {focusedTask.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setFocusedTask(null)}
                      title="Clear Focus"
                      className="p-1 hover:bg-[#E0ECEB] text-[#8A958E] hover:text-[#1A2B32] rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-[#8A958E] text-xs font-serif italic">
                  <Loader2 className="h-5 w-5 animate-spin text-[#5AA9A7]" />
                  <span>Restoring our conversation...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto space-y-4 py-12">
                  <div className="h-12 w-12 bg-[#F8F7F2] border border-[#E5E2D9] rounded-2xl flex items-center justify-center text-[#00606E]">
                    <Heart className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-serif font-semibold text-sm text-[#1A2B32]">Begin a Gentle Dialogue</h4>
                    <p className="text-xs text-[#8A958E] mt-1.5 leading-relaxed font-sans">
                      Rumi is here to help you break down overwhelm, plan your focus, and unpack emotional blocks. Try choosing one of the support options below to begin.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((m, index) => {
                    const isUser = m.role === "user";
                    const isSpeakingThis = speakingId === m.id && isPlayingVoice;

                    // Parse potential Rumi subtask breakdown JSON tags and agentic proposals
                    let displayText = m.content;
                    let breakdownData: { parentTaskId: string; subtasks: (string | { title: string; dueDate?: string })[] } | null = null;
                    let proposalData: { type: "DELETE" | "RESCHEDULE"; task: Task; newDate?: string } | null = null;

                    const tagIndex = m.content.indexOf("[BREAKDOWN_JSON:");
                    if (tagIndex !== -1 && !isUser) {
                      const endIndex = m.content.lastIndexOf("]");
                      if (endIndex > tagIndex) {
                        try {
                          const jsonStr = m.content.substring(tagIndex + 16, endIndex);
                          breakdownData = JSON.parse(jsonStr);
                        } catch (e) {
                          console.error("Failed to parse breakdown JSON tag:", e);
                        }
                        // Always strip raw JSON to avoid unprofessional logs/views
                        displayText = m.content.substring(0, tagIndex) + m.content.substring(endIndex + 1);
                      } else {
                        displayText = m.content.substring(0, tagIndex);
                      }
                    }

                    // Parse agentic proposals
                    if (!isUser) {
                      // Pattern: [PROPOSAL: DELETE: task_x]
                      const propDelMatch = displayText.match(/\[PROPOSAL:\s*DELETE:\s*(task_\d+)\]/i);
                      if (propDelMatch) {
                        const friendlyId = propDelMatch[1];
                        const t = getTaskFromFriendlyId(friendlyId);
                        if (t) {
                          proposalData = { type: "DELETE", task: t };
                        }
                        displayText = displayText.replace(propDelMatch[0], "");
                      }

                      // Pattern: [PROPOSAL: RESCHEDULE: task_x: YYYY-MM-DD]
                      const propReschedMatch = displayText.match(/\[PROPOSAL:\s*RESCHEDULE:\s*(task_\d+):\s*([\d\-]+)\]/i);
                      if (propReschedMatch) {
                        const friendlyId = propReschedMatch[1];
                        const newDate = propReschedMatch[2];
                        const t = getTaskFromFriendlyId(friendlyId);
                        if (t) {
                          proposalData = { type: "RESCHEDULE", task: t, newDate };
                        }
                        displayText = displayText.replace(propReschedMatch[0], "");
                      }

                      // Also strip any COMMAND tags that might be in the string
                      displayText = displayText.replace(/\[COMMAND:\s*DELETE:\s*task_\d+\]/gi, "");
                      displayText = displayText.replace(/\[COMMAND:\s*RESCHEDULE:\s*task_\d+:\s*[\d\-]+\]/gi, "");
                    }

                    return (
                      <div
                        key={m.id || index}
                        className={`flex ${isUser ? "justify-end" : "justify-start"} items-start gap-2`}
                      >
                        {!isUser && (
                          <div className="flex flex-col gap-1 shrink-0 mt-1">
                            <button
                              onClick={() => speakText(m.content, m.id)}
                              className={`p-1.5 rounded-full border transition flex items-center justify-center ${
                                isSpeakingThis 
                                  ? "bg-[#2C7A7B] text-white border-[#2C7A7B] animate-pulse" 
                                  : "bg-white text-[#8A958E] border-gray-200 hover:text-[#2C7A7B] hover:border-[#5AA9A7]"
                              }`}
                              title={isSpeakingThis ? "Stop speaking" : "Listen to Rumi's voice"}
                            >
                              {isSpeakingThis ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
                            </button>
                          </div>
                        )}

                        <div
                          className={`max-w-[80%] rounded-2xl p-4 text-xs leading-relaxed ${
                            isUser
                              ? "bg-[#5AA9A7] text-white rounded-br-none shadow-xs font-sans whitespace-pre-wrap"
                              : "bg-[#FDFCF8] text-[#2D3748] rounded-bl-none border border-[#D1D5DB] font-sans"
                          }`}
                        >
                          {isUser ? (
                            displayText
                          ) : (
                            <div className="markdown-body prose max-w-none text-xs text-[#2D3748] space-y-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold [&_p]:mb-1 last:[&_p]:mb-0">
                              <Markdown>{displayText}</Markdown>
                            </div>
                          )}

                          {breakdownData && (
                            <div className="mt-4 p-4 bg-white border border-[#E5E2D9] rounded-2xl shadow-xs font-sans not-italic text-left space-y-3">
                              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                                <CheckSquare className="h-4 w-4 text-[#00606E]" />
                                <span className="text-xs font-bold text-[#1A2B32] uppercase tracking-wide">Rumi's Focused Breakdown</span>
                              </div>
                              <div className="space-y-2">
                                {breakdownData.subtasks.map((sub, sIdx) => {
                                  const title = typeof sub === "string" ? sub : sub.title;
                                  const dueDate = typeof sub === "string" ? null : sub.dueDate;
                                  return (
                                    <div key={sIdx} className="flex items-start justify-between gap-2.5 border-b border-gray-50/50 pb-1.5 last:border-0 last:pb-0">
                                      <div className="flex items-start gap-2.5">
                                        <div className="h-4 w-4 rounded-md border border-gray-300 bg-[#EAF0EB] flex items-center justify-center shrink-0 mt-0.5">
                                          <Check className="h-3 w-3 text-[#00606E]" />
                                        </div>
                                        <span className="text-[11px] text-[#4A5568] leading-tight font-medium">{title}</span>
                                      </div>
                                      {dueDate && (
                                        <span className="text-[9px] font-sans font-semibold bg-[#EBF7F6] text-[#00606E] border border-[#D1ECEB] rounded px-1.5 py-0.5 shrink-0">
                                          {formatScheduleDate(dueDate)}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              
                              <div className="pt-2">
                                {lockedTaskIds[breakdownData.parentTaskId] ? (
                                  <div className="w-full bg-[#EAF0EB] text-[#2C3E2B] text-[10px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1">
                                    <Check className="h-3.5 w-3.5" />
                                    <span>PLAN ACCEPTED & SCHEDULED</span>
                                  </div>
                                ) : (
                                  <button
                                    id={`btn-lock-targets-${breakdownData.parentTaskId}`}
                                    onClick={() => handleLockTargets(breakdownData!.parentTaskId, breakdownData!.subtasks)}
                                    disabled={lockingTargets}
                                    className="w-full bg-[#00606E] hover:bg-[#004550] text-white font-bold py-2.5 px-3 rounded-xl text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                                  >
                                    {lockingTargets ? (
                                      <Loader2 className="h-3 w-3 animate-spin text-white" />
                                    ) : (
                                      <Calendar className="h-3.5 w-3.5 text-white" />
                                    )}
                                    <span>ACCEPT PLAN</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {proposalData && proposalData.type === "DELETE" && proposalData.task && (
                            <div className="mt-4 p-4 bg-red-50/50 border border-red-100 rounded-2xl text-left font-sans space-y-3 not-italic">
                              <div className="flex items-center gap-2 text-red-700">
                                <Trash2 className="h-4 w-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Rumi Proposes: Dismiss Task</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-red-100/50 space-y-1 shadow-2xs">
                                <div className="text-xs font-bold text-gray-800">{proposalData.task.title}</div>
                                <div className="text-[10px] text-gray-500 font-medium">Due: {proposalData.task.dueDate || "No date"} • Priority: {proposalData.task.priority}</div>
                              </div>
                              <div className="text-xs font-medium text-gray-700">Shall I proceed?</div>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => handleExecuteAction("DELETE", proposalData!.task.id)}
                                  className="px-3 py-1.5 bg-[#00606E] hover:bg-[#004550] text-white text-[10px] font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  <Check className="h-3 w-3" />
                                  <span>Yes, proceed</span>
                                </button>
                                <button
                                  onClick={() => showToast("Dismiss canceled", "info")}
                                  className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-[10px] font-semibold text-gray-500 rounded-xl transition cursor-pointer bg-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {proposalData && proposalData.type === "RESCHEDULE" && proposalData.task && (
                            <div className="mt-4 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl text-left font-sans space-y-3 not-italic">
                              <div className="flex items-center gap-2 text-amber-700">
                                <Calendar className="h-4 w-4" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Rumi Proposes: Reschedule Task</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-amber-100/50 space-y-1 shadow-2xs">
                                <div className="text-xs font-bold text-gray-800">{proposalData.task.title}</div>
                                <div className="text-[10px] text-gray-600 font-medium">Current Date: {proposalData.task.dueDate || "No date"}</div>
                                <div className="text-[10px] text-amber-700 font-bold flex items-center gap-1">
                                  <ArrowLeft className="h-3 w-3 rotate-180" /> Proposed New Date: {proposalData.newDate}
                                </div>
                              </div>
                              <div className="text-xs font-medium text-gray-700">Shall I proceed?</div>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => handleExecuteAction("RESCHEDULE", proposalData!.task.id, proposalData!.newDate)}
                                  className="px-3 py-1.5 bg-[#00606E] hover:bg-[#004550] text-white text-[10px] font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  <Check className="h-3 w-3" />
                                  <span>Yes, proceed</span>
                                </button>
                                <button
                                  onClick={() => showToast("Rescheduling canceled", "info")}
                                  className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-[10px] font-semibold text-gray-500 rounded-xl transition cursor-pointer bg-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                          
                          {isSpeakingThis && (
                            <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-[#E5E2D9] text-[10px] text-[#00606E] font-semibold font-serif select-none">
                              <span className="h-1.5 w-1.5 bg-[#2C7A7B] rounded-full animate-ping" />
                              Speaking in grounding British voice...
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-[#F8F7F2] text-[#8A958E] rounded-2xl rounded-bl-none p-4 text-xs flex items-center gap-2 border border-[#E5E2D9] font-serif italic">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#5AA9A7]" />
                        <span>Rumi is typing gently...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}
            </>
          )}

          {/* VIEW: Saved Chats List */}
          {viewMode === "saved_list" && (
            <div className="space-y-3 h-full">
              {loadingSavedChats ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-[#8A958E] text-xs font-serif italic">
                  <Loader2 className="h-5 w-5 animate-spin text-[#5AA9A7]" />
                  <span>Loading guidance archive...</span>
                </div>
              ) : savedChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center max-w-xs mx-auto space-y-3 py-12">
                  <div className="h-10 w-10 rounded-xl bg-[#F8F7F2] flex items-center justify-center text-[#8A958E]">
                    <History className="h-5 w-5" />
                  </div>
                  <h4 className="font-serif font-semibold text-xs text-[#1A2B32]">No Saved Conversations Yet</h4>
                  <p className="text-[11px] text-[#8A958E]">
                    When you have a meaningful conversation with Rumi, click the **Save** icon in the top right to store it safely here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedChats.map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => {
                        setSelectedSavedChat(chat);
                        setViewMode("view_saved");
                      }}
                      className="p-4 bg-[#F8F7F2] hover:bg-[#E9E7DF]/50 border border-[#E5E2D9] rounded-2xl cursor-pointer transition flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-[#1A2B32] truncate">{chat.title}</div>
                        <div className="text-[10px] text-[#8A958E] mt-0.5">
                          {new Date(chat.createdAt).toLocaleDateString(undefined, { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })} • {chat.messages.length} messages
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSavedChat(chat.id, e)}
                        className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition opacity-0 group-hover:opacity-100"
                        title="Delete saved chat"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW: Read-only Saved Chat viewer */}
          {viewMode === "view_saved" && selectedSavedChat && (
            <div className="space-y-4">
              <div className="p-3 bg-[#FCFBF7] border border-[#E5E2D9] rounded-xl text-[10px] text-[#8A958E] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[#5AA9A7]" />
                <span>You are viewing a saved conversation from {new Date(selectedSavedChat.createdAt).toLocaleString()}.</span>
              </div>
              <div className="space-y-4">
                {selectedSavedChat.messages.map((m, index) => {
                  const isUser = m.role === "user";

                  // Parse potential Rumi subtask breakdown JSON tags and agentic proposals
                  let displayText = m.content;
                  let breakdownData: { parentTaskId: string; subtasks: (string | { title: string; dueDate?: string })[] } | null = null;
                  let proposalData: { type: "DELETE" | "RESCHEDULE"; task: Task; newDate?: string } | null = null;

                  const tagIndex = m.content.indexOf("[BREAKDOWN_JSON:");
                  if (tagIndex !== -1 && !isUser) {
                    const endIndex = m.content.lastIndexOf("]");
                    if (endIndex > tagIndex) {
                      try {
                        const jsonStr = m.content.substring(tagIndex + 16, endIndex);
                        breakdownData = JSON.parse(jsonStr);
                      } catch (e) {
                        console.error("Failed to parse breakdown JSON tag in saved chat:", e);
                      }
                      // Always strip raw JSON to avoid unprofessional logs/views
                      displayText = m.content.substring(0, tagIndex) + m.content.substring(endIndex + 1);
                    } else {
                      displayText = m.content.substring(0, tagIndex);
                    }
                  }

                  // Parse agentic proposals
                  if (!isUser) {
                    // Pattern: [PROPOSAL: DELETE: task_x]
                    const propDelMatch = displayText.match(/\[PROPOSAL:\s*DELETE:\s*(task_\d+)\]/i);
                    if (propDelMatch) {
                      const friendlyId = propDelMatch[1];
                      const t = getTaskFromFriendlyId(friendlyId);
                      if (t) {
                        proposalData = { type: "DELETE", task: t };
                      }
                      displayText = displayText.replace(propDelMatch[0], "");
                    }

                    // Pattern: [PROPOSAL: RESCHEDULE: task_x: YYYY-MM-DD]
                    const propReschedMatch = displayText.match(/\[PROPOSAL:\s*RESCHEDULE:\s*(task_\d+):\s*([\d\-]+)\]/i);
                    if (propReschedMatch) {
                      const friendlyId = propReschedMatch[1];
                      const newDate = propReschedMatch[2];
                      const t = getTaskFromFriendlyId(friendlyId);
                      if (t) {
                        proposalData = { type: "RESCHEDULE", task: t, newDate };
                      }
                      displayText = displayText.replace(propReschedMatch[0], "");
                    }

                    // Also strip any COMMAND tags that might be in the string
                    displayText = displayText.replace(/\[COMMAND:\s*DELETE:\s*task_\d+\]/gi, "");
                    displayText = displayText.replace(/\[COMMAND:\s*RESCHEDULE:\s*task_\d+:\s*[\d\-]+\]/gi, "");
                  }

                  return (
                    <div
                      key={index}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                          isUser
                            ? "bg-[#5AA9A7] text-white rounded-br-none shadow-xs font-sans whitespace-pre-wrap"
                            : "bg-[#FDFCF8] text-[#2D3748] rounded-bl-none border border-[#D1D5DB] font-sans"
                        }`}
                      >
                        {isUser ? (
                          displayText
                        ) : (
                          <div className="markdown-body prose max-w-none text-xs text-[#2D3748] space-y-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold [&_p]:mb-1 last:[&_p]:mb-0">
                            <Markdown>{displayText}</Markdown>
                          </div>
                        )}

                        {breakdownData && (
                          <div className="mt-4 p-4 bg-white border border-[#E5E2D9] rounded-2xl shadow-xs font-sans not-italic text-left space-y-3">
                            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                              <CheckSquare className="h-4 w-4 text-[#00606E]" />
                              <span className="text-xs font-bold text-[#1A2B32] uppercase tracking-wide">Rumi's Focused Breakdown</span>
                            </div>
                            <div className="space-y-2">
                              {breakdownData.subtasks.map((sub, sIdx) => {
                                const title = typeof sub === "string" ? sub : sub.title;
                                const dueDate = typeof sub === "string" ? null : sub.dueDate;
                                return (
                                  <div key={sIdx} className="flex items-start justify-between gap-2.5 border-b border-gray-50/50 pb-1.5 last:border-0 last:pb-0">
                                    <div className="flex items-start gap-2.5">
                                      <div className="h-4 w-4 rounded-md border border-gray-300 bg-[#EAF0EB] flex items-center justify-center shrink-0 mt-0.5">
                                        <Check className="h-3 w-3 text-[#00606E]" />
                                      </div>
                                      <span className="text-[11px] text-[#4A5568] leading-tight font-medium">{title}</span>
                                    </div>
                                    {dueDate && (
                                      <span className="text-[9px] font-sans font-semibold bg-[#EBF7F6] text-[#00606E] border border-[#D1ECEB] rounded px-1.5 py-0.5 shrink-0">
                                        {formatScheduleDate(dueDate)}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            
                            {/* State-Dependent UI Control: If a task has already been accepted/committed to database, the button MUST be completely stripped */}
                            {!lockedTaskIds[breakdownData.parentTaskId] && (
                              <div className="pt-2">
                                <button
                                  id={`btn-lock-targets-saved-${breakdownData.parentTaskId}`}
                                  onClick={() => handleLockTargets(breakdownData!.parentTaskId, breakdownData!.subtasks)}
                                  disabled={lockingTargets}
                                  className="w-full bg-[#00606E] hover:bg-[#004550] text-white font-bold py-2.5 px-3 rounded-xl text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                                >
                                  {lockingTargets ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-white" />
                                  ) : (
                                    <Calendar className="h-3.5 w-3.5 text-white" />
                                  )}
                                  <span>ACCEPT PLAN</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {proposalData && proposalData.type === "DELETE" && proposalData.task && (
                          <div className="mt-4 p-4 bg-red-50/50 border border-red-100 rounded-2xl text-left font-sans space-y-3 not-italic">
                            <div className="flex items-center gap-2 text-red-700">
                              <Trash2 className="h-4 w-4" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Rumi Proposes: Dismiss Task</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-red-100/50 space-y-1 shadow-2xs">
                              <div className="text-xs font-bold text-gray-800">{proposalData.task.title}</div>
                              <div className="text-[10px] text-gray-500 font-medium">Due: {formatScheduleDate(proposalData.task.dueDate || "") || "No date"} • Priority: {proposalData.task.priority}</div>
                            </div>
                            <div className="text-xs font-medium text-gray-700">Shall I proceed?</div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => handleExecuteAction("DELETE", proposalData!.task.id)}
                                className="px-3 py-1.5 bg-[#00606E] hover:bg-[#004550] text-white text-[10px] font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Check className="h-3 w-3" />
                                <span>Yes, proceed</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {proposalData && proposalData.type === "RESCHEDULE" && proposalData.task && (
                          <div className="mt-4 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl text-left font-sans space-y-3 not-italic">
                            <div className="flex items-center gap-2 text-amber-700">
                              <Calendar className="h-4 w-4" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Rumi Proposes: Reschedule Task</span>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-amber-100/50 space-y-1 shadow-2xs">
                              <div className="text-xs font-bold text-gray-800">{proposalData.task.title}</div>
                              <div className="text-[10px] text-gray-600 font-medium">Current Date: {formatScheduleDate(proposalData.task.dueDate || "") || "No date"}</div>
                              <div className="text-[10px] text-amber-700 font-bold flex items-center gap-1">
                                <ArrowLeft className="h-3 w-3 rotate-180" /> Proposed New Date: {formatScheduleDate(proposalData.newDate || "")}
                              </div>
                            </div>
                            <div className="text-xs font-medium text-gray-700">Shall I proceed?</div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => handleExecuteAction("RESCHEDULE", proposalData!.task.id, proposalData!.newDate)}
                                className="px-3 py-1.5 bg-[#00606E] hover:bg-[#004550] text-white text-[10px] font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Check className="h-3 w-3" />
                                <span>Yes, proceed</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Suggestion Chips (Only on active empty chat) */}
        {viewMode === "chat" && messages.length === 0 && !loadingHistory && (
          <div className="p-6 grid grid-cols-2 gap-2 border-t border-[#E5E2D9] shrink-0 bg-[#FCFBF7]/60">
            {promptChips.map((chip, i) => (
              <button
                key={i}
                onClick={() => {
                  if (chip.action === "clear") {
                    handleClearActiveSession(false);
                  } else {
                    handleSend(chip.text);
                  }
                }}
                className="p-2.5 text-left border border-[#D1D5DB] rounded-xl hover:border-[#5AA9A7] bg-[#FDFCF8] text-[10px] text-[#2D3748] font-bold uppercase tracking-wider transition-all line-clamp-2"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Chat Input (Only on Active Chat screen) */}
        {viewMode === "chat" && (
          <div className="border-t border-[#E5E2D9] p-6 shrink-0 bg-white space-y-4">
            {/* Task-specific suggestion prompts when Ask Rumi is active */}
            {focusedTask && (
              <div className="flex flex-wrap gap-2 pb-1.5">
                {[
                  { label: "Help me break this task", text: "Help me break this task down into manageable targets." },
                  { label: "I don't know where to start", text: "I don't know where to start with this task. Can you help me find the first simple step?" },
                  { label: "I'm confused what the task demands", text: "I'm confused about what this task actually demands from me. Can you help me unpack it?" }
                ].map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(chip.text)}
                    className="px-3 py-1.5 border border-[#00606E]/20 hover:border-[#00606E]/50 rounded-xl bg-[#F0FDF4]/30 hover:bg-[#F0FDF4]/60 text-[10px] text-[#00606E] font-semibold transition-all cursor-pointer shadow-2xs"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2"
            >
              {/* Mic STT Input */}
              <button
                type="button"
                onClick={startSpeechRecognition}
                className={`p-3 rounded-xl border transition-all shrink-0 flex items-center justify-center ${
                  listening 
                    ? "bg-rose-500 border-rose-500 text-white animate-pulse" 
                    : "bg-[#F8F7F2] border-[#E5E2D9] text-[#8A958E] hover:text-[#004550] hover:bg-[#E9E7DF]/40"
                }`}
                title={listening ? "Listening... click to stop" : "Speak to Rumi (Speech-to-Text)"}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>

              <input
                id="chat-input-field"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={listening ? "Listening... speak now" : "Talk about your energy, task blocks, or mind..."}
                className="flex-1 bg-white border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] focus:ring-1 focus:ring-[#5AA9A7] rounded-xl px-4 py-3 text-xs text-[#2D3748]"
              />
              <button
                id="btn-chat-send"
                type="submit"
                disabled={!inputText.trim() || sending}
                className="bg-[#5AA9A7] hover:bg-[#2C7A7B] disabled:opacity-50 text-white p-3 rounded-xl transition-all shadow-md shadow-[#5AA9A7]/10 shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}

      </motion.div>
    </div>
  );
}
