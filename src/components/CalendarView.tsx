import React, { useState } from "react";
import { Task, UserProfile } from "../types";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles } from "lucide-react";

interface CalendarViewProps {
  userProfile: UserProfile | null;
  tasks: Task[];
}

export default function CalendarView({ userProfile, tasks }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Helper arrays
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Days calculations
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarCells = [];

  // Previous month padding cells
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const dateStr = `${year}-${String(month === 0 ? 12 : month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    calendarCells.push({ day, isCurrentMonth: false, dateStr });
  }

  // Current month cells
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    calendarCells.push({ day: i, isCurrentMonth: true, dateStr });
  }

  // Next month padding cells
  const remainingCells = 42 - calendarCells.length;
  for (let i = 1; i <= remainingCells; i++) {
    const dateStr = `${year}-${String(month === 11 ? 1 : month + 2).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    calendarCells.push({ day: i, isCurrentMonth: false, dateStr });
  }

  // Group all completed tasks (active and archived) for comprehensive display
  const completedHistory = userProfile?.completedTasksHistory || [];
  const allHistoricAndActiveTasks = [
    ...tasks,
    ...completedHistory.map(h => ({
      id: h.id,
      title: h.title,
      description: "Archived completion",
      type: h.type,
      category: h.category,
      priority: h.priority,
      dueDate: h.completedDate.split("T")[0],
      completed: true,
      timeSpentMs: h.timeSpentMs,
      createdAt: h.completedDate
    } as Task))
  ];

  // Helper to retrieve tasks/events/deadlines for a specific day cell
  const getTasksForDate = (dateStr: string) => {
    return allHistoricAndActiveTasks.filter(t => {
      if (!t.dueDate) return false;
      const tDate = t.dueDate.split("T")[0];
      // Normalize single-digit days/months
      const [ty, tm, td] = tDate.split("-");
      const [cy, cm, cd] = dateStr.split("-");
      return Number(ty) === Number(cy) && Number(tm) === Number(cm) && Number(td) === Number(cd);
    });
  };

  // Render priority bullets
  const getPriorityBadgeStyles = (priority: string) => {
    switch (priority) {
      case "High-Priority":
        return "bg-red-100 text-red-700 border-red-200";
      case "Priority":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div id="calendar-container" className="space-y-6 selection:bg-[#00606E]/20">
      
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#F8F7F2] border border-[#E5E2D9] rounded-3xl p-6 shadow-xs">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-[#1A2B32] tracking-tight">Calendar</h2>
          <p className="text-sm text-[#8A958E] font-serif italic mt-1 flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-[#00606E]" />
            Aesthetic minimalist overview of all events, tasks, and deadlines.
          </p>
        </div>
        
        {/* Navigation Controls */}
        <div className="flex items-center gap-3 bg-white border border-[#E5E2D9] rounded-2xl p-1.5 shadow-2xs">
          <button
            id="btn-calendar-prev"
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-[#F8F7F2] text-[#00606E] rounded-xl transition"
            title="Previous Month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-serif font-semibold text-[#1A2B32] px-3 text-sm min-w-[120px] text-center">
            {monthNames[month]} {year}
          </span>
          <button
            id="btn-calendar-next"
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-[#F8F7F2] text-[#00606E] rounded-xl transition"
            title="Next Month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="bg-white border border-[#E5E2D9] rounded-3xl overflow-hidden shadow-xs">
        
        {/* Header - Day of Week Labels */}
        <div className="grid grid-cols-7 border-b border-[#E5E2D9] bg-[#F8F7F2]/40">
          {dayNames.map((day) => (
            <div key={day} className="py-3 text-center text-[10px] font-bold text-[#8A958E] uppercase tracking-wider font-sans border-r last:border-r-0 border-[#E5E2D9]/80">
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div id="calendar-days-grid" className="grid grid-cols-7 grid-rows-6 auto-rows-fr">
          {calendarCells.map((cell, idx) => {
            const dateTasks = getTasksForDate(cell.dateStr);
            const isToday = cell.dateStr === todayStr;

            return (
              <div
                key={idx}
                className={`min-h-[110px] md:min-h-[140px] p-2.5 border-r border-b border-[#E5E2D9]/60 last:border-r-0 hover:bg-[#F8F7F2]/20 transition flex flex-col justify-between ${
                  cell.isCurrentMonth ? "bg-white" : "bg-[#F9FAFB]/50 text-[#8A958E]/60"
                } ${isToday ? "bg-[#00606E]/5!" : ""}`}
              >
                {/* Header of the cell */}
                <div className="flex justify-between items-center mb-1">
                  <span
                    className={`text-xs font-semibold h-6 w-6 flex items-center justify-center rounded-full font-sans ${
                      isToday
                        ? "bg-[#00606E] text-white"
                        : cell.isCurrentMonth
                        ? "text-[#1A2B32]"
                        : "text-[#8A958E]/40"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {dateTasks.length > 0 && (
                    <span className="text-[9px] text-[#00606E] bg-[#00606E]/10 px-1.5 py-0.5 rounded-full font-bold">
                      {dateTasks.length}
                    </span>
                  )}
                </div>

                {/* Task Stack for this Day */}
                <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[85px] md:max-h-[105px] pr-0.5 custom-scrollbar">
                  {dateTasks.slice(0, 4).map((task) => (
                    <div
                      key={task.id}
                      className={`text-[10px] p-1.5 rounded-lg border leading-tight transition-all truncate hover:shadow-2xs ${
                        task.completed 
                          ? "bg-gray-50 border-gray-100 text-gray-400 line-through"
                          : getPriorityBadgeStyles(task.priority)
                      }`}
                      title={`${task.title} (${task.priority})`}
                    >
                      <div className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          task.completed
                            ? "bg-gray-300"
                            : task.priority === "High-Priority"
                            ? "bg-red-500"
                            : task.priority === "Priority"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`} />
                        <span className="truncate font-sans font-medium">{task.title}</span>
                      </div>
                    </div>
                  ))}
                  {dateTasks.length > 4 && (
                    <div className="text-[8px] text-[#8A958E] italic pl-1 font-serif">
                      + {dateTasks.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-6 bg-[#F8F7F2]/40 border border-[#E5E2D9] rounded-2xl p-4 text-xs">
        <span className="font-serif font-semibold text-[#1A2B32]">Priority Index:</span>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="font-sans text-gray-600">High-Priority</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span className="font-sans text-gray-600">Priority</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="font-sans text-gray-600">Not Urgent</span>
        </div>
        <div className="flex items-center gap-1.5 border-l pl-6 border-[#E5E2D9]">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300 line-through" />
          <span className="font-sans text-gray-400">Completed (History Preserved)</span>
        </div>
      </div>

    </div>
  );
}
