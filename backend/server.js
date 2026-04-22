require("dotenv").config();

const express = require("express");
const multer = require("multer");
const multerS3 = require("multer-s3");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");

const {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();

app.use(cors());
app.use(express.json());
app.use(session({
  secret: "sessionsecretkey",
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

const SECRET = "supersecretkey";

// ================= EMAIL SETUP =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ================= RATE LIMIT =================
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Upload limit exceeded (5 per hour)"
});

// ================= S3 =================
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// ================= POSTGRES =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create tables if not exists
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        google_id VARCHAR(255),
        linkedin_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        startup_name VARCHAR(255),
        overall_score INTEGER,
        recommendation VARCHAR(50),
        confidence_score INTEGER,
        report_data JSONB,
        filename VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Database tables ready");
  } catch (err) {
    console.error("Database init error:", err);
  }
};
initDB();

// ================= PASSPORT SERIALIZATION =================
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// ================= GOOGLE OAUTH =================
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "http://localhost:5000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await pool.query("SELECT * FROM users WHERE google_id = $1", [profile.id]);
    
    if (user.rows.length === 0) {
      const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [profile.emails[0].value]);
      
      if (existingUser.rows.length > 0) {
        user = await pool.query(
          "UPDATE users SET google_id = $1 WHERE email = $2 RETURNING *",
          [profile.id, profile.emails[0].value]
        );
      } else {
        user = await pool.query(
          "INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING *",
          [profile.emails[0].value, profile.id]
        );
      }
    }
    
    return done(null, user.rows[0]);
  } catch (err) {
    console.error("Google OAuth error:", err);
    return done(err, null);
  }
}));

// ================= LINKEDIN OAUTH (MANUAL IMPLEMENTATION) =================

// Helper function to exchange authorization code for access token
const getLinkedInAccessToken = async (code) => {
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('client_id', process.env.LINKEDIN_CLIENT_ID);
  params.append('client_secret', process.env.LINKEDIN_CLIENT_SECRET);
  params.append('redirect_uri', 'http://localhost:5000/auth/linkedin/callback');

  const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', 
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  
  return response.data;
};

// Helper function to fetch user info using access token
const getLinkedInUserInfo = async (accessToken) => {
  const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  return response.data;
};

// LinkedIn OAuth route - Redirect to LinkedIn authorization page
app.get("/auth/linkedin", (req, res) => {
  const state = Math.random().toString(36).substring(7);
  req.session.linkedinState = state;
  
  const authUrl = 'https://www.linkedin.com/oauth/v2/authorization?' + 
    new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID,
      redirect_uri: 'http://localhost:5000/auth/linkedin/callback',
      scope: 'openid profile email',
      state: state
    });
  
  res.redirect(authUrl);
});

// LinkedIn OAuth callback - Exchange code for user info
app.get("/auth/linkedin/callback", async (req, res) => {
  const { code, state, error } = req.query;
  
  // Verify state to prevent CSRF attacks
  if (state !== req.session.linkedinState) {
    console.error('State mismatch - possible CSRF attack');
    return res.redirect('http://localhost:3000/login?error=auth_failed');
  }
  
  if (error) {
    console.error('LinkedIn auth error:', error);
    return res.redirect('http://localhost:3000/login?error=' + error);
  }
  
  if (!code) {
    console.error('No authorization code received');
    return res.redirect('http://localhost:3000/login?error=no_code');
  }
  
  try {
    // Step 1: Exchange code for access token
    const tokenData = await getLinkedInAccessToken(code);
    const accessToken = tokenData.access_token;
    
    // Step 2: Fetch user info using access token
    const userInfo = await getLinkedInUserInfo(accessToken);
    
    console.log('LinkedIn user info received:', userInfo.email);
    
    const email = userInfo.email;
    const linkedinId = userInfo.sub;
    
    if (!email) {
      console.error('No email in LinkedIn response:', userInfo);
      return res.redirect('http://localhost:3000/login?error=no_email');
    }
    
    // Step 3: Find or create user in database
    let user = await pool.query("SELECT * FROM users WHERE linkedin_id = $1", [linkedinId]);
    
    if (user.rows.length === 0) {
      // Check if user exists with same email
      const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      
      if (existingUser.rows.length > 0) {
        // Update existing user with linkedin_id
        user = await pool.query(
          "UPDATE users SET linkedin_id = $1 WHERE email = $2 RETURNING *",
          [linkedinId, email]
        );
        console.log("Updated existing user with LinkedIn ID:", email);
      } else {
        // Create new user
        user = await pool.query(
          "INSERT INTO users (email, linkedin_id) VALUES ($1, $2) RETURNING *",
          [email, linkedinId]
        );
        console.log("Created new user from LinkedIn:", email);
      }
    } else {
      console.log("Existing LinkedIn user found:", email);
    }
    
    // Step 4: Generate JWT token and redirect to frontend
    const token = jwt.sign(
      { email: user.rows[0].email, id: user.rows[0].id }, 
      SECRET, 
      { expiresIn: "24h" }
    );
    
    res.redirect(`http://localhost:3000?token=${token}&email=${email}`);
    
  } catch (err) {
    console.error("LinkedIn OAuth error:", err.response?.data || err.message);
    res.redirect('http://localhost:3000/login?error=linkedin_auth_failed');
  }
});

