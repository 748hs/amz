import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { DBState, Test, Participant, Submission, ActiveSession, Question } from "./src/types.js";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

// Initialize Gemini API
const geminiApiKey = process.env.GEMINI_API_KEY;
let aiGemini: GoogleGenAI | null = null;
if (geminiApiKey) {
  aiGemini = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
} else {
  console.warn("GEMINI_API_KEY environment variable is not defined.");
}

// Initialize Firebase
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseApp: any = null;
let dbFirestore: any = null;

if (fs.existsSync(firebaseConfigPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
    firebaseApp = initializeApp({
      projectId: config.projectId,
    });
    dbFirestore = getFirestore(firebaseApp, config.firestoreDatabaseId || "(default)");
    console.log("Firebase Admin SDK initialized successfully with database ID:", config.firestoreDatabaseId);
  } catch (err) {
    console.error("Failed to initialize Firebase:", err);
  }
}

// Helper functions for cloud synchronization
async function syncFromFirestore(): Promise<void> {
  if (!dbFirestore) {
    console.log("Firestore not initialized. Skipping cloud sync.");
    return;
  }

  try {
    console.log("Syncing database state from Firestore...");
    const db = readDB();

    // 1. Sync tests
    const testsSnapshot = await dbFirestore.collection("tests").get();
    const cloudTests: Test[] = [];
    testsSnapshot.forEach((doc: any) => {
      cloudTests.push(doc.data() as Test);
    });

    // 2. Sync participants
    const participantsSnapshot = await dbFirestore.collection("participants").get();
    const cloudParticipants: Participant[] = [];
    participantsSnapshot.forEach((doc: any) => {
      cloudParticipants.push(doc.data() as Participant);
    });

    // 3. Sync submissions
    const submissionsSnapshot = await dbFirestore.collection("submissions").get();
    const cloudSubmissions: Submission[] = [];
    submissionsSnapshot.forEach((doc: any) => {
      cloudSubmissions.push(doc.data() as Submission);
    });

    // 4. Sync active sessions
    const activeSessionsSnapshot = await dbFirestore.collection("activeSessions").get();
    const cloudActiveSessions: ActiveSession[] = [];
    activeSessionsSnapshot.forEach((doc: any) => {
      cloudActiveSessions.push(doc.data() as ActiveSession);
    });

    // Merge or overwrite local memory
    if (cloudTests.length > 0) {
      db.tests = cloudTests;
    } else if (db.tests.length > 0) {
      console.log(`Cloud tests collection is empty. Uploading ${db.tests.length} local tests...`);
      for (const t of db.tests) {
        await dbFirestore.collection("tests").doc(t.id).set(t);
      }
    }

    if (cloudParticipants.length > 0) {
      db.participants = cloudParticipants;
    } else if (db.participants.length > 0) {
      console.log(`Cloud participants collection is empty. Uploading ${db.participants.length} local participants...`);
      for (const p of db.participants) {
        await dbFirestore.collection("participants").doc(p.id).set(p);
      }
    }

    if (cloudSubmissions.length > 0) {
      db.submissions = cloudSubmissions;
    } else if (db.submissions.length > 0) {
      console.log(`Cloud submissions collection is empty. Uploading ${db.submissions.length} local submissions...`);
      for (const s of db.submissions) {
        const id = `${s.testId}_${s.studentId}`;
        await dbFirestore.collection("submissions").doc(id).set(s);
      }
    }

    if (cloudActiveSessions.length > 0) {
      db.activeSessions = cloudActiveSessions;
    } else if (db.activeSessions.length > 0) {
      console.log(`Cloud activeSessions collection is empty. Uploading ${db.activeSessions.length} local sessions...`);
      for (const s of db.activeSessions) {
        await dbFirestore.collection("activeSessions").doc(s.studentId).set(s);
      }
    }

    writeDB(db);
    console.log("Firestore sync completed successfully. Local DB updated.");
  } catch (err) {
    console.error("Error syncing from Firestore:", err);
  }
}

async function saveTestToCloud(test: Test): Promise<void> {
  if (!dbFirestore) return;
  try {
    await dbFirestore.collection("tests").doc(test.id).set(test);
  } catch (err) {
    console.error("Error saving test to Firestore:", err);
  }
}

