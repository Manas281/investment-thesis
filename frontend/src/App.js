import { useState, useEffect } from "react";
import axios from "axios";

function App() {
  const [page, setPage] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(null);
  const [userName, setUserName] = useState("");

  const [file, setFile] = useState(null);
  const [slides, setSlides] = useState([]);
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState("");
  const [reports, setReports] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // ================= CHECK FOR OAUTH TOKEN IN URL =================
  useEffect(() => {
    // Check URL for token from OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const emailFromUrl = urlParams.get('email');
    
    if (tokenFromUrl && emailFromUrl) {
      // Save OAuth token
      localStorage.setItem("token", tokenFromUrl);
      localStorage.setItem("userEmail", emailFromUrl);
      setToken(tokenFromUrl);
      setUserName(emailFromUrl.split("@")[0]);
      setPage("dashboard");
      fetchReportHistory(tokenFromUrl);
      
      // Clean URL (remove token from address bar)
      window.history.replaceState({}, document.title, "/");
    } else {
      // Check for existing token in localStorage
      const savedToken = localStorage.getItem("token");
      const savedEmail = localStorage.getItem("userEmail");
      if (savedToken) {
        setToken(savedToken);
        setUserName(savedEmail?.split("@")[0] || "User");
        setPage("dashboard");
        fetchReportHistory(savedToken);
      }
    }
  }, []);

  const fetchReportHistory = async (authToken) => {
    try {
      const res = await axios.get("http://localhost:5000/reports", {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      setReports(res.data.reports || []);
    } catch (err) {
      console.error("Failed to fetch reports", err);
      setReports([]);
    }
  };

  // ================= LOGIN =================
  const handleLogin = async () => {
    try {
      const res = await axios.post("http://localhost:5000/login", {
        email,
        password
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userEmail", email);
      setToken(res.data.token);
      setUserName(email.split("@")[0]);
      setPage("dashboard");
      fetchReportHistory(res.data.token);
    } catch (err) {
      alert(err.response?.data?.error || "Login failed");
    }
  };

  // ================= GOOGLE LOGIN =================
  const handleGoogleLogin = () => {
    window.location.href = "http://localhost:5000/auth/google";
  };

  // ================= LINKEDIN LOGIN =================
  const handleLinkedinLogin = () => {
    window.location.href = "http://localhost:5000/auth/linkedin";
  };

  // ================= REGISTER =================
  const handleRegister = async () => {
    try {
      await axios.post("http://localhost:5000/register", {
        email,
        password
      });

      alert("Registered successfully! Please login.");
      setPage("login");
    } catch (err) {
      alert(err.response?.data?.error || "Registration failed");
    }
  };

  // ================= UPLOAD WITH PROGRESS =================
  const handleUpload = async () => {
    if (!file) return alert("Select file");

    if (!file.name.endsWith(".ppt") && !file.name.endsWith(".pptx")) {
      return alert("Only PPT/PPTX files allowed");
    }

    if (file.size > 50 * 1024 * 1024) {
      return alert("File size must be less than 50MB");
    }

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setUploadProgress(0);
    setAnalysisStage("Uploading file...");

    try {
      const res = await axios.post("http://localhost:5000/upload", formData, {
        headers: { Authorization: `Bearer ${token}` },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      setSlides(res.data.slides || []);
      setAnalysisStage("File uploaded! Starting analysis...");
      
      // Auto-analyze after upload
      await analyzeSlides(res.data.slides);
      
    } catch (err) {
      alert(err.response?.data?.error || "Upload failed");
      setLoading(false);
      setUploadProgress(0);
    }
  };

  // ================= ANALYZE =================
  const analyzeSlides = async (slidesData = null) => {
    setAnalysisStage("AI analyzing your pitch deck...");
    setUploadProgress(50);

    try {
      const res = await axios.post(
        "http://localhost:5000/analyze",
        { slides: slidesData || slides },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAiResult(res.data);
      setAnalysisStage("Analysis complete! Generating report...");
      setUploadProgress(100);
      
      // Refresh report history
      fetchReportHistory(token);
      
      // Send email notification
      try {
        await axios.post("http://localhost:5000/send-email", 
          { reportData: res.data },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (emailErr) {
        console.error("Email notification failed:", emailErr);
        // Don't show alert for email failure
      }
      
    } catch (err) {
      alert("Analysis failed: " + (err.response?.data?.error || err.message));
    } finally {
      setTimeout(() => {
        setLoading(false);
        setUploadProgress(0);
        setAnalysisStage("");
      }, 1000);
    }
  };

  // ================= PDF =================
  const downloadPDF = async (reportData = null, customFilename = null) => {
    try {
      const dataToSend = reportData || aiResult;
      if (!dataToSend) {
        alert("No report data available");
        return;
      }
      
      const res = await axios.post(
        "http://localhost:5000/generate-pdf",
        dataToSend,
        {
          responseType: "blob",
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      const filename = customFilename || `Investment_Thesis_${dataToSend.startup_name || "Startup"}_${new Date().toISOString().slice(0,10).replace(/-/g, "")}.pdf`;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("PDF download failed: " + (err.response?.data?.error || err.message));
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    setToken(null);
    setUserName("");
    setAiResult(null);
    setSlides([]);
    setReports([]);
    setPage("login");
  };

  // ================= UI =================

  if (!token && page === "login") {
    return (
      <div style={styles.authContainer}>
        <div style={styles.card}>
          <h1 style={styles.title}>PitchDeck AI</h1>
          <h2>Login</h2>

          <input
            style={styles.input}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button style={styles.button} onClick={handleLogin}>
            Login
          </button>

          <div style={styles.divider}>OR</div>

          <button style={{...styles.button, background: "#DB4437"}} onClick={handleGoogleLogin}>
            Sign in with Google
          </button>

          <button style={{...styles.button, background: "#0077B5", marginTop: "10px"}} onClick={handleLinkedinLogin}>
            Sign in with LinkedIn
          </button>

          <p onClick={() => setPage("register")} style={styles.link}>
            New user? Register
          </p>
        </div>
      </div>
    );
  }

  if (page === "register") {
    return (
      <div style={styles.authContainer}>
        <div style={styles.card}>
          <h1 style={styles.title}>PitchDeck AI</h1>
          <h2>Register</h2>

          <input
            style={styles.input}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button style={styles.button} onClick={handleRegister}>
            Register
          </button>

          <p onClick={() => setPage("login")} style={styles.link}>
            Already have account? Login
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>PitchDeck AI</h1>
        <div>
          <span style={styles.userName}>Welcome, {userName}!</span>
          <button onClick={logout} style={styles.logout}>Logout</button>
        </div>
      </div>

      <div style={styles.tabs}>
        <button 
          style={{...styles.tabButton, background: !showHistory ? "#238636" : "#161b22"}}
          onClick={() => setShowHistory(false)}
        >
          New Analysis
        </button>
        <button 
          style={{...styles.tabButton, background: showHistory ? "#238636" : "#161b22"}}
          onClick={() => setShowHistory(true)}
        >
          History ({reports.length})
        </button>
      </div>

      {!showHistory ? (
        <>
          <div style={styles.uploadArea}>
            <input
              style={styles.input}
              type="file"
              accept=".ppt,.pptx"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <button style={styles.button} onClick={handleUpload} disabled={loading}>
              Upload PPT
            </button>
          </div>

          {loading && (
            <div style={styles.progressContainer}>
              <div style={styles.progressBar}>
                <div style={{...styles.progressFill, width: `${uploadProgress}%`}}></div>
              </div>
              <p style={styles.progressText}>{analysisStage} ({uploadProgress}%)</p>
            </div>
          )}

          {slides.length > 0 && !loading && (
            <>
              <h3>Slides Extracted ({slides.length} slides)</h3>
              <div style={styles.slideBox}>
                {slides.slice(0, 5).map((s, i) => (
                  <p key={i}><strong>Slide {i+1}:</strong> {s.substring(0, 100)}...</p>
                ))}
                {slides.length > 5 && <p>...and {slides.length - 5} more slides</p>}
              </div>
            </>
          )}

          {aiResult && (
            <div style={styles.resultBox}>
              <h2>{aiResult.startup_name || "Unknown Startup"}</h2>
              <div style={styles.scoreCard}>
                <div>
                  <h3>Overall Score</h3>
                  <div style={styles.bigScore}>{aiResult.overall_score || 0}/100</div>
                </div>
                <div>
                  <h3>Recommendation</h3>
                  <div style={{
                    ...styles.recommendation,
                    background: aiResult.recommendation === "Strong Buy" ? "#238636" : 
                               aiResult.recommendation === "Hold" ? "#e3b341" : "#da3633"
                  }}>
                    {aiResult.recommendation || "N/A"}
                  </div>
                </div>
                <div>
                  <h3>Confidence</h3>
                  <div style={styles.confidence}>{aiResult.confidence_score || 0}%</div>
                </div>
              </div>

              <h3>Category Analysis</h3>
              {aiResult.categories && Object.entries(aiResult.categories).map(([key, val]) => (
                <div key={key} style={styles.categoryItem}>
                  <div style={styles.categoryHeader}>
                    <strong>{key}</strong>
                    <span>Score: {val?.score || 0}/10 | Weight: {aiResult.weights?.[key] || 0}%</span>
                  </div>
                  <div style={styles.categoryFeedback}>{val?.feedback || "No feedback available"}</div>
                </div>
              ))}

              <div style={styles.strengthsWeaknesses}>
                <div style={styles.strengths}>
                  <h3>Strengths</h3>
                  <ul>
                    {(aiResult.strengths || []).map((s, i) => <li key={i}>{s}</li>)}
                    {(!aiResult.strengths || aiResult.strengths.length === 0) && <li>No strengths identified</li>}
                  </ul>
                </div>
                <div style={styles.weaknesses}>
                  <h3>Weaknesses</h3>
                  <ul>
                    {(aiResult.weaknesses || []).map((w, i) => <li key={i}>{w}</li>)}
                    {(!aiResult.weaknesses || aiResult.weaknesses.length === 0) && <li>No weaknesses identified</li>}
                  </ul>
                </div>
              </div>

              <div style={styles.recommendationsBox}>
                <h3>Recommendations</h3>
                <p>{aiResult.recommendations || "No recommendations available"}</p>
              </div>

              <button style={styles.button} onClick={() => downloadPDF()}>
                Download PDF Report
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={styles.historyContainer}>
          <h2>Your Analysis History</h2>
          {reports.length === 0 ? (
            <p>No reports yet. Upload your first pitch deck!</p>
          ) : (
            reports.map((report, idx) => (
              <div key={idx} style={styles.historyItem}>
                <div>
                  <strong>{report.startup_name || "Unknown"}</strong>
                  <span style={styles.historyDate}>{new Date(report.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span style={styles.historyScore}>Score: {report.overall_score || 0}/100</span>
                  <span style={{
                    ...styles.historyRecommendation,
                    background: report.recommendation === "Strong Buy" ? "#238636" : 
                               report.recommendation === "Hold" ? "#e3b341" : "#da3633"
                  }}>
                    {report.recommendation || "N/A"}
                  </span>
                  <button 
                    style={styles.historyButton}
                    onClick={() => downloadPDF(report.report_data, report.filename)}
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default App;

const styles = {
  authContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    background: "#0d1117"
  },
  card: {
    background: "#161b22",
    padding: "30px",
    borderRadius: "10px",
    width: "350px",
    textAlign: "center",
    color: "white",
    boxShadow: "0 0 20px rgba(0,0,0,0.5)"
  },
  title: {
    marginBottom: "10px"
  },
  input: {
    width: "100%",
    padding: "10px",
    margin: "10px 0",
    borderRadius: "5px",
    border: "none",
    fontSize: "14px"
  },
  button: {
    width: "100%",
    padding: "10px",
    background: "#238636",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold"
  },
  link: {
    color: "#58a6ff",
    cursor: "pointer",
    marginTop: "10px"
  },
  divider: {
    margin: "15px 0",
    color: "#8b949e",
    fontSize: "12px"
  },
  container: {
    padding: "20px",
    background: "#0d1117",
    color: "white",
    minHeight: "100vh"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    paddingBottom: "10px",
    borderBottom: "1px solid #30363d"
  },
  userName: {
    marginRight: "15px",
    color: "#8b949e"
  },
  logout: {
    background: "red",
    color: "white",
    border: "none",
    padding: "5px 15px",
    borderRadius: "5px",
    cursor: "pointer"
  },
  tabs: {
    display: "flex",
    gap: "10px",
    marginBottom: "20px"
  },
  tabButton: {
    padding: "8px 20px",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    color: "white"
  },
  uploadArea: {
    background: "#161b22",
    padding: "20px",
    borderRadius: "10px",
    marginBottom: "20px"
  },
  progressContainer: {
    background: "#161b22",
    padding: "15px",
    borderRadius: "5px",
    margin: "15px 0"
  },
  progressBar: {
    width: "100%",
    height: "20px",
    background: "#30363d",
    borderRadius: "10px",
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    background: "#238636",
    transition: "width 0.3s ease",
    borderRadius: "10px"
  },
  progressText: {
    marginTop: "10px",
    textAlign: "center",
    color: "#8b949e"
  },
  slideBox: {
    background: "#161b22",
    padding: "15px",
    marginTop: "15px",
    borderRadius: "5px",
    maxHeight: "200px",
    overflowY: "auto"
  },
  resultBox: {
    marginTop: "20px",
    padding: "20px",
    background: "#161b22",
    borderRadius: "10px"
  },
  scoreCard: {
    display: "flex",
    justifyContent: "space-around",
    margin: "20px 0",
    padding: "15px",
    background: "#0d1117",
    borderRadius: "10px"
  },
  bigScore: {
    fontSize: "36px",
    fontWeight: "bold",
    color: "#58a6ff"
  },
  recommendation: {
    padding: "5px 15px",
    borderRadius: "5px",
    fontWeight: "bold",
    fontSize: "18px"
  },
  confidence: {
    fontSize: "24px",
    fontWeight: "bold"
  },
  categoryItem: {
    margin: "15px 0",
    padding: "10px",
    background: "#0d1117",
    borderRadius: "5px"
  },
  categoryHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "10px"
  },
  categoryFeedback: {
    fontSize: "14px",
    lineHeight: "1.6"
  },
  strengthsWeaknesses: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    margin: "20px 0"
  },
  strengths: {
    background: "#0d1117",
    padding: "15px",
    borderRadius: "5px"
  },
  weaknesses: {
    background: "#0d1117",
    padding: "15px",
    borderRadius: "5px"
  },
  recommendationsBox: {
    background: "#0d1117",
    padding: "15px",
    borderRadius: "5px",
    margin: "20px 0"
  },
  historyContainer: {
    background: "#161b22",
    padding: "20px",
    borderRadius: "10px"
  },
  historyItem: {
    background: "#0d1117",
    padding: "15px",
    margin: "10px 0",
    borderRadius: "5px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px"
  },
  historyDate: {
    fontSize: "12px",
    color: "#8b949e",
    marginLeft: "10px"
  },
  historyScore: {
    marginRight: "15px",
    fontWeight: "bold"
  },
  historyRecommendation: {
    padding: "2px 10px",
    borderRadius: "3px",
    fontSize: "12px",
    marginRight: "10px"
  },
  historyButton: {
    background: "#238636",
    border: "none",
    padding: "5px 10px",
    borderRadius: "3px",
    cursor: "pointer",
    color: "white"
  }
};