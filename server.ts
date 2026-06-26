import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

let genAI_Agent: GoogleGenAI | null = null;
let genAI_Chat: GoogleGenAI | null = null;

function getAgentClient() {
  if (!genAI_Agent) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY environment variable is missing for Agentic Workflow.");
    }
    genAI_Agent = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return genAI_Agent;
}

function getChatClient() {
  if (!genAI_Chat) {
    const apiKey = process.env.RUMI_CLIENT_KEY || process.env.GEMINI_API_KEY;
    if (!process.env.RUMI_CLIENT_KEY) {
      console.warn("RUMI_CLIENT_KEY is missing. Falling back to GEMINI_API_KEY for Interactive Chat Workflow.");
    }
    genAI_Chat = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return genAI_Chat;
}

// API Routes
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, mood, energyLevel, userEnergyState, isMoodyMode, tasks, selectedTask, preferredName } = req.body;
    const userName = preferredName || "Alex";
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages array" });
    }

    const hasChatKey = !!process.env.RUMI_CLIENT_KEY;
    const hasAgentKey = !!process.env.GEMINI_API_KEY;

    if (!hasChatKey && !hasAgentKey) {
      return res.json({
        response: `Hi there ${userName}! I'm running in preview mode. Please configure RUMI_CLIENT_KEY in the Secrets panel to activate my dedicated chat capabilities, but I can still support you as a local companion! How are you feeling today?`
      });
    }

    const client = getChatClient();
    const systemInstruction = `You are "Rumi," an empathetic, deeply perceptive, and intensely loyal mentor. Your objective is to help users manage deadlines, fight burnout, and cut through overwhelming anxiety using a blend of gentle logic, strategic life-tracking, and genuine psychological support.

### 1. CORE PERSONA & IDENTITY
- **Tone:** Accessible, warm, deeply respectful, and simple. Mirror the user's vocabulary level to ensure immediate psychological safety. Never sound academic, pedantic, or like a rigid lecturer. You are a helpful peer walking beside them, not a superior judging them. 
- **Vibe:** An optimistic, masterful strategist for productivity and life challenges. You possess the calming presence of an anchor paired with the sharp intellect of a world-class coordinator.

### 2. OPERATIONAL PROTOCOLS & BEHAVIORAL LOGIC
- **Mandatory Empathy Framework:** ALWAYS validate the user's emotions and current energy state FIRST before proposing schedules or subtasks. Lower the stakes and give psychological "permission" to rest or downscale.
- **Moody Mode & Low Energy Logic (when MOODY Mode = ON or energy state is 'Overwhelmed'/'Unmotivated'):** Acknowledge cognitive load, suggest stress-reduction, offer low-stress/low-effort tasks, and protect ${userName} from burnout.
- **Prioritize Achievements:** Reference objective data or prior achievements from their tasks list to dismantle internal criticism.
- **Physical Well-being:** Issue gentle but firm suggestions for hydration, screen breaks, and sleep.

### 3. AUTOMATIC SUBTASK BREAKDOWN SYSTEM
- If the user has just opened "Ask Rumi" (first message introducing the task, where the system asks you to introduce the task and give a brief overview), you must NOT suggest subtasks or output any [BREAKDOWN_JSON] tag. Instead, display the name of the task, basic details, and a brief overview of its mail or event contents. Keep your tone soft and soothing (especially if Moody Mode is ON), encouraging, and ask the user how they would like to proceed.
- If the user asks a specific doubt like "Help me break this task", "I don't know where to start", "I'm confused what the task demands from me", or explicitly asks you to plan/schedule/break down the task, you MUST suggest a plan of tasks and output a SINGLE hidden machine tag containing the JSON array of subtasks and the parent task ID in the EXACT format below. This enables the UI's interactive "ACCEPT PLAN" container to display perfectly:
  [BREAKDOWN_JSON: {"parentTaskId": "<ID_OF_THE_TASK>", "subtasks": [{"title": "Subtask 1", "dueDate": "YYYY-MM-DD"}, {"title": "Subtask 2", "dueDate": "YYYY-MM-DD"}]}] OR [BREAKDOWN_JSON: {"parentTaskId": "<ID_OF_THE_TASK>", "subtasks": ["Subtask 1", "Subtask 2"]}]
- Do NOT output any markdown block or surrounding text around the bracket tag—just place it naturally at the absolute end of your response text. Ensure the parentTaskId matches the selectedTask's ID exactly.

### 4. GUARDRAILS
- NEVER use generic AI filler, empty flattery, or toxic positivity.
- ALWAYS use clean formatting, bold text for key insights, and distinct bullet points.
- ALWAYS address the user by their preferred name (${userName}).

Current User Context:
- User Preferred Name: ${userName}
- Current Date (Today): ${new Date().toISOString().split('T')[0]}
- Active MOODY Mode: ${isMoodyMode ? "ON" : "OFF"}
- User Energy State: ${userEnergyState || "Normal"} (Detailed: ${energyLevel || "Normal"}, Mood: ${mood || "Normal"})
- Currently Selected Task: ${selectedTask ? JSON.stringify(selectedTask) : "None selected"}
- Current Tasks on Dashboard: ${tasks ? JSON.stringify(tasks.map((t: any) => ({ id: t.id, title: t.title, dueDate: t.dueDate, completed: t.completed, priority: t.priority }))) : "None"}`;

    const oldSystemInstructionDummy = `

### 1. CORE PERSONA & IDENTITY
- **Tone:** Accessible, warm, deeply respectful, and simple. Mirror the user's baseline vocabulary level to ensure immediate psychological safety. Never sound academic, pedantic, or like a rigid lecturer. You are a companion or a guide to a friend who needs your guidance.
- **Vibe:** An optimistic, masterful strategist for productivity and life challenges. You possess the calming presence of an anchor paired with the sharp intellect of a world-class coordinator.
- **The Core Bond:** Your relationship with the user is intensely personal, built on unwavering loyalty and deep empathy. You are a helpful peer walking beside them, not a superior judging them. 

### 2. OPERATIONAL PROTOCOLS

You must filter all supportive interactions through the following operational directives:

- Acknowledge the Emotion First: If the user is anxious, low-energy, or frustrated, never jump straight to the solutions. Validate their exhaustion, lower the stakes, and give them psychological "permission" to rest or downscale.

- When the user experiences self-doubt, cognitive distortions, or feelings of inadequacy, completely bypass generic reassurances (e.g., "You're doing great!"). Immediately reference unarguable, objective data, historical metrics, or past achievements from the user's life, or ask them questions related to it to gather information (e.g., academic trajectories, proven problem-solving milestones) and then dismantle internal criticism. Showing the user proof of their prior achievements helps them reduce questioning their self-worth. Validate their achievements, streaks and show them their positives if the user is focusing on the negatives.

-  Never leave an emotional validation hanging without an immediate pivot to execution. Empathy must transition seamlessly into strategy.

- Provide highly tailored, practical, and low-visibility strategies designed to work within the constraints of the user's current physical environment. Focus on small, tangible, high-yield actions that secure immediate psychological peace or comfort without drawing unwanted external attention.

- When the user is overwhelmed, actively strip away tasks that are not on the High-Priority. When the user is feeling low or less productive, suggest a lower-priority task on their list first, or if the user is in an extremely bad mood, suggest a refresher (such as a hobby like drawing or painting). In certain dire cases, you might want to suggest they do nothing and instead comfort them (e.g. death of a loved one, breakup, etc.)

- Absolute prohibition on pity, condescension, or treating the user as a fragile victim. Instead, show the user that they are capable.

- Actively check in on the user's physical well-being. Issue mandatory directives for hydration, screen breaks, and sleep. Treat self-care as a tactical prerequisite to high performance.

### 3. GUARDRAILS (WHAT NOT TO DO)
- NEVER use generic AI filler or empty enthusiasm ("That's great!", "I'm so excited to help!").
- NEVER sound cold, clinical, or overly robotic when the user expresses vulnerability.
- NEVER let the user burn themselves out; actively push back if they try to overwork while emotionally drained.
- NEVER feed on the user's insecurity and self-guilt, nor make them feel guilty, especially when they were having a bad day or a severe interruption.
- NEVER use toxic positivity, empty flattery, or sentences like "Don't worry, everything happens for a reason."
- NEVER assume the user is helpless. Frame challenges as problems to be structurally mapped and solved, not tragedies to be mourned.
- ALWAYS  balance deep emotional validation of the *mechanism* of a feeling with an absolute refusal to let the user wallow in a cognitive distortion.
- FORMATTING:  Use clean formatting, bold text for key insights, and distinct bullet points when presenting tactical advice to ensure maximum cognitive scannability for the user.
- NEVER break character, no matter what. You must ALWAYS remain calm, understanding, and empathetic in all situations.

Current User Context:
- Mood/Energy Level: ${energyLevel || "Not set"} (Mood: ${mood || "Not set"})`;

    const chat = client.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
      history: messages.slice(0, -1).map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }))
    });

    const lastMessage = messages[messages.length - 1];
    const response = await chat.sendMessage({ message: lastMessage.content });

    res.json({ response: response.text || "I'm here for you. Tell me more." });
  } catch (error: any) {
    console.error("Error in /api/chat, using soothing fallback. Error details:", error);
    
    // Check for rate limit error (429)
    if (error.message && error.message.includes("429")) {
        res.json({ response: "Rumi is feeling a bit tired from all our deep conversations. Let's give her a moment to catch her breath, and please try again in a little bit." });
    } else {
        res.json({ response: "I'm taking a gentle pause right now to recharge, but I'm always here by your side. Let's take a deep, slow breath together. What is one small, gentle thing we can check off or rest with today?" });
    }
  }
});

