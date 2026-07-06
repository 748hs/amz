import React, { useState, useEffect } from "react";
import { api, getAdminToken, saveAdminToken } from "./lib/api.js";
import { Test } from "./types.js";
import StudentInterface from "./components/StudentInterface.js";
import AdminPanel from "./components/AdminPanel.js";
import { Lock, LogIn, X, Sparkles, ShieldCheck, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  
  // Login form state
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Global tests list
  const [tests, setTests] = useState<Test[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);

  // Load tests on mount
  useEffect(() => {
    // Check if admin is already logged in
    const token = getAdminToken();
    if (token === "admin-session-token-998877") {
      setIsAdminLoggedIn(true);
    }
    
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      const data = await api.getTests();
      setTests(data);
    } catch (err: any) {
      console.error("Failed to load tests list:", err);
    } finally {
      setLoadingTests(false);
    }
  };

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);

    try {
      const data = await api.adminLogin(adminUsername, adminPassword);
      if (data.success) {
        setIsAdminLoggedIn(true);
        setShowAdminLoginModal(false);
        setAdminUsername("");
        setAdminPassword("");
      } else {
        setLoginError("Invalid Administrator credentials.");
      }
    } catch (err: any) {
      setLoginError(err.message || "Login connection failed.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    saveAdminToken(null);
    setIsAdminLoggedIn(false);
  };

  return (
    <div id="app-root" className="min-h-screen bg-slate-50">
      {/* Dynamic View switching */}
      {isAdminLoggedIn ? (
        <AdminPanel 
          onLogout={handleAdminLogout} 
          tests={tests}
          refreshTests={fetchTests}
        />
      ) : (
        <StudentInterface 
          tests={tests} 
          refreshTests={fetchTests}
          onOpenAdminLogin={() => {
            setLoginError(null);
            setShowAdminLoginModal(true);
          }}
        />
      )}

      {/* Admin Login Modal Overlay */}
      <AnimatePresence>
        {showAdminLoginModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.35 }}
              className="bg-white border border-slate-200 shadow-2xl rounded-3xl p-8 max-w-sm w-full relative space-y-6"
            >
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowAdminLoginModal(false);
                  setAdminUsername("");
                  setAdminPassword("");
                  setLoginError(null);
                }}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-xl transition-colors cursor-pointer"
              >
                ✕
              </button>

              <div className="text-center space-y-2">
                <div className="bg-amber-100 text-amber-800 p-3.5 rounded-2xl max-w-max mx-auto shadow-inner border border-amber-200">
                  <Lock size={22} className="animate-pulse" />
                </div>
                <h3 className="text-xl font-display font-bold text-slate-900 flex items-center justify-center gap-1.5">
                  Coordinator Auth
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Authentication is strictly restricted to platform administrators. Authorized access only.
                </p>
              </div>

              {loginError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs flex items-start gap-2 animate-shake">
                  <AlertCircle size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />
                  <span className="font-medium">{loginError}</span>
                </div>
              )}

              <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Admin Username</label>
                  <input
                    type="text"
                    required
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="Enter coordinator username"
                    className="w-full text-xs px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-semibold text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Secret Passkey</label>
                  <input
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter coordinator password"
                    className="w-full text-xs px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all font-semibold text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loggingIn}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-2xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  {loggingIn ? (
                    <>
                      <div className="animate-spin h-3.5 w-3.5 border-b-2 border-white rounded-full"></div>
                      <span>Verifying Session...</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={13} />
                      <span>Authenticate Access</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
