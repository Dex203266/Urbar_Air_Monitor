/* ── Urban Air Monitor — Frontend App (Vanilla JS) ────────────────────────
   Matches Stocksphere pattern: single index.html, navigate() section switching,
   RestTemplate calls to Spring Boot on port 8080.
   ──────────────────────────────────────────────────────────────────────── */

const API = 'http://localhost:8080/api';

// ── Section navigation ───────────────────────────────────────────────────
function navigate(section) {
  document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  document.getElementById(`section-${section}`).classList.add('active');
  document.querySelector(`nav a[data-section="${section}"]`).classList.add('active');

  if (section === 'dashboard')   loadDashboard();
  if (section === 'record')      { loadRecordRecent(); resetReadingForm(); }
  if (section === 'data')        loadData();
  if (section === 'prediction')  { loadModelInfo(); loadPredHistory(); }
  if (section === 'alerts')      loadAlerts();
}

// ── Toast ────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Status badge ─────────────────────────────────────────────────────────
function badge(status) {
  const map = { 'Good': 'status-good', 'Moderate': 'status-moderate', 'Poor': 'status-poor', 'Very Poor': 'status-very-poor' };
  return `<span class="badge ${map[status] || 'status-unknown'}">${status || '–'}</span>`;
}

function statusColor(s) {
  return { 'Good': '#1a7a3c', 'Moderate': '#b45309', 'Poor': '#ea580c', 'Very Poor': '#b91c1c' }[s] || '#888';
}

// ── Generic fetch ────────────────────────────────────────────────────────
async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Request failed');
  return json;
}

// ════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════
let pollutantChart, statusChart;

async function loadDashboard() {
  try {
    const stats = await api(`${API}/dashboard/stats`);
    document.getElementById('stat-locations').textContent = stats.totalLocations;
    document.getElementById('stat-pm25').textContent      = stats.avgPm25;
    document.getElementById('stat-pm10').textContent      = stats.avgPm10;
    document.getElementById('stat-alerts').textContent    = stats.activeAlerts;
    document.getElementById('stat-status').innerHTML      = badge(stats.currentStatus);

    if (stats.activeAlerts > 0) {
      const b = document.getElementById('nav-alert-badge');
      b.textContent = stats.activeAlerts;
      b.style.display = 'inline';
    }

    renderStatusChart(stats.statusDistribution);
    loadRecentTable();
    loadChartData('daily');
  } catch (e) {
    toast('Could not load dashboard. Is the backend running?', 'error');
  }
}

function renderStatusChart(dist) {
  const labels = Object.keys(dist);
  const values = Object.values(dist);
  const colors = labels.map(l => statusColor(l));
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById('status-chart'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

async function loadChartData(period) {
  try {
    const d = await api(`${API}/dashboard/chart-data?period=${period}`);
    if (pollutantChart) pollutantChart.destroy();
    pollutantChart = new Chart(document.getElementById('pollutant-chart'), {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [
          { label: 'PM2.5', data: d.pm25, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.1)', tension: 0.4, fill: true },
          { label: 'PM10',  data: d.pm10, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,.1)', tension: 0.4, fill: true },
          { label: 'CO2',   data: d.co2,  borderColor: '#b45309', tension: 0.4, fill: false },
          { label: 'NO2',   data: d.no2,  borderColor: '#b91c1c', tension: 0.4, fill: false },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } },
        interaction: { mode: 'index', intersect: false }
      }
    });
  } catch (e) { console.error('Chart error', e); }
}