async function deleteTestFromCloud(testId: string): Promise<void> {
  if (!dbFirestore) return;
  try {
    await dbFirestore.collection("tests").doc(testId).delete();
    const db = readDB();
    const submissionsToDelete = db.submissions.filter(s => s.testId === testId);
    for (const s of submissionsToDelete) {
      const id = `${s.testId}_${s.studentId}`;
      await dbFirestore.collection("submissions").doc(id).delete();
    }
  } catch (err) {
    console.error("Error deleting test from Firestore:", err);
  }
}

async function saveParticipantToCloud(participant: Participant): Promise<void> {
  if (!dbFirestore) return;
  try {
    await dbFirestore.collection("participants").doc(participant.id).set(participant);
  } catch (err) {
    console.error("Error saving participant to Firestore:", err);
  }
}

async function saveSubmissionToCloud(submission: Submission): Promise<void> {
  if (!dbFirestore) return;
  try {
    const id = `${submission.testId}_${submission.studentId}`;
    await dbFirestore.collection("submissions").doc(id).set(submission);
  } catch (err) {
    console.error("Error saving submission to Firestore:", err);
  }
}

async function deleteSubmissionFromCloud(testId: string, studentId: string): Promise<void> {
  if (!dbFirestore) return;
  try {
    const id = `${testId}_${studentId}`;
    await dbFirestore.collection("submissions").doc(id).delete();
  } catch (err) {
    console.error("Error deleting submission from Firestore:", err);
  }
}

async function saveActiveSessionToCloud(session: ActiveSession): Promise<void> {
  if (!dbFirestore) return;
  try {
    await dbFirestore.collection("activeSessions").doc(session.studentId).set(session);
  } catch (err) {
    console.error("Error saving active session to Firestore:", err);
  }
}

async function deleteActiveSessionFromCloud(studentId: string): Promise<void> {
  if (!dbFirestore) return;
  try {
    await dbFirestore.collection("activeSessions").doc(studentId).delete();
  } catch (err) {
    console.error("Error deleting active session from Firestore:", err);
  }
}

// Set up paths for database and uploads
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initial DB state
const initialDB: DBState = {
  tests: [],
  participants: [],
  submissions: [],
  activeSessions: []
};

// Helper to read DB
function readDB(): DBState {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2));
      return initialDB;
    }
    const data = fs.readFileSync(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database:", err);
    return initialDB;
  }
}

// Helper to write DB
function writeDB(state: DBState): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("Error writing database:", err);
  }
}

// Enable body parsing with large payload limits for base64 file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve static uploads
app.use("/uploads", express.static(UPLOADS_DIR));

// Helper to check if student is blocked
function isStudentBlocked(studentId: string): boolean {
  if (!studentId) return false;
  const db = readDB();
  const participant = db.participants.find((p) => p.id === studentId);
  return participant ? participant.blocked : false;
}

// API Middleware to guard blocked students
const blockGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const studentId = req.headers["x-student-id"] as string;
  if (studentId && isStudentBlocked(studentId)) {
    res.status(403).json({ error: "BLOCKED", message: "You have been blocked by the administrator." });
    return;
  }
  next();
};

// ------------------- API ROUTES -------------------

// Admin Login
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "Maranatha" && password === "Amza71554644") {
    res.json({ success: true, token: "admin-session-token-998877" });
  } else {
    res.status(401).json({ success: false, error: "Invalid credentials" });
  }
});

