<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4e490fd1-618e-4f57-8812-731cdd4a517e

# Vibe2Ship (Coding Ninjas x Google for Developers) 2026
This Project is a submission for the Vibe2Ship Hackathon 2026

## Problem Statement: The Last-Minute Life Saver
Students, professionals, and entrepreneurs frequently miss deadlines, assignments, meetings, bill payments, interviews, and important commitments. Existing productivity tools often rely on passive reminders that are easy to ignore and do little to help users actually complete their tasks.

## Rumi : Your AI-Powered Productivity Companion
Rumi is an empathetic, AI-powered productivity companion that syncs your Google Workspace, turns deadlines into actionable micro-tasks, and adapts to your mood to help you stay productive without burning out.

## KEY-FEATURES
* **Hassle Free Onboarding & Worspace Sync:** 
  
  - **Automated Lifecycle Onboarding :** Set up preferences once on setup (eg weekly syncs. monthly bill) automating future schedules and saving the time required to add those tasks manually.
    
  - **Two-Way Workspace Sync:** Create a task in Rumi and the same will reflect in your Google Calendar and Google Tasks.
    
  - **Autonomous Email Parsing:** Rumi scans incoming Gmail bodies (with Gemini Intelligence) to automatically extract hard deadlines, meetings, and interviews, uploading them to the user dashboard.
    
  - **Intelligent Task Prioritisation:** Automatically categorises all ingested tasks into distinct priority buckets (High-Priority, Priority, Not Urgent) and labels them by domain (Work, Personal) and type (Assignment, Meeting, Interview, Event, etc.) using chronological proximity.
 
* **Empathetic & Focused Workspace Design** 
  
  - Minimalist Dashboard and Easy to Navigate UI
  - Clean layout designed to prevent anxiety, grounded with empathetic words and quotes
  - Commit to tasks with Pomodoro Timer. Comes with flexible break options and ambient soundscape for deep focus sessions
  - Analytics Dashboard to track habits and streaks with visual progress bars.
    
* **Rumi : Your Guide and Companion** 
  
  - **Intelligent Task Breakdowns** : Click on the "Ask Rumi" button to automatically generate a
micro-task schedule with custom timeline recommendations.
   - **Inline Commitments** : Agent generates structured, interactive proposals. Upon clicking "Accept Plan," the subtasks are written directly to the active dashboard state.
  
   - **Talk To Rumi** : Ask Rumi anything - from your scheduled deadlines to regulating your emotions and Rumi will answer you just as a friend would. Think of it as a temporary space to clear your thoughts. You can also save your chats to history to review them anytime
  
   - **MOODY Switch**: Have a bad day? Toggle MOODY Mode on and Rumi's algorithm automatically reduces your baseline tasks to either 25% and 50% helping you stay on track without losing your streak or motivation. It'll even check in on you when you open the chatbox and offer tailored advice, even offering to reschedule your tasks if required.
  
   - **Compassionate Deadline Rescheduling** : When a deadline is missed, Rumi opens a gentle dialogue to log the reason (e.g., illness or underestimated complexity), ensuring accountability while rescheduling tasks and at the same time not letting you wallow in self-guilt. Rumi will never shuffle your tasks without asking, keeping you in the loop.

## FRAMEWORKS USED
1. **Frontend & Presentation**
   - React
   - Tailwind CSS
   - Motion
   - Lucide React
     
3. **Backend & Server-Side**
   - Express.js
   - TypeScript
   - tsx
   - esbuild
     
5. **Database and Authetication** 
   - Firebase SDK (OAuth and Storage)
     
7. **AI Integration** 
   - Google GenAI SDK (**Models**: Gemini 3.5 Flash and Gemini 2.5 Flash)
     
9. **Developer Tooling & Build System** 
    - Vite

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
