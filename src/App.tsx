import React, { useState, useEffect } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile
} from "firebase/auth";
import { doc, getDoc, collection, query, onSnapshot, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { UserProfile, Task, AppNotification } from "./types";
import { connectGoogle } from "./googleAuth";
import { 
  Compass, 
  Clock, 
  MessageSquare, 
  BarChart3, 
  LogOut, 
  Sparkles, 
  Smile, 
  Heart,
  Loader2,
  Lock,
  Mail,
  User as UserIcon,
  Flame,
  Calendar as CalendarIcon,
  Settings,
  Bell
} from "lucide-react";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import CommitTimer from "./components/CommitTimer";
import ChatInterface from "./components/ChatInterface";
import Analytics from "./components/Analytics";
import CalendarView from "./components/CalendarView";
import SettingsView from "./components/SettingsView";
import NotificationsView from "./components/NotificationsView";

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "calendar" | "commit" | "analytics" | "settings" | "notifications">("dashboard");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [triggerMoodyGreeting, setTriggerMoodyGreeting] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Authentication states
  const [isSignUp, setIsSignUp] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Active Committed Task ID (for Pomodoro)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Logged energy levels (default to normal)
  const [currentMood, setCurrentMood] = useState("good");
  const [currentEnergy, setCurrentEnergy] = useState("normal");
  const [userEnergyState, setUserEnergyState] = useState<"Normal" | "Overwhelmed" | "Unmotivated">("Normal");
  const [isMoodyMode, setIsMoodyMode] = useState(false);
  const [selectedTaskForRumi, setSelectedTaskForRumi] = useState<Task | null>(null);

  // Track Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchUserProfile(currentUser.uid);
      } else {
        setUserProfile(null);
        setTasks([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch real-time tasks if profile is loaded
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "users", user.uid, "tasks"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks: Task[] = [];
      const batch = writeBatch(db);
      let foundUntitledCount = 0;

      snapshot.forEach((docRef) => {
        const taskData = docRef.data() as Task;
        const trimmedTitle = (taskData.title || "").trim();
        if (
          !trimmedTitle ||
          trimmedTitle.toLowerCase() === "untitled" ||
          trimmedTitle.toLowerCase() === "untitled gmail task" ||
          trimmedTitle.toLowerCase() === "untitled gmail task event" ||
          trimmedTitle.startsWith("Untitled Gmail Task")
        ) {
          batch.delete(doc(db, "users", user.uid, "tasks", docRef.id));
          foundUntitledCount++;
        } else {
          fetchedTasks.push({ id: docRef.id, ...taskData });
        }
      });

      if (foundUntitledCount > 0) {
        const notificationRef = doc(collection(db, "users", user.uid, "notifications"));
        batch.set(notificationRef, {
          userId: user.uid,
          message: `Rumi found ${foundUntitledCount} Untitled Gmail Task${foundUntitledCount > 1 ? "s" : ""} in your Gmail. Check them out when you have time.`,
          read: false,
          createdAt: new Date().toISOString()
        });
        batch.commit().catch((err) => console.error("Error cleaning up and notifying ghost tasks:", err));
      }

      // Sort: incomplete first, then sort by due date ascending
      fetchedTasks.sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return a.dueDate.localeCompare(b.dueDate);
      });
      setTasks(fetchedTasks);
    }, (error) => {
      console.error("Error subscribing to tasks:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Fetch real-time notifications if user is loaded
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "users", user.uid, "notifications"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotifications: AppNotification[] = [];
      snapshot.forEach((doc) => {
        fetchedNotifications.push({ id: doc.id, ...doc.data() } as AppNotification);
      });
      setNotifications(fetchedNotifications);
    }, (error) => {
      console.error("Error subscribing to notifications:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Notifications CRUD handlers
  const handleClearAllNotifications = async () => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        batch.delete(doc(db, "users", user.uid, "notifications", n.id));
      });
      await batch.commit();
    } catch (error) {
      console.error("Error clearing all notifications:", error);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "notifications", id));
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const handleMarkAllNotificationsAsRead = async () => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((n) => {
        if (!n.read) {
          batch.update(doc(db, "users", user.uid, "notifications", n.id), { read: true });
        }
      });
      await batch.commit();
    } catch (error) {
      console.error("Error marking notifications as read:", error);
    }
  };

  // Passive Task Priority Escalation based on custom shiftToHighPriorityDays threshold
  useEffect(() => {
    if (!user || !userProfile || tasks.length === 0) return;

    const escalateTasks = async () => {
      const shiftDays = userProfile.shiftToHighPriorityDays !== undefined ? userProfile.shiftToHighPriorityDays : 3;
      const thresholdTime = Date.now() - (shiftDays * 24 * 60 * 60 * 1000);

      for (const task of tasks) {
        if (!task.completed && task.priority !== "High-Priority" && task.createdAt) {
          const createdAtTime = new Date(task.createdAt).getTime();
          if (createdAtTime < thresholdTime) {
            try {
              const taskRef = doc(db, "users", user.uid, "tasks", task.id);
              await updateDoc(taskRef, { priority: "High-Priority" });
              console.log(`Passive Escalation: Escalated task "${task.title}" to High Priority (created ${shiftDays}+ days ago)`);
            } catch (err) {
              console.error("Error performing passive task escalation:", err);
            }
          }
        }
      }
    };

    escalateTasks();
  }, [user, userProfile?.shiftToHighPriorityDays, tasks]);

  // Self-healing and robust streak logic
  useEffect(() => {
    if (!user || !userProfile || tasks.length === 0) return;

    const syncStreak = async () => {
      // Helper for local date strings
      const getLocalDateString = (offsetDays = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - offset * 60 * 1000);
        return localDate.toISOString().split("T")[0];
      };

      const todayStr = getLocalDateString(0);
      const yesterdayStr = getLocalDateString(-1);

      const baseGoal = userProfile.dailyGoalCount || 3;
      let mult = 1.0;
      if (currentEnergy === "low") mult = 0.5;
      else if (currentEnergy === "sick") mult = 0.25;
      const adaptedGoal = Math.max(1, Math.round(baseGoal * mult));

      // Check tasks completed on today and yesterday
      const completedToday = tasks.filter(
        t => t.completed && t.completedDate && t.completedDate.startsWith(todayStr)
      ).length;

      const completedYesterday = tasks.filter(
        t => t.completed && t.completedDate && t.completedDate.startsWith(yesterdayStr)
      ).length;

      const userRef = doc(db, "users", user.uid);

      // Scenario 1: They completed their goal today
      if (completedToday >= adaptedGoal) {
        if (userProfile.lastActiveDate !== todayStr) {
          // If yesterday was active, increment from yesterday's streak. Else, start a new 1-day streak.
          const prevStreak = userProfile.lastActiveDate === yesterdayStr ? (userProfile.currentStreak || 0) : 0;
          await updateDoc(userRef, {
            currentStreak: prevStreak + 1,
            lastActiveDate: todayStr
          });
          fetchUserProfile(user.uid);
        }
      }
      // Scenario 2: Today is not completed yet, but yesterday was active
      else if (userProfile.lastActiveDate === yesterdayStr) {
        // If they did indeed complete yesterday, but streak is showing 0, fix it to 1!
        if ((userProfile.currentStreak || 0) < 1) {
          await updateDoc(userRef, {
            currentStreak: 1,
            lastActiveDate: yesterdayStr
          });
          fetchUserProfile(user.uid);
        }
      }
      // Scenario 3: Neither today nor yesterday is the lastActiveDate
      else if (userProfile.lastActiveDate !== todayStr && userProfile.lastActiveDate !== yesterdayStr) {
        // Check if they completed yesterday's goal to see if we can rescue the streak
        if (completedYesterday >= adaptedGoal || completedYesterday > 0) {
          await updateDoc(userRef, {
            currentStreak: 1,
            lastActiveDate: yesterdayStr
          });
          fetchUserProfile(user.uid);
        } else {
          // No completion yesterday, so streak is broken. Reset to 0 if it is currently > 0.
          if ((userProfile.currentStreak || 0) > 0) {
            await updateDoc(userRef, {
              currentStreak: 0
            });
            fetchUserProfile(user.uid);
          }
        }
      }
    };

    syncStreak().catch((err) => console.error("Error checking streak on load:", err));
  }, [user, userProfile?.lastActiveDate, userProfile?.currentStreak, tasks.length]);

  // Rollover: Delete completed tasks from previous days, archiving them in userProfile.completedTasksHistory for Analytics
  useEffect(() => {
    if (!user || !userProfile || tasks.length === 0) return;

    const performRolloverCleanup = async () => {
      const getLocalDateString = (offsetDays = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - offset * 60 * 1000);
        return localDate.toISOString().split("T")[0];
      };

      const todayStr = getLocalDateString(0);

      // Find tasks that are completed and whose completedDate is strictly before todayStr
      const tasksToCleanup = tasks.filter(t => {
        if (!t.completed) return false;
        if (!t.completedDate) return false;
        const compDay = t.completedDate.split("T")[0];
        return compDay < todayStr;
      });

      if (tasksToCleanup.length === 0) return;

      console.log(`[Rollover] Found ${tasksToCleanup.length} completed tasks from previous days to clean up.`);

      // Prepare the history archives
      const existingHistory = userProfile.completedTasksHistory || [];
      const newHistoryEntries = tasksToCleanup.map(t => ({
        id: t.id,
        title: t.title,
        completedDate: t.completedDate || todayStr,
        category: t.category,
        priority: t.priority,
        type: t.type,
        timeSpentMs: t.timeSpentMs || 0
      }));

      // Filter out duplicates
      const filteredNewEntries = newHistoryEntries.filter(
        newEntry => !existingHistory.some(h => h.id === newEntry.id)
      );

      const userRef = doc(db, "users", user.uid);

      if (filteredNewEntries.length > 0) {
        await updateDoc(userRef, {
          completedTasksHistory: [...existingHistory, ...filteredNewEntries]
        });
      }

      // Delete the tasks from Firestore
      for (const t of tasksToCleanup) {
        const taskRef = doc(db, "users", user.uid, "tasks", t.id);
        await deleteDoc(taskRef);
      }

      // Refresh the user profile to get updated completedTasksHistory
      fetchUserProfile(user.uid);
    };

    performRolloverCleanup().catch(err => console.error("Error in rollover cleanup:", err));
  }, [user, userProfile?.completedTasksHistory?.length, tasks.length]);

  const fetchUserProfile = async (uid: string) => {
    try {
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const profile = docSnap.data() as UserProfile;
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
    } catch (err) {
      console.error("Error getting user profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      if (isSignUp) {
        if (!authName.trim()) {
          throw new Error("Please enter your name.");
        }
        const userCred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await updateProfile(userCred.user, { displayName: authName });
        // Profile will be created via Onboarding completed step
        await fetchUserProfile(userCred.user.uid);
      } else {
        const userCred = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        await fetchUserProfile(userCred.user.uid);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setAuthError(err.message || "Failed to authenticate.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      await connectGoogle();
    } catch (err: any) {
      console.error("Google Auth error:", err);
      setAuthError(err.message || "Failed to authenticate with Google.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      setActiveTab("dashboard");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleOnboardingComplete = (profile: UserProfile) => {
    setUserProfile(profile);
  };

  const handleUpdateMoodEnergy = (mood: string, energy: string) => {
    setCurrentMood(mood);
    setCurrentEnergy(energy);
  };

  const handleUpdateEnergyState = (energy: "Normal" | "Overwhelmed" | "Unmotivated") => {
    setUserEnergyState(energy);
    if (!isMoodyMode) {
      setCurrentEnergy(energy === "Normal" ? "normal" : energy.toLowerCase());
    }
  };

  const handleMoodyToggle = (isMoody: boolean) => {
    setIsMoodyMode(isMoody);
    if (isMoody) {
      setCurrentEnergy("low");
      setCurrentMood("moody");
      setTriggerMoodyGreeting(true);
      // Removed automatic chat open to respect user preference
    } else {
      setCurrentEnergy(userEnergyState === "Normal" ? "normal" : userEnergyState.toLowerCase());
      setCurrentMood("good");
      setTriggerMoodyGreeting(false);
    }
  };

  const handleAskRumi = (task: Task) => {
    setSelectedTaskForRumi(task);
    setIsChatOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FCFBF7] text-[#2C3E2B] flex flex-col items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#8FA885]" />
          <span className="text-sm font-medium tracking-wide">Connecting with Rumi...</span>
        </div>
      </div>
    );
  }

  // Not Logged In View
  if (!user) {
    return (
      <div id="auth-container" className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] flex flex-col items-center justify-center p-6 md:p-12 font-sans relative overflow-hidden">
        {/* Soft background decor */}
        <div className="absolute top-1/4 left-1/4 h-72 w-72 bg-[var(--color-border)] rounded-full blur-3xl opacity-60 pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 h-72 w-72 bg-[var(--color-border)] rounded-full blur-3xl opacity-60 pointer-events-none" />

        <div className="w-full max-w-md bg-white rounded-3xl border border-[var(--color-border)] shadow-sm overflow-hidden p-8 md:p-10 relative z-10">
          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <div className="h-14 w-14 rounded-full flex items-center justify-center overflow-hidden border border-[#00606E]/30 shadow-sm">
              <svg viewBox="0 0 100 100" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="50" fill="#00606E" />
                <rect x="34" y="34" width="32" height="32" rx="9" fill="#FCFBF7" transform="rotate(45 50 50)" />
              </svg>
            </div>
            <div>
              <h1 id="auth-title" className="font-serif italic font-bold text-[50px] tracking-tight text-[var(--color-text)]">Rumi</h1>
              <p className="font-sans italic no-underline text-xs text-[var(--color-muted)] mt-1.5 leading-relaxed">
                An AI-powered empathetic productivity companion that prioritizes your goals and protects your peace.
              </p>
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-1.5">Preferred Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-3.5 h-4 w-4 text-[var(--color-muted)]" />
                  <input
                    id="auth-name-field"
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-[var(--color-background)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] rounded-xl pl-10 pr-4 py-3 text-sm text-[var(--color-text)]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-4 w-4 text-[var(--color-muted)]" />
                <input
                  id="auth-email-field"
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] rounded-xl pl-10 pr-4 py-3 text-sm text-[var(--color-text)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-[var(--color-muted)]" />
                <input
                  id="auth-password-field"
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] rounded-xl pl-10 pr-4 py-3 text-sm text-[var(--color-text)]"
                />
              </div>
            </div>

            {authError && (
              <div id="auth-error" className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 leading-normal">
                {authError}
              </div>
            )}

            <button
              id="btn-auth-submit"
              type="submit"
              disabled={authLoading}
              className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition duration-200 text-sm mt-2 flex items-center justify-center gap-2"
            >
              {authLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSignUp ? (
                "Create Account"
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="relative my-6 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--color-border)]"></div>
            </div>
            <span className="relative bg-white px-3 text-[10px] uppercase font-semibold text-[var(--color-muted)] tracking-wider">or continue with</span>
          </div>

          <button
            id="btn-google-auth"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={authLoading}
            className="w-full bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl transition duration-200 text-sm flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="text-center mt-6 pt-4 border-t border-[var(--color-border)]">
            <button
              id="btn-toggle-auth-mode"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setAuthError("");
              }}
              className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] font-medium"
            >
              {isSignUp ? "Already have an account? Sign In" : "New to Rumi? Create an Account"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Logged In, but Onboarding Incomplete
  if (!userProfile || !userProfile.onboardingCompleted) {
    return <Onboarding user={user} onComplete={handleOnboardingComplete} />;
  }

  // Active Workspace Layout
  return (
    <div id="app-workspace" className="min-h-screen bg-[#FCFBF7] text-[#1A2B32] flex flex-col md:flex-row font-sans selection:bg-[#00606E]/30">
      
      {/* Left Sidebar */}
      <aside className="w-full md:w-64 bg-[#F9FAFB] border-r border-[#D1D5DB] flex flex-col p-6 shrink-0 justify-between">
        <div className="space-y-8">
          {/* Logo / Branding */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#00606E] rounded-full flex items-center justify-center shrink-0">
              <div className="w-3 h-3 bg-white rounded-sm rotate-45"></div>
            </div>
            <div>
              <h1 id="sidebar-app-name" className="text-xl font-serif font-semibold text-[#1A2B32] tracking-tight">Rumi</h1>
              <p className="text-[10px] text-[#6B7280]">Your mindful companion</p>
            </div>
          </div>

          {/* Quick Streak Meter */}
          <div className="p-4 bg-white/60 rounded-2xl border border-[#D1D5DB]">
            <div className="text-[10px] uppercase tracking-wider text-[#00606E] font-bold mb-1 flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-[#00606E] fill-current animate-pulse" /> Streak
            </div>
            <div className="text-xl font-serif text-[#00606E] font-semibold">{userProfile.currentStreak || 0} Days</div>
            <div className="mt-2 h-1.5 w-full bg-[#D1D5DB] rounded-full overflow-hidden">
              <div className="h-full bg-[#00606E]" style={{ width: `${Math.min(100, Math.max(15, ((userProfile.currentStreak || 0) / 14) * 100))}%` }}></div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              id="nav-btn-dashboard"
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "dashboard"
                  ? "bg-[#E5E7EB] text-[#00606E]"
                  : "text-[#1A2B32] hover:bg-[#E5E7EB]/50 hover:text-[#00606E]"
              }`}
            >
              <Compass className="h-4 w-4" />
              <span>Dashboard</span>
            </button>

            <button
              id="nav-btn-calendar"
              onClick={() => setActiveTab("calendar")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "calendar"
                  ? "bg-[#E5E7EB] text-[#00606E]"
                  : "text-[#1A2B32] hover:bg-[#E5E7EB]/50 hover:text-[#00606E]"
              }`}
            >
              <CalendarIcon className="h-4 w-4" />
              <span>Calendar</span>
            </button>

            <button
              id="nav-btn-commit"
              onClick={() => setActiveTab("commit")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "commit"
                  ? "bg-[#E5E7EB] text-[#00606E]"
                  : "text-[#1A2B32] hover:bg-[#E5E7EB]/50 hover:text-[#00606E]"
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>Commit</span>
            </button>

            <button
              id="nav-btn-analytics"
              onClick={() => setActiveTab("analytics")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "analytics"
                  ? "bg-[#E5E7EB] text-[#00606E]"
                  : "text-[#1A2B32] hover:bg-[#E5E7EB]/50 hover:text-[#00606E]"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </button>

            <button
              id="nav-btn-notifications"
              onClick={() => setActiveTab("notifications")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "notifications"
                  ? "bg-[#E5E7EB] text-[#00606E]"
                  : "text-[#1A2B32] hover:bg-[#E5E7EB]/50 hover:text-[#00606E]"
              }`}
            >
              <div className="relative shrink-0 flex items-center justify-center">
                <Bell className="h-4 w-4" />
                {notifications.some(n => !n.read) && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-[#00606E] rounded-full border-2 border-[#FCFBF7] shadow-xs animate-pulse" />
                )}
              </div>
              <span>Notifications</span>
            </button>

            <button
              id="nav-btn-settings"
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "settings"
                  ? "bg-[#E5E7EB] text-[#00606E]"
                  : "text-[#1A2B32] hover:bg-[#E5E7EB]/50 hover:text-[#00606E]"
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Custom Rumi Avatar Trigger right below settings */}
          <div className="mt-4">
            <button
              id="rumi-avatar-trigger"
              onClick={() => setIsChatOpen(true)}
              className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-[#00606E]/10 to-[#E5E7EB]/20 hover:from-[#00606E]/20 hover:to-[#E5E7EB]/30 border border-[#D1D5DB] rounded-2xl transition-all group text-left cursor-pointer shadow-xs"
            >
              <div className="relative">
                <div className="h-10 w-10 rounded-full flex items-center justify-center relative overflow-hidden border border-[#00606E]/30 shadow-xs">
                  <svg viewBox="0 0 100 100" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="50" fill="#00606E" />
                    <rect x="34" y="34" width="32" height="32" rx="9" fill="#FCFBF7" transform="rotate(45 50 50)" />
                  </svg>
                </div>
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-emerald-500 border-2 border-[#F9FAFB] rounded-full"></span>
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-xs text-[#00606E] flex items-center gap-1">
                  Talk to Rumi <Sparkles className="h-3 w-3 text-[#00606E] animate-pulse" />
                </div>
                <div className="text-[10px] text-[#6B7280] truncate">Your mindful companion</div>
              </div>
            </button>
          </div>
        </div>

        {/* User profile / Logout footer block */}
        <div className="pt-6 border-t border-[#D1D5DB] mt-6 space-y-4">
          
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-white border border-[#D1D5DB] rounded-xl flex items-center justify-center text-[#00606E] font-semibold text-xs uppercase font-serif">
              {userProfile.name.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[#00606E] truncate">{userProfile.name}</div>
              <div className="text-[10px] text-[#6B7280] truncate">{userProfile.email}</div>
            </div>
          </div>

          <button
            id="btn-logout"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 p-6 md:p-10 lg:p-12 max-w-5xl mx-auto w-full">
        {activeTab === "dashboard" && (
          <Dashboard
            userProfile={userProfile}
            tasks={tasks}
            currentMood={currentMood}
            currentEnergy={currentEnergy}
            onUpdateMoodEnergy={handleUpdateMoodEnergy}
            onMoodyToggle={handleMoodyToggle}
            onTaskUpdated={() => fetchUserProfile(user.uid)}
            onActiveTaskSelect={(id) => {
              setActiveTaskId(id);
              if (id) {
                setActiveTab("commit");
              }
            }}
            activeTaskId={activeTaskId}
            userEnergyState={userEnergyState}
            onUpdateEnergyState={handleUpdateEnergyState}
            onAskRumi={handleAskRumi}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarView
            userProfile={userProfile}
            tasks={tasks}
          />
        )}

        {activeTab === "commit" && (
          <CommitTimer
            tasks={tasks}
            activeTaskId={activeTaskId}
            onActiveTaskChange={setActiveTaskId}
            onTaskUpdated={() => fetchUserProfile(user.uid)}
          />
        )}

        {activeTab === "analytics" && (
          <Analytics
            userProfile={userProfile}
            tasks={tasks}
            currentMood={currentMood}
            currentEnergy={currentEnergy}
          />
        )}

        {activeTab === "settings" && (
          <SettingsView
            userProfile={userProfile}
            onProfileUpdated={() => fetchUserProfile(user.uid)}
          />
        )}

        {activeTab === "notifications" && (
          <NotificationsView
            notifications={notifications}
            onClearAll={handleClearAllNotifications}
            onDeleteOne={handleDeleteNotification}
            onMarkAllAsRead={handleMarkAllNotificationsAsRead}
          />
        )}
      </main>

      {/* Rumi Chat Overlay Drawer */}
      {isChatOpen && (
        <ChatInterface
          user={user}
          userProfile={userProfile}
          tasks={tasks}
          currentMood={currentMood}
          currentEnergy={currentEnergy}
          userEnergyState={userEnergyState}
          isMoodyMode={isMoodyMode}
          initialTaskToBreakdown={selectedTaskForRumi}
          onTaskBreakdownHandled={() => setSelectedTaskForRumi(null)}
          onTaskUpdated={() => fetchUserProfile(user.uid)}
          triggerMoodyGreeting={triggerMoodyGreeting}
          onMoodyGreetingTriggered={() => setTriggerMoodyGreeting(false)}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  );
}