// Register student
app.post("/api/students/register", async (req, res) => {
  const { nickname, studentId } = req.body;
  if (!nickname) {
    res.status(400).json({ error: "Nickname is required" });
    return;
  }

  const db = readDB();
  const id = studentId || `std_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Find or create participant
  let participant = db.participants.find((p) => p.id === id);
  if (participant) {
    if (participant.blocked) {
      res.status(403).json({ error: "BLOCKED", message: "You have been blocked by the administrator." });
      return;
    }
    // Update nickname and last heartbeat
    participant.nickname = nickname;
    participant.lastHeartbeat = new Date().toISOString();
  } else {
    participant = {
      id,
      nickname,
      joinedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      blocked: false
    };
    db.participants.push(participant);
  }

  writeDB(db);
  await saveParticipantToCloud(participant);
  res.json({ studentId: id, nickname: participant.nickname });
});

// Student Heartbeat (Tracks active users and checks if blocked)
app.post("/api/students/heartbeat", blockGuard, async (req, res) => {
  const { studentId, currentTestId } = req.body;
  if (!studentId) {
    res.status(400).json({ error: "Student ID required" });
    return;
  }

  const db = readDB();
  const participant = db.participants.find((p) => p.id === studentId);
  
  if (!participant) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }

  if (participant.blocked) {
    res.status(403).json({ error: "BLOCKED", message: "You have been blocked by the administrator." });
    return;
  }

  const now = new Date().toISOString();
  participant.lastHeartbeat = now;

  // Manage active sessions
  db.activeSessions = db.activeSessions.filter(
    (s) => s.studentId !== studentId && (Date.now() - new Date(s.lastHeartbeat).getTime() < 30000)
  );

  const activeSession: ActiveSession = {
    studentId,
    testId: currentTestId || "",
    nickname: participant.nickname,
    startedAt: now,
    lastHeartbeat: now
  };

  if (currentTestId) {
    db.activeSessions.push(activeSession);
  }

  writeDB(db);
  
  await saveParticipantToCloud(participant);
  if (currentTestId) {
    await saveActiveSessionToCloud(activeSession);
  } else {
    await deleteActiveSessionFromCloud(studentId);
  }

  res.json({ status: "ok", blocked: false });
});

// Admin Dashboard stats
app.get("/api/admin/stats", (req, res) => {
  // Check auth header (mock token verification for simplicity & security)
  const authHeader = req.headers["authorization"];
  if (authHeader !== "Bearer admin-session-token-998877") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = readDB();
  const now = Date.now();
  
  // Active participants: heartbeat in the last 20 seconds
  const activeParticipants = db.participants.filter(
    (p) => now - new Date(p.lastHeartbeat).getTime() < 20000
  );

  // Joined in last 3 days
  const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
  const joinedLast3Days = db.participants.filter(
    (p) => new Date(p.joinedAt).getTime() > threeDaysAgo
  );

  res.json({
    activeCount: activeParticipants.length,
    activeList: activeParticipants,
    joinedLast3Days,
    totalParticipants: db.participants.length,
    allParticipants: db.participants,
    submissions: db.submissions,
    testsCount: db.tests.length
  });
});

// Admin block/unblock participant
app.post("/api/admin/participants/:id/block", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (authHeader !== "Bearer admin-session-token-998877") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  const { blocked } = req.body;

  const db = readDB();
  const participant = db.participants.find((p) => p.id === id);
  if (!participant) {
    res.status(404).json({ error: "Participant not found" });
    return;
  }

  participant.blocked = !!blocked;
  writeDB(db);
  await saveParticipantToCloud(participant);
  res.json({ success: true, participant });
});

// Student upload diagram / answer image
app.post("/api/students/upload", blockGuard, (req, res) => {
  const { fileData, fileName } = req.body;
  if (!fileData || !fileName) {
    res.status(400).json({ error: "fileData and fileName are required" });
    return;
  }

  try {
    const matches = fileData.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      res.status(400).json({ error: "Invalid data URI format" });
      return;
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const fileExt = path.extname(fileName) || "." + mimeType.split("/")[1];
    const safeName = `stud_${Date.now()}_${Math.random().toString(36).substr(2, 5)}${fileExt}`;
    const filePath = path.join(UPLOADS_DIR, safeName);

    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      url: `/uploads/${safeName}`,
      mimeType
    });
  } catch (error: any) {
    console.error("Student upload error:", error);
    res.status(500).json({ error: "Failed to upload file", details: error.message });
  }
});

// Admin upload file / base64 asset
app.post("/api/admin/upload", (req, res) => {
  const authHeader = req.headers["authorization"];
  if (authHeader !== "Bearer admin-session-token-998877") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { fileData, fileName } = req.body;
  if (!fileData || !fileName) {
    res.status(400).json({ error: "fileData and fileName are required" });
    return;
  }

  try {
    // Expected fileData format: "data:image/png;base64,..." or similar
    const matches = fileData.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      res.status(400).json({ error: "Invalid data URI format" });
      return;
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const fileExt = path.extname(fileName) || "." + mimeType.split("/")[1];
    const safeName = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}${fileExt}`;
    const filePath = path.join(UPLOADS_DIR, safeName);

    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      url: `/uploads/${safeName}`,
      mimeType
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload file", details: error.message });
  }
});

