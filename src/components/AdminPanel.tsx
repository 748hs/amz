import React, { useState, useEffect, useRef } from "react";
import { 
  Users, 
  BookOpen, 
  Plus, 
  Trash2, 
  Lock, 
  Unlock, 
  FileText, 
  Image as ImageIcon, 
  Upload, 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileCheck, 
  UserMinus, 
  LogOut,
  Sparkles,
  ChevronRight,
  Eye,
  AlertTriangle
} from "lucide-react";
import { api } from "../lib/api.js";
import { Test, Participant, Submission, Question } from "../types.js";
import { motion, AnimatePresence } from "motion/react";

interface AdminPanelProps {
  onLogout: () => void;
  tests: Test[];
  refreshTests: () => Promise<void>;
}

export default function AdminPanel({ onLogout, tests, refreshTests }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "tests" | "create-test" | "submissions" | "participants">("dashboard");
  const [stats, setStats] = useState<{
    activeCount: number;
    activeList: Participant[];
    joinedLast3Days: Participant[];
    totalParticipants: number;
    allParticipants: Participant[];
    submissions: Submission[];
    testsCount: number;
  } | null>(null);
  
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Test form state
  const [testTitle, setTestTitle] = useState("");
  const [testDescription, setTestDescription] = useState("");
  const [testTimeLimit, setTestTimeLimit] = useState<number>(30);
  const [testDocumentUrl, setTestDocumentUrl] = useState<string | null>(null);
  const [testDocumentName, setTestDocumentName] = useState<string | null>(null);
  const [testDocumentType, setTestDocumentType] = useState<"pdf" | "image" | "none">("none");
  const [questions, setQuestions] = useState<Omit<Question, "id">[]>([]);
  const [submittingTest, setSubmittingTest] = useState(false);

  // Upload and extraction states
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [extractingQuestions, setExtractingQuestions] = useState(false);
  const [extractionSuccess, setExtractionSuccess] = useState<boolean | null>(null);
  const [uploadingQuestionImages, setUploadingQuestionImages] = useState<Record<number, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View submission modal
  const [selectedSubmissionResult, setSelectedSubmissionResult] = useState<{
    submission: Submission;
    questions: any[];
  } | null>(null);

  // Fetch stats on mount and periodically
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Poll stats every 5 seconds for live participant monitoring
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const data = await api.getAdminStats();
      setStats(data);
      setLoadingStats(false);
    } catch (err: any) {
      console.error("Failed to load admin stats:", err);
      setError("Failed to fetch dashboard statistics.");
    }
  };

  const handleToggleBlock = async (participantId: string, currentBlocked: boolean) => {
    try {
      await api.toggleBlockParticipant(participantId, !currentBlocked);
      await fetchStats();
    } catch (err: any) {
      alert("Failed to update block status: " + err.message);
    }
  };

  const handleDeleteTest = async (testId: string) => {
    if (!confirm("Are you sure you want to delete this test? This will permanently remove the test and all its submissions.")) {
      return;
    }
    try {
      await api.deleteTest(testId);
      await refreshTests();
      await fetchStats();
    } catch (err: any) {
      alert("Failed to delete test: " + err.message);
    }
  };

  // Convert files to base64 for upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    // Validate file type
    const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/i);
    if (!isPDF && !isImage) {
      alert("Unsupported format. Please upload a PDF or an image/diagram.");
      return;
    }

    setUploadingDoc(true);
    setExtractionSuccess(null);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const uploadResult = await api.uploadFile(base64Data, file.name);
          
          setTestDocumentUrl(uploadResult.url);
          setTestDocumentName(file.name);
          const docType = isPDF ? "pdf" : "image";
          setTestDocumentType(docType);
          setUploadingDoc(false);

          // Auto-set test title from PDF/image name if current title is empty
          if (!testTitle.trim() || testTitle === "Untitled Test") {
            const defaultTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
            setTestTitle(defaultTitle);
          }

          // Seamlessly switch to create-test tab
          setActiveTab("create-test");

          // Automatically trigger Gemini-powered question extraction!
          setExtractingQuestions(true);
          try {
            const extractResult = await api.extractQuestions(uploadResult.url, docType);
            if (extractResult.success && extractResult.questions && extractResult.questions.length > 0) {
              setQuestions(extractResult.questions);
              setExtractionSuccess(true);
            } else {
              throw new Error("No questions could be parsed.");
            }
          } catch (extractErr: any) {
            console.error("Auto-extraction failed:", extractErr);
            setExtractionSuccess(false);
            
            // Fallback placeholder question if auto-extraction fails or key is missing
            if (questions.length === 0) {
              setQuestions([
                {
                  text: "Question 1: Enter question text based on the uploaded document",
                  type: "multiple-choice",
                  options: ["Option A", "Option B", "Option C", "Option D"],
                  correctAnswer: "0",
                  points: 1,
                  imageUrl: null
                }
              ]);
            }
          } finally {
            setExtractingQuestions(false);
          }
        } catch (uploadErr: any) {
          alert("Upload failed: " + uploadErr.message);
          setUploadingDoc(false);
        }
      };
    } catch (err: any) {
      alert("Failed to read file: " + err.message);
      setUploadingDoc(false);
    }
  };

  // Upload question specific diagram
  const handleQuestionImageChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image/diagram.");
      return;
    }

    setUploadingQuestionImages(prev => ({ ...prev, [index]: true }));
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const uploadResult = await api.uploadFile(base64Data, file.name);
          
          const updatedQuestions = [...questions];
          updatedQuestions[index] = {
            ...updatedQuestions[index],
            imageUrl: uploadResult.url
          };
          setQuestions(updatedQuestions);
        } catch (err: any) {
          alert("Upload failed: " + err.message);
        } finally {
          setUploadingQuestionImages(prev => ({ ...prev, [index]: false }));
        }
      };
    } catch (err: any) {
      alert("Upload failed: " + err.message);
      setUploadingQuestionImages(prev => ({ ...prev, [index]: false }));
    }
  };

  // Question manipulation
  const addQuestion = (type: "multiple-choice" | "short-answer") => {
    setQuestions([
      ...questions,
      {
        text: "",
        type,
        options: type === "multiple-choice" ? ["Option A", "Option B", "Option C", "Option D"] : undefined,
        correctAnswer: type === "multiple-choice" ? "0" : "",
        points: 1,
        imageUrl: null
      }
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestionText = (index: number, text: string) => {
    const updated = [...questions];
    updated[index].text = text;
    setQuestions(updated);
  };

  const updateQuestionPoints = (index: number, points: number) => {
    const updated = [...questions];
    updated[index].points = points;
    setQuestions(updated);
  };

  const updateQuestionOption = (qIndex: number, oIndex: number, val: string) => {
    const updated = [...questions];
    if (updated[qIndex].options) {
      updated[qIndex].options![oIndex] = val;
    }
    setQuestions(updated);
  };

  const updateQuestionCorrectAnswer = (index: number, val: string) => {
    const updated = [...questions];
    updated[index].correctAnswer = val;
    setQuestions(updated);
  };

  const removeQuestionImage = (index: number) => {
    const updated = [...questions];
    updated[index].imageUrl = null;
    setQuestions(updated);
  };

  const handleCreateTestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTitle.trim()) {
      alert("Please provide a test title.");
      return;
    }
    if (questions.length === 0) {
      alert("Please add at least one question to the test.");
      return;
    }

    // Basic validation
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) {
        alert(`Question ${i + 1} text is empty.`);
        return;
      }
      if (q.type === "short-answer" && !q.correctAnswer.trim()) {
        alert(`Question ${i + 1} does not have a correct answer specified.`);
        return;
      }
    }

    setSubmittingTest(true);
    try {
      await api.createTest({
        title: testTitle,
        description: testDescription,
        timeLimit: testTimeLimit,
        documentUrl: testDocumentUrl,
        documentType: testDocumentType,
        questions
      });

      // Reset form
      setTestTitle("");
      setTestDescription("");
      setTestTimeLimit(30);
      setTestDocumentUrl(null);
      setTestDocumentName(null);
      setTestDocumentType("none");
      setQuestions([]);
      
      alert("Test uploaded and published successfully!");
      await refreshTests();
      await fetchStats();
      setActiveTab("tests");
    } catch (err: any) {
      alert("Failed to create test: " + err.message);
    } finally {
      setSubmittingTest(false);
    }
  };

  const handleViewSubmissionDetails = async (sub: Submission) => {
    try {
      const result = await api.getSubmissionResult(sub.testId, sub.studentId);
      setSelectedSubmissionResult(result);
    } catch (err: any) {
      alert("Failed to load submission details: " + err.message);
    }
  };

  // Helper formatting
  const formatDate = (isoStr: string) => {
    return new Date(isoStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const isWithinLast3Days = (isoStr: string) => {
    const diff = Date.now() - new Date(isoStr).getTime();
    return diff < 3 * 24 * 60 * 60 * 1000;
  };

  return (
    <div id="admin-panel" className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf, image/*"
        className="hidden"
      />
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-8 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm shadow-indigo-600/10">M</div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-800 flex items-center gap-2">
              Maranatha Exam Pro
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-sans border border-emerald-200 font-bold uppercase tracking-wider animate-pulse">Live</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-mono">ADMIN_ROOT: MARANATHA</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-700">Administrator</p>
            <p className="text-[10px] text-slate-500 font-semibold font-mono">Maranatha</p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center space-x-1.5 bg-slate-900 hover:bg-rose-600 text-white border border-slate-800 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden min-h-[calc(100vh-64px)]">
        {/* Navigation Sidebar */}
        <aside className="w-full lg:w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800">
          <nav className="flex-1 py-6 px-4 space-y-1.5">
            <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase px-3 mb-3">Controls</p>
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <Users size={15} />
              <span>Live Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab("tests")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                activeTab === "tests"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <BookOpen size={15} />
              <span>Test Bank ({tests.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("create-test");
                // Clear any leftover upload stuff
                setTestDocumentUrl(null);
                setTestDocumentName(null);
                setTestDocumentType("none");
                setQuestions([]);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                activeTab === "create-test"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <Plus size={15} />
              <span>Upload New Test</span>
            </button>

            <button
              onClick={() => setActiveTab("submissions")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                activeTab === "submissions"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <FileCheck size={15} />
              <span>Exam Submissions</span>
            </button>

            <button
              onClick={() => setActiveTab("participants")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
                activeTab === "participants"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <UserMinus size={15} />
              <span>User Access</span>
            </button>
          </nav>

          {/* Sidebar Footer Server Status Panel */}
          <div className="p-4 border-t border-slate-800/80">
            <div className="p-3.5 bg-slate-800/40 border border-slate-800/60 rounded-xl">
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Server Status</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-[10px] text-slate-300 uppercase font-semibold tracking-wider font-mono">Live & Secure</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50 space-y-6 flex flex-col">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl mb-6 flex items-center gap-3">
              <AlertTriangle className="text-rose-500" size={20} />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {loadingStats ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-12 flex flex-col items-center justify-center flex-1 min-h-[300px]">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900 mb-4"></div>
              <p className="text-slate-500 text-sm">Synchronizing database status...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {/* LIVE DASHBOARD */}
              {activeTab === "dashboard" && stats && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Active Now */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 h-32 w-32 bg-emerald-50 rounded-full -mr-8 -mt-8 -z-10 opacity-60"></div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-500 font-medium text-sm">Active Online Users</span>
                        <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        </span>
                      </div>
                      <h2 className="text-4xl font-display font-bold text-slate-950 mb-1">{stats.activeCount}</h2>
                      <div className="mt-2 text-xs text-emerald-600 font-medium">Live heartbeat connection active</div>
                    </div>

                    {/* Joined Last 3 Days */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 h-32 w-32 bg-blue-50 rounded-full -mr-8 -mt-8 -z-10 opacity-60"></div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-500 font-medium text-sm">Joined (Last 3 Days)</span>
                        <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg">
                          <Users size={16} />
                        </div>
                      </div>
                      <h2 className="text-4xl font-display font-bold text-slate-950 mb-1">
                        {stats.joinedLast3Days.length}
                      </h2>
                      <div className="mt-2 text-xs text-slate-400">Tracked in local storage state</div>
                    </div>

                    {/* Total Tests & Submissions */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 h-32 w-32 bg-purple-50 rounded-full -mr-8 -mt-8 -z-10 opacity-60"></div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-slate-500 font-medium text-sm">Test Bank Activity</span>
                        <div className="p-1.5 bg-purple-50 text-purple-700 rounded-lg">
                          <FileText size={16} />
                        </div>
                      </div>
                      <h2 className="text-4xl font-display font-bold text-slate-950 mb-1">
                        {stats.submissions.length}
                      </h2>
                      <div className="mt-2 text-xs text-indigo-600 font-semibold font-mono tracking-tighter uppercase">SYSTEM AUTOMARK ACTIVE</div>
                    </div>
                  </div>

                  {/* Quick Test Creator / Upload Box */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <Upload size={18} className="text-indigo-600" />
                          <span>Quick Test Creator — Upload Exam PDF</span>
                        </h3>
                        <p className="text-xs text-slate-500">Drop or select a PDF or image here to instantly initialize and design a new graded test.</p>
                      </div>
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border border-indigo-150 shrink-0 self-start sm:self-center">
                        30m Default Timer
                      </span>
                    </div>

                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/10 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group"
                    >
                      <div className="w-12 h-12 bg-indigo-100/80 rounded-xl flex items-center justify-center text-indigo-600 mb-3 group-hover:scale-105 transition-transform shadow-sm">
                        <Upload size={20} className="group-hover:translate-y-[-2px] transition-transform" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700 group-hover:text-indigo-900 transition-colors text-center">
                        {uploadingDoc ? "Uploading & Initializing Test..." : "Drop PDF, Images, or Diagrams"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 text-center">We automatically extract the title and set up a custom workspace for you!</p>
                    </div>
                  </div>

                  {/* Active Students List Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Active & Live Users List */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span>Live Session Room ({stats.activeList.length})</span>
                        </h3>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                          Realtime
                        </span>
                      </div>
                      
                      {stats.activeList.length === 0 ? (
                        <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-xl">
                          <Users className="mx-auto text-slate-300 mb-2" size={32} />
                          <p className="text-xs text-slate-400">No students are currently active online.</p>
                        </div>
                      ) : (
                        <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                          {stats.activeList.map((p) => (
                            <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl transition-colors">
                              <div className="flex items-center space-x-3">
                                <div className="bg-slate-200 text-slate-800 font-medium h-8 w-8 rounded-full flex items-center justify-center text-xs">
                                  {p.nickname.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-800">{p.nickname}</h4>
                                  <p className="text-[10px] text-slate-500">Student ID: {p.id}</p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-[10px] text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded">
                                  Live
                                </span>
                                {p.blocked && (
                                  <span className="text-[10px] text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                                    Blocked
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Users Joined Within Last 3 Days */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
                          <Users size={18} className="text-blue-500" />
                          <span>Joined Last 3 Days ({stats.joinedLast3Days.length})</span>
                        </h3>
                        <span className="text-[10px] text-slate-500">Last 72 hours</span>
                      </div>

                      {stats.joinedLast3Days.length === 0 ? (
                        <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-xl">
                          <Users className="mx-auto text-slate-300 mb-2" size={32} />
                          <p className="text-xs text-slate-400">No new students joined in the last 3 days.</p>
                        </div>
                      ) : (
                        <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                          {stats.joinedLast3Days.map((p) => (
                            <div key={p.id} className="flex items-center justify-between p-3 border border-slate-100 hover:border-slate-200 rounded-xl transition-all">
                              <div className="flex items-center space-x-3">
                                <div className="bg-blue-50 text-blue-800 font-semibold h-8 w-8 rounded-full flex items-center justify-center text-xs">
                                  {p.nickname.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-800">{p.nickname}</h4>
                                  <p className="text-[10px] text-slate-500">Registered: {formatDate(p.joinedAt)}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleToggleBlock(p.id, p.blocked)}
                                className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                                  p.blocked
                                    ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                                    : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                                }`}
                              >
                                {p.blocked ? "Unblock" : "Block User"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* TEST BANK */}
              {activeTab === "tests" && (
                <motion.div
                  key="tests"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-display font-bold text-slate-900">Available Tests</h3>
                      <p className="text-xs text-slate-500">All published online tests stored permanently</p>
                    </div>
                    <button
                      onClick={() => setActiveTab("create-test")}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                    >
                      <Plus size={14} />
                      <span>Upload Test</span>
                    </button>
                  </div>

                  {tests.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                      <BookOpen className="mx-auto text-slate-300 mb-3" size={44} />
                      <h4 className="text-sm font-semibold text-slate-700 mb-1">Test Bank is Empty</h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                        Upload some test documents (PDFs, images, or custom questions) so students can access them.
                      </p>
                      <button
                        onClick={() => setActiveTab("create-test")}
                        className="text-xs font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200 px-4 py-2 rounded-xl transition-colors cursor-pointer"
                      >
                        Create First Test
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {tests.map((test) => (
                        <div
                          key={test.id}
                          className="border border-slate-200 hover:border-slate-300/80 bg-slate-50/50 hover:bg-white rounded-xl p-5 flex flex-col justify-between transition-all group shadow-sm hover:shadow-md"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider bg-slate-200/70 px-2.5 py-0.5 rounded-full">
                                {test.questions.length} Questions
                              </span>
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock size={12} />
                                {test.timeLimit} mins
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 mb-1 group-hover:text-slate-950">
                              {test.title}
                            </h4>
                            <p className="text-xs text-slate-500 line-clamp-2 mb-4">
                              {test.description || "No description provided."}
                            </p>

                            {test.documentUrl && (
                              <div className="text-[11px] text-slate-600 bg-slate-100 hover:bg-slate-200 p-2.5 rounded-lg flex items-center gap-2 mb-4 transition-colors max-w-max border border-slate-200/50">
                                <FileText size={13} className="text-slate-500" />
                                <span className="font-medium truncate max-w-[200px]">Test Document</span>
                                <span className="text-[9px] bg-slate-300 text-slate-700 font-bold px-1.5 py-0.2 rounded uppercase">
                                  {test.documentType}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-150">
                            <span className="text-[10px] text-slate-400">Uploaded {formatDate(test.createdAt)}</span>
                            <button
                              onClick={() => handleDeleteTest(test.id)}
                              className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-2 rounded-lg transition-colors cursor-pointer"
                              title="Delete Test"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* UPLOAD & CREATE TEST FORM */}
              {activeTab === "create-test" && (
                <motion.div
                  key="create-test"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6"
                >
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-lg font-display font-bold text-slate-900">Upload New Test</h3>
                      <p className="text-xs text-slate-500">Configure parameters, attach sheets/PDFs, and define questions</p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateTestSubmit} className="space-y-6">
                    {/* Basic Meta */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-xs font-semibold text-slate-700">Test Title *</label>
                        <input
                          type="text"
                          required
                          value={testTitle}
                          onChange={(e) => setTestTitle(e.target.value)}
                          placeholder="e.g., Mathematics Midterm Exam - Calculus"
                          className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-700">Duration (Minutes)</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            max="180"
                            required
                            value={testTimeLimit}
                            onChange={(e) => setTestTimeLimit(Number(e.target.value))}
                            className="w-full text-xs pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all outline-none"
                          />
                          <Clock className="absolute right-3 top-2.5 text-slate-400" size={16} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700">Test Instructions & Description</label>
                      <textarea
                        rows={2}
                        value={testDescription}
                        onChange={(e) => setTestDescription(e.target.value)}
                        placeholder="Provide guidelines for students (e.g. calculators allowed, formula sheets, etc.)"
                        className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all outline-none resize-none"
                      />
                    </div>

                    {/* Test Sheet Document Upload Section */}
                    <div className="space-y-3">
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        <FileText size={14} className="text-indigo-500" />
                        <span>Optional: Attach Primary Test Document (PDF, Exam Paper Image, or Diagram)</span>
                      </label>
                      
                      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center space-x-3.5">
                          <div className="bg-indigo-50 text-indigo-700 h-10 w-10 rounded-xl flex items-center justify-center">
                            <Upload size={18} />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-700">PDF, Exam Sheet or Diagram Upload</h4>
                            <p className="text-[10px] text-slate-500">Supports PDF / PNG / JPG. Displayed side-by-side with answer sheets!</p>
                          </div>
                        </div>

                        <div>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingDoc}
                            className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                          >
                            {uploadingDoc ? (
                              <>
                                <div className="animate-spin h-3 w-3 border-b-2 border-slate-800 rounded-full"></div>
                                <span>Uploading...</span>
                              </>
                            ) : (
                              <>
                                <Upload size={13} />
                                <span>Select Document</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {testDocumentUrl && (
                        <div className="space-y-3">
                          <div className="bg-slate-100 p-3 rounded-xl flex items-center justify-between border border-slate-200/50">
                            <div className="flex items-center space-x-2.5 overflow-hidden">
                              <CheckCircle className="text-emerald-500 flex-shrink-0" size={16} />
                              <span className="text-xs font-medium text-slate-700 truncate max-w-[400px]">
                                {testDocumentName || "Uploaded Document"}
                              </span>
                              <span className="text-[9px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded uppercase font-mono">
                                {testDocumentType}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setTestDocumentUrl(null);
                                setTestDocumentName(null);
                                setTestDocumentType("none");
                                setExtractionSuccess(null);
                              }}
                              className="text-xs text-rose-600 hover:text-rose-800 px-2 py-1 hover:bg-rose-50 rounded"
                            >
                              Remove
                            </button>
                          </div>

                          {/* Gemini Extraction Status Banners */}
                          {extractingQuestions && (
                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex items-center space-x-3.5 animate-pulse">
                              <div className="flex-shrink-0 bg-indigo-100 text-indigo-700 p-2 rounded-lg">
                                <Sparkles className="h-5 w-5 animate-spin text-indigo-600" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                                  <span>🪄 Gemini is analyzing your document...</span>
                                </h4>
                                <p className="text-[10px] text-indigo-700">
                                  We are auto-extracting all questions, choices, and suggested correct answers. This might take 5-15 seconds.
                                </p>
                              </div>
                            </div>
                          )}

                          {!extractingQuestions && extractionSuccess === true && (
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 flex items-center space-x-3.5">
                              <div className="flex-shrink-0 bg-emerald-100 text-emerald-700 p-2 rounded-lg">
                                <Sparkles className="h-5 w-5 text-emerald-600" />
                              </div>
                              <div className="flex-1">
                                <h4 className="text-xs font-bold text-emerald-950">✨ Successfully Extracted with Gemini!</h4>
                                <p className="text-[10px] text-emerald-700">
                                  We've loaded <strong>{questions.length}</strong> questions below. You can now review, edit question wording, insert custom diagrams, or adjust point values and correct keys.
                                </p>
                              </div>
                            </div>
                          )}

                          {!extractingQuestions && extractionSuccess === false && (
                            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 flex items-center space-x-3.5">
                              <div className="flex-shrink-0 bg-amber-100 text-amber-700 p-2 rounded-lg">
                                <AlertTriangle className="h-5 w-5 text-amber-600" />
                              </div>
                              <div className="flex-1">
                                <h4 className="text-xs font-bold text-amber-950">⚠️ Auto-Extraction Unavailable</h4>
                                <p className="text-[10px] text-amber-700">
                                  Your document is attached, but we couldn't auto-extract the questions. No worries! You can manually add and customize questions in the editor below.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Question Builder block */}
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Define Exam Questions & Keys</h4>
                          <p className="text-[10px] text-slate-500">Create Multiple Choice bubbles or Short Answer text validations.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => addQuestion("multiple-choice")}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Plus size={11} />
                            <span>+ Multiple Choice</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => addQuestion("short-answer")}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Plus size={11} />
                            <span>+ Short Answer</span>
                          </button>
                        </div>
                      </div>

                      {questions.length === 0 ? (
                        <div className="py-12 text-center border border-dashed border-slate-200 bg-slate-50/30 rounded-xl">
                          <BookOpen className="mx-auto text-slate-300 mb-2" size={24} />
                          <p className="text-xs text-slate-400">No questions defined. Click the buttons above to add questions.</p>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {questions.map((q, qIndex) => (
                            <div key={qIndex} className="bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-xl p-5 relative transition-all shadow-sm">
                              <button
                                type="button"
                                onClick={() => removeQuestion(qIndex)}
                                className="absolute right-4 top-4 text-slate-400 hover:text-rose-600 transition-colors p-1 hover:bg-rose-50 rounded"
                                title="Remove Question"
                              >
                                <Trash2 size={14} />
                              </button>

                              <div className="flex items-center space-x-2.5 mb-3.5">
                                <span className="bg-slate-900 text-white font-bold h-6 w-6 rounded-lg text-xs flex items-center justify-center">
                                  {qIndex + 1}
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold bg-slate-200 px-2 py-0.5 rounded uppercase font-mono">
                                  {q.type === "multiple-choice" ? "Multiple Choice" : "Short Answer"}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3.5">
                                <div className="md:col-span-3 space-y-1">
                                  <label className="text-[11px] font-bold text-slate-600">Question Text *</label>
                                  <input
                                    type="text"
                                    required
                                    value={q.text}
                                    onChange={(e) => updateQuestionText(qIndex, e.target.value)}
                                    placeholder="e.g., What is the derivative of x^2?"
                                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-900 transition-all"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold text-slate-600">Points</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={q.points}
                                    onChange={(e) => updateQuestionPoints(qIndex, Number(e.target.value))}
                                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-900 transition-all"
                                  />
                                </div>
                              </div>

                              {/* Question Diagram / Image Upload */}
                              <div className="mb-4 space-y-2">
                                <label className="text-[11px] font-bold text-slate-600">Question Diagram or Image (Optional)</label>
                                
                                {q.imageUrl ? (
                                  <div className="relative border border-slate-200 bg-white p-3 rounded-xl max-w-md group/img overflow-hidden">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-3">
                                        <img 
                                          src={q.imageUrl} 
                                          alt={`Question ${qIndex + 1}`} 
                                          className="h-16 w-16 object-cover rounded-lg border border-slate-100" 
                                        />
                                        <div>
                                          <p className="text-xs font-semibold text-slate-700">Diagram Attached</p>
                                          <p className="text-[10px] text-slate-400">Successfully uploaded</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => document.getElementById(`q-img-input-${qIndex}`)?.click()}
                                          className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                        >
                                          Change
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeQuestionImage(qIndex)}
                                          className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div 
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const files = e.dataTransfer.files;
                                      if (files && files.length > 0) {
                                        const event = { target: { files } } as any;
                                        handleQuestionImageChange(qIndex, event);
                                      }
                                    }}
                                    onClick={() => document.getElementById(`q-img-input-${qIndex}`)?.click()}
                                    className="border border-dashed border-slate-200 hover:border-indigo-400 bg-white/50 hover:bg-indigo-50/10 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all group/drop"
                                  >
                                    {uploadingQuestionImages[qIndex] ? (
                                      <div className="flex flex-col items-center justify-center py-2">
                                        <div className="animate-spin h-5 w-5 border-b-2 border-indigo-600 rounded-full mb-2"></div>
                                        <span className="text-[11px] font-semibold text-slate-500">Uploading Diagram...</span>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center">
                                        <ImageIcon className="text-slate-400 group-hover/drop:text-indigo-500 transition-colors mb-1" size={18} />
                                        <p className="text-[11px] font-semibold text-slate-600 group-hover/drop:text-indigo-900 transition-colors">
                                          Click or drag image/diagram here
                                        </p>
                                        <p className="text-[9px] text-slate-400">PNG, JPG or WebP (displayed directly under question)</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                <input
                                  type="file"
                                  id={`q-img-input-${qIndex}`}
                                  onChange={(e) => handleQuestionImageChange(qIndex, e)}
                                  accept="image/*"
                                  className="hidden"
                                />
                              </div>

                              {/* Answers Options Definition */}
                              {q.type === "multiple-choice" ? (
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-600">Define Options & Select Correct Answer Key</label>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {q.options?.map((opt, oIndex) => (
                                      <div key={oIndex} className="flex items-center space-x-2 bg-white p-2 rounded-lg border border-slate-200">
                                        <input
                                          type="radio"
                                          name={`q-${qIndex}-correct`}
                                          checked={String(q.correctAnswer) === String(oIndex)}
                                          onChange={() => updateQuestionCorrectAnswer(qIndex, String(oIndex))}
                                          className="h-3.5 w-3.5 text-slate-900 border-slate-300 focus:ring-slate-900"
                                        />
                                        <input
                                          type="text"
                                          required
                                          value={opt}
                                          onChange={(e) => updateQuestionOption(qIndex, oIndex, e.target.value)}
                                          className="flex-1 text-xs border-none p-0 focus:ring-0 outline-none"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold text-slate-600">Correct Answer String (Evaluated case-insensitively) *</label>
                                  <input
                                    type="text"
                                    required
                                    value={q.correctAnswer}
                                    onChange={(e) => updateQuestionCorrectAnswer(qIndex, e.target.value)}
                                    placeholder="e.g., Photosynthesis"
                                    className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-slate-900 transition-all"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end space-x-3 pt-6 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setActiveTab("tests")}
                        className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingTest}
                        className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md disabled:bg-slate-400"
                      >
                        {submittingTest ? "Uploading Test..." : "Publish Test permanently"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* EXAM SUBMISSIONS */}
              {activeTab === "submissions" && stats && (
                <motion.div
                  key="submissions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6"
                >
                  <div className="mb-6">
                    <h3 className="text-lg font-display font-bold text-slate-900">Student Exam Papers</h3>
                    <p className="text-xs text-slate-500">Track and review grading logs submitted by students online</p>
                  </div>

                  {stats.submissions.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                      <FileCheck className="mx-auto text-slate-300 mb-3" size={44} />
                      <h4 className="text-sm font-semibold text-slate-700 mb-1">No Submissions Yet</h4>
                      <p className="text-xs text-slate-400">Completed test sheets will automatically be shown here.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-150 bg-slate-50/50">
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Student Name</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Test Assigned</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Submission Date</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Score / Grade</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Parameters</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stats.submissions.map((sub, sIndex) => {
                            const testName = tests.find((t) => t.id === sub.testId)?.title || "Deleted Test";
                            const scorePercentage = Math.round((sub.score / (sub.totalPoints || 1)) * 100);
                            
                            return (
                              <tr key={sIndex} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3 px-4">
                                  <span className="text-xs font-semibold text-slate-800">{sub.nickname}</span>
                                  <span className="block text-[9px] text-slate-400 truncate max-w-[150px]">{sub.studentId}</span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="text-xs font-medium text-slate-700 truncate max-w-[200px] block">{testName}</span>
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-500">
                                  {formatDate(sub.submittedAt)}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                    scorePercentage >= 75
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-150"
                                      : scorePercentage >= 50
                                      ? "bg-amber-50 text-amber-700 border border-amber-150"
                                      : "bg-rose-50 text-rose-700 border border-rose-150"
                                  }`}>
                                    {sub.score}/{sub.totalPoints} ({scorePercentage}%)
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  {sub.autoSubmitted ? (
                                    <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded uppercase">
                                      Auto-Submitted
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded uppercase">
                                      Manual Submit
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    onClick={() => handleViewSubmissionDetails(sub)}
                                    className="text-slate-800 hover:text-slate-950 font-bold hover:bg-slate-100 px-2.5 py-1 rounded-lg text-xs transition-colors flex items-center gap-1 ml-auto cursor-pointer border border-slate-200 shadow-sm"
                                  >
                                    <Eye size={13} />
                                    <span>Review Sheet</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              )}

              {/* USER ACCESS & BLOCKING */}
              {activeTab === "participants" && stats && (
                <motion.div
                  key="participants"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6"
                >
                  <div className="mb-6">
                    <h3 className="text-lg font-display font-bold text-slate-900">User Access Management</h3>
                    <p className="text-xs text-slate-500">Review and control who can access student test sheets</p>
                  </div>

                  {stats.allParticipants.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                      <Users className="mx-auto text-slate-300 mb-3" size={44} />
                      <h4 className="text-sm font-semibold text-slate-700 mb-1">No Students Yet</h4>
                      <p className="text-xs text-slate-400">Student registration occurs automatically when they access the portal.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-150 bg-slate-50/50">
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Student Profile</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Student ID</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">First Joined</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Last Activity</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Aesthetic Label</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Access Controls</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stats.allParticipants.map((p, pIndex) => (
                            <tr key={pIndex} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-4 flex items-center space-x-3">
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                  p.blocked ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-800"
                                }`}>
                                  {p.nickname.substring(0,2).toUpperCase()}
                                </div>
                                <span className="text-xs font-semibold text-slate-800">{p.nickname}</span>
                              </td>
                              <td className="py-3 px-4 text-xs font-mono text-slate-500">
                                {p.id}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-500">
                                {formatDate(p.joinedAt)}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-500">
                                {formatDate(p.lastHeartbeat)}
                              </td>
                              <td className="py-3 px-4">
                                {isWithinLast3Days(p.joinedAt) && (
                                  <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full uppercase">
                                    New (3d)
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  onClick={() => handleToggleBlock(p.id, p.blocked)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ml-auto ${
                                    p.blocked
                                      ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                                      : "bg-rose-50 hover:bg-rose-150 text-rose-700 border-rose-200"
                                  }`}
                                >
                                  {p.blocked ? (
                                    <>
                                      <Unlock size={12} />
                                      <span>Unblock</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock size={12} />
                                      <span>Block Student</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* DETAILED SUBMISSION REVIEW MODAL */}
      <AnimatePresence>
        {selectedSubmissionResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
                <div>
                  <h4 className="text-sm font-display font-bold">Graded Exam Sheet Review</h4>
                  <p className="text-[11px] text-slate-400">
                    Student: <strong className="text-slate-100">{selectedSubmissionResult.submission.nickname}</strong>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSubmissionResult(null)}
                  className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-inner">
                  <div className="text-center border-r border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Raw Score</span>
                    <strong className="text-xl font-display font-bold text-slate-900">
                      {selectedSubmissionResult.submission.score} / {selectedSubmissionResult.submission.totalPoints}
                    </strong>
                  </div>
                  <div className="text-center border-r border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Grade</span>
                    <strong className="text-xl font-display font-bold text-indigo-600">
                      {Math.round((selectedSubmissionResult.submission.score / (selectedSubmissionResult.submission.totalPoints || 1)) * 100)}%
                    </strong>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide block">Submission Type</span>
                    <span className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                      selectedSubmissionResult.submission.autoSubmitted 
                        ? "bg-amber-50 text-amber-700 border border-amber-100" 
                        : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                    }`}>
                      {selectedSubmissionResult.submission.autoSubmitted ? "Auto System" : "Manual User"}
                    </span>
                  </div>
                </div>

                {/* Questions log */}
                <div className="space-y-4">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Marked Questions & Responses</h5>
                  {selectedSubmissionResult.questions.map((q, qIndex) => {
                    const isCorrect = q.isCorrect;
                    
                    return (
                      <div key={q.id} className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="bg-slate-100 text-slate-800 font-bold h-5.5 w-5.5 rounded text-xs flex items-center justify-center">
                              {qIndex + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-800">{q.text}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            isCorrect 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                              : "bg-rose-50 text-rose-700 border border-rose-100"
                          }`}>
                            {isCorrect ? <CheckCircle size={11} /> : <XCircle size={11} />}
                            <span>{isCorrect ? "Correct" : "Incorrect"}</span>
                          </span>
                        </div>

                        {q.imageUrl && (
                          <div className="max-w-max">
                            <img src={q.imageUrl} alt="Diagram" className="h-20 object-contain rounded border border-slate-100" />
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block mb-0.5">Student's Answer:</span>
                            {q.type === "multiple-choice" ? (
                              <strong className="text-slate-800">
                                {q.studentAnswer ? (
                                  <>Option {String.fromCharCode(65 + Number(q.studentAnswer))}: {q.options?.[Number(q.studentAnswer)] || q.studentAnswer}</>
                                ) : (
                                  <span className="text-rose-500 italic">No Answer</span>
                                )}
                              </strong>
                            ) : (
                              <strong className={q.studentAnswer ? "text-slate-800" : "text-rose-500 italic"}>
                                {q.studentAnswer || "No Answer"}
                              </strong>
                            )}

                            {selectedSubmissionResult.submission.answerImages?.[q.id] && (
                              <div className="mt-2 border border-slate-200 bg-white p-1 rounded-lg max-w-max">
                                <img src={selectedSubmissionResult.submission.answerImages[q.id]} alt="Student uploaded solution diagram" className="max-h-24 object-contain rounded" />
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

              {/* Modal Footer */}
              <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setSelectedSubmissionResult(null)}
                  className="bg-slate-900 hover:bg-slate-850 text-white px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer shadow-md transition-colors"
                >
                  Close Review
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
