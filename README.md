# VoxBill — AI Voice Billing System

A full-stack restaurant management and billing platform
with AI-powered voice ordering. Staff speak orders into 
the browser. Managers get real-time notifications,
analytics, and complete billing control.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Frontend Server | Node.js, Express 4 |
| Backend API | Node.js, Express 4, MongoDB |
| Authentication | JWT, bcryptjs |
| AI / NLP | Python, Flask, difflib |
| Voice Input | Web Speech API |
| Real-time | Server-Sent Events (SSE) |
| PDF | jsPDF |
| Charts | Chart.js |

## Project Structure

voxbill/
├── backend/          Express REST API (port 4000)
├── frontend/         Static server + proxy (port 3000)
│   └── public/
│       ├── pages/    HTML pages
│       ├── js/       JavaScript files
│       └── css/      Stylesheets
├── ai_service/       Python Flask NLP (port 5000)
├── scripts/          Developer utilities
├── .env.example      Copy this to backend/.env
└── package.json      Run everything from here

## Setup

1. Copy environment config:
   Copy .env.example to backend/.env
   Fill in your MongoDB URI and JWT secret

2. Install dependencies:
   npm run install:all
   pip install -r ai_service/requirements.txt

3. Start everything:
   npm start

4. Open browser:
   http://localhost:3000

## First Time

1. Click Manager tab and Register
2. Go to Settings and generate a Staff PIN
3. Share the PIN with your waiters
4. Go to Menu and add your menu items
5. Go to Tables and start taking orders