// Admin create/save Test
app.post("/api/admin/tests", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (authHeader !== "Bearer admin-session-token-998877") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { title, description, timeLimit, questions, documentUrl, documentType } = req.body;
  if (!title || !questions || !Array.isArray(questions)) {
    res.status(400).json({ error: "Title and questions list are required" });
    return;
  }

  const db = readDB();
  const newTest: Test = {
    id: `test_${Date.now()}`,
    title,
    description: description || "",
    timeLimit: Number(timeLimit) || 30,
    createdAt: new Date().toISOString(),
    documentUrl: documentUrl || null,
    documentType: documentType || "none",
    questions: questions.map((q: any, i: number) => ({
      id: q.id || `q_${Date.now()}_${i}`,
      text: q.text || "",
      type: q.type || "multiple-choice",
      options: q.options || [],
      correctAnswer: String(q.correctAnswer || ""),
      points: Number(q.points) || 1,
      imageUrl: q.imageUrl || null
    }))
  };

  db.tests.push(newTest);
  writeDB(db);
  await saveTestToCloud(newTest);
  res.json({ success: true, test: newTest });
});

// Admin delete Test
app.delete("/api/admin/tests/:testId", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (authHeader !== "Bearer admin-session-token-998877") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { testId } = req.params;
  const db = readDB();
  
  const initialCount = db.tests.length;
  db.tests = db.tests.filter((t) => t.id !== testId);
  
  if (db.tests.length === initialCount) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  // Also remove submissions associated with this test
  db.submissions = db.submissions.filter((s) => s.testId !== testId);

  writeDB(db);
  await deleteTestFromCloud(testId);
  res.json({ success: true, message: "Test deleted successfully." });
});

// Student get all tests list (Hides correct answers of questions completely for security!)
app.get("/api/tests", blockGuard, (req, res) => {
  const db = readDB();
  
  // Strip out correct answers for student safety
  const safeTests = db.tests.map((test) => ({
    ...test,
    questions: test.questions.map((q) => {
      const { correctAnswer, ...safeQuestion } = q;
      return safeQuestion;
    })
  }));

  res.json(safeTests);
});

// Student get specific test (Hides correct answers!)
app.get("/api/tests/:testId", blockGuard, (req, res) => {
  const { testId } = req.params;
  const db = readDB();
  const test = db.tests.find((t) => t.id === testId);

  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  // Strip correct answers
  const safeQuestions = test.questions.map((q) => {
    const { correctAnswer, ...safeQuestion } = q;
    return safeQuestion;
  });

  const safeTest = {
    ...test,
    questions: safeQuestions
  };

  res.json(safeTest);
});

// Student submit Test answers
app.post("/api/tests/:testId/submit", blockGuard, async (req, res) => {
  const { testId } = req.params;
  const { studentId, nickname, answers, answerImages, autoSubmitted, startedAt } = req.body;

  if (!studentId || !nickname) {
    res.status(400).json({ error: "studentId and nickname are required" });
    return;
  }

  const db = readDB();
  const test = db.tests.find((t) => t.id === testId);
  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  // Automatic grading on the server
  let score = 0;
  let totalPoints = 0;
  const markedQuestions = test.questions.map((q) => {
    const studentAnswer = answers[q.id] || "";
    const isCorrect = String(q.correctAnswer).trim().toLowerCase() === String(studentAnswer).trim().toLowerCase();
    totalPoints += q.points;
    if (isCorrect) {
      score += q.points;
    }
    return {
      ...q,
      studentAnswer,
      isCorrect,
      // Include correct answer in results
      correctAnswer: q.correctAnswer
    };
  });

  const submission: Submission = {
    testId,
    studentId,
    nickname,
    startedAt: startedAt || new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    answers,
    answerImages: answerImages || {},
    score,
    totalPoints,
    autoSubmitted: !!autoSubmitted
  };

  // Remove any previous submission for this test/student combination to prevent duplicates (Retake feature requirement!)
  db.submissions = db.submissions.filter((s) => !(s.testId === testId && s.studentId === studentId));
  db.submissions.push(submission);

  // Clean active session
  db.activeSessions = db.activeSessions.filter((s) => s.studentId !== studentId);

  writeDB(db);

  await saveSubmissionToCloud(submission);
  await deleteActiveSessionFromCloud(studentId);

  // Return submission with answers + questions and correct answers for end-of-test display
  res.json({
    submission,
    questions: markedQuestions
  });
});

