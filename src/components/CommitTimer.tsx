import React, { useState, useEffect, useRef } from "react";
import { Task } from "../types";
import { Play, Pause, RotateCcw, AlertTriangle, HelpCircle, Check, Loader2, Sparkles } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

interface CommitTimerProps {
  tasks: Task[];
  activeTaskId: string | null;
  onActiveTaskChange: (id: string | null) => void;
  onTaskUpdated: () => void;
}

export default function CommitTimer({ tasks, activeTaskId, onActiveTaskChange, onTaskUpdated }: CommitTimerProps) {
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 min default
  const [isRunning, setIsRunning] = useState(false);
  const [totalSecondsSpent, setTotalSecondsSpent] = useState(0);
  const [interventionTriggered, setInterventionTriggered] = useState(false);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [suggestedSubtasks, setSuggestedSubtasks] = useState<string[]>([]);
  const [addedSubtasks, setAddedSubtasks] = useState<string[]>([]);

  const activeTask = tasks.find(t => t.id === activeTaskId) || null;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset timer when active task changes
  useEffect(() => {
    setIsRunning(false);
    setTimeLeft(25 * 60);
    setTotalSecondsSpent(0);
    setInterventionTriggered(false);
    setSuggestedSubtasks([]);
    setAddedSubtasks([]);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [activeTaskId]);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });

        setTotalSecondsSpent(prev => {
          const updated = prev + 1;
          // Trigger intervention if spent exceeds 1.5 hours (90 minutes = 5400 seconds)
          if (updated >= 5400 && !interventionTriggered) {
            setIsRunning(false);
            setInterventionTriggered(true);
            if (timerRef.current) clearInterval(timerRef.current);
          }
          return updated;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, interventionTriggered]);

  const handleToggle = () => {
    if (!activeTaskId) return;
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(25 * 60);
    setTotalSecondsSpent(0);
    setInterventionTriggered(false);
    setSuggestedSubtasks([]);
  };

  // Simulate 1.5 hours exceeded for demo/testing
  const handleSimulateExceeded = () => {
    setIsRunning(false);
    setTotalSecondsSpent(5400); // exactly 1.5 hours
    setInterventionTriggered(true);
  };

  const handleGetBreakdown = async () => {
    if (!activeTask) return;
    setLoadingBreakdown(true);
    try {
      const response = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeTask.title,
          description: activeTask.description,
        }),
      });
      const data = await response.json();
      if (data.subtasks && Array.isArray(data.subtasks)) {
        setSuggestedSubtasks(data.subtasks);
      }
    } catch (error) {
      console.error("Error getting breakdown:", error);
    } finally {
      setLoadingBreakdown(false);
    }
  };

  const handleAcceptSubtasks = async () => {
    if (!activeTask) return;
    try {
      const updatedInterventions = [
        ...(activeTask.pomodoroInterventions || []),
        ...suggestedSubtasks
      ];
      
      const taskRef = doc(db, "users", activeTask.userId, "tasks", activeTask.id);
      await updateDoc(taskRef, {
        pomodoroInterventions: updatedInterventions,
        timeSpentMs: (activeTask.timeSpentMs || 0) + totalSecondsSpent * 1000,
      });

      setAddedSubtasks(suggestedSubtasks);
      setSuggestedSubtasks([]);
      setInterventionTriggered(false);
      onTaskUpdated();
    } catch (error) {
      console.error("Error adding subtasks to task:", error);
    }
  };

  const handleCompleteTask = async () => {
    if (!activeTask) return;
    try {
      const taskRef = doc(db, "users", activeTask.userId, "tasks", activeTask.id);
      await updateDoc(taskRef, {
        completed: true,
        completedDate: new Date().toISOString(),
        timeSpentMs: (activeTask.timeSpentMs || 0) + totalSecondsSpent * 1000,
      });
      setIsRunning(false);
      onActiveTaskChange(null);
      onTaskUpdated();
    } catch (error) {
      console.error("Error completing task:", error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const incompleteTasks = tasks.filter(t => !t.completed);

  return (
    <div className="space-y-6 selection:bg-[#00606E]/20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-[#1A2B32] tracking-tight">Commit</h2>
          <p className="text-sm text-[#8A958E] font-serif italic">Select a task, commit your attention, and pace yourself gently.</p>
        </div>
        {activeTask && (
          <button
            onClick={handleSimulateExceeded}
            className="text-xs bg-[#FFF5F5] text-[#C55A5A] hover:bg-[#FFF5F5]/80 border border-[#FADEDE] px-3 py-1.5 rounded-xl transition-all font-bold uppercase tracking-wider"
          >
            Demo: Simulate 1.5h Blocked
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Task selector */}
        <div className="lg:col-span-1 bg-[#F8F7F2] border border-[#E5E2D9] rounded-3xl p-5 space-y-4">
          <h3 className="font-serif font-semibold text-sm text-[#1A2B32]">Choose what to commit to:</h3>
          {incompleteTasks.length === 0 ? (
            <div className="text-xs text-[#8A958E] italic text-center py-8">
              No tasks to commit to. Celebrate your free time or add a task!
            </div>
          ) : (
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {incompleteTasks.map(task => {
                const isActive = task.id === activeTaskId;
                return (
                  <button
                    key={task.id}
                    onClick={() => onActiveTaskChange(isActive ? null : task.id)}
                    className={`w-full p-3 rounded-2xl border text-left transition-all text-xs flex flex-col gap-1 ${
                      isActive
                        ? "bg-[#E9E7DF] border-[#00606E] text-[#00606E] font-bold"
                        : "bg-white border border-[#E5E2D9] text-[#4A5568] hover:border-[#00606E]/50"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 w-full">
                      <span className="truncate">{task.title}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider font-bold ${
                        task.priority === "High-Priority" ? "bg-[#FFF5F5] text-[#C55A5A]" :
                        task.priority === "Priority" ? "bg-[#E9E7DF] text-[#00606E]" :
                        "bg-white border border-[#E5E2D9] text-[#8A958E]"
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-[10px] text-[#8A958E] line-clamp-1">{task.description}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: The elegant Timer */}
        <div className="lg:col-span-2 bg-[#F8F7F2]/40 border border-[#E5E2D9] rounded-3xl p-8 flex flex-col items-center justify-center relative overflow-hidden min-h-[300px]">
          
          {activeTask ? (
            <div className="w-full max-w-md flex flex-col items-center text-center space-y-6">
              <div>
                <span className="text-[10px] font-bold text-[#00606E] bg-[#E9E7DF] border border-[#E5E2D9]/40 px-3 py-1 rounded-full uppercase tracking-wider">
                  Active Focus
                </span>
                <h4 className="text-xl font-serif font-semibold text-[#1A2B32] mt-2 line-clamp-1">
                  {activeTask.title}
                </h4>
                <p className="text-xs text-[#8A958E] mt-1 font-serif italic">
                  Time spent on this task: {Math.round((activeTask.timeSpentMs || 0) / 1000 / 60)} minutes
                </p>
              </div>

              {/* Huge Timer display */}
              <div className="text-6xl md:text-7xl font-serif text-[#1A2B32] font-light tracking-tight bg-white border border-[#E5E2D9] px-8 py-5 rounded-3xl shadow-sm">
                {formatTime(timeLeft)}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleToggle}
                  className={`h-14 w-14 rounded-full flex items-center justify-center text-white transition-all shadow-md ${
                    isRunning 
                      ? "bg-[#C55A5A] hover:bg-[#A94A4A] shadow-[#C55A5A]/10" 
                      : "bg-[#00606E] hover:bg-[#004550] shadow-[#00606E]/10"
                  }`}
                >
                  {isRunning ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
                </button>
                <button
                  onClick={handleReset}
                  className="h-10 w-10 rounded-full bg-white hover:bg-[#E9E7DF]/50 border border-[#E5E2D9] flex items-center justify-center text-[#4A5568] transition-all"
                  title="Reset Timer"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>

              <div className="w-full">
                <button
                  onClick={handleCompleteTask}
                  className="w-full py-3 border-2 border-[#00606E] text-[#00606E] hover:bg-[#00606E] hover:text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                >
                  Mark Task as Complete & Stop Timer
                </button>
              </div>

              {/* Progress feedback */}
              <p className="text-[11px] text-[#8A958E] font-serif italic">
                {isRunning ? "Focusing beautifully. Rest is as important as flow." : "Timer paused. Deep breaths."}
              </p>
            </div>
          ) : (
            <div className="text-center space-y-4 max-w-sm">
              <div className="h-12 w-12 bg-white border border-[#E5E2D9] rounded-2xl flex items-center justify-center text-[#8A958E] mx-auto">
                <HelpCircle className="h-6 w-6" />
              </div>
              <h4 className="font-serif font-semibold text-[#1A2B32]">Select a Task to Begin Flow</h4>
              <p className="text-xs text-[#8A958E] leading-relaxed">
                Commit to one single task. Setting a focused intention helps reduce multitasking fatigue. Choose a task from the list on the left to start.
              </p>
            </div>
          )}

          {/* Intervention Modal Overlay */}
          {interventionTriggered && activeTask && (
            <div className="absolute inset-0 bg-[#FDFCF0]/98 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-10 overflow-y-auto">
              <div className="max-w-md space-y-6">
                <div className="h-12 w-12 bg-[#FFF5F5] border border-[#FADEDE] rounded-full flex items-center justify-center text-[#C55A5A] mx-auto animate-bounce">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                
                <div>
                  <h4 className="text-xl font-serif font-semibold text-[#C55A5A]">Let's pause, friend.</h4>
                  <p className="text-xs text-[#4A5568] mt-2 leading-relaxed">
                    You've been committing to <strong className="text-[#00606E] font-sans font-bold">"{activeTask.title}"</strong> for over 1.5 hours. When we feel stuck, it's a completely normal signal that the task is too broad or heavy. No self-blame here!
                  </p>
                  <p className="text-xs text-[#8A958E] mt-1 font-serif italic">
                    Let's use Rumi's AI intelligence to break this task down into gentle, bite-sized checklists so we can dissolve the anxiety together.
                  </p>
                </div>

                {suggestedSubtasks.length === 0 ? (
                  <button
                    onClick={handleGetBreakdown}
                    disabled={loadingBreakdown}
                    className="w-full py-3 bg-[#00606E] hover:bg-[#004550] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-[#00606E]/15 transition-all flex items-center justify-center gap-2"
                  >
                    {loadingBreakdown ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Breaking down with Rumi's empathy...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" /> Break It Down for Me
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-4 text-left bg-white border border-[#E5E2D9] p-4 rounded-2xl shadow-sm">
                    <div className="text-xs font-bold text-[#1A2B32] uppercase tracking-wider font-serif">Suggested Tiny Steps:</div>
                    <ul className="space-y-2">
                      {suggestedSubtasks.map((step, i) => (
                        <li key={i} className="text-xs text-[#4A5568] flex items-start gap-2">
                          <span className="font-bold text-[#00606E] shrink-0 font-serif">Step {i + 1}:</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={handleAcceptSubtasks}
                      className="w-full py-2.5 bg-[#00606E] hover:bg-[#004550] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                    >
                      <Check className="h-4 w-4" /> Add these steps to my task
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setInterventionTriggered(false);
                      setIsRunning(true);
                    }}
                    className="flex-1 py-2 text-xs text-[#00606E] hover:text-[#004550] font-bold uppercase tracking-wider transition-all"
                  >
                    Keep trying anyway
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 py-2 text-xs text-[#8A958E] hover:text-[#4A5568]"
                  >
                    Reset & try another task
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Show active task checklist subtasks if any were added */}
      {activeTask && (activeTask.pomodoroInterventions || []).length > 0 && (
        <div className="bg-[#F8F7F2]/40 border border-[#E5E2D9] rounded-3xl p-6 mt-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-[#00606E]" />
            <h4 className="font-serif font-semibold text-sm text-[#1A2B32]">Your Rumi Action Checklist (Deconstructed Task)</h4>
          </div>
          <div className="space-y-2">
            {activeTask.pomodoroInterventions?.map((step, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-white border border-[#E5E2D9] rounded-xl text-xs text-[#4A5568]">
                <span className="font-bold text-[#00606E] shrink-0 font-serif">#{i + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
