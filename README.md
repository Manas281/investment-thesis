cd D:\investment-thesis
@"
# PitchDeck AI - Investment Thesis Generator

## Overview
An AI-powered web application that analyzes startup pitch decks (PPT/PPTX) and generates professional investment thesis reports. The system evaluates pitch decks across 9 categories using Groq's LLM and produces downloadable PDF reports.

## Features
- User authentication (Email/Password + Google OAuth + LinkedIn OAuth)
- PPT/PPTX file upload (5-20 slides, max 50MB)
- AI-powered analysis across 9 investment categories
- Weighted scoring system (0-100 scale)
- Professional PDF report generation
- Report history dashboard
- Email notifications
- Progress tracking during analysis
- Rate limiting (5 uploads per hour)
- OCR support for image-based slides

## Tech Stack
- **Frontend**: React.js 18
- **Backend**: Node.js + Express.js
- **AI/LLM**: Groq (Llama 3.1 8B)
- **Database**: PostgreSQL (Neon)
- **Storage**: AWS S3
- **OCR**: Tesseract
- **PDF Generation**: ReportLab (Python)
- **Authentication**: JWT, Passport.js (Google OAuth, LinkedIn OAuth)

## Evaluation Categories

| Category | Weight | Criteria |
|----------|--------|----------|
| Problem Statement | 10% | Clarity, customer pain evidence, scope |
| Solution/Product | 15% | Feasibility, innovation, alignment |
| Market Opportunity | 20% | TAM/SAM/SOM clarity, realism, data |
| Business Model | 15% | Revenue streams, scalability, pricing |
| Competitive Landscape | 10% | Competitor analysis, UVP strength |
| Team | 15% | Experience, completeness, track record |
| Traction/Milestones | 10% | Metrics, progress, achievements |
| Financial Projections | 10% | Forecasts, assumptions, realism |
| Clarity and Presentation | 5% | Flow, design, professionalism |

## Prerequisites

- Node.js (v20+)
- Python (3.11+)
- PostgreSQL database (Neon or local)
- AWS S3 bucket
- Groq API key
- Google OAuth credentials
- LinkedIn OAuth credentials (optional)

## Installation

### 1. Clone the repository
`bash
git clone https://github.com/Manas281/investment-thesis.git
cd investment-thesis
`

### 2. Backend Setup
`bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npm start
`

### 3. Frontend Setup
`bash
cd ../frontend
npm install
npm start
`

### 4. Python Service Setup
`bash
cd ../python-service
pip install -r requirements.txt
python app.py
`

### 5. Access the Application
Open your browser and go to: http://localhost:3000

## Environment Variables

Create a `.env` file in the backend folder:

`env
# AWS Configuration
AWS_REGION=your-region
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_BUCKET_NAME=your-bucket-name

# Database Configuration (Neon PostgreSQL)
DATABASE_URL=postgresql://username:password@host/database

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret

# Email Configuration (Gmail App Password)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-digit-app-password

# Groq AI API
GROQ_API_KEY=your-groq-api-key
`

## Database Setup (Neon PostgreSQL)

1. Create a free account at https://neon.tech
2. Create a new project
3. Get your connection string
4. Run the following SQL in the Neon SQL Editor:

`sql
-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  google_id TEXT UNIQUE,
  linkedin_id TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create reports table
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  startup_name TEXT,
  recommendation TEXT,
  overall_score INTEGER,
  confidence_score INTEGER,
  report_data JSONB,
  filename TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_users_email ON users(email);
`

## Running the Application

You need three terminals running simultaneously:

**Terminal 1 - Python Service:**
`bash
cd python-service
python app.py
`

**Terminal 2 - Backend:**
`bash
cd backend
node server.js
`

**Terminal 3 - Frontend:**
`bash
cd frontend
npm start
`

## Project Structure

```
investment-thesis/
├── frontend/                 # React application
│   ├── src/
│   │   ├── App.js           # Main React component
│   │   └── index.js         # Entry point
│   ├── public/              # Static files
│   └── package.json
├── backend/                  # Node.js backend
│   ├── server.js            # Express server
│   ├── package.json
│   └── .env                 # Environment variables (not committed)
├── python-service/           # Python microservice
│   ├── app.py               # Flask + Groq + PDF
│   └── requirements.txt     # Python dependencies
└── README.md
```

## Usage Guide

1. **Register/Login**
   - Click "Register" to create a new account
   - Or click "Sign in with Google" for quick access

2. **Upload Pitch Deck**
   - Click "Choose File" and select your PPT/PPTX file
   - File must be between 5-20 slides
   - Maximum file size: 50MB

3. **View Analysis**
   - Watch the progress bar during upload and analysis
   - AI analyzes across 9 categories (30-60 seconds)
   - View overall score and category-wise scores

4. **Download Report**
   - Click "Download PDF Report" to save the investment thesis
   - Report includes recommendations, scores, and feedback

5. **View History**
   - Click "History" tab to see all previous analyses
   - Download any previous report

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /register | Create new user account |
| POST | /login | Login with email/password |
| GET | /auth/google | Google OAuth login |
| GET | /auth/linkedin | LinkedIn OAuth login |
| POST | /upload | Upload PPT/PPTX file |
| POST | /analyze | Analyze extracted slides |
| POST | /generate-pdf | Generate PDF report |
| GET | /reports | Get user's report history |
| POST | /send-email | Send email notification |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Analysis service unavailable | Ensure Python service is running on port 5001 |
| Database connection failed | Check DATABASE_URL in .env file |
| AWS upload fails | Verify AWS credentials and bucket permissions |
| Email not sent | Use Gmail App Password, not regular password |
| Module not found | Run `npm install` in both backend and frontend |
| Port already in use | Change port or kill process using the port |

## Security Features

- JWT tokens for authentication (24-hour expiry)
- Passwords hashed using bcrypt
- Environment variables for sensitive data
- .gitignore prevents committing .env files
- Rate limiting on uploads (5 per hour)

## Expected Output

The generated PDF report includes:
- Investment Recommendation (Strong Buy/Hold/Pass)
- Overall Score (0-100)
- Category-wise scores (0-10) with feedback (50-150 words)
- Strengths and weaknesses analysis (3-5 each)
- Actionable recommendations (100-200 words)
- Confidence score (0-100)

## Project Completion Status

| Feature | Status |
|---------|--------|
| User Registration | Complete |
| Email/Password Login | Complete |
| Google OAuth Login | Complete |
| LinkedIn OAuth Login | Complete |
| PPT Upload (5-20 slides) | Complete |
| File Size Validation (50MB) | Complete |
| Slide Type Detection | Complete |
| AI Analysis (9 Categories) | Complete |
| Weighted Scoring | Complete |
| PDF Report Generation | Complete |
| Report History Dashboard | Complete |
| Email Notifications | Complete |
| Progress Bar | Complete |
| Rate Limiting | Complete |
| OCR for Images | Complete |

## Time Taken
- Development: 40 hours
- Testing: 10 hours

## Acknowledgments
- Groq for LLM API
- Neon for PostgreSQL hosting
- AWS for cloud storage

## GitHub Repository
https://github.com/Manas281/investment-thesis

## Demo Video
[Link to your demo video]

## Submission Details
- **Project**: Automated Investment Thesis Generator
- **Internship**: KaroStartup
- **Date**: April 22, 2025
"@ | Out-File -FilePath README.md -Encoding utf8