function setChartPeriod(period, btn) {
  document.querySelectorAll('.period-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadChartData(period);
}

async function loadRecentTable() {
  const tbody = document.getElementById('recent-tbody');
  try {
    const rows = await api(`${API}/dashboard/recent`);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fa-solid fa-leaf"></i><p>No readings yet. <a href="#" onclick="navigate('record')">Add one</a></p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><strong>${r.city}</strong></td>
        <td>${r.locationName || '–'}</td>
        <td>${r.monitoringDate}</td>
        <td>${r.pm25}</td><td>${r.pm10}</td><td>${r.co2}</td><td>${r.no2}</td>
        <td>${badge(r.airQualityStatus)}</td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Failed to load.</td></tr>`;
  }
}

// ════════════════════════════════════════════════════════════════════════
// RECORD READING
// ════════════════════════════════════════════════════════════════════════
function calcStatus(pm25, pm10, co2, no2) {
  const sc = (v, g, m, p) => v <= g ? 0 : v <= m ? 1 : v <= p ? 2 : 3;
  const avg = (sc(pm25,12,35,55) + sc(pm10,54,154,254) + sc(co2,400,800,1000) + sc(no2,53,100,200)) / 4;
  return avg < 0.75 ? 'Good' : avg < 1.5 ? 'Moderate' : avg < 2.5 ? 'Poor' : 'Very Poor';
}

function livePreview() {
  const vals = ['f-pm25','f-pm10','f-co2','f-no2'].map(id => parseFloat(document.getElementById(id).value));
  const prev = document.getElementById('aq-preview');
  if (vals.some(isNaN)) { prev.style.display = 'none'; return; }
  const s = calcStatus(...vals);
  prev.style.display = 'block';
  document.getElementById('preview-badge').innerHTML = badge(s);
}

function clearErr(id) { document.getElementById(id).textContent = ''; }
function setErr(id, msg) { document.getElementById(id).textContent = msg; }

async function submitReading(e) {
  e.preventDefault();
  let valid = true;
  ['city','date','pm25','pm10','co2','no2'].forEach(f => clearErr(`err-${f}`));

  const city = document.getElementById('f-city').value.trim();
  const date = document.getElementById('f-date').value;
  const pm25 = parseFloat(document.getElementById('f-pm25').value);
  const pm10 = parseFloat(document.getElementById('f-pm10').value);
  const co2  = parseFloat(document.getElementById('f-co2').value);
  const no2  = parseFloat(document.getElementById('f-no2').value);

  if (!city)          { setErr('err-city', 'City is required'); valid = false; }
  if (!date)          { setErr('err-date', 'Date is required'); valid = false; }
  if (isNaN(pm25))    { setErr('err-pm25', 'Required (0–1000)'); valid = false; }
  if (isNaN(pm10))    { setErr('err-pm10', 'Required (0–1000)'); valid = false; }
  if (isNaN(co2))     { setErr('err-co2',  'Required (300–5000)'); valid = false; }
  if (isNaN(no2))     { setErr('err-no2',  'Required (0–1000)'); valid = false; }
  if (!valid) return;

  const btn = document.getElementById('reading-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

  try {
    const res = await api(`${API}/readings`, {
      method: 'POST',
      body: JSON.stringify({
        city, monitoringDate: date,
        locationName: document.getElementById('f-location').value.trim() || null,
        pm25, pm10, co2, no2,
        temperature: parseFloat(document.getElementById('f-temp').value) || null,
        humidity:    parseFloat(document.getElementById('f-humidity').value) || null,
      })
    });
    toast(`Reading saved — Status: ${res.airQualityStatus}`, 'success');
    resetReadingForm();
    loadRecordRecent();
  } catch (err) {
    toast(err.message || 'Failed to save', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Reading';
  }
}

function resetReadingForm() {
  document.getElementById('reading-form').reset();
  document.getElementById('f-date').valueAsDate = new Date();
  document.getElementById('aq-preview').style.display = 'none';
  ['city','date','pm25','pm10','co2','no2'].forEach(f => clearErr(`err-${f}`));
}

async function loadRecordRecent() {
  const tbody = document.getElementById('record-recent-tbody');
  try {
    const rows = await api(`${API}/dashboard/recent`);
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No readings yet.</td></tr>`; return; }
    tbody.innerHTML = rows.map(r => `
      <tr><td><strong>${r.city}</strong></td><td>${r.monitoringDate}</td>
      <td>${r.pm25}</td><td>${badge(r.airQualityStatus)}</td></tr>`).join('');
  } catch (e) { tbody.innerHTML = `<tr><td colspan="4">Failed to load.</td></tr>`; }
}

// ════════════════════════════════════════════════════════════════════════
// DATA PAGE
// ════════════════════════════════════════════════════════════════════════
let dataPage = 1;
const DATA_PER_PAGE = 15;
let allDataRows = [];
let filteredRows = [];

