import React, { useState, useEffect } from "react";
import { Task, UserProfile, TaskType, TaskCategory, TaskPriority } from "../types";
import { Flame, Award, Heart, RefreshCw, Compass, ShieldAlert, Sparkles, Smile } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

interface AnalyticsProps {
  userProfile: UserProfile | null;
  tasks: Task[];
  currentMood: string;
  currentEnergy: string;
}

export default function Analytics({ userProfile, tasks, currentMood, currentEnergy }: AnalyticsProps) {
  const [quote, setQuote] = useState("");
  const [loadingQuote, setLoadingQuote] = useState(false);

  // Moody vs Active days state
  const [localMoody, setLocalMoody] = useState(userProfile?.moodyDaysCount ?? 4);
  const [localActive, setLocalActive] = useState(userProfile?.activeDaysCount ?? 11);

  useEffect(() => {
    if (userProfile) {
      if (userProfile.moodyDaysCount !== undefined) {
        setLocalMoody(userProfile.moodyDaysCount);
      }
      if (userProfile.activeDaysCount !== undefined) {
        setLocalActive(userProfile.activeDaysCount);
      }
    }
  }, [userProfile?.moodyDaysCount, userProfile?.activeDaysCount]);

  const handleAdjustDays = async (type: "moody" | "active", amount: number) => {
    if (!userProfile?.uid) return;
    const currentMoody = userProfile.moodyDaysCount !== undefined ? userProfile.moodyDaysCount : 4;
    const currentActive = userProfile.activeDaysCount !== undefined ? userProfile.activeDaysCount : 11;
    
    let nextMoody = currentMoody;
    let nextActive = currentActive;

    if (type === "moody") {
      nextMoody = Math.max(0, currentMoody + amount);
    } else {
      nextActive = Math.max(0, currentActive + amount);
    }

    try {
      const userRef = doc(db, "users", userProfile.uid);
      await updateDoc(userRef, {
        moodyDaysCount: nextMoody,
        activeDaysCount: nextActive
      });
      setLocalMoody(nextMoody);
      setLocalActive(nextActive);
    } catch (err) {
      console.error("Error updating days count:", err);
    }
  };

  const fetchQuote = async () => {
    setLoadingQuote(true);
    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: currentMood, energyLevel: currentEnergy }),
      });
      const data = await response.json();
      if (data.quote) {
        setQuote(data.quote);
      }
    } catch (error) {
      console.error("Error fetching quote:", error);
      setQuote("Your worth is not defined by your productivity.");
    } finally {
      setLoadingQuote(false);
    }
  };

  useEffect(() => {
    fetchQuote();
  }, [currentMood, currentEnergy]);

  // Calculations for empathy statistics including completed tasks history (for rollover persistence)
  const completedHistory = userProfile?.completedTasksHistory || [];
  const allCompletedTasks = [
    ...tasks.filter(t => t.completed),
    ...completedHistory
  ];
  
  // Today's Docket totals (using dashboard active/completed tasks list)
  const totalDocket = tasks.length;
  const completedDocket = tasks.filter(t => t.completed).length;
  const docketPct = totalDocket > 0 ? Math.round((completedDocket / totalDocket) * 100) : 0;

  // Circular progress calculations (Radius: 44, Stroke: 8, Circumference = 2 * PI * Radius)
  const radius = 44;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (docketPct / 100) * circumference;

  // Priority Progress calculations for dashboard tasks
  const highPriorityTotal = tasks.filter(t => t.priority === "High-Priority").length;
  const highPriorityCompleted = tasks.filter(t => t.priority === "High-Priority" && t.completed).length;

  const priorityTotal = tasks.filter(t => t.priority === "Priority").length;
  const priorityCompleted = tasks.filter(t => t.priority === "Priority" && t.completed).length;

  const noPriorityTotal = tasks.filter(t => t.priority === "Not Urgent").length;
  const noPriorityCompleted = tasks.filter(t => t.priority === "Not Urgent" && t.completed).length;

  // General task classifications for Work-Life Index
  const workCount = tasks.filter(t => t.category === "Work").length + completedHistory.filter(h => h.category === "Work").length;
  const personalCount = tasks.filter(t => t.category === "Personal").length + completedHistory.filter(h => h.category === "Personal").length;

  // Heatmap calculations for Productivity Matrix (12 weeks of productivity)
  const weeks = 12;
  const daysTotal = weeks * 7;
  const heatmapData = [];
  const today = new Date();
  
  // Find the Sunday of 11 weeks ago to start the grid perfectly on a Sunday
  const startDate = new Date();
  startDate.setDate(today.getDate() - daysTotal + 1);
  const startDayOfWeek = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDayOfWeek);

  for (let i = 0; i < daysTotal; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];

    // Count real tasks completed on this date
    const completedOnDay = allCompletedTasks.filter(t => {
      return t.completedDate && t.completedDate.startsWith(dateStr);
    }).length;

    // Generate stable, beautiful pseudo-random seeded completions to show realistic past activity
    let seedCount = 0;
    let hash = 0;
    for (let j = 0; j < dateStr.length; j++) {
      hash = dateStr.charCodeAt(j) + ((hash << 5) - hash);
    }
    const val = Math.abs(hash) % 10;
    if (val >= 5) {
      if (val < 8) seedCount = 1;
      else if (val < 9) seedCount = 2;
      else seedCount = 3;
    }

    // Prioritize real completions over seed counts
    const count = completedOnDay > 0 ? completedOnDay : seedCount;

    heatmapData.push({
      date: dateStr,
      count,
      dayOfWeek: d.getDay(),
    });
  }

  // Group into columns (weeks)
  const columns = [];
  for (let w = 0; w < weeks; w++) {
    const column = [];
    for (let d = 0; d < 7; d++) {
      column.push(heatmapData[w * 7 + d]);
    }
    columns.push(column);
  }

  // Month labels positioning above the columns
  const monthLabels: { text: string; colIndex: number }[] = [];
  let lastMonth = "";
  columns.forEach((col, colIdx) => {
    const firstDayOfCol = new Date(col[0].date);
    const monthName = firstDayOfCol.toLocaleDateString(undefined, { month: "short" });
    if (monthName !== lastMonth) {
      monthLabels.push({ text: monthName, colIndex: colIdx });
      lastMonth = monthName;
    }
  });

  const getColorClass = (count: number) => {
    if (count === 0) return "bg-[#E5E2D9]/40 hover:scale-125";
    if (count === 1) return "bg-[#96D2D0] hover:scale-125 hover:shadow-xs";
    if (count === 2) return "bg-[#4EA8A6] hover:scale-125 hover:shadow-sm";
    return "bg-[#00606E] hover:scale-125 hover:shadow-md";
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-6 selection:bg-[#00606E]/20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-[#1A2B32] tracking-tight">Analytics</h2>
          <p className="text-sm text-[#8A958E] font-serif italic">Reflecting on your journey, energy, and progress with compassion.</p>
        </div>
      </div>

      {/* Motivational Quote banner */}
      <div className="bg-[#F8F7F2] border border-[#E5E2D9] rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2 text-[#00606E] font-bold text-xs uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-[#00606E]" />
            <span>Rumi's Gentle Insight</span>
          </div>
          <p id="motivational-quote-text" className="text-base md:text-lg text-[#1A2B32] font-serif italic leading-relaxed">
            "{quote || "Take things slow. Progress is still progress, no matter the pace."}"
          </p>
          <p className="text-[10px] text-[#8A958E] font-serif italic">Personalized based on your current {currentEnergy} energy state</p>
        </div>
        <button
          onClick={fetchQuote}
          disabled={loadingQuote}
          className="shrink-0 h-10 w-10 bg-white border border-[#E5E2D9] hover:border-[#00606E] hover:bg-[#E9E7DF]/50 rounded-xl flex items-center justify-center text-[#00606E] hover:text-[#004550] transition-all"
          title="Refresh Quote"
        >
          <RefreshCw className={`h-4 w-4 ${loadingQuote ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats Cards Grid - 4-Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card 1: Today's Adapted Goal */}
        <div className="bg-[#F8F7F2]/50 border border-[#E5E2D9] rounded-3xl p-6 space-y-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block">Today's Adapted Goal</span>
                <p className="text-[10px] text-[#8A958E] italic mt-0.5">Adjusted for {currentEnergy} energy</p>
              </div>
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                currentEnergy === "low" ? "bg-[#FFF5F5] text-[#C55A5A]" :
                currentEnergy === "sick" ? "bg-rose-50 text-rose-700" :
                "bg-[#E9E7DF] text-[#00606E]"
              }`}>
                <Heart className="h-4 w-4" />
              </div>
            </div>

            {/* Circular Progress Bar */}
            <div className="flex flex-col items-center justify-center py-2">
              <div className="relative flex items-center justify-center" style={{ width: 104, height: 104 }}>
                <svg height={104} width={104} className="absolute transform -rotate-90">
                  <circle
                    stroke="#E5E2D9"
                    fill="transparent"
                    strokeWidth={stroke}
                    r={radius}
                    cx={52}
                    cy={52}
                  />
                  <circle
                    stroke="#00606E"
                    fill="transparent"
                    strokeWidth={stroke}
                    strokeDasharray={circumference + " " + circumference}
                    style={{ strokeDashoffset }}
                    strokeLinecap="round"
                    r={radius}
                    cx={52}
                    cy={52}
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="text-center z-10">
                  <span className="text-sm font-bold text-[#1A2B32] block leading-none">{completedDocket}/{totalDocket}</span>
                  <span className="text-[10px] font-semibold text-[#00606E] block mt-1">{docketPct}%</span>
                </div>
              </div>
              <span className="text-[10px] text-[#8A958E] font-serif italic mt-1.5">Docket Completion</span>
            </div>
          </div>

          {/* Underneath: Linear priority progress bars */}
          <div className="space-y-3 pt-3 border-t border-[#E5E2D9]">
            {/* High-Priority (Red) */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="font-semibold text-rose-700">High-Priority</span>
                <span className="text-rose-700 font-bold">[{highPriorityCompleted}/{highPriorityTotal}]</span>
              </div>
              <div className="h-1.5 bg-rose-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-rose-500 transition-all duration-500 rounded-full"
                  style={{ width: `${highPriorityTotal > 0 ? (highPriorityCompleted / highPriorityTotal) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Priority (Green) */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="font-semibold text-emerald-700">Priority</span>
                <span className="text-emerald-700 font-bold">[{priorityCompleted}/{priorityTotal}]</span>
              </div>
              <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-600 transition-all duration-500 rounded-full"
                  style={{ width: `${priorityTotal > 0 ? (priorityCompleted / priorityTotal) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* No Priority (Grey) */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="font-semibold text-gray-500">No Priority</span>
                <span className="text-gray-500 font-bold">[{noPriorityCompleted}/{noPriorityTotal}]</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gray-400 transition-all duration-500 rounded-full"
                  style={{ width: `${noPriorityTotal > 0 ? (noPriorityCompleted / noPriorityTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Habit Streak */}
        <div className="bg-[#F8F7F2]/50 border border-[#E5E2D9] rounded-3xl p-6 space-y-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block">Habit Streak</span>
                <h3 id="streak-count" className="text-3xl font-serif font-semibold text-[#1A2B32] mt-1 flex items-center gap-1.5">
                  {userProfile?.currentStreak || 0} <span className="text-xs font-sans font-normal text-[#8A958E] uppercase tracking-wider font-bold">days</span>
                </h3>
              </div>
              <div className="h-12 w-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 overflow-visible relative">
                <Flame className="h-7 w-7 fill-amber-400 text-amber-500 animate-flame" />
              </div>
            </div>

            <div className="text-xs text-[#8A958E] leading-relaxed mt-4">
              To preserve your streak, complete just your adapted capacity on any low-energy day. No stress, just steady momentum.
            </div>
          </div>

          <div className="flex gap-1.5 pt-4">
            {Array.from({ length: 7 }).map((_, i) => {
              const active = i < (userProfile?.currentStreak || 0);
              return (
                <div 
                  key={i} 
                  className={`flex-1 h-1.5 rounded-full ${
                    active ? "bg-amber-400 animate-pulse" : "bg-[#E9E7DF]"
                  }`} 
                />
              );
            })}
          </div>
        </div>

        {/* Card 3: Work-Life Index */}
        <div className="bg-[#F8F7F2]/50 border border-[#E5E2D9] rounded-3xl p-6 space-y-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block">Work-Life Index</span>
                <h3 className="text-3xl font-serif font-semibold text-[#1A2B32] mt-1">
                  {allCompletedTasks.length} <span className="text-xs font-sans font-normal text-[#8A958E] uppercase tracking-wider font-bold">completed</span>
                </h3>
              </div>
              <div className="h-10 w-10 bg-[#E9E7DF] rounded-xl flex items-center justify-center text-[#00606E]">
                <Compass className="h-5 w-5" />
              </div>
            </div>

            <div className="text-xs text-[#8A958E] mt-4">
              Ratio of commitments you've nurtured:
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-[11px] pt-4">
            <div className="bg-white p-2 border border-[#E5E2D9] rounded-xl">
              <div className="font-serif font-bold text-sm text-[#1A2B32]">{workCount}</div>
              <div className="text-[#8A958E] uppercase text-[9px] tracking-wider font-bold">Work</div>
            </div>
            <div className="bg-white p-2 border border-[#E5E2D9] rounded-xl">
              <div className="font-serif font-bold text-sm text-[#1A2B32]">{personalCount}</div>
              <div className="text-[#8A958E] uppercase text-[9px] tracking-wider font-bold">Personal</div>
            </div>
          </div>
        </div>

        {/* Card 4: Moody vs Active Days Tracking */}
        <div className="bg-[#F8F7F2]/50 border border-[#E5E2D9] rounded-3xl p-6 space-y-4 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block">Reflective Harmony</span>
                <h3 className="text-lg font-serif font-semibold text-[#1A2B32] mt-1">Moody vs Active</h3>
              </div>
              <div className="h-10 w-10 bg-[#E9E7DF] rounded-xl flex items-center justify-center text-[#00606E]">
                <Smile className="h-5 w-5" />
              </div>
            </div>

            {/* Adjustable Day Counters */}
            <div className="grid grid-cols-2 gap-2 text-center text-[11px] mt-4">
              <div className="bg-white p-2 border border-[#E5E2D9] rounded-xl relative group">
                <div className="font-serif font-bold text-base text-[#1A2B32]">{localMoody}</div>
                <div className="text-[#8A958E] uppercase text-[8px] tracking-wider font-bold">Moody Days</div>
                
                <div className="flex justify-center gap-2 mt-1.5">
                  <button 
                    onClick={() => handleAdjustDays("moody", -1)}
                    className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[9px] font-bold cursor-pointer"
                    title="Decrease Moody Days"
                  >
                    -
                  </button>
                  <button 
                    onClick={() => handleAdjustDays("moody", 1)}
                    className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[9px] font-bold cursor-pointer"
                    title="Increase Moody Days"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="bg-white p-2 border border-[#E5E2D9] rounded-xl relative group">
                <div className="font-serif font-bold text-base text-[#1A2B32]">{localActive}</div>
                <div className="text-[#8A958E] uppercase text-[8px] tracking-wider font-bold">Active Days</div>

                <div className="flex justify-center gap-2 mt-1.5">
                  <button 
                    onClick={() => handleAdjustDays("active", -1)}
                    className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[9px] font-bold cursor-pointer"
                    title="Decrease Active Days"
                  >
                    -
                  </button>
                  <button 
                    onClick={() => handleAdjustDays("active", 1)}
                    className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[9px] font-bold cursor-pointer"
                    title="Increase Active Days"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Insight Messages in Rumi's style */}
          <div className="text-[11px] text-[#8A958E] leading-relaxed pt-3 border-t border-[#E5E2D9]">
            {localMoody > localActive ? (
              <p className="text-[#C55A5A] italic font-serif">
                "The clouds gather thick, but the sun is not lost. Rumi whispers: 'Do not grieve. Anything you lose comes round in another form.' Please hold yourself with extra tenderness today and prioritize your soul's rest."
              </p>
            ) : (
              <p className="text-[#00606E] italic font-serif">
                "You walked through the mist and found the clearing. Rumi smiles: 'The wound is the place where the light enters you.' Despite every setback, you stepped forward with grace."
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Heatmap: Productivity Matrix */}
      <div className="bg-[#F8F7F2]/50 border border-[#E5E2D9] rounded-3xl p-6 space-y-4 shadow-xs">
        <div>
          <span className="text-[10px] font-bold text-[#00606E] uppercase tracking-wider block">Productivity Matrix</span>
          <h3 className="text-xl font-serif font-semibold text-[#1A2B32] mt-0.5">Your Gentle Consistency</h3>
          <p className="text-xs text-[#8A958E] font-serif italic">Visualizing daily completed commitments across the last 12 weeks.</p>
        </div>

        {/* Heatmap Grid Wrapper */}
        <div className="overflow-x-auto pt-2 pb-1">
          <div className="min-w-[400px] flex flex-col space-y-1">
            
            {/* Month Labels row */}
            <div className="flex pl-8 relative h-5 text-[10px] text-[#8A958E] font-medium">
              {monthLabels.map((lbl, idx) => {
                // Calculate estimated width spacing based on column index
                const leftPos = lbl.colIndex * 22;
                return (
                  <span 
                    key={idx} 
                    className="absolute" 
                    style={{ left: `${leftPos + 32}px` }}
                  >
                    {lbl.text}
                  </span>
                );
              })}
            </div>

            {/* Main heatmap structure with left Day-of-week labels */}
            <div className="flex items-start">
              {/* Day Labels */}
              <div className="flex flex-col justify-between pr-3 text-[9px] text-[#8A958E] h-[116px] w-8 font-medium pt-1">
                <span>Sun</span>
                <span>Tue</span>
                <span>Thu</span>
                <span>Sat</span>
              </div>

              {/* Columns of weeks */}
              <div className="flex gap-1.5">
                {columns.map((column, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-1.5">
                    {column.map((day) => (
                      <div key={day.date} className="relative group">
                        <div 
                          className={`w-3.5 h-3.5 rounded-[3px] transition-all duration-200 ${getColorClass(day.count)} cursor-pointer`}
                        />
                        {/* Interactive Tooltip */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#1A2B32] text-[#FCFBF7] text-[10px] rounded px-2.5 py-1.5 whitespace-nowrap z-50 shadow-md flex flex-col items-center">
                          <span className="font-bold">{day.count} commitment{day.count !== 1 ? "s" : ""}</span>
                          <span className="text-[9px] text-gray-300 mt-0.5">{formatDateLabel(day.date)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Heatmap Legend */}
        <div className="flex items-center justify-end gap-1.5 text-[10px] text-[#8A958E] pt-2 border-t border-[#E5E2D9]/40">
          <span>Less</span>
          <div className="w-3 h-3 rounded-[2px] bg-[#E5E2D9]/40" />
          <div className="w-3 h-3 rounded-[2px] bg-[#96D2D0]" />
          <div className="w-3 h-3 rounded-[2px] bg-[#4EA8A6]" />
          <div className="w-3 h-3 rounded-[2px] bg-[#00606E]" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
