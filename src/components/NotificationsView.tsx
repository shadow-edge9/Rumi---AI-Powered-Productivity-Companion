import React from "react";
import { AppNotification } from "../types";
import { Trash2, Bell, X, CheckCheck, Inbox, AlertCircle } from "lucide-react";

interface NotificationsViewProps {
  notifications: AppNotification[];
  onClearAll: () => Promise<void>;
  onDeleteOne: (id: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
}

export default function NotificationsView({
  notifications,
  onClearAll,
  onDeleteOne,
  onMarkAllAsRead,
}: NotificationsViewProps) {
  // Sort by date descending
  const sortedNotifications = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-8 animate-fade-in">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E2D9] pb-6">
        <div>
          <div className="flex items-center gap-2 text-[#00606E]">
            <Bell className="h-5 w-5 animate-pulse" />
            <h1 className="text-2xl font-serif font-bold tracking-tight">Rumi Notifications</h1>
          </div>
          <p className="text-xs text-[#8A958E] mt-1.5 font-sans">
            Keep track of automatic intercepts, system logs, and intelligent corrections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.read) && (
            <button
              onClick={onMarkAllAsRead}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F3F4F6] text-xs font-semibold text-[#00606E] border border-[#D1D5DB] rounded-xl transition cursor-pointer shadow-2xs"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark all read</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-600 border border-red-200 rounded-xl transition cursor-pointer shadow-2xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* List section */}
      {sortedNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-[#FCFBF7]/50 border border-[#E5E2D9]/60 rounded-3xl p-6">
          <div className="h-14 w-14 bg-white border border-[#E5E2D9] rounded-2xl flex items-center justify-center text-[#8A958E] shadow-2xs">
            <Inbox className="h-7 w-7" />
          </div>
          <div>
            <h3 className="font-serif font-semibold text-base text-[#1A2B32]">Your Inbox is Quiet</h3>
            <p className="text-xs text-[#8A958E] mt-1.5 max-w-sm mx-auto leading-relaxed">
              When Rumi performs intelligent intercepts, filters out empty tasks, or generates system alerts, they will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {sortedNotifications.map((notification) => {
            const formattedTime = new Date(notification.createdAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={notification.id}
                className={`relative flex items-start gap-4 p-5 rounded-2xl border transition-all ${
                  !notification.read
                    ? "bg-[#00606E]/5 border-[#00606E]/20 shadow-xs pl-6"
                    : "bg-white border-[#E5E2D9] hover:border-gray-300"
                }`}
              >
                {/* Unread vertical line tag */}
                {!notification.read && (
                  <span className="absolute left-0 top-0 bottom-0 w-1 bg-[#00606E] rounded-l-2xl" />
                )}

                {/* Status indicator icon */}
                <div className={`mt-0.5 h-7 w-7 rounded-xl flex items-center justify-center shrink-0 ${
                  !notification.read ? "bg-[#00606E]/10 text-[#00606E]" : "bg-gray-100 text-[#8A958E]"
                }`}>
                  <AlertCircle className="h-4 w-4" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-6">
                  <p className="text-xs text-[#1A2B32] font-medium leading-relaxed">
                    {notification.message}
                  </p>
                  <span className="block text-[10px] font-mono text-[#8A958E] mt-2 font-medium tracking-wide">
                    {formattedTime}
                  </span>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => onDeleteOne(notification.id)}
                  className="absolute right-4 top-4 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition cursor-pointer"
                  title="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
