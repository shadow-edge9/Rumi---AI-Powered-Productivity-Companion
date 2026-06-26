import React, { useState, useRef } from "react";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { storage, db } from "../firebase";
import { Task, TaskAttachment } from "../types";
import { 
  Paperclip, 
  Trash2, 
  UploadCloud, 
  Loader2, 
  FileText, 
  FileImage, 
  File, 
  Download, 
  AlertCircle 
} from "lucide-react";

interface TaskAttachmentsProps {
  userId: string;
  task: Task;
  onTaskUpdated: () => void;
}

export default function TaskAttachments({ userId, task, onTaskUpdated }: TaskAttachmentsProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get matching icon for file type
  const getFileIcon = (type?: string) => {
    if (!type) return <File className="h-5 w-5 text-[#8A958E]" />;
    if (type.startsWith("image/")) return <FileImage className="h-5 w-5 text-[#00606E]" />;
    if (type.includes("pdf") || type.includes("word") || type.includes("text")) {
      return <FileText className="h-5 w-5 text-[#00606E]" />;
    }
    return <File className="h-5 w-5 text-[#8A958E]" />;
  };

  // Format file size
  const formatSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // Upload file logic
  const uploadFile = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setErrorMsg("");

    try {
      // Create path: users/{userId}/tasks/{taskId}/{timestamp}_{filename}
      const fileRef = ref(storage, `users/${userId}/tasks/${task.id}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setProgress(pct);
        },
        (err) => {
          console.error("Upload error:", err);
          setErrorMsg("Failed to upload. Ensure Firebase Storage is initialized and permissions are correct.");
          setUploading(false);
        },
        async () => {
          // Upload complete
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          const newAttachment: TaskAttachment = {
            name: file.name,
            url: downloadUrl,
            size: file.size,
            type: file.type,
            uploadedAt: new Date().toISOString()
          };

          // Save attachment link to the Task in Firestore
          const taskRef = doc(db, "users", userId, "tasks", task.id);
          await updateDoc(taskRef, {
            attachments: arrayUnion(newAttachment)
          });

          setUploading(false);
          setProgress(0);
          onTaskUpdated();
        }
      );
    } catch (err: any) {
      console.error("Storage upload exception:", err);
      setErrorMsg(err.message || "An error occurred during upload.");
      setUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Delete attachment
  const handleDeleteAttachment = async (attachment: TaskAttachment) => {
    if (!window.confirm(`Are you sure you want to remove the attachment "${attachment.name}"?`)) {
      return;
    }

    try {
      // First remove the attachment metadata from the task in Firestore
      const taskRef = doc(db, "users", userId, "tasks", task.id);
      await updateDoc(taskRef, {
        attachments: arrayRemove(attachment)
      });

      // Try to delete the file from Storage (if it's stored on Firebase Storage)
      if (attachment.url.includes("firebasestorage.googleapis.com")) {
        try {
          const fileStorageRef = ref(storage, attachment.url);
          await deleteObject(fileStorageRef);
        } catch (storageErr) {
          // If the file was already deleted or storage is misconfigured, we still proceed
          console.warn("Storage delete failed or file not found:", storageErr);
        }
      }

      onTaskUpdated();
    } catch (err: any) {
      console.error("Error deleting attachment:", err);
      setErrorMsg("Failed to delete attachment from database.");
    }
  };

  return (
    <div id={`attachments-container-${task.id}`} className="mt-4 pt-4 border-t border-[#E5E2D9]/60 space-y-4">
      <div className="flex items-center justify-between">
        <h5 className="text-[11px] font-bold text-[#1A2B32] uppercase tracking-wider flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5 text-[#00606E]" />
          Attachments ({task.attachments?.length || 0})
        </h5>
      </div>

      {/* Attachments List */}
      {task.attachments && task.attachments.length > 0 && (
        <div className="space-y-2">
          {task.attachments.map((att, i) => (
            <div 
              key={i} 
              className="flex items-center justify-between p-2.5 bg-[#F8F7F2] hover:bg-[#E9E7DF]/40 border border-[#E5E2D9] rounded-xl transition duration-150"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {getFileIcon(att.type)}
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-[#4A5568] truncate" title={att.name}>
                    {att.name}
                  </span>
                  <span className="text-[10px] text-[#8A958E] font-serif italic">
                    {formatSize(att.size)} • {new Date(att.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 ml-2">
                <a 
                  href={att.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  download={att.name}
                  className="p-1.5 text-[#8A958E] hover:text-[#004550] hover:bg-[#E9E7DF] rounded-lg transition-all"
                  title="Download File"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => handleDeleteAttachment(att)}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  title="Remove File"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drag-and-drop & Click Upload Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center space-y-2 ${
          dragActive
            ? "border-[#00606E] bg-[#E9E7DF]/30"
            : "border-[#E5E2D9] hover:border-[#00606E] bg-white/40 hover:bg-[#E9E7DF]/10"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-[#00606E]" />
            <span className="text-xs font-semibold text-[#1A2B32]">Uploading... {progress}%</span>
            <div className="w-32 h-1.5 bg-[#E9E7DF] rounded-full overflow-hidden mt-1">
              <div 
                className="h-full bg-[#00606E] transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-[#00606E]" />
            <div className="space-y-0.5">
              <span className="block text-xs font-bold text-[#1A2B32] uppercase tracking-wide">
                Drag & Drop File Here
              </span>
              <span className="block text-[10px] text-[#8A958E] font-serif italic">
                or click to browse local files
              </span>
            </div>
          </>
        )}
      </div>

      {errorMsg && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50/80 p-2.5 border border-red-100 rounded-xl leading-normal">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