async function loadData() {
  const tbody = document.getElementById('data-tbody');
  tbody.innerHTML = `<tr><td colspan="12" class="loading"><div class="spinner"></div></td></tr>`;
  try {
    const search = document.getElementById('data-search').value.toLowerCase();
    const from   = document.getElementById('data-from').value;
    const to     = document.getElementById('data-to').value;
    const status = document.getElementById('data-status').value;

    const params = new URLSearchParams();
    if (search) params.set('city', search);
    if (status) params.set('status', status);
    const rows = await api(`${API}/readings?${params}`);

    filteredRows = rows.filter(r => {
      if (from && r.monitoringDate < from) return false;
      if (to   && r.monitoringDate > to)   return false;
      if (search && !r.city.toLowerCase().includes(search) &&
          !(r.locationName || '').toLowerCase().includes(search)) return false;
      return true;
    });

    dataPage = 1;
    renderDataPage();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load data.</p></div></td></tr>`;
    toast('Failed to load data', 'error');
  }
}

function renderDataPage() {
  const tbody = document.getElementById('data-tbody');
  const total = filteredRows.length;
  const totalPages = Math.ceil(total / DATA_PER_PAGE) || 1;
  const start = (dataPage - 1) * DATA_PER_PAGE;
  const rows  = filteredRows.slice(start, start + DATA_PER_PAGE);

  document.getElementById('data-info').textContent =
    `Showing ${start+1}–${Math.min(start+DATA_PER_PAGE, total)} of ${total} records`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p>No records match filters.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = rows.map((r, i) => `
      <tr>
        <td>${start+i+1}</td>
        <td><strong>${r.city}</strong></td>
        <td>${r.locationName || '–'}</td>
        <td>${r.monitoringDate}</td>
        <td>${r.pm25}</td><td>${r.pm10}</td><td>${r.co2}</td><td>${r.no2}</td>
        <td>${r.temperature ?? '–'}</td>
        <td>${r.humidity ?? '–'}</td>
        <td>${r.aqiScore ?? '–'}</td>
        <td>${badge(r.airQualityStatus)}</td>
      </tr>`).join('');
  }

  // Pagination
  const pag = document.getElementById('data-pagination');
  let html = `<button class="btn btn-sm btn-secondary" ${dataPage===1?'disabled':''} onclick="goDataPage(${dataPage-1})">‹</button>`;
  for (let p = Math.max(1, dataPage-2); p <= Math.min(totalPages, dataPage+2); p++) {
    html += `<button class="btn btn-sm ${p===dataPage?'btn-primary':'btn-secondary'}" onclick="goDataPage(${p})">${p}</button>`;
  }
  html += `<button class="btn btn-sm btn-secondary" ${dataPage===totalPages?'disabled':''} onclick="goDataPage(${dataPage+1})">›</button>`;
  pag.innerHTML = html;
}

function goDataPage(p) { dataPage = p; renderDataPage(); }
function applyDataFilters() { loadData(); }
function clearDataFilters() {
  ['data-search','data-from','data-to'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('data-status').value = '';
  loadData();
}

function exportCsv() {
  const headers = ['City','Location','Date','PM2.5','PM10','CO2','NO2','Temp','Humidity','AQI','Status'];
  const rows    = filteredRows.map(r => [
    r.city, r.locationName||'', r.monitoringDate,
    r.pm25, r.pm10, r.co2, r.no2,
    r.temperature||'', r.humidity||'', r.aqiScore||'', r.airQualityStatus
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'air_quality_data.csv';
  a.click();
}

// ════════════════════════════════════════════════════════════════════════
// PREDICTION
// ════════════════════════════════════════════════════════════════════════
const PRESETS = {
  'good':      { pm25:8,   pm10:30,  co2:380,  no2:20,  t:22, h:50 },
  'moderate':  { pm25:25,  pm10:100, co2:600,  no2:75,  t:28, h:65 },
  'poor':      { pm25:45,  pm10:200, co2:900,  no2:150, t:32, h:75 },
  'very-poor': { pm25:120, pm10:350, co2:1500, no2:300, t:38, h:85 },
};
const STATUS_ICONS = { 'Good':'🌿','Moderate':'🌤️','Poor':'🌫️','Very Poor':'🔴' };

function setPreset(key) {
  const p = PRESETS[key];
  document.getElementById('p-pm25').value    = p.pm25;
  document.getElementById('p-pm10').value    = p.pm10;
  document.getElementById('p-co2').value     = p.co2;
  document.getElementById('p-no2').value     = p.no2;
  document.getElementById('p-temp').value    = p.t;
  document.getElementById('p-humidity').value = p.h;
}

async function loadModelInfo() {
  const body = document.getElementById('model-banner-body');
  try {
    const info = await api(`${API}/prediction/model-info`);
    body.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:center;font-size:.875rem">
        <span><strong>Best Model:</strong> ${info.bestModel}</span>
        <span class="badge status-good">Accuracy: ${(info.accuracy*100).toFixed(1)}%</span>
        <span class="badge status-moderate" style="color:#1d4ed8;background:#eff6ff">F1: ${(info.f1Score*100).toFixed(1)}%</span>
        <span class="badge status-unknown">CV: ${(info.cvScore*100).toFixed(1)}%</span>
        <span style="color:var(--gray-400)">Classes: ${info.classes.join(' · ')}</span>
      </div>`;
    renderModelCompare(info.allResults, info.bestModel);
  } catch (e) {
    body.innerHTML = `<div class="alert-block danger"><i class="fa-solid fa-triangle-exclamation"></i><div>ML model not loaded — run <code>python ml/train_model.py</code> then <code>python ml/ml_service.py</code></div></div>`;
  }
}

