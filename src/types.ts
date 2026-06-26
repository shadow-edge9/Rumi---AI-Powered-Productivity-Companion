export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  onboardingCompleted: boolean;
  onboardingAnswers?: {
    pronouns?: string;
    focusAreas?: string[];
    typicalEnergy?: string;
    challenges?: string[];
    connectedCalendar?: string;
  };
  monthlyBills?: {
    id: string;
    title: string;
    amount: number;
    dueDate: number; // day of month 1-31
    category: "Work" | "Personal";
  }[];
  currentStreak: number;
  lastActiveDate?: string; // YYYY-MM-DD
  dailyGoalCount: number; // base number of tasks (e.g. 4)
  completedTasksHistory?: {
    id: string;
    title: string;
    completedDate: string;
    category: "Work" | "Personal";
    priority: "High-Priority" | "Priority" | "Not Urgent";
    type: string;
    timeSpentMs: number;
  }[];
  outlookCredentials?: {
    email: string;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
  };
  shiftToHighPriorityDays?: number;
  baselineTarget?: "Balanced" | "High Achiever";
  sleepTimingStart?: string;
  sleepTimingEnd?: string;
  dailyTasksTemplate?: string[];
  weeklyTasksTemplate?: string[];
  monthlyTasksTemplate?: string[];
  weekendDays?: "Fri-Sat" | "Sat-Sun";
  gmailAccessEnabled?: boolean;
  outlookAccessEnabled?: boolean;
  googleCalendarAccessEnabled?: boolean;
  googleTasksAccessEnabled?: boolean;
  otherIntegrations?: {
    name: string;
    enabled: boolean;
    credentials?: string;
  }[];
  moodyDaysCount?: number;
  activeDaysCount?: number;
}

export type TaskType = 
  | "Meeting" 
  | "Interview" 
  | "Assignment" 
  | "Event" 
  | "Bill" 
  | "Personal Commitment";

export type TaskCategory = "Work" | "Personal";

export type TaskPriority = "High-Priority" | "Priority" | "Not Urgent";

export interface TaskAttachment {
  name: string;
  url: string;
  size?: number;
  type?: string;
  uploadedAt: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: TaskType;
  category: TaskCategory;
  priority: TaskPriority;
  dueDate: string; // ISO String or YYYY-MM-DD
  completed: boolean;
  completedDate?: string;
  createdAt: string;
  timeSpentMs: number;
  pomodoroInterventions?: string[]; // small broken down subtasks from AI if 1.5h exceeded
  isRecurring?: boolean;
  recurrenceDay?: number;
  streakAdjusted?: boolean; // if completed under low energy goal adjustment
  explanation?: string; // custom explanation given during guilt-free missed deadline
  attachments?: TaskAttachment[];
  googleTaskId?: string; // tracker for Google Tasks sync
  googleEventId?: string; // tracker for Google Calendar sync
  gmailMessageId?: string; // tracker for Gmail import
}

export interface MoodLog {
  id: string;
  userId: string;
  energyLevel: "low" | "normal" | "high" | "sick";
  energyPercent: number; // 25, 50, 100
  note: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: "user" | "model";
  content: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  message: string;
  read: boolean;
  createdAt: string;
}
