export interface Question {
  id: string;
  text: string;
  type: 'multiple-choice' | 'short-answer';
  options?: string[]; // for multiple choice
  correctAnswer: string; // "0", "1" etc. for MC, or string text for short-answer
  points: number;
  imageUrl?: string | null; // Base64 or uploaded server path
}

export interface Test {
  id: string;
  title: string;
  description: string;
  timeLimit: number; // in minutes (default 30)
  createdAt: string;
  documentUrl?: string | null; // Main test PDF/image document
  documentType?: 'pdf' | 'image' | 'none';
  questions: Question[];
}

export interface Participant {
  id: string;
  nickname: string;
  joinedAt: string;
  lastHeartbeat: string;
  blocked: boolean;
}

export interface Submission {
  testId: string;
  studentId: string;
  nickname: string;
  startedAt: string;
  submittedAt: string;
  answers: Record<string, string>; // questionId -> studentAnswer
  answerImages?: Record<string, string>; // questionId -> studentAnswerImageUrl
  score: number;
  totalPoints: number;
  autoSubmitted: boolean;
}

export interface ActiveSession {
  studentId: string;
  testId: string;
  nickname: string;
  startedAt: string;
  lastHeartbeat: string;
}

export interface DBState {
  tests: Test[];
  participants: Participant[];
  submissions: Submission[];
  activeSessions: ActiveSession[];
}
