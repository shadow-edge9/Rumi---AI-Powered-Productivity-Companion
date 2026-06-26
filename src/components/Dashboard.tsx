import React, { useState, useEffect } from "react";
import { Task, TaskType, TaskCategory, TaskPriority, UserProfile } from "../types";
import { CheckSquare, Square, Calendar, Plus, Filter, ShieldAlert, Sparkles, Smile, RefreshCcw, Bell, ChevronDown, ChevronUp, Paperclip, Sun, CloudSun, Moon, Cloud, Star, Clock, X } from "lucide-react";
import { collection, addDoc, doc, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { motion } from "motion/react";
import MissedDeadlineDialog from "./MissedDeadlineDialog";
import TaskAttachments from "./TaskAttachments";
import { 
  getGoogleAccessToken, 
  connectGoogle, 
  syncGoogleTasks, 
  syncGoogleCalendar, 
  scanAndImportGmail,
  disconnectGoogle
} from "../googleAuth";

interface DashboardProps {
  userProfile: UserProfile | null;
  tasks: Task[];
  currentMood: string;
  currentEnergy: string;
  onUpdateMoodEnergy: (mood: string, energy: string) => void;
  onMoodyToggle?: (isMoody: boolean) => void;
  onTaskUpdated: () => void;
  onActiveTaskSelect: (id: string | null) => void;
  activeTaskId?: string | null;
  userEnergyState: "Normal" | "Overwhelmed" | "Unmotivated";
  onUpdateEnergyState: (energy: "Normal" | "Overwhelmed" | "Unmotivated") => void;
  onAskRumi?: (task: Task) => void;
}

export default function Dashboard({
  userProfile,
  tasks,
  currentMood,
  currentEnergy,
  onUpdateMoodEnergy,
  onMoodyToggle,
  onTaskUpdated,
  onActiveTaskSelect,
  activeTaskId,
  userEnergyState,
  onUpdateEnergyState,
  onAskRumi
}: DashboardProps) {
  // Filters State
  const [selectedPriority, setSelectedPriority] = useState<string>("All");
  const [selectedType, setSelectedType] = useState<string>("All");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Google Sync States
  const [googleConnected, setGoogleConnected] = useState(!!getGoogleAccessToken());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<string>("");
  const [syncError, setSyncError] = useState<string | null>(null);

  // Outlook Connection States
  const [outlookConnected, setOutlookConnected] = useState(!!userProfile?.outlookCredentials?.email);
  const [outlookEmail, setOutlookEmail] = useState(userProfile?.outlookCredentials?.email || "");
  const [outlookAppPassword, setOutlookAppPassword] = useState("");
  const [showOutlookAdvanced, setShowOutlookAdvanced] = useState(false);
  const [outlookClientId, setOutlookClientId] = useState(userProfile?.outlookCredentials?.clientId || "");
  const [outlookClientSecret, setOutlookClientSecret] = useState(userProfile?.outlookCredentials?.clientSecret || "");
  const [outlookTenantId, setOutlookTenantId] = useState(userProfile?.outlookCredentials?.tenantId || "common");
  
  const [isOutlookSyncing, setIsOutlookSyncing] = useState(false);
  const [outlookSyncStatus, setOutlookSyncStatus] = useState("");
  const [outlookSyncError, setOutlookSyncError] = useState<string | null>(null);
  const [showOutlookForm, setShowOutlookForm] = useState(false);

  const runOutlookSync = async () => {
    if (!outlookEmail) {
      setOutlookSyncError("Email address is required.");
      return;
    }
    
    setIsOutlookSyncing(true);
    setOutlookSyncError(null);
    setOutlookSyncStatus("Connecting to Outlook account...");

    try {
      // 1. Save credentials to Firestore
      if (userProfile?.uid) {
        const userRef = doc(db, "users", userProfile.uid);
        await updateDoc(userRef, {
          outlookCredentials: {
            email: outlookEmail,
            clientId: outlookClientId || null,
            clientSecret: outlookClientSecret || null,
            tenantId: outlookTenantId || null
          }
        });
      }

      setOutlookSyncStatus("Scanning Outlook events & obligations...");

      // 2. Query our secure server endpoint
      const response = await fetch("/api/outlook/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: outlookEmail,
          clientId: outlookClientId,
          clientSecret: outlookClientSecret,
          tenantId: outlookTenantId
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to sync with Microsoft Graph.");
      }

      const data = await response.json();
      const importedTasks = data.tasks || [];

      setOutlookSyncStatus(`Adding ${importedTasks.length} obligations to Rumi...`);

      // 3. Save each imported task into the user's tasks subcollection
      if (userProfile?.uid && importedTasks.length > 0) {
        for (const task of importedTasks) {
          // Check if task with same title already exists to avoid duplicates
          const isDuplicate = tasks.some(existing => existing.title === task.title && existing.dueDate === task.dueDate);
          if (!isDuplicate) {
            await addDoc(collection(db, "users", userProfile.uid, "tasks"), {
              ...task,
              userId: userProfile.uid
            });
          }
        }
      }

      setOutlookConnected(true);
      setOutlookSyncStatus(`Sync complete! Loaded ${importedTasks.length} items.`);
      setShowOutlookForm(false);
      onTaskUpdated(); // Refresh dashboard list!
    } catch (err: any) {
      console.error(err);
      setOutlookSyncError(err.message || "Failed to authorize or sync Outlook.");
    } finally {
      setIsOutlookSyncing(false);
    }
  };

  // Expand task card state
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Add Task Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<TaskType>("Personal Commitment");
  const [newCategory, setNewCategory] = useState<TaskCategory>("Personal");
  const [newPriority, setNewPriority] = useState<TaskPriority>("Priority");
  const [newDueDate, setNewDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [savingTask, setSavingTask] = useState(false);

  // Edit Task Form State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editType, setEditType] = useState<TaskType>("Personal Commitment");
  const [editCategory, setEditCategory] = useState<TaskCategory>("Personal");
  const [editPriority, setEditPriority] = useState<TaskPriority>("Priority");
  const [editDueDate, setEditDueDate] = useState("");

  const startEditTask = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description || "");
    setEditType(task.type);
    setEditCategory(task.category);
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate);
  };

  const handleEditTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !userProfile?.uid) return;
    try {
      setSavingTask(true);
      const tRef = doc(db, "users", userProfile.uid, "tasks", editingTask.id);
      await updateDoc(tRef, {
        title: editTitle,
        description: editDesc,
        type: editType,
        category: editCategory,
        priority: editPriority,
        dueDate: editDueDate
      });
      setEditingTask(null);
      onTaskUpdated(); // Refresh dashboard list
    } catch (err) {
      console.error("Error editing task:", err);
    } finally {
      setSavingTask(false);
    }
  };

  // Late Task State (for guilt-free dialog)
  const [lateTask, setLateTask] = useState<Task | null>(null);
  const [showLateDialog, setShowLateDialog] = useState(false);

  // Notifications of upgraded priorities
  const [upgradedCount, setUpgradedCount] = useState(0);

  // Completed task visibility state
  const [showCompleted, setShowCompleted] = useState(false);

  // Dynamic Clock State
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const MorningSun = () => (
    <div className="relative flex items-center justify-center shrink-0">
      <Sun className="h-6 w-6 text-yellow-400 fill-yellow-300 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]" />
    </div>
  );

  const AfternoonSunCloud = () => (
    <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
      {/* Orange Sun behind */}
      <Sun className="absolute top-0.5 right-0.5 h-4.5 w-4.5 text-orange-500 fill-orange-500 animate-pulse" />
      {/* White Cloud in front */}
      <svg className="absolute bottom-0.5 left-0.5 h-4 w-6" viewBox="0 0 24 24" fill="white" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.5 19A4.5 4.5 0 0 0 22 14.5c0-2-1.3-3.7-3.2-4.3A6 6 0 0 0 7 11a5 5 0 0 0-4 4.9A4.1 4.1 0 0 0 7.1 20h10.4z" />
      </svg>
    </div>
  );

  const NightMoon = () => (
    <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
      {/* Navy blue moon */}
      <Moon className="h-6 w-6 text-blue-900 fill-blue-950 stroke-blue-900" />
      {/* Star 1 */}
      <Star className="absolute top-0 right-0 h-2 w-2 text-white fill-white animate-ping" style={{ animationDuration: '3s' }} />
      <Star className="absolute top-0 right-0 h-2 w-2 text-white fill-white" />
      {/* Star 2 */}
      <Star className="absolute bottom-1.5 -right-0.5 h-1.5 w-1.5 text-white fill-white animate-ping" style={{ animationDuration: '2s' }} />
      <Star className="absolute bottom-1.5 -right-0.5 h-1.5 w-1.5 text-white fill-white" />
    </div>
  );

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: "Good Morning", icon: <MorningSun /> };
    if (hour < 18) return { text: "Good Afternoon", icon: <AfternoonSunCloud /> };
    return { text: "Good Evening", icon: <NightMoon /> };
  };
  const greeting = getGreeting();

  const runGoogleSync = async (showLoading = false) => {
    if (!userProfile) return;
    const token = getGoogleAccessToken();
    if (!token) {
      setGoogleConnected(false);
      return;
    }

    setGoogleConnected(true);
    if (showLoading) setIsSyncing(true);
    setSyncError(null);

    const failures: string[] = [];
    let completedSteps = 0;

    // 1. Sync Calendar
    try {
      setGmailStatus("Syncing Calendar...");
      await syncGoogleCalendar(userProfile.uid, tasks);
      completedSteps++;
    } catch (err: any) {
      console.error("Calendar sync error:", err);
      failures.push("Google Calendar");
    }

    // 2. Sync Tasks
    try {
      setGmailStatus("Syncing Tasks...");
      await syncGoogleTasks(userProfile.uid, tasks);
      completedSteps++;
    } catch (err: any) {
      console.error("Tasks sync error:", err);
      failures.push("Google Tasks");
    }

    // 3. Scan Gmail
    try {
      setGmailStatus("Scanning Gmail...");
      const gmailCount = await scanAndImportGmail(userProfile.uid, tasks);
      if (gmailCount > 0) {
        setGmailStatus(`Imported ${gmailCount} Gmail tasks!`);
      } else {
        setGmailStatus("Gmail up to date.");
      }
      completedSteps++;
    } catch (err: any) {
      console.error("Gmail sync error:", err);
      failures.push("Gmail Scanning (ensure Gmail API is enabled & authorized)");
    }

    if (failures.length > 0) {
      const errorMessage = `Some sync steps failed: ${failures.join(", ")}. Please check your Google account settings, ensure relevant Google APIs are enabled in your Cloud project, and try disconnecting and reconnecting.`;
      setSyncError(errorMessage);
      if (completedSteps === 0) {
        setGmailStatus("Sync failed completely.");
      } else {
        setGmailStatus("Partial sync completed.");
      }
    } else {
      setGmailStatus("Workspace sync complete!");
    }

    setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    onTaskUpdated();
    if (showLoading) setIsSyncing(false);
  };

  // Continuous background synchronization (triggers every 15 mins)
  useEffect(() => {
    const token = getGoogleAccessToken();
    if (token && userProfile) {
      setGoogleConnected(true);
      runGoogleSync(true); // Run initial sync
      
      const interval = setInterval(() => {
        runGoogleSync(false); // Background sync
      }, 15 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [userProfile, tasks.length]);

  // Scan deadlines and trigger high priority adjustments proactively on mount/load
  useEffect(() => {
    if (tasks.length === 0 || !userProfile) return;

    const today = new Date();
    today.setHours(0,0,0,0);
    let count = 0;

    const scanAndProactivelyPrioritize = async () => {
      for (const task of tasks) {
        if (task.completed) continue;

        const taskDueDate = new Date(task.dueDate);
        taskDueDate.setHours(0,0,0,0);
        
        const diffTime = taskDueDate.getTime() - today.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        // If task is within 3 days (inclusive) and not currently High-Priority, automatically upgrade!
        if (diffDays <= 3 && diffDays >= 0 && task.priority !== "High-Priority") {
          const taskRef = doc(db, "users", userProfile.uid, "tasks", task.id);
          await updateDoc(taskRef, {
            priority: "High-Priority"
          });
          count++;
        }
      }

      if (count > 0) {
        setUpgradedCount(count);
        onTaskUpdated();
      }
    };

    scanAndProactivelyPrioritize();
  }, [tasks, userProfile]);

  // Scan for missed deadlines (incomplete tasks where due date is yesterday or older)
  useEffect(() => {
    if (tasks.length === 0) return;

    const getLocalDateString = (offsetDays = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      const offset = d.getTimezoneOffset();
      const localDate = new Date(d.getTime() - offset * 60 * 1000);
      return localDate.toISOString().split("T")[0];
    };
    const todayStr = getLocalDateString(0);
    
    // Find the first task that is late and not completed
    const missedTask = tasks.find(t => !t.completed && t.dueDate < todayStr && !t.explanation);
    if (missedTask) {
      setLateTask(missedTask);
      setShowLateDialog(true);
    }
  }, [tasks]);

  // Handle Mark Done (triggers check if they are late)
  const handleToggleComplete = async (task: Task) => {
    if (!userProfile) return;

    try {
      const getLocalDateString = (offsetDays = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - offset * 60 * 1000);
        return localDate.toISOString().split("T")[0];
      };
      const todayStr = getLocalDateString(0);
      const isLate = !task.completed && task.dueDate < todayStr && !task.explanation;

      if (isLate) {
        // Trigger dialog first instead of just ticking it
        setLateTask(task);
        setShowLateDialog(true);
        return;
      }

      const taskRef = doc(db, "users", userProfile.uid, "tasks", task.id);
      await updateDoc(taskRef, {
        completed: !task.completed,
        completedDate: !task.completed ? new Date().toISOString() : null
      });

      // Quick-sync completion back to Google Tasks if synced
      if (task.googleTaskId) {
        const token = getGoogleAccessToken();
        if (token) {
          try {
            const listsRes = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (listsRes.ok) {
              const listsData = await listsRes.json();
              const listId = listsData.items?.[0]?.id;
              if (listId) {
                await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${task.googleTaskId}`, {
                  method: "PATCH",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    status: !task.completed ? "completed" : "needsAction"
                  })
                });
              }
            }
          } catch (gErr) {
            console.error("Failed to sync completion update to Google Tasks:", gErr);
          }
        }
      }

      // Update streaks if completing today
      if (!task.completed) {
        // Simple streak logic: if completed target today
        const completedToday = tasks.filter(t => t.completed && t.completedDate?.startsWith(todayStr)).length + 1;
        const baseGoal = userProfile.dailyGoalCount || 3;
        let mult = 1.0;
        if (currentEnergy === "low") mult = 0.5;
        else if (currentEnergy === "sick") mult = 0.25;
        const adaptedGoal = Math.max(1, Math.round(baseGoal * mult));

        if (completedToday >= adaptedGoal) {
          const userRef = doc(db, "users", userProfile.uid);
          // If they haven't updated streak today, increment it
          if (userProfile.lastActiveDate !== todayStr) {
            const yesterdayStr = getLocalDateString(-1);
            const prevStreak = userProfile.lastActiveDate === yesterdayStr ? (userProfile.currentStreak || 0) : 0;
            await updateDoc(userRef, {
              currentStreak: prevStreak + 1,
              lastActiveDate: todayStr
            });
          }
        }
      }

      onTaskUpdated();
    } catch (error) {
      console.error("Error completing task:", error);
    }
  };

  // Reschedule peacefully (guilt-free)
  const handlePeacefulReschedule = async (task: Task, newDate: string, explanation: string) => {
    if (!userProfile) return;
    try {
      const taskRef = doc(db, "users", userProfile.uid, "tasks", task.id);
      await updateDoc(taskRef, {
        dueDate: newDate,
        explanation: explanation,
        priority: "Priority" // reset priority back to priority or compute
      });
      onTaskUpdated();
    } catch (error) {
      console.error("Error rescheduling task:", error);
    }
  };

  // Dismiss task entirely (not relevant)
  const handleDismissTask = async (task: Task) => {
    if (!userProfile) return;
    try {
      if (activeTaskId === task.id) {
        onActiveTaskSelect(null);
      }
      const taskRef = doc(db, "users", userProfile.uid, "tasks", task.id);
      await deleteDoc(taskRef);
      onTaskUpdated();
    } catch (error) {
      console.error("Error dismissing task:", error);
    }
  };

  // Add Task
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !newTitle.trim()) return;

    setSavingTask(true);
    try {
      const taskId = `task-${Date.now()}`;
      const taskData: Task = {
        id: taskId,
        userId: userProfile.uid,
        title: newTitle,
        description: newDesc,
        type: newType,
        category: newCategory,
        priority: newPriority,
        dueDate: newDueDate,
        completed: false,
        createdAt: new Date().toISOString(),
        timeSpentMs: 0
      };

      await setDoc(doc(db, "users", userProfile.uid, "tasks", taskId), taskData);
      
      // Reset form
      setNewTitle("");
      setNewDesc("");
      setShowAddForm(false);
      onTaskUpdated();
    } catch (error) {
      console.error("Error adding task:", error);
    } finally {
      setSavingTask(false);
    }
  };

  // Filter Tasks
  const filteredTasks = tasks.filter(task => {
    const matchesPriority = selectedPriority === "All" || task.priority === selectedPriority;
    const matchesType = selectedType === "All" || task.type === selectedType;
    const matchesCategory = selectedCategory === "All" || task.category === selectedCategory;
    return matchesPriority && matchesType && matchesCategory;
  });

  const activeFilteredTasks = filteredTasks.filter(task => !task.completed);
  const completedFilteredTasks = filteredTasks.filter(task => task.completed);

  const taskTypes: TaskType[] = [
    "Meeting", "Interview", "Assignment", "Event", "Bill", "Personal Commitment"
  ];

  const renderTaskCard = (task: Task) => {
    const getLocalDateString = (offsetDays = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      const offset = d.getTimezoneOffset();
      const localDate = new Date(d.getTime() - offset * 60 * 1000);
      return localDate.toISOString().split("T")[0];
    };
    const isLate = !task.completed && task.dueDate < getLocalDateString(0);
    const isExpanded = expandedTaskId === task.id;
    
    return (
      <div
        key={task.id}
        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
        className={`relative border rounded-2xl p-4 transition-all duration-200 cursor-pointer hover:shadow-sm ${
          task.completed 
            ? "border-[#E5E2D9] bg-[#F8F7F2]/40 opacity-70" 
            : task.priority === "High-Priority"
            ? "bg-[#FFF5F5] border-[#FADEDE]"
            : task.priority === "Not Urgent"
            ? "bg-white/40 border-[#E5E2D9] border-dashed"
            : "bg-white border-[#E5E2D9]"
        }`}
      >
        {!task.completed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismissTask(task);
            }}
            className="absolute top-2 right-2 text-[#C55A5A] hover:bg-[#FFF5F5] p-1 rounded-full transition-all flex items-center justify-center border border-[#FADEDE] h-6 w-6 cursor-pointer"
            title="Dismiss task as not relevant"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleToggleComplete(task)}
              className="text-[#00606E] hover:text-[#004550] shrink-0 mt-0.5 cursor-pointer"
            >
              {task.completed ? (
                <CheckSquare className="h-5 w-5 text-[#00606E]" />
              ) : (
                <Square className="h-5 w-5 text-[#E5E2D9]" />
              )}
            </button>
  
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`font-semibold text-sm truncate ${task.completed ? "line-through text-[#8A958E]" : "text-[#4A5568]"}`}>
                  {task.title}
                </span>
                
                {/* Label Badges */}
                <span className="text-[9px] px-2 py-0.5 bg-[#E9E7DF]/60 text-[#1A2B32] rounded-full uppercase tracking-wider font-bold">
                  {task.type}
                </span>
                <span className="text-[9px] px-2 py-0.5 bg-white border border-[#E5E2D9] text-[#8A958E] rounded-full uppercase tracking-wider font-bold">
                  {task.category}
                </span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold ${
                  task.priority === "High-Priority" ? "bg-[#FFF5F5] text-[#C55A5A]" :
                  task.priority === "Priority" ? "bg-[#E9E7DF] text-[#1A2B32]" :
                  "bg-white border border-dashed border-[#E5E2D9] text-[#8A958E]"
                }`}>
                  {task.priority}
                </span>
              </div>
  
              {!isExpanded && task.description && (
                <p className="text-xs text-[#8A958E] line-clamp-1">{task.description}</p>
              )}
  
              <div className="flex items-center gap-1.5 text-[10px] text-[#8A958E]">
                <Calendar className="h-3.5 w-3.5 text-[#00606E]" />
                <span>Due: {task.dueDate}</span>
                {task.explanation && (
                  <span className="text-[#C55A5A] bg-[#FFF5F5] px-2 py-0.5 rounded font-serif italic">
                    Adapted: {task.explanation}
                  </span>
                )}
                {task.attachments && task.attachments.length > 0 && (
                  <span className="flex items-center gap-0.5 text-[#00606E] font-semibold bg-[#EAF0EB] px-2 py-0.5 rounded">
                    <Paperclip className="h-3 w-3" /> {task.attachments.length} file{task.attachments.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
  
          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Commit & Dismiss Task Column */}
            {!task.completed && (
              <div className="flex flex-col items-stretch gap-1.5">
                {onAskRumi && (
                  <button
                    id={`btn-ask-rumi-${task.id}`}
                    onClick={() => onAskRumi(task)}
                    className="text-[10px] text-white bg-[#00606E] hover:bg-[#004550] px-3 py-1.5 rounded-xl transition-all font-bold uppercase tracking-wider cursor-pointer text-center flex items-center justify-center gap-1 shrink-0 shadow-xs"
                  >
                    <Sparkles className="h-3 w-3 text-white" />
                    Ask Rumi
                  </button>
                )}
                <button
                  onClick={() => startEditTask(task)}
                  className="text-[10px] text-[#00606E] border border-[#00606E]/30 hover:bg-[#00606E]/10 px-3 py-1.5 rounded-xl transition-all font-bold uppercase tracking-wider cursor-pointer text-center"
                >
                  Edit
                </button>
                <button
                  onClick={() => onActiveTaskSelect(task.id)}
                  className="text-[10px] text-[#00606E] border-2 border-[#00606E] hover:bg-[#00606E] hover:text-white px-3 py-1.5 rounded-xl transition-all font-bold uppercase tracking-wider cursor-pointer text-center"
                >
                  Commit
                </button>
              </div>
            )}
            <div className="text-[#8A958E]">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </div>
  
        {/* Expandable Content Panel */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-[#E5E2D9]/60 space-y-3" onClick={(e) => e.stopPropagation()}>
            {task.description && (
              <div className="space-y-1">
                <h5 className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider">Description</h5>
                <p className="text-xs text-[#1A2B32] leading-relaxed bg-[#F8F7F2]/60 p-3 rounded-xl border border-[#E5E2D9]/40 whitespace-pre-wrap">
                  {task.description}
                </p>
              </div>
            )}
            {userProfile?.uid && (
              <TaskAttachments
                userId={userProfile.uid}
                task={task}
                onTaskUpdated={onTaskUpdated}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 selection:bg-[#00606E]/30">
      
      {/* Top Banner & Moody Button */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-[#F8F7F2] border border-[#E5E2D9] rounded-3xl p-6 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-2xl font-serif font-semibold text-[#1A2B32] tracking-tight">Dashboard</h2>
          <div className="text-lg md:text-xl text-[#00606E] font-serif font-medium flex items-center gap-2.5 whitespace-nowrap">
             {greeting.icon} <span>{greeting.text}, <strong className="text-[#1A2B32] font-serif font-semibold">{userProfile?.name}</strong></span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
          {/* Beautiful Clock with Teal/Soft Blues Theme */}
          <div className="flex flex-col items-center justify-center bg-[#0B1A21] border border-[#00606E]/30 px-5 py-2.5 rounded-2xl shadow-xs select-none shrink-0 min-w-[280px]">
            {/* Top bar with full Date */}
            <div className="text-[10px] font-mono tracking-widest text-[#00A896]/80 uppercase mb-1.5 font-bold">
              {time.toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' })}
            </div>

            {/* Main Clock Grid */}
            <div className="flex items-center gap-2.5 font-mono text-white">
              {/* DAY Segment */}
              <div className="flex flex-col items-center min-w-[36px]">
                <span className="text-base font-bold tracking-tight text-[#EAF0EB]">
                  {`[${time.toLocaleDateString([], { weekday: 'short' }).toUpperCase()}]`}
                </span>
                <span className="text-[7px] tracking-wider text-[#8A958E] uppercase mt-0.5">DAY</span>
              </div>

              <span className="text-[#00A896]/60 text-xs font-bold mb-3">:</span>

              {/* HOURS Segment */}
              <div className="flex flex-col items-center min-w-[20px]">
                <span className="text-base font-bold tracking-tight text-[#EAF0EB]">
                  {time.getHours() % 12 || 12}
                </span>
                <span className="text-[7px] tracking-wider text-[#8A958E] uppercase mt-0.5">HOURS</span>
              </div>

              <span className="text-[#00A896]/60 text-xs font-bold mb-3">:</span>

              {/* MINUTES Segment */}
              <div className="flex flex-col items-center min-w-[20px]">
                <span className="text-base font-bold tracking-tight text-[#EAF0EB]">
                  {time.getMinutes().toString().padStart(2, '0')}
                </span>
                <span className="text-[7px] tracking-wider text-[#8A958E] uppercase mt-0.5">MINUTES</span>
              </div>

              <span className="text-[#00A896]/60 text-xs font-bold mb-3">:</span>

              {/* SECONDS Segment */}
              <div className="flex flex-col items-center min-w-[20px]">
                <span className="text-base font-bold tracking-tight text-[#EAF0EB]">
                  {time.getSeconds().toString().padStart(2, '0')}
                </span>
                <span className="text-[7px] tracking-wider text-[#8A958E] uppercase mt-0.5">SECONDS</span>
              </div>

              <span className="text-[#00A896]/40 text-xs font-bold mb-3">|</span>

              {/* AM/PM Indicator */}
              <div className="flex flex-col items-center min-w-[24px]">
                <span className="text-[10px] font-black px-1 rounded bg-[#00606E]/30 text-[#00C2B2] border border-[#00606E]/40 tracking-wider">
                  {time.getHours() >= 12 ? 'PM' : 'AM'}
                </span>
                <span className="text-[7px] tracking-wider text-[#8A958E] uppercase mt-1">PERIOD</span>
              </div>
            </div>
          </div>

          {/* MOODY toggle slider */}
          <div className="flex items-center gap-4 bg-white border border-[#E5E2D9] px-5 py-3 rounded-3xl shadow-xs justify-between sm:justify-start">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-2xl transition-all duration-300 ${currentEnergy === "low" ? "bg-[#00606E]/10 text-[#00606E]" : "bg-gray-100 text-gray-400"}`}>
                <Cloud className={`h-5 w-5 ${currentEnergy === "low" ? "animate-pulse" : ""}`} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider block font-sans">MOODY</span>
                <span className="text-[11px] text-[#8A958E] font-serif italic leading-tight block">
                  {currentEnergy === "low" ? "Rumi is supporting your emotions" : "Toggle cozy/low-energy mode"}
                </span>
              </div>
            </div>

            {/* Sliding Toggle Control */}
            <button
              id="moody-slider-toggle"
              onClick={() => onMoodyToggle && onMoodyToggle(currentEnergy !== "low")}
              className="relative flex items-center justify-between cursor-pointer w-12 h-6 rounded-full bg-[#E5E2D9] focus:outline-none transition-colors duration-300 shrink-0"
              style={{ backgroundColor: currentEnergy === "low" ? "#00606E" : "#E5E2D9" }}
            >
              {/* Sliding Knob */}
              <motion.div
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
                animate={{ x: currentEnergy === "low" ? 24 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Automatic Priority shift banner */}
      {upgradedCount > 0 && (
        <div className="bg-[#FFF5F5] border border-[#FADEDE] rounded-2xl p-4 flex items-center gap-3 text-xs text-[#C55A5A] animate-pulse">
          <Bell className="h-4 w-4 text-[#C55A5A] shrink-0" />
          <span>
            Rumi scanned your schedule: <strong>{upgradedCount} task(s)</strong> due in less than 3 days have been gently moved to <strong>High-Priority</strong>.
          </span>
        </div>
      )}

      {/* Energy Log Advice / Suggestions */}
      {(currentEnergy === "low" || currentEnergy === "sick") && (
        <div className="bg-white/60 border border-[#E5E2D9] rounded-2xl p-4 flex items-start gap-3 text-xs text-[#4A5568]">
          <Smile className="h-4 w-4 text-[#00606E] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-[#1A2B32] block font-serif">Rumi's Empathetic Advice:</span>
            <span>
              Your energy capacity is lowered today, and that is completely fine! We have scaled your streak target to <strong>{userProfile?.baselineTarget === "High Achiever" ? "50%" : "25%"}</strong>. Focus only on light administrative tasks or take a complete rest. Talk to Rumi if you need more support.
            </span>
          </div>
        </div>
      )}

      {/* Filter Options & Task Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Sidebar Controls Stack */}
        <div className="lg:col-span-1 space-y-4 shrink-0 h-fit">
          
          {/* Google Workspace Connection Panel */}
          <div className="bg-white border border-[#E5E2D9] rounded-3xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block font-sans">Google Workspace Sync</span>
              <span className={`h-2.5 w-2.5 rounded-full ${googleConnected ? "bg-[#00606E]" : "bg-gray-300"}`} />
            </div>

            {googleConnected ? (
              <div className="space-y-3">
                <div className="text-xs text-[#1A2B32]">
                  {lastSyncTime ? (
                    <span className="block text-[10px] text-[#8A958E]">Last sync: {lastSyncTime}</span>
                  ) : (
                    <span className="block text-[10px] text-[#8A958E]">Successfully connected</span>
                  )}
                  {gmailStatus && (
                    <span className="block text-[11px] text-[#00606E] font-semibold font-serif italic mt-1">{gmailStatus}</span>
                  )}
                  {syncError && (
                    <span className="block text-[10px] text-red-500 font-semibold mt-1">{syncError}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => runGoogleSync(true)}
                    disabled={isSyncing}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#F8F7F2] hover:bg-[#E9E7DF] disabled:opacity-50 text-[#00606E] border border-[#E5E2D9] rounded-xl px-2.5 py-1.5 text-xs font-semibold transition"
                  >
                    <RefreshCcw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Syncing..." : "Sync Now"}
                  </button>
                  <button
                    onClick={() => {
                      disconnectGoogle();
                      setGoogleConnected(false);
                      setGmailStatus("");
                    }}
                    className="text-[10px] text-[#8A958E] hover:text-red-500 px-1 py-1.5 hover:underline"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11px] text-[#8A958E] leading-relaxed font-serif italic">
                  Rumi can dynamically scan deadlines, sync schedules, and organize obligations from your Gmail, Google Tasks, and Calendar.
                </p>
                <button
                  onClick={async () => {
                    try {
                      setIsSyncing(true);
                      setSyncError(null);
                      await connectGoogle();
                      setGoogleConnected(true);
                      setIsSyncing(false);
                      setTimeout(() => runGoogleSync(true), 500);
                    } catch (err: any) {
                      setIsSyncing(false);
                      setGoogleConnected(false);
                      if (err.code === "auth/popup-blocked" || err.message?.includes("popup")) {
                        setSyncError("Popup was blocked by your browser. Please click the 'Open in New Tab' button in the top right corner of the screen to authorize, or allow popups.");
                      } else {
                        setSyncError(err.message || "Failed to connect Google. Please try again.");
                      }
                    }
                  }}
                  disabled={isSyncing}
                  className="w-full bg-[#00606E] hover:bg-[#004550] disabled:opacity-50 text-white font-bold text-[10px] uppercase tracking-wider py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  {isSyncing ? (
                    <RefreshCcw className="h-3 w-3 animate-spin" />
                  ) : (
                    "Connect Google Workspace"
                  )}
                </button>
                {syncError && (
                  <span className="block text-[10px] text-red-500 font-serif italic leading-relaxed mt-1">{syncError}</span>
                )}
              </div>
            )}
          </div>

          {/* Outlook Workspace Sync Connection Panel */}
          <div id="outlook-sync-panel" className="bg-white border border-[#E5E2D9] rounded-3xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block font-sans">Outlook Sync</span>
              <span className={`h-2.5 w-2.5 rounded-full ${outlookConnected ? "bg-[#00606E]" : "bg-gray-300"}`} />
            </div>

            {outlookConnected && !showOutlookForm ? (
              <div className="space-y-3">
                <div className="text-xs text-[#1A2B32]">
                  <span className="block text-[10px] text-[#8A958E]">Connected email:</span>
                  <span className="block text-[11px] text-[#00606E] font-semibold truncate font-serif italic mt-0.5">{outlookEmail}</span>
                  {outlookSyncStatus && (
                    <span className="block text-[10px] text-emerald-600 font-semibold mt-1">{outlookSyncStatus}</span>
                  )}
                  {outlookSyncError && (
                    <span className="block text-[10px] text-red-500 font-semibold mt-1">{outlookSyncError}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    id="btn-outlook-sync"
                    onClick={runOutlookSync}
                    disabled={isOutlookSyncing}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#F8F7F2] hover:bg-[#E9E7DF] disabled:opacity-50 text-[#00606E] border border-[#E5E2D9] rounded-xl px-2.5 py-1.5 text-xs font-semibold transition"
                  >
                    <RefreshCcw className={`h-3 w-3 ${isOutlookSyncing ? "animate-spin" : ""}`} />
                    {isOutlookSyncing ? "Syncing..." : "Sync Now"}
                  </button>
                  <button
                    id="btn-outlook-disconnect"
                    onClick={() => {
                      setOutlookConnected(false);
                      setOutlookEmail("");
                      setOutlookAppPassword("");
                      setShowOutlookForm(true);
                    }}
                    className="text-[10px] text-[#8A958E] hover:text-red-500 px-1 py-1.5 hover:underline"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11px] text-[#8A958E] leading-relaxed font-serif italic">
                  Read and sync schedules, events, and tasks directly from your Outlook or Microsoft 365 accounts.
                </p>

                {showOutlookForm ? (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="block text-[9px] font-bold text-[#8A958E] uppercase tracking-wider mb-0.5">Outlook Email</label>
                      <input
                        id="outlook-email-input"
                        type="email"
                        value={outlookEmail}
                        onChange={(e) => setOutlookEmail(e.target.value)}
                        placeholder="you@outlook.com"
                        className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#8A958E] uppercase tracking-wider mb-0.5">App Password</label>
                      <input
                        id="outlook-password-input"
                        type="password"
                        value={outlookAppPassword}
                        onChange={(e) => setOutlookAppPassword(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>

                    {/* Advanced toggle */}
                    <button
                      type="button"
                      onClick={() => setShowOutlookAdvanced(!showOutlookAdvanced)}
                      className="text-[9px] text-[#00606E] hover:underline flex items-center gap-1 font-semibold"
                    >
                      {showOutlookAdvanced ? "Hide Corporate / Azure Config" : "Show Corporate / Azure Config"}
                    </button>

                    {showOutlookAdvanced && (
                      <div className="space-y-2 border-t border-[#E5E2D9] pt-2 mt-1">
                        <div>
                          <label className="block text-[8px] font-bold text-[#8A958E] uppercase tracking-wider mb-0.5">Client ID</label>
                          <input
                            id="outlook-client-id"
                            type="text"
                            value={outlookClientId}
                            onChange={(e) => setOutlookClientId(e.target.value)}
                            placeholder="Azure Client ID"
                            className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none rounded-lg px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-bold text-[#8A958E] uppercase tracking-wider mb-0.5">Client Secret</label>
                          <input
                            id="outlook-client-secret"
                            type="password"
                            value={outlookClientSecret}
                            onChange={(e) => setOutlookClientSecret(e.target.value)}
                            placeholder="Azure Client Secret"
                            className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none rounded-lg px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-bold text-[#8A958E] uppercase tracking-wider mb-0.5">Tenant ID</label>
                          <input
                            id="outlook-tenant-id"
                            type="text"
                            value={outlookTenantId}
                            onChange={(e) => setOutlookTenantId(e.target.value)}
                            placeholder="common / organizations"
                            className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none rounded-lg px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        id="btn-outlook-connect-submit"
                        onClick={runOutlookSync}
                        disabled={isOutlookSyncing}
                        className="flex-1 bg-[#00606E] hover:bg-[#004550] disabled:opacity-50 text-white font-bold text-[10px] uppercase tracking-wider py-2 rounded-lg transition shadow-2xs"
                      >
                        {isOutlookSyncing ? "Connecting..." : "Sync & Connect"}
                      </button>
                      <button
                        onClick={() => setShowOutlookForm(false)}
                        className="bg-[#F8F7F2] border border-[#E5E2D9] text-[#1A2B32] hover:bg-[#E9E7DF] px-2.5 py-2 rounded-lg text-[10px] font-bold uppercase transition"
                      >
                        Cancel
                      </button>
                    </div>

                    {outlookSyncError && (
                      <span className="block text-[10px] text-red-500 font-serif italic mt-1 leading-normal">{outlookSyncError}</span>
                    )}
                  </div>
                ) : (
                  <button
                    id="btn-outlook-sync-activate"
                    onClick={() => setShowOutlookForm(true)}
                    className="w-full bg-[#00606E] hover:bg-[#004550] text-white font-bold text-[10px] uppercase tracking-wider py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
                  >
                    Sync Outlook Account
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Filters */}
          <div className="bg-[#F8F7F2] border border-[#E5E2D9] rounded-3xl p-5 space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-[#E5E2D9]">
              <h3 className="font-semibold text-sm text-[#1A2B32] flex items-center gap-1.5 font-serif">
                <Filter className="h-4 w-4 text-[#00606E]" /> Filters
              </h3>
              {(selectedPriority !== "All" || selectedType !== "All" || selectedCategory !== "All") && (
                <button
                  onClick={() => {
                    setSelectedPriority("All");
                    setSelectedType("All");
                    setSelectedCategory("All");
                  }}
                  className="text-[10px] text-[#00606E] font-bold uppercase tracking-wider hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

          {/* Priority filter */}
          <div className="space-y-2">
            <label htmlFor="priority-filter" className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block">Priority</label>
            <div className="relative">
              <select
                id="priority-filter"
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="w-full bg-[#E9E7DF]/50 hover:bg-[#E9E7DF] border border-[#E5E2D9] text-[#1A2B32] text-xs px-3.5 py-2.5 rounded-xl transition-all font-medium focus:outline-hidden focus:ring-1 focus:ring-[#00606E] focus:border-[#00606E] appearance-none cursor-pointer pr-10"
              >
                {["All", "High-Priority", "Priority", "Not Urgent"].map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#1A2B32]">
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {/* Type filter */}
          <div className="space-y-2">
            <label htmlFor="type-filter" className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block">Commitment Type</label>
            <div className="relative">
              <select
                id="type-filter"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-[#E9E7DF]/50 hover:bg-[#E9E7DF] border border-[#E5E2D9] text-[#1A2B32] text-xs px-3.5 py-2.5 rounded-xl transition-all font-medium focus:outline-hidden focus:ring-1 focus:ring-[#00606E] focus:border-[#00606E] appearance-none cursor-pointer pr-10"
              >
                <option value="All">All Commitments</option>
                {taskTypes.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#1A2B32]">
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {/* Category filter */}
          <div className="space-y-2">
            <label htmlFor="category-filter" className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block">Category</label>
            <div className="relative">
              <select
                id="category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-[#E9E7DF]/50 hover:bg-[#E9E7DF] border border-[#E5E2D9] text-[#1A2B32] text-xs px-3.5 py-2.5 rounded-xl transition-all font-medium focus:outline-hidden focus:ring-1 focus:ring-[#00606E] focus:border-[#00606E] appearance-none cursor-pointer pr-10"
              >
                {["All", "Work", "Personal"].map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[#1A2B32]">
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Main Task List Area */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-base text-[#1A2B32] font-serif">
              Today's Docket ({activeFilteredTasks.length})
            </h3>
            <button
              id="btn-add-task"
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 bg-[#00606E] hover:bg-[#004550] text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-md shadow-[#00606E]/10 transition-all"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
          </div>

          {/* Add Task Modal Form Overlay */}
          {showAddForm && (
            <div className="fixed inset-0 bg-black/15 backdrop-blur-xs flex items-center justify-center p-4 z-40">
              <div className="bg-[#FDFCF0] border border-[#E5E2D9] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-xl">
                <h4 className="text-lg font-serif font-semibold text-[#1A2B32] mb-4">Set a New Gentle Intention</h4>
                <form onSubmit={handleAddTask} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Title</label>
                    <input
                      id="input-task-title"
                      type="text"
                      required
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="e.g. Finish strategic proposal"
                      className="w-full bg-white border border-[#E5E2D9] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#00606E]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Description (Optional)</label>
                    <textarea
                      value={newDesc}
                      onChange={e => setNewDesc(e.target.value)}
                      placeholder="Give yourself some friendly context..."
                      className="w-full bg-white border border-[#E5E2D9] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#00606E] h-16 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Commitment Type</label>
                      <select
                        value={newType}
                        onChange={e => setNewType(e.target.value as TaskType)}
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-[#00606E]"
                      >
                        {taskTypes.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Category</label>
                      <select
                        value={newCategory}
                        onChange={e => setNewCategory(e.target.value as TaskCategory)}
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-[#00606E]"
                      >
                        <option value="Personal">Personal</option>
                        <option value="Work">Work</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Priority</label>
                      <select
                        value={newPriority}
                        onChange={e => setNewPriority(e.target.value as TaskPriority)}
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-[#00606E]"
                      >
                        <option value="High-Priority">High-Priority</option>
                        <option value="Priority">Priority</option>
                        <option value="Not Urgent">Not Urgent</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Due Date</label>
                      <input
                        type="date"
                        value={newDueDate}
                        onChange={e => setNewDueDate(e.target.value)}
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-[#00606E]"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-[#E5E2D9]">
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="flex-1 py-2 border border-[#E5E2D9] rounded-xl text-xs text-[#8A958E] hover:bg-[#F8F7F2]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingTask}
                      className="flex-1 py-2 bg-[#00606E] hover:bg-[#004550] disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                    >
                      {savingTask ? "Saving..." : "Set Goal"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Task Modal Form Overlay */}
          {editingTask && (
            <div className="fixed inset-0 bg-black/15 backdrop-blur-xs flex items-center justify-center p-4 z-40">
              <div className="bg-[#FDFCF0] border border-[#E5E2D9] rounded-3xl p-6 md:p-8 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h4 className="text-lg font-serif font-semibold text-[#1A2B32] mb-4">Edit Your Gentle Intention</h4>
                <form onSubmit={handleEditTaskSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Title</label>
                    <input
                      required
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      placeholder="e.g. Finish strategic proposal"
                      className="w-full bg-white border border-[#E5E2D9] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#00606E]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Description (Optional)</label>
                    <textarea
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      placeholder="Give yourself some friendly context..."
                      className="w-full bg-white border border-[#E5E2D9] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#00606E] h-16 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Commitment Type</label>
                      <select
                        value={editType}
                        onChange={e => setEditType(e.target.value as TaskType)}
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-[#00606E]"
                      >
                        {taskTypes.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Category</label>
                      <select
                        value={editCategory}
                        onChange={e => setEditCategory(e.target.value as TaskCategory)}
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-[#00606E]"
                      >
                        <option value="Personal">Personal</option>
                        <option value="Work">Work</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Priority</label>
                      <select
                        value={editPriority}
                        onChange={e => setEditPriority(e.target.value as TaskPriority)}
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-[#00606E]"
                      >
                        <option value="High-Priority">High-Priority</option>
                        <option value="Priority">Priority</option>
                        <option value="Not Urgent">Not Urgent</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Due Date</label>
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={e => setEditDueDate(e.target.value)}
                        className="w-full bg-white border border-[#E5E2D9] rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-[#00606E]"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-[#E5E2D9]">
                    <button
                      type="button"
                      onClick={() => setEditingTask(null)}
                      className="flex-1 py-2 border border-[#E5E2D9] rounded-xl text-xs text-[#8A958E] hover:bg-[#F8F7F2]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingTask}
                      className="flex-1 py-2 bg-[#00606E] hover:bg-[#004550] disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                    >
                      {savingTask ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
           {/* Task Grid / Cards List */}
          {activeFilteredTasks.length === 0 ? (
            <div className="bg-white border border-[#E5E2D9] rounded-3xl p-12 text-center space-y-3">
              <div className="h-10 w-10 bg-[#F8F7F2] border border-[#E5E2D9] rounded-full flex items-center justify-center text-[#00606E] mx-auto">
                <Sparkles className="h-5 w-5" />
              </div>
              <h4 className="font-serif font-semibold text-sm text-[#1A2B32]">Nurture your time</h4>
              <p className="text-xs text-[#8A958E] max-w-sm mx-auto">
                No active goals in this category. You are perfectly in sync. Add a new commitment or enjoy this peaceful moment.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeFilteredTasks.map(task => renderTaskCard(task))}
            </div>
          )}

          {/* Completed Tasks section */}
          {completedFilteredTasks.length > 0 && (
            <div className="mt-8 pt-6 border-t border-[#E5E2D9]/60">
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8A958E] hover:text-[#004550] transition-colors focus:outline-hidden cursor-pointer"
              >
                {showCompleted ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Completed Goals ({completedFilteredTasks.length})
              </button>
              
              {showCompleted && (
                <div className="mt-4 space-y-3">
                  {completedFilteredTasks.map(task => renderTaskCard(task))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Missed Deadline Guilt-Free Dialog */}
      <MissedDeadlineDialog
        isOpen={showLateDialog}
        task={lateTask}
        onClose={() => {
          setShowLateDialog(false);
          setLateTask(null);
        }}
        onReschedule={handlePeacefulReschedule}
      />
    </div>
  );
}