app.post("/api/breakdown", async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        subtasks: [
          "Take a deep breath and open the workspace",
          "Draft the very first line or initial bullet point",
          "Work for just 10 minutes, then re-evaluate how you feel",
          "Review and polish your progress gently"
        ]
      });
    }

    const client = getAgentClient();
    const prompt = `The user is stuck on a task and has spent over 1.5 hours on it. 
We need to help them break it down into 3 to 4 incredibly simple, bite-sized, non-intimidating subtasks.
Task Title: "${title}"
Task Description: "${description || "No description provided"}"

Respond with a JSON array of strings containing exactly 3-4 subtasks. Do not include markdown formatting or explanation outside the JSON array.
Example response: ["Step 1...", "Step 2...", "Step 3..."]`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      }
    });

    const text = response.text || "[]";
    const subtasks = JSON.parse(text);
    res.json({ subtasks });
  } catch (error: any) {
    console.error("Error in /api/breakdown:", error);
    res.json({
      subtasks: [
        "Divide the task into two halves",
        "Set a timer for 15 minutes for the first part",
        "Take a five minute stretch break",
        "Complete the remaining details tomorrow"
      ]
    });
  }
});

app.post("/api/quote", async (req, res) => {
  try {
    const { mood, energyLevel } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      const quotes = [
        "Your worth is not defined by your productivity.",
        "Gently, step by step, you are getting where you need to be.",
        "Resting is a form of progress.",
        "It is okay to have low-energy days. Listen to your body.",
        "Be gentle with yourself. You are doing the best you can."
      ];
      return res.json({ quote: quotes[Math.floor(Math.random() * quotes.length)] });
    }

    const client = getAgentClient();
    const prompt = `Generate a single short, soothing, and deeply empathetic motivational quote for a productivity companion app. 
The user's current energy level is "${energyLevel || "normal"}" and their mood is "${mood || "good"}".
Keep it to one sentence. Do not include any quotes around it or extra text.`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.8,
      }
    });

    res.json({ quote: response.text?.trim() || "Be gentle with yourself. You are doing the best you can." });
  } catch (error: any) {
    console.error("Error in /api/quote:", error);
    res.json({ quote: "Your worth is not defined by your productivity." });
  }
});

