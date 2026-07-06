import { Test, Participant, Submission, Question } from "../types.js";

// Save student details in local storage
const STUDENT_ID_KEY = "testing_platform_student_id";
const STUDENT_NICKNAME_KEY = "testing_platform_nickname";
const ADMIN_TOKEN_KEY = "testing_platform_admin_token";

export function getLocalStudentId(): string | null {
  return localStorage.getItem(STUDENT_ID_KEY);
}

export function getLocalNickname(): string | null {
  return localStorage.getItem(STUDENT_NICKNAME_KEY);
}

export function saveLocalStudent(id: string, nickname: string) {
  localStorage.setItem(STUDENT_ID_KEY, id);
  localStorage.setItem(STUDENT_NICKNAME_KEY, nickname);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function saveAdminToken(token: string | null) {
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

// Global API Fetch helper that includes x-student-id header for block checking
async function apiFetch(url: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers || {});
  
  const studentId = getLocalStudentId();
  if (studentId) {
    headers.set("x-student-id", studentId);
  }

  const adminToken = getAdminToken();
  if (adminToken) {
    headers.set("Authorization", `Bearer ${adminToken}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 403) {
    // Student is blocked
    const data = await response.json().catch(() => ({}));
    if (data.error === "BLOCKED") {
      // Trigger event or window action to handle block state globally
      window.dispatchEvent(new CustomEvent("student-blocked"));
      throw new Error("BLOCKED");
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    let errJson;
    try {
      errJson = JSON.parse(errText);
    } catch {
      errJson = { error: errText };
    }
    throw new Error(errJson.error || errJson.message || "API request failed");
  }

  return response.json();
}

export const api = {
  // Student Auth / Init
  registerStudent: async (nickname: string, existingId?: string): Promise<{ studentId: string; nickname: string }> => {
    return apiFetch("/api/students/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, studentId: existingId || getLocalStudentId() })
    });
  },

  sendHeartbeat: async (currentTestId?: string): Promise<void> => {
    const studentId = getLocalStudentId();
    if (!studentId) return;
    try {
      await apiFetch("/api/students/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, currentTestId })
      });
    } catch (err: any) {
      if (err.message === "BLOCKED") {
        console.warn("Student is blocked from sending heartbeats.");
      }
    }
  },

  // Student Test Endpoints
  getTests: async (): Promise<Test[]> => {
    return apiFetch("/api/tests");
  },

  getTest: async (testId: string): Promise<Test> => {
    return apiFetch(`/api/tests/${testId}`);
  },

  submitTest: async (
    testId: string,
    payload: {
      studentId: string;
      nickname: string;
      answers: Record<string, string>;
      answerImages?: Record<string, string>;
      autoSubmitted: boolean;
      startedAt: string;
    }
  ): Promise<{ submission: Submission; questions: any[] }> => {
    return apiFetch(`/api/tests/${testId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },

  getSubmissionResult: async (testId: string, studentId: string): Promise<{ submission: Submission; questions: any[] }> => {
    return apiFetch(`/api/tests/${testId}/result/${studentId}`);
  },

  retakeTest: async (testId: string, studentId: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/tests/${testId}/retake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId })
    });
  },

  // Admin Endpoints
  adminLogin: async (username: string, password: string): Promise<{ success: boolean; token: string }> => {
    const data = await apiFetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (data.success && data.token) {
      saveAdminToken(data.token);
    }
    return data;
  },

  getAdminStats: async (): Promise<{
    activeCount: number;
    activeList: Participant[];
    joinedLast3Days: Participant[];
    totalParticipants: number;
    allParticipants: Participant[];
    submissions: Submission[];
    testsCount: number;
  }> => {
    return apiFetch("/api/admin/stats");
  },

  toggleBlockParticipant: async (id: string, blocked: boolean): Promise<{ success: boolean }> => {
    return apiFetch(`/api/admin/participants/${id}/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocked })
    });
  },

  uploadFile: async (fileData: string, fileName: string): Promise<{ success: boolean; url: string; mimeType: string }> => {
    return apiFetch("/api/admin/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileData, fileName })
    });
  },

  uploadStudentFile: async (fileData: string, fileName: string): Promise<{ success: boolean; url: string; mimeType: string }> => {
    return apiFetch("/api/students/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileData, fileName })
    });
  },

  extractQuestions: async (documentUrl: string, documentType: "pdf" | "image" | "none"): Promise<{ success: boolean; questions: Omit<Question, "id">[] }> => {
    return apiFetch("/api/admin/extract-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentUrl, documentType })
    });
  },

  createTest: async (testData: {
    title: string;
    description: string;
    timeLimit: number;
    documentUrl?: string | null;
    documentType?: "pdf" | "image" | "none";
    questions: Omit<Question, "id">[];
  }): Promise<{ success: boolean; test: Test }> => {
    return apiFetch("/api/admin/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testData)
    });
  },

  deleteTest: async (testId: string): Promise<{ success: boolean }> => {
    return apiFetch(`/api/admin/tests/${testId}`, {
      method: "DELETE"
    });
  }
};