// Get submission result for student (If they completed it)
app.get("/api/tests/:testId/result/:studentId", blockGuard, (req, res) => {
  const { testId, studentId } = req.params;
  const db = readDB();
  
  const test = db.tests.find((t) => t.id === testId);
  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return;
  }

  const submission = db.submissions.find((s) => s.testId === testId && s.studentId === studentId);
  if (!submission) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  // Build the marked questions list with correct answers
  const markedQuestions = test.questions.map((q) => {
    const studentAnswer = submission.answers[q.id] || "";
    const isCorrect = String(q.correctAnswer).trim().toLowerCase() === String(studentAnswer).trim().toLowerCase();
    return {
      ...q,
      studentAnswer,
      isCorrect,
      correctAnswer: q.correctAnswer
    };
  });

  res.json({
    submission,
    questions: markedQuestions
  });
});

// Handle Retake command (Deletes student's previous submission so they can retake)
app.post("/api/tests/:testId/retake", blockGuard, async (req, res) => {
  const { testId } = req.params;
  const { studentId } = req.body;

  if (!studentId) {
    res.status(400).json({ error: "studentId is required" });
    return;
  }

  const db = readDB();
  
  // Remove submission to make it clean
  const initialLength = db.submissions.length;
  db.submissions = db.submissions.filter((s) => !(s.testId === testId && s.studentId === studentId));
  
  writeDB(db);
  await deleteSubmissionFromCloud(testId, studentId);
  res.json({ success: true, removed: db.submissions.length < initialLength });
});

// Admin extract questions from uploaded document using Gemini
app.post("/api/admin/extract-questions", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (authHeader !== "Bearer admin-session-token-998877") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { documentUrl, documentType } = req.body;
  if (!documentUrl) {
    res.status(400).json({ error: "documentUrl is required" });
    return;
  }

  if (!aiGemini) {
    res.status(500).json({ error: "Gemini API is not configured on this server (missing GEMINI_API_KEY)" });
    return;
  }

  try {
    const filename = path.basename(documentUrl);
    const filePath = path.join(UPLOADS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: `File not found on server disk: ${filename}` });
      return;
    }

    let mimeType = "application/octet-stream";
    if (documentType === "pdf") {
      mimeType = "application/pdf";
    } else if (documentType === "image") {
      const ext = path.extname(filename).toLowerCase();
      if (ext === ".png") mimeType = "image/png";
      else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
      else if (ext === ".webp") mimeType = "image/webp";
      else if (ext === ".gif") mimeType = "image/gif";
    }

    const base64Data = fs.readFileSync(filePath).toString("base64");
    const filePart = {
      inlineData: {
        mimeType,
        data: base64Data
      }
    };

    const prompt = `You are an expert exam paper analyzer and test creator. Extract ALL questions from the attached document.
For each question:
1. Determine its exact text.
2. Determine if it is a multiple-choice question or a short-answer question.
3. If it has options (like A, B, C, D) or bubbles, format it as "multiple-choice" and provide the "options" list of strings in order. Determine the "correctAnswer" index as a string representing the 0-based index of the correct option (e.g., "0" for the first option, "1" for the second, etc.).
4. If it is an open-ended/essay/fill-in-the-blank or short-answer question, format it as "short-answer", omit the options list, and provide a suggested/model answer string in "correctAnswer".
5. Set "points" to 1 by default for each question.
6. Make "imageUrl" null.

Ensure all questions are extracted accurately. Return the extracted list of questions strictly in the specified JSON format matching the schema.`;

    const response = await aiGemini.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [filePart, { text: prompt }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["questions"],
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["text", "type", "correctAnswer", "points"],
                properties: {
                  text: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["multiple-choice", "short-answer"] },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  correctAnswer: { type: Type.STRING },
                  points: { type: Type.INTEGER },
                  imageUrl: { type: Type.STRING, nullable: true }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);
    res.json({ success: true, questions: result.questions || [] });
  } catch (error: any) {
    console.error("Failed to extract questions with Gemini:", error);
    res.status(500).json({ error: "Failed to extract questions", details: error.message });
  }
});

// ------------------- VITE & SERVING -------------------

async function startServer() {
  // Sync state from Firestore at server boot
  await syncFromFirestore();

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
