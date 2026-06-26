import React, { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { UserProfile } from "../types";
import { Calendar, Mail, ShieldAlert, Sparkles, Check, ArrowRight, Plus, Trash } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { connectGoogle } from "../googleAuth";

interface OnboardingProps {
  user: any;
  onComplete: (profile: UserProfile) => void;
}

export default function Onboarding({ user, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(user.displayName || "");
  const [pronouns, setPronouns] = useState("");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [typicalEnergy, setTypicalEnergy] = useState("normal");
  const [integrations, setIntegrations] = useState({
    calendar: false,
    gmail: false,
    outlook: false,
  });
  const [bills, setBills] = useState<{ title: string; day: number; category: "Work" | "Personal" }[]>([
    { title: "Internet Bill", day: 15, category: "Personal" },
    { title: "Monthly Rent", day: 1, category: "Personal" },
  ]);
  const [newBillTitle, setNewBillTitle] = useState("");
  const [newBillDay, setNewBillDay] = useState(5);
  const [newBillCategory, setNewBillCategory] = useState<"Work" | "Personal">("Personal");
  const [dailyGoalCount, setDailyGoalCount] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const focusOptions = ["Deep Work", "Self-Care", "Life Admin", "Learning", "Habits", "Career Development"];

  const handleToggleFocus = (area: string) => {
    setFocusAreas(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  const handleConnectGoogle = async () => {
    setError(null);
    try {
      await connectGoogle();
      setIntegrations(prev => ({ ...prev, calendar: true, gmail: true }));
    } catch (err: any) {
      console.error("Error connecting Google:", err);
      if (err.code === "auth/popup-blocked" || err.message?.includes("popup")) {
        setError("The authorization popup was blocked by your browser. Please click the 'Open in New Tab' button in the top right corner of the screen to open the app in a new window, or allow popups in your browser settings!");
      } else {
        setError(err.message || "Failed to connect to Google. Please try again.");
      }
    }
  };

  const handleAddBill = () => {
    if (!newBillTitle.trim()) return;
    setBills(prev => [...prev, { title: newBillTitle, day: newBillDay, category: newBillCategory }]);
    setNewBillTitle("");
  };

  const handleRemoveBill = (index: number) => {
    setBills(prev => prev.filter((_, i) => i !== index));
  };

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      const profileData: UserProfile = {
        uid: user.uid,
        name: name || user.email?.split("@")[0] || "Friend",
        email: user.email || "",
        onboardingCompleted: true,
        onboardingAnswers: {
          pronouns,
          focusAreas,
          typicalEnergy,
          connectedCalendar: integrations.calendar ? "Google Calendar" : undefined,
        },
        monthlyBills: bills.map((b, i) => ({
          id: `bill-${Date.now()}-${i}`,
          title: b.title,
          amount: 0,
          dueDate: b.day,
          category: b.category,
        })),
        currentStreak: 0,
        dailyGoalCount,
      };

      await setDoc(doc(db, "users", user.uid), profileData);

      // Create initial automatic tasks based on Calendar Integration and Monthly Bills
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = String(today.getMonth() + 1).padStart(2, "0");

      // Set bills as tasks
      for (const bill of bills) {
        const dueDateStr = `${currentYear}-${currentMonth}-${String(bill.day).padStart(2, "0")}`;
        const taskId = `task-bill-${Date.now()}-${bill.title.replace(/\s+/g, "-")}`;
        await setDoc(doc(db, "users", user.uid, "tasks", taskId), {
          id: taskId,
          userId: user.uid,
          title: bill.title,
          description: `Recurring monthly commitment on the ${bill.day}th.`,
          type: "Bill",
          category: bill.category,
          priority: bill.day - today.getDate() <= 3 && bill.day >= today.getDate() ? "High-Priority" : "Priority",
          dueDate: dueDateStr,
          completed: false,
          createdAt: today.toISOString(),
          timeSpentMs: 0,
          isRecurring: true,
          recurrenceDay: bill.day,
        });
      }

      // If Calendar is integrated, pre-populate 2 demo events to show automatic deadline priority shifts!
      if (integrations.calendar) {
        const soonDate = new Date();
        soonDate.setDate(soonDate.getDate() + 2); // 2 days from now (should be automatic High-Priority)
        const soonDateStr = soonDate.toISOString().split("T")[0];

        const laterDate = new Date();
        laterDate.setDate(laterDate.getDate() + 5); // 5 days from now (should be Priority)
        const laterDateStr = laterDate.toISOString().split("T")[0];

        // Soon Event
        const taskSoonId = `task-cal-soon-${Date.now()}`;
        await setDoc(doc(db, "users", user.uid, "tasks", taskSoonId), {
          id: taskSoonId,
          userId: user.uid,
          title: "Project Milestone Sync",
          description: "Imported from Google Calendar. Crucial project check-in.",
          type: "Meeting",
          category: "Work",
          priority: "High-Priority", // Auto high priority because it is < 3 days away
          dueDate: soonDateStr,
          completed: false,
          createdAt: today.toISOString(),
          timeSpentMs: 0,
        });

        // Later Event
        const taskLaterId = `task-cal-later-${Date.now()}`;
        await setDoc(doc(db, "users", user.uid, "tasks", taskLaterId), {
          id: taskLaterId,
          userId: user.uid,
          title: "Quarterly Review Strategy",
          description: "Imported from Google Calendar. Preparing slides and presentation.",
          type: "Assignment",
          category: "Work",
          priority: "Priority", // Priority because it is 5 days away (> 3 days)
          dueDate: laterDateStr,
          completed: false,
          createdAt: today.toISOString(),
          timeSpentMs: 0,
        });
      }

      onComplete(profileData);
    } catch (error) {
      console.error("Error saving onboarding:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const variants = {
    enter: { opacity: 0, x: 20 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  return (
    <div id="onboarding-container" className="min-h-screen bg-[#FCFBF7] text-[#4A5568] flex flex-col items-center justify-center p-6 md:p-12 font-sans selection:bg-[#00606E]/30">
      <div className="w-full max-w-2xl bg-[#F8F7F2] rounded-3xl border border-[#E5E2D9] shadow-md overflow-hidden p-8 md:p-12 relative">
        
        {/* Top Progress bar */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-[#E9E7DF]">
          <div 
            className="h-full bg-[#00606E] transition-all duration-500" 
            style={{ width: `${(step / 6) * 100}%` }}
          />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="h-16 w-16 bg-[#E9E7DF] rounded-2xl flex items-center justify-center text-[#00606E] mb-6 shadow-sm">
                <Sparkles className="h-8 w-8 animate-pulse" />
              </div>
              <h1 id="onboarding-welcome-title" className="text-3xl md:text-4xl font-serif font-semibold tracking-tight text-[#1A2B32]">
                Welcome to Rumi
              </h1>
              <p className="text-lg text-[#8A958E] font-serif italic leading-relaxed">
                Take a deep breath. We are here to support you, not stress you. Rumi is an empathetic productivity companion designed to help you plan, prioritize, and gently move forward without the weight of self-guilt.
              </p>
              <p className="text-sm text-[#8A958E] font-serif italic">
                Before we begin, we'd love to ask a few soft questions to tailor Rumi to your unique rhythm.
              </p>
              <button
                id="btn-onboarding-start"
                onClick={() => setStep(2)}
                className="mt-8 flex items-center justify-center gap-2 bg-[#00606E] hover:bg-[#004550] text-white font-bold uppercase text-xs tracking-wider px-6 py-3.5 rounded-xl transition duration-200 shadow-md shadow-[#00606E]/10"
              >
                Let's begin <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-serif font-semibold text-[#1A2B32]">Who are we speaking with?</h2>
              <p className="text-[#8A958E] font-serif italic">How would you like Rumi to address you during our conversations?</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#00606E] uppercase tracking-wider mb-2">Preferred Name</label>
                  <input
                    id="input-onboarding-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-white border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] focus:ring-1 focus:ring-[#00606E] rounded-xl px-4 py-3 text-base text-[#4A5568]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#00606E] uppercase tracking-wider mb-2">Pronouns (Optional)</label>
                  <input
                    id="input-onboarding-pronouns"
                    type="text"
                    value={pronouns}
                    onChange={e => setPronouns(e.target.value)}
                    placeholder="e.g. they/them, she/her, he/him"
                    className="w-full bg-white border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] focus:ring-1 focus:ring-[#00606E] rounded-xl px-4 py-3 text-base text-[#4A5568]"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center mt-10 pt-4 border-t border-[#E5E2D9]">
                <button onClick={() => setStep(1)} className="text-[#8A958E] hover:text-[#004550] font-bold uppercase text-xs tracking-wider transition-all">Back</button>
                <button
                  id="btn-onboarding-step2-next"
                  onClick={() => setStep(3)}
                  disabled={!name.trim()}
                  className="flex items-center gap-2 bg-[#00606E] hover:bg-[#004550] disabled:opacity-50 text-white font-bold uppercase text-xs tracking-wider px-6 py-3.5 rounded-xl transition duration-200 shadow-md shadow-[#00606E]/10"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-serif font-semibold text-[#1A2B32]">Your Gentle Focus</h2>
              <p className="text-[#8A958E] font-serif italic">What areas of your life are you focusing on nurturing right now? (Select all that apply)</p>
              
              <div className="grid grid-cols-2 gap-3">
                {focusOptions.map(option => {
                  const selected = focusAreas.includes(option);
                  return (
                    <button
                      key={option}
                      onClick={() => handleToggleFocus(option)}
                      className={`flex items-center justify-between p-4 rounded-xl border text-left transition duration-200 ${
                        selected 
                          ? "bg-[#E9E7DF] border-[#00606E] text-[#1A2B32] font-bold" 
                          : "bg-white border border-[#E5E2D9] text-[#4A5568] hover:border-[#00606E]"
                      }`}
                    >
                      <span className="text-xs uppercase tracking-wider font-bold">{option}</span>
                      {selected && <Check className="h-4 w-4 text-[#00606E] shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between items-center mt-10 pt-4 border-t border-[#E5E2D9]">
                <button onClick={() => setStep(2)} className="text-[#8A958E] hover:text-[#004550] font-bold uppercase text-xs tracking-wider transition-all">Back</button>
                <button
                  onClick={() => setStep(4)}
                  className="flex items-center gap-2 bg-[#00606E] hover:bg-[#004550] text-white font-bold uppercase text-xs tracking-wider px-6 py-3.5 rounded-xl transition duration-200 shadow-md shadow-[#00606E]/10"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-serif font-semibold text-[#1A2B32]">Calendar & Mail Connections</h2>
              <p className="text-[#8A958E] font-serif italic">
                Rumi automatically scans upcoming meetings, commitments, and schedules to prioritize them for you <strong>3 days prior</strong>. Connect your schedules to let Rumi protect your peace.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white border border-[#E5E2D9] rounded-2xl hover:border-[#00606E] transition duration-200">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-serif font-semibold text-[#1A2B32] text-sm">Google Calendar</h4>
                      <p className="text-xs text-[#8A958E]">Scan meetings & assignments dynamically</p>
                    </div>
                  </div>
                  <button
                    onClick={handleConnectGoogle}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
                      integrations.calendar 
                        ? "bg-[#00606E] text-white" 
                        : "bg-[#E9E7DF] text-[#4A5568] hover:bg-[#DEDCD2]"
                    }`}
                  >
                    {integrations.calendar ? "Connected" : "Connect"}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-white border border-[#E5E2D9] rounded-2xl hover:border-[#00606E] transition duration-200">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-serif font-semibold text-[#1A2B32] text-sm">Gmail (Inboxes & Receipts)</h4>
                      <p className="text-xs text-[#8A958E]">Detect bill receipts & flight strategy timelines</p>
                    </div>
                  </div>
                  <button
                    onClick={handleConnectGoogle}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
                      integrations.gmail 
                        ? "bg-[#00606E] text-white" 
                        : "bg-[#E9E7DF] text-[#4A5568] hover:bg-[#DEDCD2]"
                    }`}
                  >
                    {integrations.gmail ? "Connected" : "Connect"}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-white border border-[#E5E2D9] rounded-2xl hover:border-[#00606E] transition duration-200">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-[#E8F0FE] text-blue-800 rounded-xl flex items-center justify-center">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-serif font-semibold text-[#1A2B32] text-sm">Outlook Calendar</h4>
                      <p className="text-xs text-[#8A958E]">Bring over work calendars and events</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIntegrations(prev => ({ ...prev, outlook: !prev.outlook }))}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
                      integrations.outlook 
                        ? "bg-[#00606E] text-white" 
                        : "bg-[#E9E7DF] text-[#4A5568] hover:bg-[#DEDCD2]"
                    }`}
                  >
                    {integrations.outlook ? "Connected" : "Connect"}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs text-[#8A958E] bg-[#F8F7F2] p-3 rounded-xl border border-[#E5E2D9] mt-4">
                <ShieldAlert className="h-4 w-4 text-[#00606E] shrink-0 mt-0.5" />
                <span>
                  By connecting, Rumi can import strategic task dates automatically. Don't worry, your credentials and tokens are stored securely in your private profile.
                </span>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-serif italic leading-relaxed">
                  {error}
                </div>
              )}

              <div className="flex justify-between items-center mt-10 pt-4 border-t border-[#E5E2D9]">
                <button onClick={() => setStep(3)} className="text-[#8A958E] hover:text-[#004550] font-bold uppercase text-xs tracking-wider transition-all">Back</button>
                <button
                  id="btn-onboarding-step4-next"
                  onClick={() => setStep(5)}
                  className="flex items-center gap-2 bg-[#00606E] hover:bg-[#004550] text-white font-bold uppercase text-xs tracking-wider px-6 py-3.5 rounded-xl transition duration-200 shadow-md shadow-[#00606E]/10"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div
              key="step5"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-serif font-semibold text-[#1A2B32]">Monthly Recurring Bills & Commitments</h2>
              <p className="text-[#8A958E] font-serif italic">Set up dates for monthly obligations so Rumi can track and remind you without panic.</p>
              
              <div className="space-y-4">
                {/* Bills List */}
                {bills.length > 0 && (
                  <div className="bg-white border border-[#E5E2D9] rounded-2xl p-4 divide-y divide-[#E5E2D9]">
                    {bills.map((bill, index) => (
                      <div key={index} className="flex justify-between items-center py-2.5 first:pt-0 last:pb-0">
                        <div>
                          <span className="font-serif font-semibold text-[#1A2B32]">{bill.title}</span>
                          <span className="text-[10px] text-[#8A958E] ml-2 bg-[#E9E7DF]/60 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            Day {bill.day} of month
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8A958E] uppercase tracking-wider font-bold">{bill.category}</span>
                          <button onClick={() => handleRemoveBill(index)} className="text-red-500 hover:text-red-700 p-1 transition-all">
                            <Trash className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Bill Form */}
                <div className="bg-white border border-dashed border-[#00606E]/60 rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-bold font-serif text-[#00606E]">Add a recurring bill/commitment</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Electricity, Gym, Rent"
                      value={newBillTitle}
                      onChange={e => setNewBillTitle(e.target.value)}
                      className="bg-[#F8F7F2] border border-[#E5E2D9] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#00606E]"
                    />
                    <div className="flex items-center gap-2 bg-[#F8F7F2] border border-[#E5E2D9] rounded-xl px-2 py-1">
                      <span className="text-xs text-[#8A958E] whitespace-nowrap">Due Day</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={newBillDay}
                        onChange={e => setNewBillDay(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                        className="w-full bg-transparent border-none text-sm focus:outline-none font-semibold text-center text-[#1A2B32]"
                      />
                    </div>
                    <select
                      value={newBillCategory}
                      onChange={e => setNewBillCategory(e.target.value as any)}
                      className="bg-[#F8F7F2] border border-[#E5E2D9] rounded-xl px-2 py-2 text-sm focus:outline-none text-[#1A2B32] font-semibold"
                    >
                      <option value="Personal">Personal</option>
                      <option value="Work">Work</option>
                    </select>
                  </div>
                  <button
                    onClick={handleAddBill}
                    className="flex items-center gap-1.5 text-xs text-white bg-[#00606E] hover:bg-[#004550] px-3 py-2 rounded-lg font-bold uppercase tracking-wider transition-all shadow-sm"
                  >
                    <Plus className="h-3 w-3" /> Add Commitment
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center mt-10 pt-4 border-t border-[#E5E2D9]">
                <button onClick={() => setStep(4)} className="text-[#8A958E] hover:text-[#004550] font-bold uppercase text-xs tracking-wider transition-all">Back</button>
                <button
                  onClick={() => setStep(6)}
                  className="flex items-center gap-2 bg-[#00606E] hover:bg-[#004550] text-white font-bold uppercase text-xs tracking-wider px-6 py-3.5 rounded-xl transition duration-200 shadow-md shadow-[#00606E]/10"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 6 && (
            <motion.div
              key="step6"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-serif font-semibold text-[#1A2B32]">Your Ideal Daily Rhythm</h2>
              <p className="text-[#8A958E] font-serif italic">On a typical day, how many completed tasks would make you feel accomplished but not exhausted?</p>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-[#F8F7F2] border border-[#E5E2D9] rounded-2xl p-6">
                  <div>
                    <h4 className="font-serif font-semibold text-[#1A2B32] text-lg">Daily Accomplishment Goal</h4>
                    <p className="text-xs text-[#8A958E] mt-1">
                      This represents your base standard. On low-energy or sick days, Rumi will automatically scale this down by 25% or 50% to protect your wellbeing.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 bg-white border border-[#E5E2D9] rounded-2xl p-2 shrink-0">
                    <button 
                      onClick={() => setDailyGoalCount(prev => Math.max(1, prev - 1))}
                      className="h-8 w-8 rounded-lg bg-[#F8F7F2] hover:bg-[#E9E7DF] font-bold text-[#00606E] flex items-center justify-center transition-all"
                    >
                      -
                    </button>
                    <span className="font-serif font-bold text-lg text-[#1A2B32] w-6 text-center">{dailyGoalCount}</span>
                    <button 
                      onClick={() => setDailyGoalCount(prev => Math.min(10, prev + 1))}
                      className="h-8 w-8 rounded-lg bg-[#F8F7F2] hover:bg-[#E9E7DF] font-bold text-[#00606E] flex items-center justify-center transition-all"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Example of dynamic adjustment preview */}
                <div className="border border-[#E5E2D9] rounded-2xl p-5 space-y-3">
                  <div className="text-[10px] font-bold text-[#8A958E] uppercase tracking-wider">Dynamic Habit System Preview:</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 bg-[#EAF0EB] border border-[#D0DFD3] rounded-xl text-center">
                      <div className="text-xs font-bold text-green-800">High Energy</div>
                      <div className="text-xl font-serif font-bold text-green-950 mt-1">{dailyGoalCount} tasks</div>
                      <div className="text-[10px] text-green-600">100% capacity</div>
                    </div>
                    <div className="p-3 bg-[#FFF9EA] border border-[#F6EACD] rounded-xl text-center">
                      <div className="text-xs font-bold text-amber-800">Low Energy</div>
                      <div className="text-xl font-serif font-bold text-amber-950 mt-1">{Math.max(1, Math.round(dailyGoalCount * 0.5))} tasks</div>
                      <div className="text-[10px] text-amber-600">50% capacity</div>
                    </div>
                    <div className="p-3 bg-[#FFF5F5] border border-[#FADCDD] rounded-xl text-center">
                      <div className="text-xs font-bold text-rose-800">Feeling Sick</div>
                      <div className="text-xl font-serif font-bold text-rose-950 mt-1">{Math.max(1, Math.round(dailyGoalCount * 0.25))} task</div>
                      <div className="text-[10px] text-rose-600">25% capacity</div>
                    </div>
                  </div>
                  <p className="text-xs text-[#8A958E] font-serif italic text-center">
                    Completing even your scaled target counts towards keeping your streaks! No guilt, only momentum.
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center mt-10 pt-4 border-t border-[#E5E2D9]">
                <button onClick={() => setStep(5)} className="text-[#8A958E] hover:text-[#004550] font-bold uppercase text-xs tracking-wider transition-all">Back</button>
                <button
                  id="btn-onboarding-finish"
                  onClick={handleFinish}
                  disabled={submitting}
                  className="flex items-center gap-2 bg-[#00606E] hover:bg-[#004550] disabled:opacity-50 text-white font-bold uppercase text-xs tracking-wider px-8 py-3.5 rounded-xl transition duration-200 shadow-md shadow-[#00606E]/10"
                >
                  {submitting ? "Entering Rumi..." : "Complete Setup"} <Check className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
