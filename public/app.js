/* ─────────────────────────────────────────────────────────────────────────────
   Talking Rabbitt — App Logic
   Handles: CSV upload, Papa-parse, LLM queries, Chart.js visualizations
───────────────────────────────────────────────────────────────────────────── */

const API_BASE = window.location.origin; // Works locally and on deployed server

/* ── STATE ──────────────────────────────────────────────────────────────────── */
let appState = {
  records: null,
  headers: [],
  stats: {},
  fileName: '',
  rowCount: 0,
  chartInstance: null,
  currentChartData: null,
  sessionApiKey: null,
  isUploading: false,
  isQuerying: false
};

/* ── DOM REFS ────────────────────────────────────────────────────────────────── */
const uploadZone    = document.getElementById('uploadZone');
const uploadInner   = document.getElementById('uploadInner');
const fileInput     = document.getElementById('fileInput');
const loadSampleBtn = document.getElementById('loadSampleBtn');
const dataCard      = document.getElementById('dataCard');
const dataFileName  = document.getElementById('dataFileName');
const statRows      = document.getElementById('statRows');
const statCols      = document.getElementById('statCols');
const columnsList   = document.getElementById('columnsList');
const chartContainer = document.getElementById('chartContainer');
const chartPlaceholder = document.getElementById('chartPlaceholder');
const mainChartCanvas = document.getElementById('mainChart');
const chartToolbar  = document.getElementById('chartToolbar');
const chartMeta     = document.getElementById('chartMeta');
const chartMetaTitle = document.getElementById('chartMetaTitle');
const chatWindow    = document.getElementById('chatWindow');
const chatInput     = document.getElementById('chatInput');
const sendBtn       = document.getElementById('sendBtn');
const statusBadge   = document.getElementById('statusBadge');
const apiBadge      = document.getElementById('apiBadge');
const apiKeyLink    = document.getElementById('apiKeyLink');
const downloadChartBtn = document.getElementById('downloadChartBtn');

/* ── SAMPLE CSV DATA ─────────────────────────────────────────────────────────── */
const SAMPLE_CSV = `Order ID,Region,Product,Category,Sales Rep,Month,Revenue,Units Sold,Cost,Profit
1001,North,Laptop Pro,Electronics,Alice,January,85000,12,60000,25000
1002,South,Wireless Mouse,Electronics,Bob,January,12000,240,6000,6000
1003,East,Office Chair,Furniture,Carol,January,45000,30,28000,17000
1004,West,Monitor 4K,Electronics,Dave,January,62000,40,38000,24000
1005,North,Desk Lamp,Furniture,Alice,January,8500,170,4000,4500
1006,South,Laptop Pro,Electronics,Eve,February,91000,13,65000,26000
1007,East,Keyboard,Electronics,Frank,February,15000,300,7500,7500
1008,West,Office Chair,Furniture,Grace,February,52000,35,32000,20000
1009,North,Monitor 4K,Electronics,Alice,February,58000,38,35000,23000
1010,South,Desk Lamp,Furniture,Bob,February,9200,184,4300,4900
1011,East,Laptop Pro,Electronics,Carol,March,97000,14,68000,29000
1012,West,Wireless Mouse,Electronics,Dave,March,14000,280,7000,7000
1013,North,Office Chair,Furniture,Alice,March,48000,32,29500,18500
1014,South,Monitor 4K,Electronics,Eve,March,71000,46,43000,28000
1015,East,Desk Lamp,Furniture,Frank,March,7800,156,3700,4100
1016,West,Laptop Pro,Electronics,Grace,April,88000,12,62000,26000
1017,North,Keyboard,Electronics,Alice,April,16500,330,8000,8500
1018,South,Office Chair,Furniture,Bob,April,55000,38,33000,22000
1019,East,Monitor 4K,Electronics,Carol,April,64000,42,39000,25000
1020,West,Wireless Mouse,Electronics,Dave,April,13500,270,6700,6800
1021,North,Laptop Pro,Electronics,Alice,May,93000,13,66000,27000
1022,South,Desk Lamp,Furniture,Eve,May,10200,204,4800,5400
1023,East,Keyboard,Electronics,Frank,May,17000,340,8200,8800
1024,West,Office Chair,Furniture,Grace,May,60000,40,36500,23500
1025,North,Monitor 4K,Electronics,Alice,May,67000,44,41000,26000
1026,South,Laptop Pro,Electronics,Bob,June,102000,15,72000,30000
1027,East,Wireless Mouse,Electronics,Carol,June,16000,320,8000,8000
1028,West,Office Chair,Furniture,Dave,June,58000,39,35000,23000
1029,North,Desk Lamp,Furniture,Alice,June,9500,190,4500,5000
1030,South,Monitor 4K,Electronics,Eve,June,75000,50,46000,29000`;

