# 🐇 Talking Rabbitt — AI Analytics MVP

> **"Stop building dashboards. Start having conversations."**

Talking Rabbitt is a conversational AI analytics platform. Upload any CSV, ask questions in plain English, and get instant answers with beautiful visualizations — powered by Google Gemini AI.

---

## 🚀 Live Demo
**[Visit Talking Rabbitt on Vercel](https://rabitt-ai-oa.vercel.app/)**

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API Key
```bash
# Copy the example env file
copy .env.example .env
# Edit .env and add your Google Gemini API key
```

Open `.env` and replace `your_gemini_api_key_here` with your actual key from [aistudio.google.com](https://aistudio.google.com/apikey).

> **No API key?** The app runs in **Demo Mode** — you can still upload CSVs and see charts using the built-in **⚡ Local Analytics Engine**. You can also enter your key directly in the UI (click "Demo API" badge).

### 3. Start the Server
```bash
npm start
```

Open **http://localhost:3001** in your browser.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📂 CSV Upload | Drag-and-drop or click to upload any CSV file |
| ⚡ Local Analytics | Instant NL query results using an internal data engine |
| 🤖 Gemini AI | Advanced reasoning fallback using Google Gemini |
| 📊 Auto-Visualization | Automatic Chart.js charts generated from your data |
| 🔄 Chart Types | Switch between Bar, Line, Pie, Doughnut instantly |
| 💬 Chat History | Full conversation history in the chat panel |
| 📋 Data Preview | Click data card to see full tabular preview |
| ⬇️ Export | Download charts as PNG |
| 🔑 Session API Key | Enter API key in-browser without restarting server |
| ✨ Sample Data | Built-in sample sales dataset to demo instantly |

---

## 🎯 The "Magic Moment"

The MVP demonstrates Talking Rabbitt's core value:

```
User: "Which region had the highest revenue?"
Rabbitt: "The North region led with $351,000 in total revenue, 
          followed by West ($295,500) and South ($299,400)."
          → [Bar chart auto-renders]
```

A 10-minute Excel filter replaced by a 5-second conversation.

---

## 🗂 Project Structure

```
rabbitt-ai/
├── server.js          # Express backend — CSV parse, Gemini proxy
├── package.json
├── .env               # Your API key (not committed)
├── .env.example       # Template
└── public/
    ├── index.html     # 3-panel UI layout
    ├── style.css      # Premium dark-mode design
    └── app.js         # CSV parsing, Local NLP, Chart.js
```

---

## 🌐 Deployment

### Deploy to Render/Railway (Free)
1. Push to GitHub
2. Connect repo to Render/Railway
3. Set `GEMINI_API_KEY` as environment variable
4. Deploy!

### Deploy to Vercel (Frontend-only demo)
The `public/` folder can be deployed as static files to Vercel. 
**Output Directory:** `public`
**Framework Preset:** `Other`

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Recommended | Google Gemini API key |
| `PORT` | Optional | Server port (default: 3001) |

---

## 📋 Sample Questions to Try

- *"Which region had the highest revenue?"*
- *"Show me total sales by product category"*
- *"What is the total units sold for each product?"*
- *"Show me the sales trend from Q1 to Q3"*
- *"Which city had the most sales?"*

---

Made with ❤️ for Rabbitt.AI