function renderModelCompare(results, best) {
  if (!results) return;
  document.getElementById('model-compare').innerHTML = Object.entries(results).map(([name, r]) => `
    <div style="border:2px solid ${name===best?'var(--green)':'var(--gray-200)'};border-radius:var(--radius);padding:1rem;background:${name===best?'var(--green-light)':'var(--white)'}">
      ${name===best?'<span class="badge status-good" style="margin-bottom:.5rem;display:inline-block">Best</span>':''}
      <div style="font-weight:700;font-size:.875rem">${name}</div>
      <div style="font-size:.82rem;margin-top:.4rem;color:var(--gray-600)">
        Accuracy: <strong>${(r.accuracy*100).toFixed(1)}%</strong><br>
        F1: <strong>${(r.f1*100).toFixed(1)}%</strong><br>
        CV: <strong>${(r.cv*100).toFixed(1)}%</strong>
      </div>
    </div>`).join('');
}

async function submitPrediction(e) {
  e.preventDefault();
  const pm25 = parseFloat(document.getElementById('p-pm25').value);
  const pm10 = parseFloat(document.getElementById('p-pm10').value);
  const co2  = parseFloat(document.getElementById('p-co2').value);
  const no2  = parseFloat(document.getElementById('p-no2').value);
  if ([pm25,pm10,co2,no2].some(isNaN)) { toast('Fill all required fields', 'error'); return; }

  const btn = document.getElementById('pred-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Predicting…';

  try {
    const res = await api(`${API}/prediction/predict`, {
      method: 'POST',
      body: JSON.stringify({
        pm25, pm10, co2, no2,
        temperature: parseFloat(document.getElementById('p-temp').value) || 25,
        humidity:    parseFloat(document.getElementById('p-humidity').value) || 60,
      })
    });
    renderPredResult(res);
    loadPredHistory();
  } catch (err) {
    toast(err.message || 'Prediction failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Predict Air Quality';
  }
}

function renderPredResult(res) {
  document.getElementById('pred-placeholder').style.display = 'none';
  document.getElementById('pred-result-content').style.display = 'block';

  const status = res.predictedStatus;
  const color  = statusColor(status);
  const box    = document.getElementById('pred-result-box');
  box.style.background = color + '18';
  box.style.border     = `2px solid ${color}`;

  document.getElementById('pred-icon').textContent  = STATUS_ICONS[status] || '🌿';
  document.getElementById('pred-label').textContent = status;
  document.getElementById('pred-label').style.color = color;

  const conf = res.confidence || 0;
  document.getElementById('conf-fill').style.width      = conf + '%';
  document.getElementById('conf-fill').style.background = color;
  document.getElementById('conf-pct').textContent       = conf + '%';

  // Class probabilities
  const probColors = { 'Good':'#1a7a3c','Moderate':'#b45309','Poor':'#ea580c','Very Poor':'#b91c1c' };
  document.getElementById('prob-body').innerHTML =
    Object.entries(res.classProbabilities || {}).sort((a,b) => b[1]-a[1]).map(([cls, pct]) => `
      <div class="bar-row">
        <div class="bar-label">${cls}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${probColors[cls]||'#888'}"></div></div>
        <div class="bar-value">${pct}%</div>
      </div>`).join('');

  // Feature importance
  const fi = res.featureImportance || {};
  const fiEntries = Object.entries(fi).sort((a,b) => b[1]-a[1]);
  const maxFi = fiEntries[0]?.[1] || 1;
  document.getElementById('fi-body').innerHTML = fiEntries.length
    ? fiEntries.map(([feat, val]) => `
        <div class="bar-row">
          <div class="bar-label">${feat.toUpperCase()}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(val/maxFi*100).toFixed(1)}%"></div></div>
          <div class="bar-value">${(val*100).toFixed(1)}%</div>
        </div>`).join('')
    : '<p style="color:var(--gray-400);font-size:.85rem">Not available for this model.</p>';
}

async function loadPredHistory() {
  const tbody = document.getElementById('pred-history-tbody');
  try {
    const rows = await api(`${API}/prediction/history`);
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No predictions yet.</td></tr>`; return; }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><small>${r.createdAt ? r.createdAt.slice(11,16) : '–'}</small></td>
        <td>${r.pm25}</td><td>${r.pm10}</td>
        <td>${badge(r.predictedStatus)}</td>
        <td>${r.confidence ? r.confidence+'%' : '–'}</td>
      </tr>`).join('');
  } catch (e) { tbody.innerHTML = `<tr><td colspan="5">–</td></tr>`; }
}

// ════════════════════════════════════════════════════════════════════════
// ALERTS
// ════════════════════════════════════════════════════════════════════════
async function loadAlerts() {
  const list = document.getElementById('alerts-list');
  list.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  const city     = document.getElementById('alert-city-filter').value;
  const severity = document.getElementById('alert-severity-filter').value;
  const resolved = document.getElementById('alert-resolved-filter').value;

  try {
    const params = new URLSearchParams({ resolved });
    if (city)     params.set('city', city);
    if (severity) params.set('severity', severity);

    const res = await api(`${API}/alerts?${params}`);
    const sum = res.summary || {};
    document.getElementById('a-good').textContent     = sum['Good']      || 0;
    document.getElementById('a-moderate').textContent = sum['Moderate']  || 0;
    document.getElementById('a-poor').textContent     = sum['Poor']      || 0;
    document.getElementById('a-verypoor').textContent = sum['Very Poor'] || 0;

    const alerts = res.alerts || [];
    if (!alerts.length) {
      list.innerHTML = `<div class="panel"><div class="empty-state"><i class="fa-solid fa-circle-check" style="color:var(--green)"></i><p>No active alerts. Air quality is within acceptable limits.</p></div></div>`;
      return;
    }

    list.innerHTML = alerts.map(a => `
      <div class="panel" id="alert-${a.id}" style="margin-bottom:.6rem">
        <div class="panel-body ${a.severityClass}" style="padding:.875rem 1.25rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
            <div style="display:flex;gap:.75rem;align-items:flex-start">
              <span class="dot dot-${a.severity.toLowerCase().replace(' ','-')} " style="margin-top:4px;width:13px;height:13px;flex-shrink:0"></span>
              <div>
                <div style="font-weight:700">${a.alertType} Alert — ${a.city}${a.locationName ? ` <span style="font-weight:400;color:var(--gray-400)">(${a.locationName})</span>` : ''}</div>
                <div style="margin-top:.25rem;font-size:.875rem">${a.message || ''}</div>
                <div style="margin-top:.35rem;font-size:.78rem;color:var(--gray-400)">
                  Value: <strong>${a.pollutantValue}</strong> · Threshold: ${a.thresholdValue} · ${badge(a.severity)} · ${a.createdAt ? a.createdAt.slice(0,16) : ''}
                </div>
              </div>
            </div>
            ${!a.isResolved
              ? `<button class="btn btn-sm btn-secondary" onclick="resolveAlert(${a.id})" style="flex-shrink:0"><i class="fa-solid fa-check"></i> Resolve</button>`
              : `<span class="badge status-unknown">Resolved</span>`}
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><p>Failed to load alerts.</p></div>`;
    toast('Failed to load alerts', 'error');
  }
}

async function resolveAlert(id) {
  try {
    await api(`${API}/alerts/${id}/resolve`, { method: 'PUT' });
    toast('Alert resolved', 'success');
    loadAlerts();
  } catch (e) { toast('Failed to resolve', 'error'); }
}

async function resolveAll() {
  if (!confirm('Mark all active alerts as resolved?')) return;
  try {
    const res = await api(`${API}/alerts/resolve-all`, { method: 'PUT' });
    toast(`${res.resolved} alerts resolved`, 'success');
    loadAlerts();
  } catch (e) { toast('Failed', 'error'); }
}

function clearAlertFilters() {
  document.getElementById('alert-city-filter').value     = '';
  document.getElementById('alert-severity-filter').value = '';
  document.getElementById('alert-resolved-filter').value = 'false';
  loadAlerts();
}

// ── Init ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('f-date').valueAsDate = new Date();
  loadDashboard();
});
