import { GoogleAuthProvider, signInWithPopup, linkWithPopup } from "firebase/auth";
import { collection, addDoc, doc, updateDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { Task, TaskType, TaskCategory, TaskPriority } from "./types";

// Scopes required for Gmail, Google Calendar, and Google Tasks
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly"
];

// In-memory access token cache
let cachedAccessToken: string | null = null;

export function getGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export function setGoogleAccessToken(token: string | null) {
  cachedAccessToken = token;
}

// Open Google sign-in popup to authenticate and cache access token
export async function connectGoogle(): Promise<string> {
  const provider = new GoogleAuthProvider();
  GOOGLE_SCOPES.forEach(scope => provider.addScope(scope));

  try {
    const currentUser = auth.currentUser;
    let result;

    if (currentUser) {
      // If already logged in, link the Google provider to current account (or sign in again with provider popup)
      try {
        result = await linkWithPopup(currentUser, provider);
      } catch (err: any) {
        if (err.code === "auth/credential-already-in-use") {
          // If already linked, just do a normal popup sign in to fetch credentials/access token
          result = await signInWithPopup(auth, provider);
        } else {
          result = await signInWithPopup(auth, provider);
        }
      }
    } else {
      result = await signInWithPopup(auth, provider);
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) {
      throw new Error("Failed to retrieve Google OAuth access token.");
    }

    cachedAccessToken = token;
    return token;
  } catch (error: any) {
    console.error("Error connecting to Google:", error);
    if (error.code === "auth/popup-blocked" || error.message?.includes("popup")) {
      throw new Error("The Google login popup was blocked by your browser. Please allow popups for this site, click the address bar popup icon to allow them, or try opening the application in a new tab to authorize Rumi.");
    }
    throw error;
  }
}

// Disconnect Google session
export function disconnectGoogle() {
  cachedAccessToken = null;
}

/**
 * Sync Google Tasks with Rumi
 * - Fetches tasks from default task list
 * - Two-way sync completion statuses
 * - Push newly added Rumi tasks without googleTaskId to Google Tasks
 */