/* ── UTILS ───────────────────────────────────────────────────────────────────── */
function showToast(message, type = 'info', duration = 3000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function setStatus(text, type = 'ready') {
  statusBadge.textContent = `● ${text}`;
  statusBadge.style.color = type === 'ready' ? 'var(--green)' : type === 'loading' ? 'var(--orange)' : 'var(--red)';
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function markdownToHtml(text) {
  // Basic markdown: bold, bullets, line breaks
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>');
}

/* ── CHART.JS HELPERS ────────────────────────────────────────────────────────── */
const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#3b82f6', '#84cc16', '#f97316'
];

const CHART_COLORS_ALPHA = CHART_COLORS.map(c => c + 'cc');

function buildChartData(type, labels, values) {
  const isMultiColor = ['pie', 'doughnut'].includes(type);
  return {
    labels,
    datasets: [{
      data: values,
      backgroundColor: isMultiColor ? CHART_COLORS : CHART_COLORS[0] + 'cc',
      borderColor: isMultiColor ? CHART_COLORS : CHART_COLORS[0],
      borderWidth: type === 'line' ? 2.5 : 1,
      borderRadius: type === 'bar' ? 6 : 0,
      fill: type === 'line' ? { target: 'origin', above: 'rgba(99,102,241,0.08)' } : false,
      tension: 0.4,
      pointBackgroundColor: CHART_COLORS[0],
      pointRadius: type === 'line' ? 4 : 0,
    }]
  };
}

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 600, easing: 'easeOutQuart' },
  plugins: {
    legend: {
      labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, boxWidth: 10 }
    },
    tooltip: {
      backgroundColor: '#0d1220',
      borderColor: 'rgba(99,150,255,0.22)',
      borderWidth: 1,
      titleColor: '#f0f4ff',
      bodyColor: '#94a3b8',
      titleFont: { family: 'Inter', size: 12, weight: 'bold' },
      bodyFont: { family: 'Inter', size: 11 },
      padding: 10,
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label || ''}: ${typeof ctx.raw === 'object' ? JSON.stringify(ctx.raw) : formatNumber(ctx.raw)}`
      }
    }
  },
  scales: {
    x: {
      ticks: { color: '#64748b', font: { family: 'Inter', size: 10 }, maxRotation: 45 },
      grid: { color: 'rgba(99,150,255,0.06)' }
    },
    y: {
      ticks: {
        color: '#64748b',
        font: { family: 'Inter', size: 10 },
        callback: (v) => formatNumber(v)
      },
      grid: { color: 'rgba(99,150,255,0.06)' }
    }
  }
};

function renderChart(type, title, labels, values) {
  // Destroy old chart
  if (appState.chartInstance) {
    appState.chartInstance.destroy();
    appState.chartInstance = null;
  }

  chartPlaceholder.style.display = 'none';
  mainChartCanvas.style.display = 'block';
  chartMeta.style.display = 'block';
  chartMetaTitle.textContent = title;
  chartToolbar.style.display = 'flex';

  // Store data for chart type switching
  appState.currentChartData = { title, labels, values };

  const config = {
    type: type,
    data: buildChartData(type, labels, values),
    options: {
      ...JSON.parse(JSON.stringify(CHART_DEFAULTS)),
      plugins: {
        ...JSON.parse(JSON.stringify(CHART_DEFAULTS.plugins)),
        legend: {
          display: ['pie', 'doughnut'].includes(type),
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, boxWidth: 10 }
        },
        title: { display: false }
      }
    }
  };

  // For pie/doughnut, remove axis scales
  if (['pie', 'doughnut'].includes(type)) {
    config.options.scales = {};
  }

  appState.chartInstance = new Chart(mainChartCanvas, config);
}

function switchChartType(type) {
  if (!appState.currentChartData) return;
  const { title, labels, values } = appState.currentChartData;
  renderChart(type, title, labels, values);
}

/* ── DATA PROCESSING ─────────────────────────────────────────────────────────── */
function computeStats(records) {
  if (!records || records.length === 0) return {};
  const headers = Object.keys(records[0]);
  const stats = {};
  headers.forEach(col => {
    const values = records.map(r => r[col]).filter(v => v !== undefined && v !== '');
    const nums = values.map(v => parseFloat(v)).filter(n => !isNaN(n));
    if (nums.length > 0 && nums.length === values.length) {
      stats[col] = {
        type: 'numeric',
        min: Math.min(...nums), max: Math.max(...nums),
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

function processCSVData(csvText, fileName) {
  const result = Papa.parse(csvText, {
    header: true, skipEmptyLines: true, trimHeaders: true,
    dynamicTyping: false
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    showToast('CSV parsing failed: ' + result.errors[0].message, 'error');
    return;
  }

  const records = result.data;
  const headers = result.meta.fields || Object.keys(records[0] || {});
  const stats = computeStats(records);

  appState.records = records;
  appState.headers = headers;
  appState.stats = stats;
  appState.fileName = fileName;
  appState.rowCount = records.length;

  updateDataUI(fileName, records.length, headers, stats);
  enableChat();
  triggerDefaultChart(records, headers, stats);

  showToast(`✅ Loaded ${records.length} rows from ${fileName}`, 'success');
  setStatus('Data Loaded');

  // Add bot message
  addBotMessage(
    `I've loaded <strong>${fileName}</strong> — <strong>${records.length} rows</strong> and <strong>${headers.length} columns</strong> detected.
    <br/><br/>
    Key columns: ${headers.slice(0, 5).map(h => `<em>${h}</em>`).join(', ')}${headers.length > 5 ? ` + ${headers.length - 5} more` : ''}.
    <br/><br/>
    Go ahead and ask me anything about your data! 🚀`
  );
}

function updateDataUI(fileName, rowCount, headers, stats) {
  dataFileName.textContent = fileName;
  statRows.textContent = rowCount.toLocaleString();
  statCols.textContent = headers.length;
  columnsList.innerHTML = headers.map(h => {
    const isNum = stats[h] && stats[h].type === 'numeric';
    return `<span class="col-tag ${isNum ? 'numeric' : ''}">${h}</span>`;
  }).join('');
  dataCard.style.display = 'block';

  // Update upload zone
  uploadInner.innerHTML = `
    <div class="upload-icon">✅</div>
    <div class="upload-title">${fileName}</div>
    <div class="upload-sub">${rowCount.toLocaleString()} rows loaded</div>
    <div class="upload-hint">Click or drop to replace</div>`;
  uploadZone.classList.add('has-file');
}

function triggerDefaultChart(records, headers, stats) {
  const numericCols = Object.entries(stats).filter(([, v]) => v.type === 'numeric').map(([k]) => k);
  const catCols = Object.entries(stats).filter(([, v]) => v.type === 'categorical').map(([k]) => k);

  if (catCols.length > 0 && numericCols.length > 0) {
    const catCol = catCols[0];
    const numCol = numericCols[0];
    const agg = {};
    records.forEach(row => {
      const key = row[catCol] || 'Unknown';
      const val = parseFloat(row[numCol]) || 0;
      agg[key] = (agg[key] || 0) + val;
    });
    const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 10);
    renderChart('bar', `${numCol} by ${catCol}`, sorted.map(([k]) => k), sorted.map(([, v]) => Math.round(v)));
  } else if (numericCols.length >= 1) {
    const col = numericCols[0];
    const values = records.slice(0, 15).map(r => parseFloat(r[col]) || 0);
    renderChart('line', `${col} Trend`, values.map((_, i) => `#${i + 1}`), values);
  }
}