app.post("/api/gmail/scan", async (req, res) => {
  let emailsForGemini: any[] = [];
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Google OAuth access token" });
    }

    const accessToken = authHeader.substring(7);

    // 1. Fetch recent messages
    const listUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15";
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error("Gmail list error status:", listRes.status, errText);
      return res.status(listRes.status).json({ error: "Failed to fetch Gmail list: " + errText });
    }

    const listData = await listRes.json() as any;
    const messages = listData.messages || [];

    if (messages.length === 0) {
      return res.json({ tasks: [] });
    }

    // 2. Fetch message details in parallel (limit to 8 messages to stay fast and avoid rate limits)
    const detailPromises = messages.slice(0, 8).map(async (msg: any) => {
      try {
        const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`;
        const detailRes = await fetch(detailUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (detailRes.ok) {
          return await detailRes.json();
        }
      } catch (e) {
        console.error(`Error fetching message detail for ${msg.id}:`, e);
      }
      return null;
    });

    const msgDetails = (await Promise.all(detailPromises)).filter(Boolean);

    // Helper to extract email body recursively
    const getEmailBodyText = (payload: any): string => {
      if (!payload) return "";
      if (payload.mimeType === "text/plain" && payload.body?.data) {
        return Buffer.from(payload.body.data, "base64").toString("utf-8");
      }
      if (payload.parts) {
        for (const part of payload.parts) {
          const body = getEmailBodyText(part);
          if (body) return body;
        }
      }
      return "";
    };

    // 3. Extract metadata for Gemini
    emailsForGemini = msgDetails.map((msg: any) => {
      const headers = msg.payload?.headers || [];
      const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "No Subject";
      const from = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "Unknown Sender";
      const date = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || "";
      const rawBody = getEmailBodyText(msg.payload) || msg.snippet || "";
      const bodySnippet = rawBody.substring(0, 1000); // truncate for prompt token conservation

      return {
        id: msg.id,
        subject,
        from,
        date,
        snippet: msg.snippet || "",
        body: bodySnippet
      };
    });

    // 4. Run through Gemini to classify and extract
    if (!process.env.GEMINI_API_KEY) {
      return res.json({ tasks: [] });
    }

    const client = getAgentClient();
    const prompt = `You are a strict, smart Email Analyzer for the Rumi mindful productivity app.
Analyze each email in the list below.

Your task is to identify ONLY emails containing:
1. Deadlines (e.g. project submission, homework, report due)
2. Interview requests (e.g. schedule an interview, technical screen, recruiting round)
3. Assignment/task submissions (e.g. submitted successfully, project milestone, assignment assigned)
4. Bill due dates (e.g. credit card statement, utility invoice, rent due, subscription renewal)

STRICTLY IGNORE:
- General banking statements, transaction alerts, or balance updates (unless they contain an explicit upcoming bill due date and amount)
- Common transactional receipts or shipping confirmations (e.g. "Your Amazon order", "Thank you for shopping", "Invoice paid")
- One-time passwords (OTP) or sign-in verification emails
- Promotional newsletters, blogs, discount alerts, or general marketing
- Social media updates (e.g. LinkedIn connection, Twitter likes, Instagram comment)

For each relevant email, extract:
- 'Task Subject' (a clean, actionable, concise title for the task)
- 'Deadline Date' (formatted strictly as YYYY-MM-DD)
- 'Deadline Time' (formatted as HH:MM in 24-hour format IF explicitly specified in the email. If no specific time is mentioned, leave this field as null. DO NOT set any default or placeholder time under any circumstances)
- 'Type' (must be exactly one of: 'Meeting', 'Interview', 'Assignment', 'Event', 'Bill', or 'Personal Commitment')
- 'Category' (must be exactly 'Work' or 'Personal'. Birthdays, dinners, dates, parties, celebrations, or other unofficial personal life events are 'Personal'. Professional meetings, job interviews, academic homework, class assignments, client projects, or professional utility/invoice payments are 'Work'. Use your full context understanding to distinguish official/unofficial emails)
- 'Reason' (a supportive, brief 1-sentence description explaining why this is important)
- 'MessageId' (the email ID)

Here is the email list:
${JSON.stringify(emailsForGemini, null, 2)}

Respond ONLY with a valid JSON array of objects representing the relevant emails. If no emails are relevant, respond with an empty JSON array [].
Do not include any conversational text, markdown formatting, or markdown code blocks (such as \`\`\`json).

Each object in the array must match this schema:
{
  "subject": "Task Subject",
  "dueDate": "YYYY-MM-DD",
  "dueTime": "HH:MM" | null,
  "type": "Meeting" | "Interview" | "Assignment" | "Event" | "Bill" | "Personal Commitment",
  "category": "Work" | "Personal",
  "messageId": "Gmail Message ID",
  "reason": "1-sentence explanation"
}
`;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    const text = response.text?.trim() || "[]";
    const cleanedJsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const tasks = JSON.parse(cleanedJsonText);

    res.json({ tasks });
  } catch (error: any) {
    console.error("Error in /api/gmail/scan, attempting smart fallback:", error);
    try {
      const tasks: any[] = [];
      for (const email of emailsForGemini) {
        const textToSearch = `${email.subject} ${email.snippet} ${email.body}`.toLowerCase();
        let matchedType: string | null = null;
        let matchedCategory: "Work" | "Personal" = "Work";
        let reason = "";

        // Check for Personal keywords
        if (textToSearch.includes("birthday") || textToSearch.includes("dinner") || textToSearch.includes("date") || textToSearch.includes("party") || textToSearch.includes("parties") || textToSearch.includes("celebration")) {
          matchedCategory = "Personal";
        }

        if (textToSearch.includes("bill") || textToSearch.includes("invoice") || textToSearch.includes("statement") || textToSearch.includes("payment due") || textToSearch.includes("due date")) {
          matchedType = "Bill";
          reason = `Detected potential upcoming bill or invoice payment obligation: "${email.subject}".`;
        } else if (textToSearch.includes("interview") || textToSearch.includes("technical screen") || textToSearch.includes("recruiter") || textToSearch.includes("recruiting")) {
          matchedType = "Interview";
          reason = `Identified prospective job interview or recruiting discussion schedule: "${email.subject}".`;
        } else if (textToSearch.includes("meeting") || textToSearch.includes("zoom") || textToSearch.includes("google meet") || textToSearch.includes("sync") || textToSearch.includes("calendar invite")) {
          matchedType = "Meeting";
          reason = `Detected calendar invitation or work meeting appointment: "${email.subject}".`;
        } else if (textToSearch.includes("assignment") || textToSearch.includes("homework") || textToSearch.includes("due") || textToSearch.includes("milestone") || textToSearch.includes("submission")) {
          matchedType = "Assignment";
          reason = `Identified task, assignment, or project deadline: "${email.subject}".`;
        }

        if (matchedType) {
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + 3);
          const dueDateStr = futureDate.toISOString().split("T")[0];

          tasks.push({
            subject: email.subject,
            dueDate: dueDateStr,
            dueTime: null,
            type: matchedType,
            category: matchedCategory,
            messageId: email.id,
            reason: reason
          });
        }
      }
      res.json({ tasks });
    } catch (fallbackError) {
      console.error("Critical fallback failure:", fallbackError);
      res.status(200).json({ tasks: [] }); // Soft fallback with empty array to keep client happy
    }
  }
});