// ================= OAUTH ROUTES =================
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "http://localhost:3000/login" }), (req, res) => {
  const token = jwt.sign({ email: req.user.email, id: req.user.id }, SECRET, { expiresIn: "24h" });
  res.redirect(`http://localhost:3000?token=${token}&email=${req.user.email}`);
});

// ================= REGISTER =================
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2)",
      [email, hashed]
    );

    res.json({ message: "User registered" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);

    if (result.rows.length === 0)
      return res.status(400).json({ error: "User not found" });

    const user = result.rows[0];

    if (!user.password) {
      return res.status(400).json({ 
        error: "This account uses Google/LinkedIn login. Please sign in with the appropriate provider." 
      });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid)
      return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign({ email: user.email, id: user.id }, SECRET, { expiresIn: "24h" });

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login error" });
  }
});

// ================= AUTH MIDDLEWARE =================
const auth = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) return res.status(401).json({ error: "No token" });

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

// ================= FILE VALIDATION =================
const fileFilter = (req, file, cb) => {
  const allowed = [
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ];

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only PPT/PPTX allowed"), false);
  }

  cb(null, true);
};

// ================= S3 UPLOAD =================
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      cb(null, `uploads/${Date.now()}_${file.originalname}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter
});

// ================= GET USER ID FROM EMAIL =================
const getUserId = async (email) => {
  const result = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  return result.rows[0]?.id;
};

// ================= SAVE REPORT =================
const saveReport = async (userId, reportData) => {
  const filename = `Investment_Thesis_${reportData.startup_name || "Startup"}_${new Date().toISOString().slice(0,10).replace(/-/g, "")}.pdf`;
  
  await pool.query(
    `INSERT INTO reports (user_id, startup_name, overall_score, recommendation, confidence_score, report_data, filename)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, reportData.startup_name, reportData.overall_score, reportData.recommendation, reportData.confidence_score, JSON.stringify(reportData), filename]
  );
};

// ================= GET USER REPORTS =================
app.get("/reports", auth, async (req, res) => {
  try {
    const userId = await getUserId(req.user.email);
    const result = await pool.query(
      "SELECT * FROM reports WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= SEND EMAIL =================
app.post("/send-email", auth, async (req, res) => {
  try {
    const { reportData } = req.body;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: req.user.email,
      subject: `Investment Thesis Report - ${reportData.startup_name || "Startup"}`,
      html: `
        <h2>Your Investment Thesis Report is Ready!</h2>
        <p><strong>Startup:</strong> ${reportData.startup_name || "N/A"}</p>
        <p><strong>Recommendation:</strong> ${reportData.recommendation || "N/A"}</p>
        <p><strong>Overall Score:</strong> ${reportData.overall_score || 0}/100</p>
        <p><strong>Confidence Score:</strong> ${reportData.confidence_score || 0}%</p>
        <p>Login to your dashboard to download the full PDF report.</p>
        <br>
        <p>Best regards,<br>PitchDeck AI Team</p>
      `
    };
    
    await transporter.sendMail(mailOptions);
    res.json({ message: "Email sent" });
  } catch (err) {
    console.error("Email error:", err);
    res.json({ message: "Report generated but email notification failed" });
  }
});

// ================= UPLOAD =================
app.post("/upload", auth, uploadLimiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Invalid file" });
    }

    const fileKey = req.file.key;

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileKey
    });

    const signedUrl = await getSignedUrl(s3, command, {
      expiresIn: 3600
    });

    try {
      const response = await axios.post("http://localhost:5001/extract", {
        filePath: signedUrl
      }, { timeout: 30000 });

      setTimeout(async () => {
        try {
          await s3.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileKey
          }));
        } catch (err) {
          console.error("S3 delete error:", err);
        }
      }, 24 * 60 * 60 * 1000);

      res.json(response.data);
    } catch (err) {
      console.error("Python service error:", err.message);
      res.status(503).json({ error: "Analysis service unavailable. Please ensure Python service is running on port 5001." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= ANALYZE =================
app.post("/analyze", auth, async (req, res) => {
  try {
    const response = await axios.post("http://localhost:5001/analyze", {
      slides: req.body.slides
    }, { timeout: 120000 });

    const userId = await getUserId(req.user.email);
    await saveReport(userId, response.data);

    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Analysis failed: " + (err.response?.data?.error || err.message) });
  }
});

// ================= PDF =================
app.post("/generate-pdf", auth, async (req, res) => {
  try {
    const response = await axios.post(
      "http://localhost:5001/generate-pdf",
      req.body,
      { responseType: "arraybuffer", timeout: 30000 }
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Investment_Thesis_${req.body.startup_name || "Startup"}_${new Date().toISOString().slice(0,10).replace(/-/g, "")}.pdf`
    });

    res.send(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PDF generation failed: " + (err.response?.data?.error || err.message) });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));