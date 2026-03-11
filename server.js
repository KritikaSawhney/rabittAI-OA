const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup — store uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ── Helper: summarise CSV for LLM context ──────────────────────────────────
function buildCSVContext(records, maxRows = 50) {
  if (!records || records.length === 0) return 'No data available.';
  const headers = Object.keys(records[0]);
  const sample = records.slice(0, maxRows);
  const rows = sample.map(r => headers.map(h => r[h]).join(' | '));
  return `Columns: ${headers.join(', ')}\n\nData (${records.length} total rows, showing first ${sample.length}):\n${headers.join(' | ')}\n${rows.join('\n')}`;
}

// ── Helper: compute basic stats for each column ─────────────────────────────
function computeStats(records) {
  if (!records || records.length === 0) return {};
  const headers = Object.keys(records[0]);
  const stats = {};
  headers.forEach(col => {
    const values = records.map(r => r[col]).filter(v => v !== undefined && v !== '');
    const nums = values.map(v => parseFloat(v)).filter(n => !isNaN(n));
    if (nums.length > 0) {
      stats[col] = {
        type: 'numeric',
        min: Math.min(...nums),
        max: Math.max(...nums),
        sum: nums.reduce((a, b) => a + b, 0),
        avg: nums.reduce((a, b) => a + b, 0) / nums.length,
        count: nums.length
      };
    } else {
      const freq = {};
      values.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      stats[col] = {
        type: 'categorical',
        uniqueCount: sorted.length,
        topValues: sorted.slice(0, 10).map(([k, v]) => ({ value: k, count: v }))
      };
    }
  });
  return stats;
}

// ── Route: Upload CSV ────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const csvText = req.file.buffer.toString('utf-8');
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or has no data rows.' });
    }

    const stats = computeStats(records);
    const headers = Object.keys(records[0]);

    res.json({
      success: true,
      fileName: req.file.originalname,
      rowCount: records.length,
      columnCount: headers.length,
      headers,
      stats,
      preview: records.slice(0, 5),
      // Send full records back to frontend to store in sessionStorage
      records
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: `Failed to parse CSV: ${err.message}` });
  }
});

// ── Route: Ask Question (LLM) ────────────────────────────────────────────────
app.post('/api/query', async (req, res) => {
  try {
    const { question, records, stats, headers } = req.body;

    if (!question || !records) {
      return res.status(400).json({ error: 'Missing question or data.' });
    }

    // Allow session API key from frontend header (overrides .env)
    const sessionKey = req.headers['x-api-key'];
    const effectiveKey = sessionKey || process.env.OPENAI_API_KEY;
    const openaiClient = sessionKey
      ? new OpenAI({ apiKey: sessionKey })
      : openai;

    if (!effectiveKey || effectiveKey === 'your_openai_api_key_here') {
      // Demo mode — return a helpful mock response
      return res.json({
        answer: `[Demo Mode] You asked: "${question}". To get real AI answers, add your OpenAI API key to the .env file. Your data has ${records.length} rows and ${headers.length} columns: ${headers.join(', ')}.`,
        chartSuggestion: null,
        isDemo: true
      });
    }

    const csvContext = buildCSVContext(records);
    const statsStr = JSON.stringify(stats, null, 2);

    const systemPrompt = `You are Talking Rabbitt, an intelligent AI data analyst assistant. You help business users understand their data through natural conversation.

You have access to the following dataset:
${csvContext}

Column Statistics:
${statsStr}

Your job is to:
1. Answer the user's question accurately based on the data above.
2. Provide clear, concise, business-friendly answers (no jargon).
3. When relevant, suggest what type of chart would best visualize the answer.

IMPORTANT: Always respond in this exact JSON format:
{
  "answer": "Your clear, human-readable answer here. Use bullet points or numbered lists when appropriate.",
  "chartSuggestion": {
    "type": "bar|line|pie|doughnut|scatter|null",
    "title": "Chart title",
    "reasoning": "Why this chart type fits",
    "xColumn": "column name for X axis or labels",
    "yColumn": "column name for Y axis or values",
    "groupBy": "optional column to group/aggregate by"
  }
}

If no chart is needed, set chartSuggestion to null.`;

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    let responseText = completion.choices[0].message.content;

    // Parse the JSON response
    let parsed;
    try {
      // Strip markdown code fences if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      // If JSON parse fails, return raw text as answer
      parsed = { answer: responseText, chartSuggestion: null };
    }

    res.json({
      answer: parsed.answer || responseText,
      chartSuggestion: parsed.chartSuggestion || null,
      isDemo: false
    });

  } catch (err) {
    console.error('Query error:', err);
    if (err.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key. Check your .env file.' });
    }
    res.status(500).json({ error: `LLM query failed: ${err.message}` });
  }
});

// ── Route: Auto-generate visualization suggestion ────────────────────────────
app.post('/api/suggest-chart', async (req, res) => {
  try {
    const { headers, stats, records } = req.body;
    if (!headers || !stats) return res.status(400).json({ error: 'Missing data' });

    const numericCols = Object.entries(stats).filter(([, v]) => v.type === 'numeric').map(([k]) => k);
    const catCols = Object.entries(stats).filter(([, v]) => v.type === 'categorical').map(([k]) => k);

    // Auto-suggest a default chart
    let suggestion = null;
    if (catCols.length > 0 && numericCols.length > 0) {
      // Best default: bar chart with top categorical column + first numeric
      const catCol = catCols[0];
      const numCol = numericCols[0];

      // Aggregate data
      const agg = {};
      records.forEach(row => {
        const key = row[catCol] || 'Unknown';
        const val = parseFloat(row[numCol]) || 0;
        agg[key] = (agg[key] || 0) + val;
      });

      const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 10);
      suggestion = {
        type: 'bar',
        title: `${numCol} by ${catCol}`,
        xColumn: catCol,
        yColumn: numCol,
        data: {
          labels: sorted.map(([k]) => k),
          values: sorted.map(([, v]) => Math.round(v * 100) / 100)
        }
      };
    } else if (numericCols.length >= 2) {
      suggestion = {
        type: 'scatter',
        title: `${numericCols[0]} vs ${numericCols[1]}`,
        xColumn: numericCols[0],
        yColumn: numericCols[1],
        data: {
          labels: records.slice(0, 100).map((r, i) => `Row ${i + 1}`),
          values: records.slice(0, 100).map(r => ({
            x: parseFloat(r[numericCols[0]]) || 0,
            y: parseFloat(r[numericCols[1]]) || 0
          }))
        }
      };
    }

    res.json({ suggestion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🐇 Talking Rabbitt MVP running at http://localhost:${PORT}\n`);
});