/* ── UPLOAD HANDLERS ─────────────────────────────────────────────────────────── */
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) handleFileSelect(file);
  else showToast('Please drop a CSV file.', 'error');
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

function handleFileSelect(file) {
  setStatus('Parsing...', 'loading');
  const reader = new FileReader();
  reader.onload = (e) => processCSVData(e.target.result, file.name);
  reader.onerror = () => { showToast('Could not read file.', 'error'); setStatus('Error', 'error'); };
  reader.readAsText(file);
}

/* ── SAMPLE DATA ────────────────────────────────────────────────────────────── */
loadSampleBtn.addEventListener('click', () => {
  processCSVData(SAMPLE_CSV, 'sample_sales_data.csv');
});

/* ── CHAT FUNCTIONS ──────────────────────────────────────────────────────────── */
function enableChat() {
  chatInput.disabled = false;
  sendBtn.disabled = false;
  chatInput.placeholder = 'Ask anything about your data...';
}

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'chat-message user';
  div.innerHTML = `
    <div class="chat-avatar">U</div>
    <div class="chat-bubble">${escapeHtml(text)}</div>
  `;
  chatWindow.appendChild(div);
  scrollChat();
}

function addBotMessage(html, chartInfo = null) {
  const div = document.createElement('div');
  div.className = 'chat-message bot';
  let extra = '';
  if (chartInfo) {
    extra = `<span class="chart-insight">📈 Chart updated: ${chartInfo}</span>`;
  }
  div.innerHTML = `
    <div class="chat-avatar">🐇</div>
    <div class="chat-bubble">${html}${extra}</div>
  `;
  chatWindow.appendChild(div);
  scrollChat();
}

function addTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'chat-message bot typing';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="chat-avatar">🐇</div>
    <div class="chat-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  chatWindow.appendChild(div);
  scrollChat();
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function scrollChat() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── LLM QUERY ───────────────────────────────────────────────────────────────── */
async function askQuestion(question) {
  if (!appState.records || appState.isQuerying) return;
  appState.isQuerying = true;
  setStatus('Thinking...', 'loading');
  sendBtn.disabled = true;

  addUserMessage(question);
  addTypingIndicator();

  try {
    const payload = {
      question,
      records: appState.records.slice(0, 500), // Send max 500 rows
      headers: appState.headers,
      stats: appState.stats
    };

    // Use session API key if set
    const headers = { 'Content-Type': 'application/json' };
    if (appState.sessionApiKey) {
      headers['X-API-Key'] = appState.sessionApiKey;
    }

    const response = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    removeTypingIndicator();

    if (!response.ok) {
      addBotMessage(`❌ Error: ${data.error || 'Something went wrong.'}`);
      showToast(data.error || 'Query failed', 'error');
      return;
    }

    let chartInfo = null;

    // Render chart if suggestion available
    if (data.chartSuggestion && data.chartSuggestion.type !== 'null' && data.chartSuggestion.type) {
      chartInfo = await renderChartFromSuggestion(data.chartSuggestion);
    }

    // Format answer
    const formatted = markdownToHtml(data.answer || 'No answer returned.');

    if (data.isDemo) {
      addBotMessage(`
        ${formatted}
        <br/><br/>
        <small style="color:var(--orange)">⚠️ Running in Demo Mode — add your OpenAI API key for real AI answers. <a href="#" onclick="document.getElementById('apiKeyLink').click()">Add API Key →</a></small>
      `);
    } else {
      addBotMessage(formatted, chartInfo);
    }

    setStatus('Ready');

    // Update apiBadge if demo
    if (data.isDemo) {
      apiBadge.textContent = 'API: Demo';
      apiBadge.classList.remove('active');
    } else {
      apiBadge.textContent = '✓ API: Live';
      apiBadge.classList.add('active');
    }

  } catch (err) {
    removeTypingIndicator();
    addBotMessage(`❌ Network error: ${err.message}. Make sure the server is running.`);
    showToast('Connection error', 'error');
    setStatus('Error', 'error');
  } finally {
    appState.isQuerying = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

async function renderChartFromSuggestion(suggestion) {
  try {
    const { type, title, xColumn, yColumn, groupBy } = suggestion;
    const records = appState.records;

    let labels = [];
    let values = [];
    let chartTitle = title || `${yColumn} by ${xColumn}`;

    if (xColumn && yColumn) {
      // Aggregate
      const agg = {};
      records.forEach(row => {
        const key = String(row[xColumn] || 'Unknown');
        const val = parseFloat(row[yColumn]) || 0;
        agg[key] = (agg[key] || 0) + val;
      });
      const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 12);
      labels = sorted.map(([k]) => k);
      values = sorted.map(([, v]) => Math.round(v * 100) / 100);
    } else if (xColumn) {
      // Categorical frequency
      const freq = {};
      records.forEach(r => {
        const k = String(r[xColumn] || 'Unknown');
        freq[k] = (freq[k] || 0) + 1;
      });
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12);
      labels = sorted.map(([k]) => k);
      values = sorted.map(([, v]) => v);
    }

    if (labels.length > 0 && values.length > 0) {
      const validType = ['bar', 'line', 'pie', 'doughnut', 'scatter'].includes(type) ? type : 'bar';
      renderChart(validType, chartTitle, labels, values);
      return chartTitle;
    }
  } catch (e) {
    console.warn('Chart render failed:', e);
  }
  return null;
}