export async function syncGoogleTasks(userId: string, currentRumiTasks: Task[]): Promise<void> {
  const token = getGoogleAccessToken();
  if (!token) return;

  try {
    // 1. Fetch Google Task Lists to find default
    const listsRes = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!listsRes.ok) throw new Error("Failed to fetch Google Task Lists");
    const listsData = await listsRes.json();
    const defaultList = listsData.items?.[0];
    if (!defaultList) return;
    const listId = defaultList.id;

    // 2. Fetch tasks from Google Task List
    const tasksRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?showCompleted=true&showHidden=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!tasksRes.ok) throw new Error("Failed to fetch Google Tasks");
    const tasksData = await tasksRes.json();
    const gTasks = tasksData.items || [];

    const batch = writeBatch(db);
    let hasUpdates = false;

    // Helper map for existing Google Tasks synced in Rumi
    const rumiTasksByGId = new Map<string, Task>();
    currentRumiTasks.forEach(t => {
      if (t.googleTaskId) rumiTasksByGId.set(t.googleTaskId, t);
    });

    // 3. Process task list from Google
    for (const gt of gTasks) {
      if (!gt.title) continue; // Skip empty titles

      const matchingRumiTask = rumiTasksByGId.get(gt.id);
      const isGCompleted = gt.status === "completed";

      if (matchingRumiTask) {
        // Task exists on both sides, check if completions match
        if (matchingRumiTask.completed !== isGCompleted) {
          // If Rumi is completed but Google is not -> Complete Google Task
          if (matchingRumiTask.completed) {
            await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${gt.id}`, {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ status: "completed" })
            });
          } else {
            // If Google is completed but Rumi is not -> Complete Rumi Task
            const tRef = doc(db, "users", userId, "tasks", matchingRumiTask.id);
            batch.update(tRef, {
              completed: true,
              completedDate: gt.completed || new Date().toISOString()
            });
            hasUpdates = true;
          }
        }
      } else {
        // Task exists in Google but not in Rumi -> Import as new Rumi task
        const dueDateStr = gt.due ? gt.due.split("T")[0] : new Date().toISOString().split("T")[0];
        
        // Check if task with same title and due date already exists to avoid duplicates
        const isDuplicate = currentRumiTasks.some(existing => 
          existing.title.toLowerCase().trim() === (gt.title || "").toLowerCase().trim() && 
          existing.dueDate === dueDateStr
        );
        if (isDuplicate) continue;

        const newTaskRef = doc(collection(db, "users", userId, "tasks"));
        
        const classifiedType = classifyEvent(gt.title || "Untitled Google Task", gt.notes || "");
        const classifiedCategory = getCategoryForType(classifiedType, gt.title || "Untitled Google Task", gt.notes || "");

        const newTaskData: Omit<Task, "id"> = {
          userId,
          title: gt.title || "Untitled Google Task",
          description: gt.notes || "Imported from Google Tasks",
          type: classifiedType,
          category: classifiedCategory,
          priority: (classifiedType === "Interview" || classifiedType === "Bill") ? "High-Priority" : "Priority",
          dueDate: dueDateStr || new Date().toISOString().split("T")[0],
          completed: !!isGCompleted,
          completedDate: gt.completed || null,
          createdAt: gt.updated || new Date().toISOString(),
          timeSpentMs: 0,
          googleTaskId: gt.id || ""
        };
        batch.set(newTaskRef, newTaskData);
        hasUpdates = true;
      }
    }

    // 4. Push new Rumi tasks created locally to Google Tasks
    for (const rt of currentRumiTasks) {
      if (!rt.googleTaskId && !rt.googleEventId && !rt.gmailMessageId) {
        // Newly added local Rumi task -> push to Google Tasks
        try {
          const createRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              title: rt.title,
              notes: rt.description || "Created in Rumi",
              due: rt.dueDate ? `${rt.dueDate}T00:00:00.000Z` : undefined
            })
          });

          if (createRes.ok) {
            const createdGTask = await createRes.json();
            const tRef = doc(db, "users", userId, "tasks", rt.id);
            batch.update(tRef, { googleTaskId: createdGTask.id });
            hasUpdates = true;
          }
        } catch (pushErr) {
          console.error("Error pushing Rumi task to Google Tasks:", pushErr);
        }
      }
    }

    if (hasUpdates) {
      await batch.commit();
    }
  } catch (error) {
    console.error("Error in syncGoogleTasks:", error);
    throw error;
  }
}

/**
 * Classify a Calendar Event into Rumi Task Types
 */
export function classifyEvent(title: string, description: string): TaskType {
  const text = `${title} ${description}`.toLowerCase();

  if (
    text.includes("interview") ||
    text.includes("hiring") ||
    text.includes("technical screen") ||
    text.includes("recruiting") ||
    text.includes("assessment")
  ) {
    return "Interview";
  }

  if (
    text.includes("meeting") ||
    text.includes("sync") ||
    text.includes("discussion") ||
    text.includes("call") ||
    text.includes("zoom") ||
    text.includes("teams") ||
    text.includes("meet") ||
    text.includes("1:1") ||
    text.includes("one-on-one")
  ) {
    return "Meeting";
  }

  if (
    text.includes("assignment") ||
    text.includes("homework") ||
    text.includes("exam") ||
    text.includes("quiz") ||
    text.includes("project due") ||
    text.includes("submission") ||
    text.includes("grading") ||
    text.includes("deliverable")
  ) {
    return "Assignment";
  }

  if (
    text.includes("bill") ||
    text.includes("invoice") ||
    text.includes("due") ||
    text.includes("payment") ||
    text.includes("credit card") ||
    text.includes("subscription") ||
    text.includes("rent") ||
    text.includes("utility") ||
    text.includes("utilities")
  ) {
    return "Bill";
  }

  if (
    text.includes("personal") ||
    text.includes("dentist") ||
    text.includes("doctor") ||
    text.includes("exercise") ||
    text.includes("gym") ||
    text.includes("habit") ||
    text.includes("meditation") ||
    text.includes("family") ||
    text.includes("chill") ||
    text.includes("workout")
  ) {
    return "Personal Commitment";
  }

  return "Event";
}

/**
 * Determine if an event is Work or Personal based on classified type, title and description context
 */
export function getCategoryForType(type: TaskType, title: string, description: string): TaskCategory {
  const text = `${title} ${description}`.toLowerCase();

  // If type is explicitly Personal Commitment, it's Personal
  if (type === "Personal Commitment") {
    return "Personal";
  }

  // Personal commitments generally include Birthdays, Dinners, Dates, parties, celebrations, family, gym, doctor
  if (
    text.includes("birthday") ||
    text.includes("dinner") ||
    text.includes("date") ||
    text.includes("party") ||
    text.includes("parties") ||
    text.includes("celebration") ||
    text.includes("dentist") ||
    text.includes("doctor") ||
    text.includes("gym") ||
    text.includes("meditation") ||
    text.includes("workout") ||
    text.includes("family") ||
    text.includes("parent") ||
    text.includes("date night")
  ) {
    return "Personal";
  }

  // Meeting, Interview, Assignment are generally work or college-related (Work)
  if (type === "Meeting" || type === "Interview" || type === "Assignment") {
    return "Work";
  }

  // Bills, events that do not have personal keywords default to Work (as requested, most emails/tasks are work-related)
  return "Work";
}

/**
 * Sync Google Calendar with Rumi
 * - Fetch active events starting from 7 days ago onwards
 * - Map to dashboard, auto-classifying event types
 * - Sync updates to title, description, and dates
 */
export async function syncGoogleCalendar(userId: string, currentRumiTasks: Task[]): Promise<void> {
  const token = getGoogleAccessToken();
  if (!token) return;

  try {
    const timeMin = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("Failed to fetch Google Calendar events");
    const data = await res.json();
    const events = data.items || [];

    const batch = writeBatch(db);
    let hasUpdates = false;

    // Helper map of current synced calendar events
    const rumiEventsByGId = new Map<string, Task>();
    currentRumiTasks.forEach(t => {
      if (t.googleEventId) rumiEventsByGId.set(t.googleEventId, t);
    });

    for (const ev of events) {
      if (ev.status === "cancelled") continue;

      const title = ev.summary || "Untitled Event";
      const desc = ev.description || "";
      const startObj = ev.start?.date || ev.start?.dateTime;
      if (!startObj) continue;
      const eventDateStr = startObj.split("T")[0];

      const classifiedType = classifyEvent(title, desc);
      const isWorkCategory = getCategoryForType(classifiedType, title, desc);

      const matchingRumiTask = rumiEventsByGId.get(ev.id);

      if (matchingRumiTask) {
        // Event already mapped, check for updates
        const dateChanged = matchingRumiTask.dueDate !== eventDateStr;
        const titleChanged = matchingRumiTask.title !== title;
        const descChanged = matchingRumiTask.description !== desc;
        const typeChanged = matchingRumiTask.type !== classifiedType;

        if (dateChanged || titleChanged || descChanged || typeChanged) {
          const tRef = doc(db, "users", userId, "tasks", matchingRumiTask.id);
          batch.update(tRef, {
            title,
            description: desc,
            dueDate: eventDateStr,
            type: classifiedType,
            category: isWorkCategory as TaskCategory
          });
          hasUpdates = true;
        }
      } else {
        // New Event! Map to Rumi Task Dashboard
        // Check if task with same title and due date already exists to avoid duplicates
        const isDuplicate = currentRumiTasks.some(existing => 
          existing.title.toLowerCase().trim() === title.toLowerCase().trim() && 
          existing.dueDate === eventDateStr
        );
        if (isDuplicate) continue;

        const newTaskRef = doc(collection(db, "users", userId, "tasks"));
        const newTaskData: Omit<Task, "id"> = {
          userId,
          title: title || "Untitled Calendar Event",
          description: desc || "Imported from Google Calendar",
          type: classifiedType || "Event",
          category: isWorkCategory as TaskCategory,
          priority: (classifiedType === "Interview" || classifiedType === "Bill") ? "High-Priority" : "Priority",
          dueDate: eventDateStr || new Date().toISOString().split("T")[0],
          completed: false,
          createdAt: ev.created || new Date().toISOString(),
          timeSpentMs: 0,
          googleEventId: ev.id || ""
        };
        batch.set(newTaskRef, newTaskData);
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      await batch.commit();
    }
  } catch (error) {
    console.error("Error in syncGoogleCalendar:", error);
    throw error;
  }
}

/**
 * Scan Gmail Inbox & Import Relevant Tasks
 * - Calls backend to scan headers & snippets via Gemini
 * - Creates tasks for newly discovered items
 */
export async function scanAndImportGmail(userId: string, currentRumiTasks: Task[]): Promise<number> {
  const token = getGoogleAccessToken();
  if (!token) return 0;

  try {
    const res = await fetch("/api/gmail/scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) throw new Error("Failed to scan Gmail via server-side Gemini");
    const data = await res.json();
    const discoveredTasks = data.tasks || [];

    if (discoveredTasks.length === 0) return 0;

    const batch = writeBatch(db);
    let importCount = 0;
    let interceptedCount = 0;

    // Tracker map for already imported Gmail messages
    const rumiGmailMsgIds = new Set<string>();
    currentRumiTasks.forEach(t => {
      if (t.gmailMessageId) rumiGmailMsgIds.add(t.gmailMessageId);
    });

    for (const dt of discoveredTasks) {
      if (rumiGmailMsgIds.has(dt.messageId)) continue; // Skip already imported

      // Check if extracted email contains empty or missing title field
      const trimmedSubject = (dt.subject || "").trim();
      if (!trimmedSubject || trimmedSubject.toLowerCase() === "untitled" || trimmedSubject.toLowerCase() === "untitled gmail task") {
        interceptedCount++;
        continue;
      }

      // Check if task with same title and due date already exists to avoid duplicates
      const isDuplicate = currentRumiTasks.some(existing => 
        existing.title.toLowerCase().trim() === trimmedSubject.toLowerCase() && 
        existing.dueDate === dt.dueDate
      );
      if (isDuplicate) continue;

      const newTaskRef = doc(collection(db, "users", userId, "tasks"));
      const isWorkCategory = dt.category || getCategoryForType((dt.type || "Personal Commitment") as TaskType, trimmedSubject, dt.reason || "");
      
      const fullDesc = `${dt.reason || "Extracted from Gmail deadline scanning"}${dt.dueTime ? `\nTime: ${dt.dueTime}` : ""}`;

      const newTaskData: Omit<Task, "id"> = {
        userId,
        title: trimmedSubject,
        description: fullDesc || "Extracted from Gmail deadline scanning",
        type: (dt.type || "Personal Commitment") as TaskType,
        category: isWorkCategory as TaskCategory,
        priority: (dt.type === "Interview" || dt.type === "Bill") ? "High-Priority" : "Priority",
        dueDate: dt.dueDate || new Date().toISOString().split("T")[0],
        completed: false,
        createdAt: new Date().toISOString(),
        timeSpentMs: 0,
        gmailMessageId: dt.messageId || ""
      };

      batch.set(newTaskRef, newTaskData);
      importCount++;
    }

    if (interceptedCount > 0) {
      try {
        await addDoc(collection(db, "users", userId, "notifications"), {
          userId,
          message: `Rumi found ${interceptedCount} Untitled Gmail Task${interceptedCount > 1 ? "s" : ""} in your Gmail. Check them out when you have time.`,
          read: false,
          createdAt: new Date().toISOString()
        });
      } catch (nErr) {
        console.error("Failed to write interception notification:", nErr);
      }
    }

    if (importCount > 0) {
      await batch.commit();
    }

    return importCount;
  } catch (error) {
    console.error("Error in scanAndImportGmail:", error);
    throw error;
  }
}
