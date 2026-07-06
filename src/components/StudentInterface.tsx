import React, { useState, useEffect, useRef } from "react";
import { 
  BookOpen, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Play, 
  Send, 
  RotateCcw, 
  HelpCircle,
  FileText,
  User,
  LogIn,
  Sparkles,
  Award,
  ChevronLeft,
  Upload,
  Image as ImageIcon
} from "lucide-react";
import { api, getLocalStudentId, getLocalNickname, saveLocalStudent } from "../lib/api.js";
import { Test, Submission, Question } from "../types.js";
import { motion, AnimatePresence } from "motion/react";

interface StudentInterfaceProps {
  tests: Test[];
  refreshTests: () => Promise<void>;
  onOpenAdminLogin: () => void;
}

export default function StudentInterface({ tests, refreshTests, onOpenAdminLogin }: StudentInterfaceProps) {
  // Auth/Welcome State
  const [studentId, setStudentId] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string>("");
  const [nicknameInput, setNicknameInput] = useState<string>("");
  const [registering, setRegistering] = useState(false);

  // Active testing state
  const [activeTest, setActiveTest] = useState<Test | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerImages, setAnswerImages] = useState<Record<string, string>>({});
  const [uploadingAnswerImages, setUploadingAnswerImages] = useState<Record<string, boolean>>({});
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(1800); // 30 minutes in seconds
  const [timerActive, setTimerActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Submissions state (to display grades/completed state for each test)
  const [completedTests, setCompletedTests] = useState<Record<string, {
    submission: Submission;
    questions: any[];
  }>>({});
  const [loadingResults, setLoadingResults] = useState(false);

  // Viewing specific results
  const [viewingResultTestId, setViewingResultTestId] = useState<string | null>(null);

  // Custom interactive modal states
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [showConfirmRetakeTestId, setShowConfirmRetakeTestId] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<{ title: string; message: string } | null>(null);

  const triggerAlert = (title: string, message: string) => {
    setAlertState({ title, message });
  };

  // Blocked status
  const [isBlocked, setIsBlocked] = useState(false);

  // Init local student info
  useEffect(() => {
    const localId = getLocalStudentId();
    const localNick = getLocalNickname();
    if (localId && localNick) {
      setStudentId(localId);
      setNickname(localNick);
      api.registerStudent(localNick, localId)
        .then(() => fetchCompletedTests(localId))
        .catch((err) => {
          if (err.message === "BLOCKED") {
            setIsBlocked(true);
          }
        });
    }

    // Register global blocked listener
    const handleBlocked = () => {
      setIsBlocked(true);
      setStudentId(null);
    };
    window.addEventListener("student-blocked", handleBlocked);
    return () => window.removeEventListener("student-blocked", handleBlocked);
  }, []);

  // Sync heartbeat when taking test
  useEffect(() => {
    if (!studentId) return;

    // Send initial heartbeat
    api.sendHeartbeat(activeTest?.id);

    // Periodically send heartbeat every 10 seconds to keep session active
    const interval = setInterval(() => {
      api.sendHeartbeat(activeTest?.id);
    }, 10000);

    return () => clearInterval(interval);
  }, [studentId, activeTest]);

  // Load submissions for student
  const fetchCompletedTests = async (studId: string) => {
    setLoadingResults(true);
    const completedMap: Record<string, any> = {};
    for (const test of tests) {
      try {
        const result = await api.getSubmissionResult(test.id, studId);
        completedMap[test.id] = result;
      } catch (err) {
        // Not submitted yet, normal
      }
    }
    setCompletedTests(completedMap);
    setLoadingResults(false);
  };

  // Timer countdown
  useEffect(() => {
    if (!timerActive || timeLeft <= 0 || !activeTest) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // System auto-submit
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timerActive, timeLeft, activeTest]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicknameInput.trim()) return;

    setRegistering(true);
    try {
      const data = await api.registerStudent(nicknameInput);
      saveLocalStudent(data.studentId, data.nickname);
      setStudentId(data.studentId);
      setNickname(data.nickname);
      await refreshTests();
      await fetchCompletedTests(data.studentId);
    } catch (err: any) {
      if (err.message === "BLOCKED") {
        setIsBlocked(true);
      } else {
        triggerAlert("Registration Failed", "Registration failed: " + err.message);
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleStartTest = (test: Test) => {
    if (completedTests[test.id]) {
      triggerAlert("Test Already Completed", "You have already completed this test. Use the Retake option if you want to redo it.");
      return;
    }
    setActiveTest(test);
    setAnswers({});
    setAnswerImages({});
    setUploadingAnswerImages({});
    setStartedAt(new Date().toISOString());
    setTimeLeft(test.timeLimit * 60); // Use test-defined time limit, defaults to 30 mins (1800s)
    setTimerActive(true);
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers({
      ...answers,
      [questionId]: value
    });
  };

  const handleStudentAnswerImageChange = async (questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      triggerAlert("Image Too Large", "Image is too large. Max allowed size is 5MB.");
      return;
    }

    setUploadingAnswerImages(prev => ({ ...prev, [questionId]: true }));
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const uploadResult = await api.uploadStudentFile(base64Data, file.name);
          
          setAnswerImages(prev => ({
            ...prev,
            [questionId]: uploadResult.url
          }));
        } catch (err: any) {
          triggerAlert("Upload Failed", "Image upload failed: " + err.message);
        } finally {
          setUploadingAnswerImages(prev => ({ ...prev, [questionId]: false }));
        }
      };
    } catch (err: any) {
      triggerAlert("Image Read Failed", "Failed to read image: " + err.message);
      setUploadingAnswerImages(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const handleRemoveAnswerImage = (questionId: string) => {
    setAnswerImages(prev => {
      const updated = { ...prev };
      delete updated[questionId];
      return updated;
    });
  };

  const submitAnswers = async (isAuto: boolean) => {
    if (!activeTest || !studentId) return;
    setSubmitting(true);
    setTimerActive(false);

    try {
      const result = await api.submitTest(activeTest.id, {
        studentId,
        nickname,
        answers,
        answerImages,
        autoSubmitted: isAuto,
        startedAt: startedAt || new Date().toISOString()
      });

      // Update submissions logs
      setCompletedTests({
        ...completedTests,
        [activeTest.id]: result
      });

      // Focus results
      setViewingResultTestId(activeTest.id);
      setActiveTest(null);
      setShowConfirmSubmit(false); // Close custom modal if open
    } catch (err: any) {
      triggerAlert("Submission Failed", "Submission failed: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSubmit = () => {
    // Open custom state-driven confirmation modal to prevent iframe blocking
    setShowConfirmSubmit(true);
  };

  const handleAutoSubmit = () => {
    submitAnswers(true);
  };

  const executeRetakeTest = async (testId: string) => {
    if (!studentId) return;
    try {
      await api.retakeTest(testId, studentId);
      
      // Update completed state locally
      const updated = { ...completedTests };
      delete updated[testId];
      setCompletedTests(updated);

      // Reset states and start exam
      const targetTest = tests.find((t) => t.id === testId);
      if (targetTest) {
        handleStartTest(targetTest);
      }
      setShowConfirmRetakeTestId(null); // Close retake modal
    } catch (err: any) {
      triggerAlert("Retake Failed", "Failed to initiate retake: " + err.message);
    }
  };

  // Formatting helpers
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (isBlocked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-950 border border-rose-500/40 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center space-y-6"
        >
          <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl max-w-max mx-auto text-rose-500">
            <AlertTriangle size={48} className="animate-bounce" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight text-rose-400">Access Restricted</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Your device profile has been blocked from accessing this online testing service by the administrator. Please contact your coordinator for details.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer"
          >
            Refresh System State
          </button>
        </motion.div>
      </div>
    );
  }

  // 1. Welcome / Identification Page
  if (!studentId) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 right-0 h-96 w-96 bg-indigo-50 rounded-full blur-3xl opacity-60 -mr-16 -mt-16 -z-10"></div>
        <div className="absolute bottom-0 left-0 h-96 w-96 bg-blue-50 rounded-full blur-3xl opacity-60 -ml-16 -mb-16 -z-10"></div>

        {/* Minimal Header */}
        <header className="py-6 px-6 max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm shadow-indigo-600/10">
              M
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-slate-900 block">Maranatha Exam Pro</span>
              <span className="text-[10px] text-slate-500 font-mono">STUDENT_PORTAL // SECURE</span>
            </div>
          </div>
          <button
            onClick={onOpenAdminLogin}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200/85 px-4 py-2 rounded-xl transition-all cursor-pointer shadow-xs hover:border-slate-300"
          >
            Coordinator Login
          </button>
        </header>

        {/* Main Card */}
        <main className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white border border-slate-200/80 rounded-3xl max-w-md w-full shadow-xl p-8 space-y-6"
          >
            <div className="text-center space-y-2">
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full uppercase tracking-wider">
                Exams & Questionnaires
              </span>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Student Portal Entrance</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Take timed examinations and get instant feedback. No registration or password required. Just enter your full name or nickname to start.
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Enter Your Name *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    placeholder="e.g., John Doe"
                    maxLength={30}
                    className="w-full text-xs pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-semibold text-slate-800"
                  />
                  <User className="absolute left-3.5 top-3.5 text-slate-400" size={15} />
                </div>
              </div>

              <button
                type="submit"
                disabled={registering}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-2xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10"
              >
                {registering ? (
                  <>
                    <div className="animate-spin h-3 w-3 border-b-2 border-white rounded-full"></div>
                    <span>Initializing Paper...</span>
                  </>
                ) : (
                  <>
                    <LogIn size={14} />
                    <span>Enter Student Lobby</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </main>

        {/* Minimal Footer */}
        <footer className="py-6 text-center text-[10px] text-slate-400 border-t border-slate-100 bg-white/40">
          Professional Online Testing Console • Secured Session
        </footer>

        {/* Custom Alert Modal */}
        <AnimatePresence>
          {alertState && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl space-y-4 text-center"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <AlertTriangle size={24} />
                </div>
                <div className="space-y-1.5 text-center">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">{alertState.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{alertState.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAlertState(null)}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-4 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  OK, Got it
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // 2. ACTIVE TEST EXPERIENCE
  if (activeTest) {
    // Check if there is an attached document (PDF or main sheet image)
    const hasDoc = activeTest.documentUrl && activeTest.documentType !== "none";
    const isFiveMinsOrLess = timeLeft <= 300;

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col font-sans text-slate-100">
        {/* Exam Session Header */}
        <header className="bg-slate-950 border-b border-slate-800 py-3.5 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-10 shadow-md">
          <div className="flex items-center space-x-3 overflow-hidden">
            <span className="bg-amber-500 text-slate-950 font-bold px-2 py-0.5 rounded text-xs animate-pulse">
              EXAM
            </span>
            <div className="overflow-hidden">
              <h2 className="text-sm font-bold text-slate-100 truncate">{activeTest.title}</h2>
              <p className="text-[10px] text-slate-400 truncate">Student: {nickname}</p>
            </div>
          </div>

          {/* Sticky Timer */}
          <div className="flex items-center space-x-4">
            <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 transition-all ${
              isFiveMinsOrLess 
                ? "bg-rose-950/40 text-rose-400 border-rose-500/50 animate-pulse" 
                : "bg-slate-900 text-slate-100 border-slate-800"
            }`}>
              <Clock size={16} className={isFiveMinsOrLess ? "animate-spin" : ""} />
              <div className="text-right">
                <span className="text-[9px] text-slate-400 block uppercase font-mono tracking-wider">Remaining</span>
                <span className="text-sm font-mono font-bold">{formatTime(timeLeft)}</span>
              </div>
            </div>

            <button
              onClick={handleManualSubmit}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-lg flex items-center gap-1.5"
            >
              <Send size={13} />
              <span>Submit Paper</span>
            </button>
          </div>
        </header>

        {/* Main Panel Side-by-Side vs Standard */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left panel: Test document view (Only if uploaded) */}
          {hasDoc && (
            <div className="lg:w-1/2 border-r border-slate-800 bg-slate-950/30 flex flex-col h-[50vh] lg:h-auto overflow-hidden">
              <div className="bg-slate-950 py-2 px-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1">
                  <FileText size={12} className="text-indigo-400" />
                  <span>Interactive Test Document Attachment</span>
                </span>
              </div>
              <div className="flex-1 bg-slate-900 p-2 flex items-center justify-center overflow-auto">
                {activeTest.documentType === "pdf" ? (
                  <iframe
                    src={`${activeTest.documentUrl}#toolbar=0`}
                    className="w-full h-full rounded-xl border border-slate-800 bg-white"
                    title="Test Document PDF"
                  />
                ) : (
                  <img
                    src={activeTest.documentUrl || undefined}
                    alt="Test Document"
                    className="max-w-full max-h-full object-contain rounded-xl border border-slate-800"
                  />
                )}
              </div>
            </div>
          )}

          {/* Right panel (or full panel): Questions Sheet */}
          <div className={`flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 ${hasDoc ? "lg:w-1/2" : "max-w-4xl mx-auto w-full"}`}>
            <div className="space-y-2 mb-6">
              <h3 className="text-lg font-display font-bold text-white">Answer Sheet</h3>
              <p className="text-xs text-slate-400">
                You can answer and change options freely. All selections are autosaved locally and will be graded automatically.
              </p>
            </div>

            <div className="space-y-6">
              {activeTest.questions.map((q, index) => {
                const isAnswered = answers[q.id] !== undefined && answers[q.id] !== "";
                
                return (
                  <div 
                    key={q.id} 
                    className={`bg-slate-950 border p-5 rounded-2xl transition-all space-y-4 ${
                      isAnswered 
                        ? "border-indigo-500/30 bg-slate-950/60 shadow-indigo-500/5" 
                        : "border-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <span className={`font-bold h-6.5 w-6.5 rounded-lg text-xs flex items-center justify-center transition-colors ${
                          isAnswered ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"
                        }`}>
                          {index + 1}
                        </span>
                        <h4 className="text-sm font-semibold text-slate-100">{q.text}</h4>
                      </div>
                      <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded uppercase font-semibold font-mono">
                        {q.points} {q.points === 1 ? "Pt" : "Pts"}
                      </span>
                    </div>

                    {/* Question image if attached */}
                    {q.imageUrl && (
                      <div className="border border-slate-800 rounded-xl p-2 bg-slate-900/50 max-w-max">
                        <img src={q.imageUrl} alt={`Diagram ${index + 1}`} className="max-h-48 object-contain rounded-lg" />
                      </div>
                    )}

                    {/* MC Choices */}
                    {q.type === "multiple-choice" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {q.options?.map((opt, oIndex) => {
                          const isSelected = String(answers[q.id]) === String(oIndex);
                          
                          return (
                            <button
                              key={oIndex}
                              type="button"
                              onClick={() => handleAnswerChange(q.id, String(oIndex))}
                              className={`p-3 rounded-xl border text-left text-xs transition-all flex items-center space-x-3 cursor-pointer ${
                                isSelected
                                  ? "bg-indigo-600/10 text-indigo-200 border-indigo-500/50 shadow-inner"
                                  : "bg-slate-900/40 hover:bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                              }`}
                            >
                              <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                                isSelected ? "border-indigo-400 text-indigo-400 bg-indigo-500/20" : "border-slate-600"
                              }`}>
                                {isSelected && <div className="h-2 w-2 rounded-full bg-indigo-400" />}
                              </div>
                              <span className="flex-1 leading-normal font-medium">
                                <span className="font-mono text-[10px] text-slate-500 mr-1.5">{String.fromCharCode(65 + oIndex)}.</span>
                                {opt}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      /* Short Answer text field */
                      <div className="space-y-1.5 pt-1">
                        <input
                          type="text"
                          value={answers[q.id] || ""}
                          onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                          placeholder="Type your answer here..."
                          className="w-full text-xs px-3.5 py-2.5 bg-slate-900/50 border border-slate-800 rounded-xl focus:border-indigo-500 outline-none focus:bg-slate-950 transition-all font-medium text-slate-100 placeholder:text-slate-600"
                        />
                      </div>
                    )}

                    {/* Student's answer image/diagram upload place */}
                    <div className="mt-4 border border-slate-800/40 rounded-xl p-3 bg-slate-900/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                          <ImageIcon size={12} className="text-indigo-400" />
                          <span>Attach Diagram or Answer Photo (Optional)</span>
                        </span>
                        {answerImages[q.id] && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAnswerImage(q.id)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors font-medium cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      
                      {answerImages[q.id] ? (
                        <div className="relative border border-slate-800 bg-slate-950 p-2 rounded-lg max-w-max">
                          <img src={answerImages[q.id]} alt="Attached solution diagram" className="max-h-32 object-contain rounded" />
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <input
                            type="file"
                            id={`student-ans-img-${q.id}`}
                            onChange={(e) => handleStudentAnswerImageChange(q.id, e)}
                            accept="image/*"
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => document.getElementById(`student-ans-img-${q.id}`)?.click()}
                            disabled={uploadingAnswerImages[q.id]}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                          >
                            {uploadingAnswerImages[q.id] ? (
                              <>
                                <div className="animate-spin h-3 w-3 border-b border-white rounded-full"></div>
                                <span>Uploading...</span>
                              </>
                            ) : (
                              <>
                                <Upload size={11} />
                                <span>Upload Diagram / Picture</span>
                              </>
                            )}
                          </button>
                          <span className="text-[10px] text-slate-500">Attach photo or drawing</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-8 pb-16 flex items-center justify-end">
              <button
                type="button"
                onClick={handleManualSubmit}
                disabled={submitting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-md flex items-center gap-1.5 disabled:bg-slate-600"
              >
                <Send size={14} />
                <span>Submit Exam Answers</span>
              </button>
            </div>
          </div>
        </div>

        {/* Custom Alert Modal */}
        <AnimatePresence>
          {alertState && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl space-y-4 text-center"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  <AlertTriangle size={24} />
                </div>
                <div className="space-y-1.5 text-center">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">{alertState.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{alertState.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAlertState(null)}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-4 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  OK, Got it
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Custom Confirm Submit Modal */}
        <AnimatePresence>
          {showConfirmSubmit && activeTest && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs text-slate-100 font-sans">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-5 text-left"
              >
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Submit Your Exam Paper?</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Please review your completion progress below. Once submitted, you cannot edit your answers anymore.
                  </p>
                </div>

                {/* Progress Breakdown */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Total Questions:</span>
                    <span className="font-bold text-white">{activeTest.questions.length}</span>
                  </div>
                  
                  {(() => {
                    const totalQ = activeTest.questions.length;
                    const answeredQ = activeTest.questions.filter(q => answers[q.id] !== undefined && answers[q.id] !== "").length;
                    const unansweredQ = totalQ - answeredQ;
                    const completionRate = Math.round((answeredQ / totalQ) * 100);

                    return (
                      <>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Answered Questions:</span>
                          <span className="font-bold text-indigo-400">{answeredQ}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Unanswered Questions:</span>
                          <span className={`font-bold ${unansweredQ > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                            {unansweredQ}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[10px] font-mono font-semibold">
                            <span className="text-slate-500">COMPLETION RATE</span>
                            <span className="text-indigo-400">{completionRate}%</span>
                          </div>
                          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                            <div 
                              className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-300"
                              style={{ width: `${completionRate}%` }}
                            />
                          </div>
                        </div>

                        {unansweredQ > 0 && (
                          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start space-x-2.5 text-amber-200 mt-1">
                            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-amber-400" />
                            <div className="text-[11px] leading-relaxed">
                              <strong>Note:</strong> You have <strong>{unansweredQ}</strong> unanswered questions left. You can still submit your paper anytime you want if you are ready.
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Modal actions */}
                <div className="flex items-center space-x-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowConfirmSubmit(false)}
                    className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors text-center animate-none"
                  >
                    Go Back & Answer
                  </button>
                  <button
                    type="button"
                    onClick={() => submitAnswers(false)}
                    disabled={submitting}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors text-center flex items-center justify-center gap-1 shadow-md"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin h-3.5 w-3.5 border-b-2 border-white rounded-full"></div>
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <>
                        <Send size={12} />
                        <span>Submit Exam Now</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // 3. RESULTS VIEW MODE (Only shown at the end, detailed diagnostic breakdown)
  if (viewingResultTestId && completedTests[viewingResultTestId]) {
    const result = completedTests[viewingResultTestId];
    const testTitle = tests.find((t) => t.id === viewingResultTestId)?.title || "Exam Paper";
    const scorePercentage = Math.round((result.submission.score / (result.submission.totalPoints || 1)) * 100);

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans text-slate-900">
        <header className="bg-white border-b border-slate-200/80 py-4 px-6 shadow-xs sticky top-0 z-10">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button
              onClick={() => setViewingResultTestId(null)}
              className="text-slate-600 hover:text-slate-900 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
              <span>Lobby</span>
            </button>
            <h1 className="text-sm font-display font-bold tracking-tight text-slate-900">Grading & Diagnosis</h1>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-full uppercase border border-slate-200">
              Exam Ended
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
          {/* Main Grade Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-200/80 rounded-3xl shadow-xl overflow-hidden"
          >
            <div className="bg-slate-900 text-white p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full uppercase tracking-wider">
                  Test Result Sheet
                </span>
                <h3 className="text-xl font-display font-bold text-slate-100 leading-snug">{testTitle}</h3>
                <p className="text-xs text-slate-400">Registered Student: <strong className="text-slate-200">{nickname}</strong></p>
              </div>

              <div className="flex items-center space-x-4">
                <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl text-center min-w-[100px] shadow-inner">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wide block mb-0.5">Points Scored</span>
                  <strong className="text-lg font-display font-bold text-white">{result.submission.score} / {result.submission.totalPoints}</strong>
                </div>
                <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl text-center min-w-[100px] shadow-inner">
                  <span className="text-[9px] text-slate-400 uppercase tracking-wide block mb-0.5">Final Grade</span>
                  <strong className="text-xl font-display font-bold text-amber-400">{scorePercentage}%</strong>
                </div>
              </div>
            </div>

            {/* Diagnostic Message */}
            <div className="p-6 border-b border-slate-150 bg-slate-50/50 flex items-center gap-3">
              <Award className="text-indigo-500" size={20} />
              <p className="text-xs text-slate-600">
                {scorePercentage >= 85 
                  ? "Outstanding! You demonstrated an excellent mastery of this topic." 
                  : scorePercentage >= 50 
                  ? "Well done. You passed the test. Review the correct answers below for improvement." 
                  : "Exam unsuccessful. You can review the corrections below and retake the exam when ready."}
              </p>
            </div>

            {/* Answer audit */}
            <div className="p-6 sm:p-8 space-y-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Question Audit Logs</h4>
              <div className="space-y-4">
                {result.questions.map((q, qIndex) => {
                  const isCorrect = q.isCorrect;
                  
                  return (
                    <div key={q.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2.5">
                          <span className="bg-slate-900 text-white font-bold h-6 w-6 rounded-lg text-xs flex items-center justify-center">
                            {qIndex + 1}
                          </span>
                          <span className="text-xs font-semibold text-slate-800">{q.text}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                          isCorrect 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-150" 
                            : "bg-rose-50 text-rose-700 border-rose-150"
                        }`}>
                          {isCorrect ? <CheckCircle size={11} /> : <XCircle size={11} />}
                          <span>{isCorrect ? "Correct" : "Wrong"}</span>
                        </span>
                      </div>

                      {q.imageUrl && (
                        <div className="border border-slate-200 rounded-xl p-2 bg-white max-w-max">
                          <img src={q.imageUrl} alt="Diagram" className="max-h-32 object-contain rounded-lg" />
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block mb-0.5">Your Response:</span>
                          {q.type === "multiple-choice" ? (
                            <strong className="text-slate-800">
                              {q.studentAnswer ? (
                                <>Option {String.fromCharCode(65 + Number(q.studentAnswer))}: {q.options?.[Number(q.studentAnswer)]}</>
                              ) : (
                                <span className="text-rose-600 italic">Unanswered</span>
                              )}
                            </strong>
                          ) : (
                            <strong className={q.studentAnswer ? "text-slate-800" : "text-rose-600 italic"}>
                              {q.studentAnswer || "Unanswered"}
                            </strong>
                          )}

                          {result.submission.answerImages?.[q.id] && (
                            <div className="mt-2 border border-slate-200 bg-white p-1 rounded-lg max-w-max">
                              <img src={result.submission.answerImages[q.id]} alt="Your uploaded solution diagram" className="max-h-24 object-contain rounded" />
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block mb-0.5">Correct Answer Key:</span>
                          {q.type === "multiple-choice" ? (
                            <strong className="text-emerald-700 font-semibold">
                              Option {String.fromCharCode(65 + Number(q.correctAnswer))}: {q.options?.[Number(q.correctAnswer)]}
                            </strong>
                          ) : (
                            <strong className="text-emerald-700 font-semibold">
                              {q.correctAnswer}
                            </strong>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Controls */}
          <div className="flex items-center justify-between pt-4 pb-16">
            <button
              onClick={() => setViewingResultTestId(null)}
              className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all shadow-xs"
            >
              Return to Exam Lobby
            </button>

            <button
              onClick={() => setShowConfirmRetakeTestId(viewingResultTestId)}
              className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all shadow-md flex items-center gap-1.5"
            >
              <RotateCcw size={13} />
              <span>Retake This Exam</span>
            </button>
          </div>
        </main>

        <footer className="py-6 text-center text-[10px] text-slate-400 border-t border-slate-150 bg-white/40">
          Professional Online Testing Console • Grading Session Verified
        </footer>
      </div>
    );
  }

  // 4. MAIN LOBBY / CATALOG VIEW
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans text-slate-900">
      {/* Lobby Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-4 sm:px-6 shadow-xs sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm shadow-indigo-600/10">
              M
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-slate-900 block">Maranatha Exam Pro</span>
              <p className="text-[10px] text-slate-400">Welcome, <strong className="text-slate-600 font-semibold">{nickname}</strong> (Student Profile)</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-150 px-2.5 py-1 rounded-full uppercase tracking-wider hidden sm:inline-block">
              Live Sync Active
            </span>
            <button
              onClick={onOpenAdminLogin}
              className="text-xs font-semibold text-slate-600 hover:text-slate-950 bg-white border border-slate-200 hover:border-slate-300 px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Coordinator Suite
            </button>
          </div>
        </div>
      </header>

      {/* Main Catalog Contents */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 flex-1">
        <div className="space-y-8">
          {/* Welcome Profile Banner */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
            <div className="absolute right-0 top-0 h-44 w-44 bg-indigo-500/10 rounded-full blur-3xl -mr-12 -mt-12 -z-10"></div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-100">Welcome to the Exam Room, {nickname}!</h2>
              <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                Choose an exam from the bank below to begin. Tests feature a continuous 30-minute timer and will submit automatically. Correct answers and grades will be revealed strictly upon paper completion.
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm("Would you like to register with a different name?")) {
                  saveLocalStudent("", "");
                  setStudentId(null);
                  setNickname("");
                }
              }}
              className="bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-semibold border border-white/10 px-4 py-2 rounded-xl transition-all cursor-pointer shadow-sm"
            >
              Change Student Identity
            </button>
          </div>

          {/* Test Listing section */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen size={18} className="text-indigo-600" />
              <span>Permanent Test Bank ({tests.length})</span>
            </h3>

            {tests.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-16 text-center shadow-xs">
                <BookOpen className="mx-auto text-slate-300 mb-3" size={48} />
                <h4 className="text-sm font-semibold text-slate-700 mb-1">No Tests Published</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  The examination bank is currently empty. Ask the administrator (Maranatha) to upload test sheets, PDFs or questions to this site.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tests.map((test) => {
                  const completedResult = completedTests[test.id];
                  const hasCompleted = !!completedResult;
                  const scorePercentage = hasCompleted 
                  ? Math.round((completedResult.submission.score / (completedResult.submission.totalPoints || 1)) * 100)
                  : 0;

                  return (
                    <div 
                      key={test.id} 
                      className={`bg-white border rounded-2xl p-5 flex flex-col justify-between hover:shadow-md transition-all ${
                        hasCompleted ? "border-emerald-500/20 bg-emerald-50/5" : "border-slate-200/80"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3.5">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                            hasCompleted
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-150"
                              : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                          }`}>
                            {hasCompleted ? "Graded & Closed" : "Exam Active"}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1 font-medium font-mono">
                            <Clock size={12} />
                            {test.timeLimit}m
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-slate-800 mb-1">{test.title}</h4>
                        <p className="text-[11px] text-slate-500 line-clamp-2 mb-4">
                          {test.description || "No specific instructions provided."}
                        </p>

                        {/* If test has a document sheet attached */}
                        {test.documentUrl && (
                          <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase max-w-max flex items-center gap-1 border border-indigo-100/50 mb-4">
                            <FileText size={10} />
                            <span>Attachment: {test.documentType} paper</span>
                          </span>
                        )}
                      </div>

                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        {hasCompleted ? (
                          <>
                            <div className="text-left">
                              <span className="text-[9px] text-slate-400 block font-semibold uppercase">Your Score</span>
                              <strong className="text-sm font-bold text-slate-800">
                                {completedResult.submission.score} / {completedResult.submission.totalPoints} ({scorePercentage}%)
                              </strong>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <button
                                onClick={() => setViewingResultTestId(test.id)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer shadow-inner border border-slate-200"
                              >
                                Corrections
                              </button>
                              <button
                                onClick={() => setShowConfirmRetakeTestId(test.id)}
                                className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer shadow-sm"
                                title="Retake Exam"
                              >
                                <RotateCcw size={12} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-slate-400">{test.questions.length} questions</span>
                            <button
                              onClick={() => handleStartTest(test)}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-sm hover:shadow-md cursor-pointer transition-colors"
                            >
                              <Play size={10} fill="currentColor" />
                              <span>Start Test</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Lobby Footer */}
      <footer className="py-6 text-center text-[10px] text-slate-400 border-t border-slate-200 bg-white">
        Professional Online Testing Console • Student Lobby Session
      </footer>

      {/* Custom Alert Modal */}
      <AnimatePresence>
        {alertState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl space-y-4 text-center"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1.5 text-center">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">{alertState.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{alertState.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setAlertState(null)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 px-4 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                OK, Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Retake Modal */}
      <AnimatePresence>
        {showConfirmRetakeTestId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs font-sans">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl space-y-4 text-left"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <RotateCcw size={22} className="animate-spin-slow" />
              </div>
              <div className="space-y-1.5 text-center">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-sans">Retake Exam?</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Retaking will permanently delete your previous score and start a fresh testing session. Are you sure you want to proceed?
                </p>
              </div>
              <div className="flex items-center space-x-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowConfirmRetakeTestId(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeRetakeTest(showConfirmRetakeTestId)}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors text-center shadow-md"
                >
                  Yes, Start Fresh
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