/* ── SEND BUTTON & INPUT ─────────────────────────────────────────────────────── */
sendBtn.addEventListener('click', () => {
  const q = chatInput.value.trim();
  if (q) { chatInput.value = ''; askQuestion(q); }
});

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const q = chatInput.value.trim();
    if (q) { chatInput.value = ''; askQuestion(q); }
  }
});

/* ── SUGGESTION CHIPS ────────────────────────────────────────────────────────── */
document.querySelectorAll('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const q = chip.dataset.q;
    if (!appState.records) {
      showToast('Upload a CSV file first!', 'error');
      return;
    }
    askQuestion(q);
  });
});

/* ── CHART TYPE SWITCHER ─────────────────────────────────────────────────────── */
document.querySelectorAll('.chart-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchChartType(btn.dataset.type);
  });
});

/* ── DOWNLOAD CHART ──────────────────────────────────────────────────────────── */
downloadChartBtn.addEventListener('click', () => {
  if (!appState.chartInstance) return;
  const url = mainChartCanvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'talking-rabbitt-chart.png';
  a.click();
  showToast('Chart exported!', 'success');
});

/* ── API KEY MODAL ───────────────────────────────────────────────────────────── */
const apiModal = document.getElementById('apiModal');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const saveApiKey = document.getElementById('saveApiKey');
const apiKeyInput = document.getElementById('apiKeyInput');

apiKeyLink.addEventListener('click', (e) => { e.preventDefault(); apiModal.style.display = 'flex'; });
apiBadge.addEventListener('click', () => apiModal.style.display = 'flex');
modalClose.addEventListener('click', () => apiModal.style.display = 'none');
modalCancel.addEventListener('click', () => apiModal.style.display = 'none');
apiModal.addEventListener('click', (e) => { if (e.target === apiModal) apiModal.style.display = 'none'; });

saveApiKey.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (key && key.startsWith('sk-')) {
    appState.sessionApiKey = key;
    apiBadge.textContent = '✓ API: Live';
    apiBadge.classList.add('active');
    apiModal.style.display = 'none';
    showToast('API key saved for this session!', 'success');
  } else {
    showToast('Invalid API key. It should start with "sk-"', 'error');
  }
});

// Update server.js to use X-API-Key header too
// (Logic already in API call above)

/* ── TABLE MODAL ─────────────────────────────────────────────────────────────── */
const tableModal = document.getElementById('tableModal');
const tableModalClose = document.getElementById('tableModalClose');
const tableWrapper = document.getElementById('tableWrapper');

tableModalClose.addEventListener('click', () => tableModal.style.display = 'none');
tableModal.addEventListener('click', (e) => { if (e.target === tableModal) tableModal.style.display = 'none'; });

dataCard.addEventListener('click', () => {
  if (!appState.records) return;
  renderTable(appState.records.slice(0, 50), appState.headers);
  tableModal.style.display = 'flex';
});

function renderTable(records, headers) {
  const ths = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const trs = records.map(r =>
    `<tr>${headers.map(h => `<td>${escapeHtml(String(r[h] ?? ''))}</td>`).join('')}</tr>`
  ).join('');
  tableWrapper.innerHTML = `
    <table class="data-table">
      <thead><tr>${ths}</tr></thead>
      <tbody>${trs}</tbody>
    </table>
    <p style="font-size:11px;color:var(--text3);margin-top:10px;text-align:center">Showing first 50 rows of ${appState.rowCount.toLocaleString()} total</p>
  `;
}

/* ── INIT ────────────────────────────────────────────────────────────────────── */
setStatus('Ready');

// Patch server.js to accept X-API-Key and use it (optional override)
// The frontend handles this by passing the key in the header
