import React, { useState, useEffect } from "react";
import { UserProfile } from "../types";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Save, Sparkles, Moon, Sun, ListTodo, Plus, Trash2, KeyRound, 
  Check, ShieldAlert, Laptop, Mail, Calendar, CheckSquare, 
  Settings, ArrowRight, HelpCircle
} from "lucide-react";

interface SettingsViewProps {
  userProfile: UserProfile | null;
  onProfileUpdated: () => void;
}

export default function SettingsView({ userProfile, onProfileUpdated }: SettingsViewProps) {
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Shift to High Priority Days
  const [shiftDays, setShiftDays] = useState<number>(3);

  // 2. Baseline Target
  const [baselineTarget, setBaselineTarget] = useState<"Balanced" | "High Achiever">("Balanced");

  // 3. Usual Sleep Timings
  const [sleepStart, setSleepStart] = useState<string>("23:00");
  const [sleepEnd, setSleepEnd] = useState<string>("07:00");

  // 4. Daily, Weekly, Monthly Templates
  const [dailyTasks, setDailyTasks] = useState<string[]>([]);
  const [newDailyTask, setNewDailyTask] = useState("");

  const [weeklyTasks, setWeeklyTasks] = useState<string[]>([]);
  const [newWeeklyTask, setNewWeeklyTask] = useState("");

  const [monthlyTasks, setMonthlyTasks] = useState<string[]>([]);
  const [newMonthlyTask, setNewMonthlyTask] = useState("");

  // 5. Weekend Days
  const [weekendDays, setWeekendDays] = useState<"Fri-Sat" | "Sat-Sun">("Sat-Sun");

  // 6. All accesses and credentials
  const [gmailEnabled, setGmailEnabled] = useState(true);
  const [outlookEnabled, setOutlookEnabled] = useState(false);
  const [googleCalendarEnabled, setGoogleCalendarEnabled] = useState(false);
  const [googleTasksEnabled, setGoogleTasksEnabled] = useState(false);

  // Outlook nested parameters
  const [outlookEmail, setOutlookEmail] = useState("");
  const [outlookClientId, setOutlookClientId] = useState("");
  const [outlookClientSecret, setOutlookClientSecret] = useState("");
  const [outlookTenantId, setOutlookTenantId] = useState("common");

  // 7. Custom integrations (Jira, Monday.com, etc)
  const [otherIntegrations, setOtherIntegrations] = useState<{ name: string; enabled: boolean; credentials?: string }[]>([]);
  const [newIntegrationName, setNewIntegrationName] = useState("");
  const [newIntegrationCreds, setNewIntegrationCreds] = useState("");

  // Initialize state with existing user profile values
  useEffect(() => {
    if (!userProfile) return;

    if (userProfile.shiftToHighPriorityDays !== undefined) {
      setShiftDays(userProfile.shiftToHighPriorityDays);
    }
    if (userProfile.baselineTarget) {
      setBaselineTarget(userProfile.baselineTarget);
    }
    if (userProfile.sleepTimingStart) {
      setSleepStart(userProfile.sleepTimingStart);
    }
    if (userProfile.sleepTimingEnd) {
      setSleepEnd(userProfile.sleepTimingEnd);
    }
    if (userProfile.dailyTasksTemplate) {
      setDailyTasks(userProfile.dailyTasksTemplate);
    }
    if (userProfile.weeklyTasksTemplate) {
      setWeeklyTasks(userProfile.weeklyTasksTemplate);
    }
    if (userProfile.monthlyTasksTemplate) {
      setMonthlyTasks(userProfile.monthlyTasksTemplate);
    }
    if (userProfile.weekendDays) {
      setWeekendDays(userProfile.weekendDays);
    }
    if (userProfile.gmailAccessEnabled !== undefined) {
      setGmailEnabled(userProfile.gmailAccessEnabled);
    }
    if (userProfile.outlookAccessEnabled !== undefined) {
      setOutlookEnabled(userProfile.outlookAccessEnabled);
    }
    if (userProfile.googleCalendarAccessEnabled !== undefined) {
      setGoogleCalendarEnabled(userProfile.googleCalendarAccessEnabled);
    }
    if (userProfile.googleTasksAccessEnabled !== undefined) {
      setGoogleTasksEnabled(userProfile.googleTasksAccessEnabled);
    }
    if (userProfile.outlookCredentials) {
      setOutlookEmail(userProfile.outlookCredentials.email || "");
      setOutlookClientId(userProfile.outlookCredentials.clientId || "");
      setOutlookClientSecret(userProfile.outlookCredentials.clientSecret || "");
      setOutlookTenantId(userProfile.outlookCredentials.tenantId || "common");
    }
    if (userProfile.otherIntegrations) {
      setOtherIntegrations(userProfile.otherIntegrations);
    }
  }, [userProfile]);

  // Handler helpers for templates list
  const handleAddDailyTask = () => {
    if (!newDailyTask.trim()) return;
    if (dailyTasks.includes(newDailyTask.trim())) return;
    setDailyTasks([...dailyTasks, newDailyTask.trim()]);
    setNewDailyTask("");
  };

  const handleRemoveDailyTask = (index: number) => {
    setDailyTasks(dailyTasks.filter((_, i) => i !== index));
  };

  const handleAddWeeklyTask = () => {
    if (!newWeeklyTask.trim()) return;
    if (weeklyTasks.includes(newWeeklyTask.trim())) return;
    setWeeklyTasks([...weeklyTasks, newWeeklyTask.trim()]);
    setNewWeeklyTask("");
  };

  const handleRemoveWeeklyTask = (index: number) => {
    setWeeklyTasks(weeklyTasks.filter((_, i) => i !== index));
  };

  const handleAddMonthlyTask = () => {
    if (!newMonthlyTask.trim()) return;
    if (monthlyTasks.includes(newMonthlyTask.trim())) return;
    setMonthlyTasks([...monthlyTasks, newMonthlyTask.trim()]);
    setNewMonthlyTask("");
  };

  const handleRemoveMonthlyTask = (index: number) => {
    setMonthlyTasks(monthlyTasks.filter((_, i) => i !== index));
  };

  // Other integrations helper
  const handleAddOtherIntegration = () => {
    if (!newIntegrationName.trim()) return;
    const exists = otherIntegrations.some(item => item.name.toLowerCase() === newIntegrationName.trim().toLowerCase());
    if (exists) return;
    
    setOtherIntegrations([
      ...otherIntegrations, 
      {
        name: newIntegrationName.trim(),
        enabled: true,
        credentials: newIntegrationCreds.trim() || undefined
      }
    ]);
    setNewIntegrationName("");
    setNewIntegrationCreds("");
  };

  const handleToggleOtherIntegration = (idx: number) => {
    const updated = [...otherIntegrations];
    updated[idx].enabled = !updated[idx].enabled;
    setOtherIntegrations(updated);
  };

  const handleRemoveOtherIntegration = (idx: number) => {
    setOtherIntegrations(otherIntegrations.filter((_, i) => i !== idx));
  };

  // Submit and Save to Firestore
  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const userRef = doc(db, "users", userProfile.uid);
      await updateDoc(userRef, {
        shiftToHighPriorityDays: Number(shiftDays),
        baselineTarget,
        sleepTimingStart: sleepStart,
        sleepTimingEnd: sleepEnd,
        dailyTasksTemplate: dailyTasks,
        weeklyTasksTemplate: weeklyTasks,
        monthlyTasksTemplate: monthlyTasks,
        weekendDays,
        gmailAccessEnabled: gmailEnabled,
        outlookAccessEnabled: outlookEnabled,
        googleCalendarAccessEnabled: googleCalendarEnabled,
        googleTasksAccessEnabled: googleTasksEnabled,
        outlookCredentials: {
          email: outlookEmail,
          clientId: outlookClientId || null,
          clientSecret: outlookClientSecret || null,
          tenantId: outlookTenantId || "common"
        },
        otherIntegrations
      });

      setSaveSuccess(true);
      onProfileUpdated();
      
      // Auto-dismiss success notification
      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    } catch (err: any) {
      console.error("Error saving settings:", err);
      setError(err.message || "Failed to preserve settings changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="settings-view-container" className="space-y-6 max-w-4xl mx-auto pb-16 selection:bg-[#00606E]/20 animate-fade-in">
      
      {/* Top Header Banner */}
      <div className="bg-[#F8F7F2] border border-[#E5E2D9] rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xs">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-[#1A2B32] tracking-tight">System Settings</h2>
          <p className="text-sm text-[#8A958E] font-serif italic mt-1.5 flex items-center gap-2">
            <Settings className="h-4 w-4 text-[#00606E]" />
            Fine-tune onboarding baselines, routine schedules, task lists & integration access.
          </p>
        </div>
        
        <button
          id="btn-save-settings-header"
          onClick={handleSaveChanges}
          disabled={saving}
          className="bg-[#00606E] hover:bg-[#004550] text-white disabled:opacity-50 font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-2xl transition flex items-center gap-2 shadow-sm"
        >
          {saving ? (
            <>
              <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
              Preserving...
            </>
          ) : saveSuccess ? (
            <>
              <Check className="h-3.5 w-3.5 text-white" />
              Preserved!
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              Save Settings
            </>
          )}
        </button>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-4 text-xs font-sans flex items-center gap-2.5 animate-bounce">
          <Check className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <span className="font-bold">Settings saved successfully!</span> Your empathetic baseline metrics and connected workspace options have been synchronized across all views.
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-xs font-sans flex items-center gap-2.5">
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <span className="font-bold">Failed to update settings.</span> {error}
          </div>
        </div>
      )}

      <form onSubmit={handleSaveChanges} className="space-y-6">
        
        {/* Section 1: Productivity & Escalation Baselines */}
        <div className="bg-white border border-[#E5E2D9] rounded-3xl p-6 md:p-8 space-y-6 shadow-2xs">
          <div className="flex items-center gap-2 pb-4 border-b border-[#E5E2D9]">
            <Sparkles className="h-5 w-5 text-[#00606E]" />
            <h3 className="text-base font-serif font-semibold text-[#1A2B32]">Escalation & Focus Baselines</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Shift to High Priority */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider flex items-center gap-1">
                Escalation Threshold
                <span className="text-[10px] text-[#8A958E] lowercase normal-case font-normal">(days)</span>
              </label>
              <div className="text-[11px] text-[#8A958E] font-serif italic mb-1.5">
                Automatically escalate standard tasks to "High-Priority" if they remain unfinished for too long.
              </div>
              <input
                id="input-shift-days"
                type="number"
                min="1"
                max="30"
                value={shiftDays}
                onChange={(e) => setShiftDays(Math.max(1, parseInt(e.target.value) || 3))}
                className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] rounded-xl px-3.5 py-2.5 text-xs font-sans"
              />
              <span className="text-[10px] text-gray-400 block mt-1">Default value is 3 days. Adjust this to set your custom comfort zone.</span>
            </div>

            {/* 2. Baseline Target */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider">
                Baseline Task Target
              </label>
              <div className="text-[11px] text-[#8A958E] font-serif italic mb-2.5">
                Define the percentage threshold of your active goals used to scale daily/weekly productivity bars.
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  id="btn-baseline-balanced"
                  onClick={() => setBaselineTarget("Balanced")}
                  className={`flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all ${
                    baselineTarget === "Balanced"
                      ? "bg-[#00606E]/5 border-[#00606E] text-[#00606E] shadow-2xs"
                      : "bg-white border-[#E5E2D9] hover:bg-[#F8F7F2]/50 text-gray-700"
                  }`}
                >
                  <span className="font-bold text-xs">Balanced (50%)</span>
                  <span className="text-[10px] opacity-80 mt-1">Nurturing baseline designed to prevent stress & heavy overload.</span>
                </button>

                <button
                  type="button"
                  id="btn-baseline-achiever"
                  onClick={() => setBaselineTarget("High Achiever")}
                  className={`flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all ${
                    baselineTarget === "High Achiever"
                      ? "bg-[#00606E]/5 border-[#00606E] text-[#00606E] shadow-2xs"
                      : "bg-white border-[#E5E2D9] hover:bg-[#F8F7F2]/50 text-gray-700"
                  }`}
                >
                  <span className="font-bold text-xs">High Achiever (75%)</span>
                  <span className="text-[10px] opacity-80 mt-1">Ambitious baseline optimized for structured flow & rapid delivery.</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Section 2: Routine Timings & Weekends */}
        <div className="bg-white border border-[#E5E2D9] rounded-3xl p-6 md:p-8 space-y-6 shadow-2xs">
          <div className="flex items-center gap-2 pb-4 border-b border-[#E5E2D9]">
            <Moon className="h-5 w-5 text-[#00606E]" />
            <h3 className="text-base font-serif font-semibold text-[#1A2B32]">Routine & Rest Schedule</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 3. Usual Sleep Timings */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider">
                Usual Sleep Window
              </label>
              <div className="text-[11px] text-[#8A958E] font-serif italic mb-2">
                Rumi silences routine alarms, provides deep-night reflection greetings, and protects quiet hours during this timing.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[10px] text-[#8A958E] uppercase tracking-wider mb-1 font-semibold">Sleep Start</span>
                  <input
                    id="input-sleep-start"
                    type="time"
                    value={sleepStart}
                    onChange={(e) => setSleepStart(e.target.value)}
                    className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] rounded-xl px-3 py-2 text-xs font-sans"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-[#8A958E] uppercase tracking-wider mb-1 font-semibold">Wake Up Time</span>
                  <input
                    id="input-sleep-end"
                    type="time"
                    value={sleepEnd}
                    onChange={(e) => setSleepEnd(e.target.value)}
                    className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] rounded-xl px-3 py-2 text-xs font-sans"
                  />
                </div>
              </div>
            </div>

            {/* 7. Weekend Days */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider">
                Weekend Rest Days
              </label>
              <div className="text-[11px] text-[#8A958E] font-serif italic mb-2">
                Rest block configuration. Active daily targets are automatically scaled down or paused on selected weekends.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  id="btn-weekend-frisat"
                  onClick={() => setWeekendDays("Fri-Sat")}
                  className={`flex items-center justify-center p-3 rounded-2xl border text-center font-bold text-xs transition-all ${
                    weekendDays === "Fri-Sat"
                      ? "bg-[#00606E] text-white"
                      : "bg-[#F8F7F2] border-[#E5E2D9] hover:bg-[#E9E7DF]/50 text-gray-600"
                  }`}
                >
                  Friday, Saturday
                </button>

                <button
                  type="button"
                  id="btn-weekend-satsun"
                  onClick={() => setWeekendDays("Sat-Sun")}
                  className={`flex items-center justify-center p-3 rounded-2xl border text-center font-bold text-xs transition-all ${
                    weekendDays === "Sat-Sun"
                      ? "bg-[#00606E] text-white"
                      : "bg-[#F8F7F2] border-[#E5E2D9] hover:bg-[#E9E7DF]/50 text-gray-600"
                  }`}
                >
                  Saturday, Sunday
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Section 3: Templates (Daily, Weekly, Monthly) */}
        <div className="bg-white border border-[#E5E2D9] rounded-3xl p-6 md:p-8 space-y-6 shadow-2xs">
          <div className="flex items-center gap-2 pb-4 border-b border-[#E5E2D9]">
            <ListTodo className="h-5 w-5 text-[#00606E]" />
            <h3 className="text-base font-serif font-semibold text-[#1A2B32]">Common Task Templates</h3>
          </div>

          <p className="text-xs text-[#8A958E] leading-relaxed font-serif italic mb-4">
            These templates serve as quick-add skeletons. When creating or starting new cycles on your dashboard, you can import these configurations instantly.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* 4. Daily Template */}
            <div className="bg-[#F8F7F2]/60 border border-[#E5E2D9] rounded-2xl p-4.5 flex flex-col justify-between space-y-3">
              <div>
                <span className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Daily Obligations</span>
                <span className="block text-[10px] text-[#8A958E] mb-3">Tasks you carry out every single day.</span>
                
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {dailyTasks.length === 0 ? (
                    <span className="text-[10px] text-[#8A958E] font-serif italic block py-2">No templates specified</span>
                  ) : (
                    dailyTasks.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white border border-[#E5E2D9] rounded-xl px-2.5 py-1.5 text-xs">
                        <span className="truncate max-w-[130px] font-sans font-medium text-gray-700">{t}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDailyTask(idx)}
                          className="text-red-500 hover:text-red-700 transition shrink-0 ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-1.5 pt-2 border-t border-[#E5E2D9]">
                <input
                  id="input-new-daily-task"
                  type="text"
                  value={newDailyTask}
                  onChange={(e) => setNewDailyTask(e.target.value)}
                  placeholder="e.g. Meditate"
                  className="flex-1 bg-white border border-[#E5E2D9] focus:outline-none rounded-lg px-2 py-1 text-[11px]"
                  onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddDailyTask(); }}}
                />
                <button
                  type="button"
                  id="btn-add-daily-task"
                  onClick={handleAddDailyTask}
                  className="bg-[#00606E] hover:bg-[#004550] text-white px-2 py-1.5 rounded-lg transition shrink-0"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* 5. Weekly Template */}
            <div className="bg-[#F8F7F2]/60 border border-[#E5E2D9] rounded-2xl p-4.5 flex flex-col justify-between space-y-3">
              <div>
                <span className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Weekly Obligations</span>
                <span className="block text-[10px] text-[#8A958E] mb-3">Schedules recurring once per week.</span>
                
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {weeklyTasks.length === 0 ? (
                    <span className="text-[10px] text-[#8A958E] font-serif italic block py-2">No templates specified</span>
                  ) : (
                    weeklyTasks.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white border border-[#E5E2D9] rounded-xl px-2.5 py-1.5 text-xs">
                        <span className="truncate max-w-[130px] font-sans font-medium text-gray-700">{t}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWeeklyTask(idx)}
                          className="text-red-500 hover:text-red-700 transition shrink-0 ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-1.5 pt-2 border-t border-[#E5E2D9]">
                <input
                  id="input-new-weekly-task"
                  type="text"
                  value={newWeeklyTask}
                  onChange={(e) => setNewWeeklyTask(e.target.value)}
                  placeholder="e.g. Review status"
                  className="flex-1 bg-white border border-[#E5E2D9] focus:outline-none rounded-lg px-2 py-1 text-[11px]"
                  onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddWeeklyTask(); }}}
                />
                <button
                  type="button"
                  id="btn-add-weekly-task"
                  onClick={handleAddWeeklyTask}
                  className="bg-[#00606E] hover:bg-[#004550] text-white px-2 py-1.5 rounded-lg transition shrink-0"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* 6. Monthly Template */}
            <div className="bg-[#F8F7F2]/60 border border-[#E5E2D9] rounded-2xl p-4.5 flex flex-col justify-between space-y-3">
              <div>
                <span className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider mb-1">Monthly Obligations</span>
                <span className="block text-[10px] text-[#8A958E] mb-3">Deliverables due once per month.</span>
                
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {monthlyTasks.length === 0 ? (
                    <span className="text-[10px] text-[#8A958E] font-serif italic block py-2">No templates specified</span>
                  ) : (
                    monthlyTasks.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white border border-[#E5E2D9] rounded-xl px-2.5 py-1.5 text-xs">
                        <span className="truncate max-w-[130px] font-sans font-medium text-gray-700">{t}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMonthlyTask(idx)}
                          className="text-red-500 hover:text-red-700 transition shrink-0 ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-1.5 pt-2 border-t border-[#E5E2D9]">
                <input
                  id="input-new-monthly-task"
                  type="text"
                  value={newMonthlyTask}
                  onChange={(e) => setNewMonthlyTask(e.target.value)}
                  placeholder="e.g. Server backup"
                  className="flex-1 bg-white border border-[#E5E2D9] focus:outline-none rounded-lg px-2 py-1 text-[11px]"
                  onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddMonthlyTask(); }}}
                />
                <button
                  type="button"
                  id="btn-add-monthly-task"
                  onClick={handleAddMonthlyTask}
                  className="bg-[#00606E] hover:bg-[#004550] text-white px-2 py-1.5 rounded-lg transition shrink-0"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Section 4: Accesses, Credentials & Third-Party Integrations */}
        <div className="bg-white border border-[#E5E2D9] rounded-3xl p-6 md:p-8 space-y-6 shadow-2xs">
          <div className="flex items-center gap-2 pb-4 border-b border-[#E5E2D9]">
            <KeyRound className="h-5 w-5 text-[#00606E]" />
            <h3 className="text-base font-serif font-semibold text-[#1A2B32]">Workspace Connections & API Sync</h3>
          </div>

          <p className="text-xs text-[#8A958E] leading-relaxed font-serif italic mb-4">
            Connect external task managers, calendars, and systems to automatically import deadlines.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Built-in integrations switches */}
            <div className="space-y-4">
              <span className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider mb-2">Google & Microsoft Core Accesses</span>
              
              {/* Gmail Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-[#F8F7F2]/40 border border-[#E5E2D9] rounded-2xl">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-red-500" />
                  <div>
                    <span className="font-sans font-semibold text-xs text-[#1A2B32] block">Gmail Account Access</span>
                    <span className="text-[10px] text-[#8A958E] block">Auto-parse emails for urgent obligations</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="toggle-gmail-access"
                    type="checkbox"
                    checked={gmailEnabled}
                    onChange={(e) => setGmailEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00606E]"></div>
                </label>
              </div>

              {/* Google Calendars Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-[#F8F7F2]/40 border border-[#E5E2D9] rounded-2xl">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <div>
                    <span className="font-sans font-semibold text-xs text-[#1A2B32] block">Google Calendar Sync</span>
                    <span className="text-[10px] text-[#8A958E] block">Sync tasks to Google Calendar schedules</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="toggle-google-calendar"
                    type="checkbox"
                    checked={googleCalendarEnabled}
                    onChange={(e) => setGoogleCalendarEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00606E]"></div>
                </label>
              </div>

              {/* Google Tasks Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-[#F8F7F2]/40 border border-[#E5E2D9] rounded-2xl">
                <div className="flex items-center gap-3">
                  <CheckSquare className="h-4 w-4 text-[#00606E]" />
                  <div>
                    <span className="font-sans font-semibold text-xs text-[#1A2B32] block">Google Tasks Connection</span>
                    <span className="text-[10px] text-[#8A958E] block">Mirror Rumi tasks inside Google Tasks list</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="toggle-google-tasks"
                    type="checkbox"
                    checked={googleTasksEnabled}
                    onChange={(e) => setGoogleTasksEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00606E]"></div>
                </label>
              </div>

              {/* Microsoft Outlook Access Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-[#F8F7F2]/40 border border-[#E5E2D9] rounded-2xl">
                <div className="flex items-center gap-3">
                  <Laptop className="h-4 w-4 text-[#00606E]" />
                  <div>
                    <span className="font-sans font-semibold text-xs text-[#1A2B32] block">Microsoft Outlook Sync</span>
                    <span className="text-[10px] text-[#8A958E] block">Sync Outlook calendar and schedules</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="toggle-outlook-access"
                    type="checkbox"
                    checked={outlookEnabled}
                    onChange={(e) => setOutlookEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00606E]"></div>
                </label>
              </div>

            </div>

            {/* Outlook nested configurations if enabled */}
            <div className="space-y-4">
              <span className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider mb-2">Outlook Access Parameters</span>
              
              <div className={`p-4 rounded-2xl border transition-all ${
                outlookEnabled 
                  ? "bg-white border-[#00606E] shadow-2xs" 
                  : "bg-gray-50 border-gray-200 opacity-60 pointer-events-none"
              }`}>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[9px] font-bold text-[#8A958E] uppercase tracking-wider mb-1">Outlook Email</label>
                    <input
                      id="outlook-email-settings"
                      type="email"
                      value={outlookEmail}
                      onChange={(e) => setOutlookEmail(e.target.value)}
                      placeholder="you@outlook.com"
                      disabled={!outlookEnabled}
                      className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] rounded-xl px-2.5 py-2 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-[#8A958E] uppercase tracking-wider mb-1">Azure Tenant ID</label>
                      <input
                        id="outlook-tenant-settings"
                        type="text"
                        value={outlookTenantId}
                        onChange={(e) => setOutlookTenantId(e.target.value)}
                        placeholder="common"
                        disabled={!outlookEnabled}
                        className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] rounded-xl px-2.5 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#8A958E] uppercase tracking-wider mb-1">Client ID</label>
                      <input
                        id="outlook-client-id-settings"
                        type="text"
                        value={outlookClientId}
                        onChange={(e) => setOutlookClientId(e.target.value)}
                        placeholder="Optional client ID"
                        disabled={!outlookEnabled}
                        className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] rounded-xl px-2.5 py-2 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-[#8A958E] uppercase tracking-wider mb-1">Client Secret / App Password</label>
                    <input
                      id="outlook-secret-settings"
                      type="password"
                      value={outlookClientSecret}
                      onChange={(e) => setOutlookClientSecret(e.target.value)}
                      placeholder="••••••••••••••••"
                      disabled={!outlookEnabled}
                      className="w-full bg-[#F8F7F2] border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] rounded-xl px-2.5 py-2 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Section 7. Custom other integrations (Jira, Monday.com, etc) */}
          <div className="border-t border-[#E5E2D9] pt-6 mt-6 space-y-4">
            <span className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wider">Custom Integrations (e.g. Jira, Monday.com)</span>
            <p className="text-[11px] text-[#8A958E] font-serif italic mb-2">
              Sync tasks and workflows into your unified workspace view from tools like Jira, Notion, Asana, Linear, or Monday.com.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* List of existing custom integrations */}
              <div className="space-y-2">
                <span className="block text-[10px] text-[#8A958E] uppercase tracking-wider font-semibold mb-1">Active Custom Connections</span>
                
                {otherIntegrations.length === 0 ? (
                  <div className="p-4 border border-dashed border-[#E5E2D9] rounded-2xl text-center text-xs text-[#8A958E] font-serif italic">
                    No custom connections configured. Add linear, monday or jira targets on the right.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {otherIntegrations.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-[#F8F7F2] border border-[#E5E2D9] rounded-xl text-xs">
                        <div className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-[#00606E]" />
                          <div>
                            <span className="font-sans font-bold text-gray-700 block">{item.name}</span>
                            {item.credentials && (
                              <span className="font-mono text-[9px] text-[#8A958E] block">Token: ••••••••</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Toggle switch */}
                          <button
                            type="button"
                            onClick={() => handleToggleOtherIntegration(idx)}
                            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition ${
                              item.enabled 
                                ? "bg-[#00606E]/10 text-[#00606E]" 
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {item.enabled ? "Enabled" : "Disabled"}
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveOtherIntegration(idx)}
                            className="p-1 hover:bg-red-50 text-red-500 hover:text-red-700 rounded transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add custom integrations form */}
              <div className="bg-[#F8F7F2]/40 border border-[#E5E2D9] rounded-2xl p-4.5 space-y-3">
                <span className="block text-[10px] text-[#00606E] uppercase tracking-wider font-bold">Configure New Integration Target</span>
                
                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-[9px] font-bold text-[#8A958E] uppercase tracking-wider mb-0.5">Integration Platform</label>
                    <input
                      id="input-other-integration-name"
                      type="text"
                      value={newIntegrationName}
                      onChange={(e) => setNewIntegrationName(e.target.value)}
                      placeholder="e.g. Jira Project X, Monday.com Board"
                      className="w-full bg-white border border-[#E5E2D9] focus:outline-none rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-[#8A958E] uppercase tracking-wider mb-0.5">API Token / Webhook Credentials</label>
                    <input
                      id="input-other-integration-creds"
                      type="password"
                      value={newIntegrationCreds}
                      onChange={(e) => setNewIntegrationCreds(e.target.value)}
                      placeholder="Enter Bearer Token / API Token"
                      className="w-full bg-white border border-[#E5E2D9] focus:outline-none rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    id="btn-add-other-integration"
                    onClick={handleAddOtherIntegration}
                    className="w-full bg-[#00606E] hover:bg-[#004550] text-white py-1.5 rounded-lg text-[10px] font-bold uppercase transition flex items-center justify-center gap-1 shadow-2xs"
                  >
                    <Plus className="h-3 w-3" /> Add Connection Target
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Global Save Button Section */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            id="btn-save-settings-footer"
            disabled={saving}
            className="bg-[#00606E] hover:bg-[#004550] text-white disabled:opacity-50 font-bold text-xs uppercase tracking-wider px-8 py-3.5 rounded-2xl transition flex items-center gap-2 shadow-sm"
          >
            {saving ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save System Settings
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