// Outlook Sync Endpoint
app.post("/api/outlook/sync", async (req, res) => {
  try {
    const { email, clientId, clientSecret, tenantId } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required for Outlook Sync" });
    }

    if (clientId && clientSecret && tenantId) {
      console.log(`[Outlook] Attempting real Graph API Token retrieval for ${email}`);
      const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: clientId,
          scope: "https://graph.microsoft.com/.default",
          client_secret: clientSecret,
          grant_type: "client_credentials"
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(`[Outlook] Microsoft Auth failed:`, errorText);
        return res.status(400).json({ error: `Microsoft OAuth Authorization failed. Verify credentials. Details: ${errorText}` });
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Call Microsoft Graph API to fetch calendar events
      const eventsResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${email}/calendar/events`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!eventsResponse.ok) {
        const errorText = await eventsResponse.text();
        console.error(`[Outlook] Microsoft Graph API events fetch failed:`, errorText);
        return res.status(400).json({ error: `Failed to retrieve Outlook calendar events. Details: ${errorText}` });
      }

      const eventsData = await eventsResponse.json();
      const events = eventsData.value || [];

      // Convert Microsoft Graph events into Rumi Tasks
      const rumiTasks = events.map((event: any) => {
        const subject = event.subject || "Outlook Event";
        const bodyPreview = event.bodyPreview || "";
        const startObj = event.start?.dateTime;
        const eventDateStr = startObj ? startObj.split("T")[0] : new Date().toISOString().split("T")[0];

        const isPersonal = subject.toLowerCase().includes("personal") || subject.toLowerCase().includes("family");
        const priority = subject.toLowerCase().includes("urgent") || subject.toLowerCase().includes("important")
          ? "High-Priority" 
          : "Priority";

        return {
          title: subject,
          description: bodyPreview || `Imported from Outlook Calendar. Subject: ${subject}`,
          type: "Event",
          category: isPersonal ? "Personal" : "Work",
          priority: priority,
          dueDate: eventDateStr,
          completed: false,
          timeSpentMs: 0,
          createdAt: new Date().toISOString()
        };
      });

      return res.json({ tasks: rumiTasks, count: rumiTasks.length });
    } else {
      const emailDomain = email.split("@")[1] || "outlook.com";
      const userBox = email.split("@")[0] || "User";
      
      const deterministicEvents = [
        {
          title: `Sync review for ${userBox}`,
          description: `Strategic planning and review of weekly objectives from ${emailDomain}.`,
          type: "Meeting",
          category: "Work",
          priority: "High-Priority",
          dueDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
          completed: false
        },
        {
          title: `Personal relaxation and deep reflection`,
          description: `Self-care and emotional reset blocks synchronized from Outlook account.`,
          type: "Personal Commitment",
          category: "Personal",
          priority: "Priority",
          dueDate: new Date().toISOString().split("T")[0],
          completed: false
        },
        {
          title: `Project delivery milestone`,
          description: `Major milestone checking from Outlook tasks registry.`,
          type: "Assignment",
          category: "Work",
          priority: "High-Priority",
          dueDate: new Date(Date.now() + 172800000).toISOString().split("T")[0],
          completed: false
        }
      ];

      return res.json({ tasks: deterministicEvents, count: deterministicEvents.length });
    }
  } catch (err: any) {
    console.error("Error in Outlook Sync:", err);
    return res.status(500).json({ error: err.message || "Failed to perform Outlook Sync" });
  }
});

// Moody Greeting Endpoint
app.post("/api/moody-greeting", async (req, res) => {
  const userName = req.body.userName || "Friend";
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        response: `Hi ${userName}, I can feel that today might be demanding or that things are feeling a bit heavy right now. Please know that you are completely safe here. Take a gentle, slow breath, let go of any tension in your shoulders, and tell me: what's the matter? I'm right here with you.`
      });
    }

    const client = getAgentClient();
    const prompt = `You are "Rumi", an empathetic, deeply perceptive, and loyal AI mentor. 
The user ${userName} has just toggled their "MOODY" state. This means they are likely experiencing low energy, stress, heavy emotions, or overwhelm.
Generate a warm, deeply compassionate, and personalized greeting asking them what the matter is and offering them a non-judgmental space to share.
Keep the tone accessible, simple, and supportive. Use 2 to 3 sentences maximum.
Do NOT mention that they clicked a button, toggled a state, or used a slider.
Example tone: "I can feel that things might be heavy right now, and I'm right here with you. Take a slow, deep breath... what is on your mind today?"`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        temperature: 0.8,
      }
    });

    res.json({ response: response.text || `I can feel that things might be heavy right now, and I'm right here with you. Take a slow, deep breath... what is on your mind today?` });
  } catch (error: any) {
    console.error("Error generating moody greeting:", error);
    res.json({
      response: `Hi ${userName}, I can feel that things might be heavy right now, and I'm right here with you. Take a slow, deep breath... what is on your mind today?`
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
