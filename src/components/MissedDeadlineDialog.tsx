import React, { useState } from "react";
import { Task } from "../types";
import { X, Calendar, MessageSquare, Coffee, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface MissedDeadlineDialogProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onReschedule: (task: Task, newDate: string, explanation: string) => void;
}

export default function MissedDeadlineDialog({ isOpen, task, onClose, onReschedule }: MissedDeadlineDialogProps) {
  const [explanation, setExplanation] = useState("");
  const [customText, setCustomText] = useState("");
  const [newDate, setNewDate] = useState("");

  if (!isOpen || !task) return null;

  const preSets = [
    { label: "My energy was low or I felt sick", icon: Coffee, text: "Low energy" },
    { label: "Life got in the way (unexpected events)", icon: ShieldAlert, text: "Unexpected interruptions" },
    { label: "The task felt way bigger than I anticipated", icon: MessageSquare, text: "Underestimated complexity" },
    { label: "I just needed a breather and prioritized self-care", icon: Coffee, text: "Prioritized self-care" },
  ];

  const handleReschedule = () => {
    const finalExplanation = explanation === "other" ? customText : explanation;
    const finalDate = newDate || new Date(Date.now() + 86400000).toISOString().split("T")[0]; // default tomorrow
    onReschedule(task, finalDate, finalExplanation || "Needed a gentle reschedule");
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-xs flex items-center justify-center p-4 z-50 selection:bg-[#00606E]/20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-[#FDFCF0] border border-[#E5E2D9] rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto"
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-[#8A958E] hover:text-[#00606E]">
            <X className="h-5 w-5" />
          </button>

          <div className="space-y-6">
            <div className="text-center">
              <span className="text-[10px] font-bold text-[#00606E] bg-[#E9E7DF] border border-[#E5E2D9]/40 px-3 py-1 rounded-full uppercase tracking-wider">
                Gently Rescheduling
              </span>
              <h3 className="text-2xl font-serif font-semibold text-[#1A2B32] mt-3">
                No guilt. Just adaptation.
              </h3>
              <p className="text-[#8A958E] mt-2 text-sm leading-relaxed font-serif italic">
                It looks like <strong className="text-[#1A2B32] font-sans font-semibold not-italic">"{task.title}"</strong> was scheduled for {task.dueDate}. Life has its own rhythm, and that's completely okay. Let's adapt this together.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider">
                What got in the way? (So we can understand)
              </label>
              <div className="grid grid-cols-1 gap-2">
                {preSets.map((preset, index) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        setExplanation(preset.text);
                        setCustomText("");
                      }}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left text-xs transition duration-200 ${
                        explanation === preset.text
                          ? "bg-[#E9E7DF] border-[#00606E] text-[#00606E] font-bold"
                          : "bg-white border border-[#E5E2D9] text-[#4A5568] hover:border-[#00606E]/50"
                      }`}
                    >
                      <Icon className="h-4 w-4 text-[#00606E] shrink-0" />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setExplanation("other")}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left text-xs transition duration-200 ${
                    explanation === "other"
                      ? "bg-[#E9E7DF] border-[#00606E] text-[#00606E] font-bold"
                      : "bg-white border border-[#E5E2D9] text-[#4A5568] hover:border-[#00606E]/50"
                  }`}
                >
                  <MessageSquare className="h-4 w-4 text-[#00606E] shrink-0" />
                  <span>Something else...</span>
                </button>
              </div>

              {explanation === "other" && (
                <textarea
                  placeholder="Share a little context if you want, or just leave a gentle note..."
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  className="w-full bg-white border border-[#E5E2D9] focus:outline-none focus:border-[#00606E] focus:ring-1 focus:ring-[#00606E] rounded-xl p-3 text-sm text-[#4A5568] h-20 resize-none mt-2"
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-[#1A2B32] uppercase tracking-wider">
                When shall we gently move this to?
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    setNewDate(d.toISOString().split("T")[0]);
                  }}
                  className={`flex-1 py-2 px-3 border rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                    newDate === new Date(Date.now() + 86400000).toISOString().split("T")[0]
                      ? "bg-[#00606E] text-white border-[#00606E]"
                      : "bg-white text-[#4A5568] border-[#E5E2D9] hover:border-[#00606E]"
                  }`}
                >
                  Tomorrow
                </button>
                <button
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 3);
                    setNewDate(d.toISOString().split("T")[0]);
                  }}
                  className={`flex-1 py-2 px-3 border rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                    newDate === new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0]
                      ? "bg-[#00606E] text-white border-[#00606E]"
                      : "bg-white text-[#4A5568] border-[#E5E2D9] hover:border-[#00606E]"
                  }`}
                >
                  In 3 Days
                </button>
                <button
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    setNewDate(d.toISOString().split("T")[0]);
                  }}
                  className={`flex-1 py-2 px-3 border rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                    newDate === new Date(Date.now() + 86400000 * 7).toISOString().split("T")[0]
                      ? "bg-[#00606E] text-white border-[#00606E]"
                      : "bg-white text-[#4A5568] border-[#E5E2D9] hover:border-[#00606E]"
                  }`}
                >
                  Next Week
                </button>
              </div>

              <div className="flex items-center gap-2 bg-white border border-[#E5E2D9] rounded-xl px-3 py-2 mt-2">
                <Calendar className="h-4 w-4 text-[#00606E]" />
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="bg-transparent border-none text-xs text-[#4A5568] focus:outline-none w-full"
                />
              </div>
            </div>

            <div className="bg-[#F8F7F2] p-4 rounded-2xl border border-[#E5E2D9] text-center text-xs text-[#1A2B32] font-serif italic">
              "Your worth is not defined by task items completed. It is defined by how gently you care for your energy."
            </div>

            <div className="flex gap-3 pt-4 border-t border-[#E5E2D9]">
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-[#E5E2D9] rounded-xl text-sm font-semibold text-[#8A958E] hover:bg-[#F8F7F2] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                className="flex-1 py-3 bg-[#00606E] hover:bg-[#004550] text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-all"
              >
                Reschedule Peacefully
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
