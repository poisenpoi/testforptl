/* ==========================================
   SmartPing Dashboard - JavaScript
   Simulated WebSocket data for mockup
   ========================================== */

// --- State ---
const state = {
    sessionActive: true,
    sessionStart: Date.now(),
    totalBalls: 0,
    leftZone: 0,
    rightZone: 0,
    detections: [],
    heatmapData: [],
    confidenceHistory: [],
    zoneIntervals: [],
    ballPositions: [],
    ballIdCounter: 0,
};

// --- Chart.js Setup ---
Chart.defaults.color = '#9aa0b2';
Chart.defaults.borderColor = 'rgba(42,45,62,0.5)';
Chart.defaults.font.family = 'Inter, sans-serif';

// Zone Distribution Chart
const zoneCtx = document.getElementById('zoneChart').getContext('2d');
const zoneChart = new Chart(zoneCtx, {
    type: 'bar',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Kiri',
                data: [],
                backgroundColor: 'rgba(59,130,246,0.7)',
                borderRadius: 4,
                barPercentage: 0.6,
            },
            {
                label: 'Kanan',
                data: [],
                backgroundColor: 'rgba(245,158,11,0.7)',
                borderRadius: 4,
                barPercentage: 0.6,
            },
        ],
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { beginAtZero: true, grid: { color: 'rgba(42,45,62,0.3)' }, ticks: { stepSize: 1, font: { size: 10 } } },
        },
    },
});

// Confidence Chart
const confCtx = document.getElementById('confidenceChart').getContext('2d');
const confidenceChart = new Chart(confCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Confidence',
            data: [],
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2,
        }],
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 12 } },
            y: { min: 0, max: 1, grid: { color: 'rgba(42,45,62,0.3)' }, ticks: { font: { size: 10 } } },
        },
    },
});

// --- Table Tennis Canvas ---
function drawTable(ctx, w, h, ballPositions) {
    // Background
    ctx.fillStyle = '#0d4a2b';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    // Table border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 10);
    ctx.stroke();

    // Center line (net)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 4);
    ctx.lineTo(w / 2, h - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // Net posts
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(w / 2 - 3, 0, 6, 8);
    ctx.fillRect(w / 2 - 3, h - 8, 6, 8);

    // Zone labels
    ctx.font = '600 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(59,130,246,0.5)';
    ctx.fillText('KIRI', w / 4, h / 2 + 5);
    ctx.fillStyle = 'rgba(245,158,11,0.5)';
    ctx.fillText('KANAN', (3 * w) / 4, h / 2 + 5);

    // Draw ball trail (fade older positions)
    ballPositions.forEach((bp, i) => {
        const age = (Date.now() - bp.time) / 3000;
        if (age > 1) return;
        const alpha = 1 - age;
        const px = (bp.x / 274) * w;
        const py = (bp.y / 152.5) * h;

        // Glow
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, 14);
        gradient.addColorStop(0, `rgba(255,140,0,${0.4 * alpha})`);
        gradient.addColorStop(1, `rgba(255,140,0,0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.fill();

        // Ball
        ctx.fillStyle = `rgba(255,165,0,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,200,100,${alpha * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });
}

// --- Heatmap Canvas ---
const heatmapGrid = [];
const HGRID_X = 20;
const HGRID_Y = 12;
for (let y = 0; y < HGRID_Y; y++) {
    heatmapGrid[y] = [];
    for (let x = 0; x < HGRID_X; x++) {
        heatmapGrid[y][x] = 0;
    }
}

function drawHeatmap(ctx, w, h) {
    const cellW = w / HGRID_X;
    const cellH = h / HGRID_Y;
    let maxVal = 1;
    for (let y = 0; y < HGRID_Y; y++)
        for (let x = 0; x < HGRID_X; x++)
            if (heatmapGrid[y][x] > maxVal) maxVal = heatmapGrid[y][x];

    // Table background
    ctx.fillStyle = '#0d4a2b';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    // Heatmap cells
    for (let y = 0; y < HGRID_Y; y++) {
        for (let x = 0; x < HGRID_X; x++) {
            const val = heatmapGrid[y][x] / maxVal;
            if (val > 0.01) {
                let r, g, b;
                if (val < 0.33) {
                    r = 34; g = 197; b = 94; // green
                } else if (val < 0.66) {
                    r = 245; g = 158; b = 11; // orange
                } else {
                    r = 239; g = 68; b = 68; // red
                }
                ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(val * 0.8 + 0.1, 0.85)})`;
                ctx.beginPath();
                ctx.roundRect(x * cellW + 1, y * cellH + 1, cellW - 2, cellH - 2, 3);
                ctx.fill();
            }
        }
    }

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, w - 2, h - 2, 12);
    ctx.stroke();
}

// --- Simulated Detection Generator ---
function generateDetection() {
    state.ballIdCounter++;
    const zone = Math.random() < 0.55 ? 'Kiri' : 'Kanan';
    const x = zone === 'Kiri'
        ? Math.random() * 130 + 5
        : Math.random() * 130 + 139;
    const y = Math.random() * 140 + 6;
    const confidence = 0.7 + Math.random() * 0.28;
    const latency = Math.floor(10 + Math.random() * 40);
    const now = new Date();

    return {
        timestamp: now.toLocaleTimeString('id-ID', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0'),
        ball_id: `B${String(state.ballIdCounter).padStart(4, '0')}`,
        position: { x: parseFloat(x.toFixed(1)), y: parseFloat(y.toFixed(1)) },
        zone: zone,
        confidence: parseFloat(confidence.toFixed(3)),
        latency_ms: latency,
        model: 'YOLOv8n',
        servo_angle: zone === 'Kiri' ? Math.floor(45 + Math.random() * 45) : Math.floor(90 + Math.random() * 45),
        time: Date.now(),
    };
}

// --- Update UI ---
function updateMetrics() {
    document.getElementById('totalBalls').textContent = state.totalBalls;

    const avgConf = state.detections.length > 0
        ? state.detections.reduce((s, d) => s + d.confidence, 0) / state.detections.length
        : 0;
    document.getElementById('accuracy').textContent = (avgConf * 100).toFixed(1) + '%';

    const fps = 25 + Math.floor(Math.random() * 6);
    document.getElementById('fps').textContent = fps + ' FPS';

    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    document.getElementById('sessionDuration').textContent = mm + ':' + ss;

    // Zone stats
    document.getElementById('leftZoneCount').textContent = state.leftZone;
    document.getElementById('rightZoneCount').textContent = state.rightZone;
    const total = state.leftZone + state.rightZone;
    document.getElementById('leftZonePct').textContent = total > 0 ? ((state.leftZone / total) * 100).toFixed(0) + '%' : '0%';
    document.getElementById('rightZonePct').textContent = total > 0 ? ((state.rightZone / total) * 100).toFixed(0) + '%' : '0%';

    // Log count
    document.getElementById('logCount').textContent = state.detections.length + ' entries';
}

function addLogRow(det) {
    const tbody = document.getElementById('logTableBody');
    const row = document.createElement('tr');
    row.className = 'new-row';

    const zoneBadge = `<span class="zone-badge ${det.zone === 'Kiri' ? 'left' : 'right'}">${det.zone}</span>`;
    const confPct = (det.confidence * 100).toFixed(1);
    const confBar = `<div class="confidence-bar"><span>${confPct}%</span><div class="conf-fill"><div class="conf-fill-inner" style="width:${confPct}%"></div></div></div>`;

    row.innerHTML = `
        <td style="color:var(--text-muted)">${det.timestamp}</td>
        <td><strong>${det.ball_id}</strong></td>
        <td>${det.position.x}</td>
        <td>${det.position.y}</td>
        <td>${zoneBadge}</td>
        <td>${confBar}</td>
        <td>${det.latency_ms} ms</td>
        <td style="color:var(--accent-cyan)">${det.model}</td>
        <td>${det.servo_angle}&deg;</td>
    `;

    tbody.insertBefore(row, tbody.firstChild);

    // Keep max 50 rows visible
    while (tbody.children.length > 50) {
        tbody.removeChild(tbody.lastChild);
    }
}

function updateZoneChart(det) {
    const interval = parseInt(document.getElementById('chartInterval').value);
    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    const bucket = Math.floor(elapsed / interval) * interval;
    const label = bucket + 's';

    const labels = zoneChart.data.labels;
    const leftData = zoneChart.data.datasets[0].data;
    const rightData = zoneChart.data.datasets[1].data;

    const idx = labels.indexOf(label);
    if (idx === -1) {
        labels.push(label);
        leftData.push(det.zone === 'Kiri' ? 1 : 0);
        rightData.push(det.zone === 'Kanan' ? 1 : 0);

        // Keep last 10 intervals
        if (labels.length > 10) {
            labels.shift();
            leftData.shift();
            rightData.shift();
        }
    } else {
        if (det.zone === 'Kiri') leftData[idx]++;
        else rightData[idx]++;
    }

    zoneChart.update('none');
}

function updateConfidenceChart(det) {
    const labels = confidenceChart.data.labels;
    const data = confidenceChart.data.datasets[0].data;

    labels.push(det.timestamp.split('.')[0]);
    data.push(det.confidence);

    if (labels.length > 30) {
        labels.shift();
        data.shift();
    }

    confidenceChart.update('none');
}

function updateHeatmap(det) {
    const gx = Math.floor((det.position.x / 274) * HGRID_X);
    const gy = Math.floor((det.position.y / 152.5) * HGRID_Y);
    const cx = Math.max(0, Math.min(HGRID_X - 1, gx));
    const cy = Math.max(0, Math.min(HGRID_Y - 1, gy));
    heatmapGrid[cy][cx]++;

    // Spread to neighbors slightly
    if (cy > 0) heatmapGrid[cy - 1][cx] += 0.3;
    if (cy < HGRID_Y - 1) heatmapGrid[cy + 1][cx] += 0.3;
    if (cx > 0) heatmapGrid[cy][cx - 1] += 0.3;
    if (cx < HGRID_X - 1) heatmapGrid[cy][cx + 1] += 0.3;
}

function updatePerformance() {
    const total = state.leftZone + state.rightZone;
    if (total === 0) return;

    const returnRate = 65 + Math.floor(Math.random() * 20);
    const leftAcc = total > 5 ? Math.floor(55 + Math.random() * 30) : 65;
    const rightAcc = total > 5 ? Math.floor(60 + Math.random() * 30) : 81;
    const avgLat = state.detections.length > 0
        ? Math.floor(state.detections.slice(-20).reduce((s, d) => s + d.latency_ms, 0) / Math.min(state.detections.length, 20))
        : 24;

    updateRing('perfReturnRate', returnRate, 100, returnRate + '%');
    updateRing('perfLeftAccuracy', leftAcc, 100, leftAcc + '%');
    updateRing('perfRightAccuracy', rightAcc, 100, rightAcc + '%');
    updateRing('perfAvgLatency', 50 - (avgLat / 50 * 50), 50, avgLat + 'ms');

    // Update weakness
    if (leftAcc < rightAcc) {
        document.getElementById('weaknessZone').textContent = 'Zona Kiri - Forehand';
        document.getElementById('weaknessFill').style.width = (100 - leftAcc) + '%';
    } else {
        document.getElementById('weaknessZone').textContent = 'Zona Kanan - Backhand';
        document.getElementById('weaknessFill').style.width = (100 - rightAcc) + '%';
    }
}

function updateRing(id, value, max, label) {
    const el = document.getElementById(id);
    const circle = el.querySelector('.ring-fg');
    const text = el.querySelector('.ring-value');
    const circumference = 2 * Math.PI * 42;
    const offset = circumference - (value / max) * circumference;
    circle.style.strokeDashoffset = Math.max(0, offset);
    text.textContent = label;
}

// --- Render Loop ---
function renderCanvases() {
    // Table canvas
    const tableCanvas = document.getElementById('tableCanvas');
    const tCtx = tableCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const tw = tableCanvas.clientWidth;
    const th = tableCanvas.clientHeight;
    tableCanvas.width = tw * dpr;
    tableCanvas.height = th * dpr;
    tCtx.scale(dpr, dpr);

    // Clean old positions
    state.ballPositions = state.ballPositions.filter(bp => Date.now() - bp.time < 3000);
    drawTable(tCtx, tw, th, state.ballPositions);

    // Heatmap canvas
    const hmCanvas = document.getElementById('heatmapCanvas');
    const hmCtx = hmCanvas.getContext('2d');
    const hw = hmCanvas.clientWidth;
    const hh = hmCanvas.clientHeight;
    hmCanvas.width = hw * dpr;
    hmCanvas.height = hh * dpr;
    hmCtx.scale(dpr, dpr);
    drawHeatmap(hmCtx, hw, hh);

    requestAnimationFrame(renderCanvases);
}

// --- Simulation Loop ---
let simInterval = null;

function startSimulation() {
    if (simInterval) return;
    simInterval = setInterval(() => {
        if (!state.sessionActive) return;

        const det = generateDetection();
        state.totalBalls++;
        if (det.zone === 'Kiri') state.leftZone++;
        else state.rightZone++;

        state.detections.push(det);
        state.ballPositions.push({
            x: det.position.x,
            y: det.position.y,
            time: Date.now(),
        });

        addLogRow(det);
        updateZoneChart(det);
        updateConfidenceChart(det);
        updateHeatmap(det);
        updateMetrics();

        if (state.totalBalls % 5 === 0) {
            updatePerformance();
        }
    }, 800 + Math.floor(Math.random() * 700));
}

function stopSimulation() {
    if (simInterval) {
        clearInterval(simInterval);
        simInterval = null;
    }
}

// --- Duration ticker ---
setInterval(() => {
    if (state.sessionActive) {
        const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');
        document.getElementById('sessionDuration').textContent = mm + ':' + ss;
    }
}, 1000);

// --- Event Handlers ---
document.getElementById('btnToggleSession').addEventListener('click', () => {
    state.sessionActive = !state.sessionActive;
    const badge = document.querySelector('.session-badge');
    const btn = document.getElementById('btnToggleSession');
    const btnIcon = document.getElementById('btnIcon');
    const btnText = document.getElementById('btnText');

    if (state.sessionActive) {
        badge.className = 'session-badge active';
        badge.innerHTML = '<span class="pulse-dot"></span> Session Active';
        btn.style.background = 'var(--accent-red)';
        btnIcon.innerHTML = '&#9724;';
        btnText.textContent = 'Stop Session';
        startSimulation();
    } else {
        badge.className = 'session-badge';
        badge.style.background = 'rgba(107,114,128,0.12)';
        badge.style.color = 'var(--text-muted)';
        badge.style.border = '1px solid rgba(107,114,128,0.25)';
        badge.innerHTML = '<span class="status-dot" style="width:8px;height:8px;border-radius:50%;background:var(--text-muted)"></span> Session Paused';
        btn.style.background = 'var(--accent-green)';
        btnIcon.innerHTML = '&#9654;';
        btnText.textContent = 'Start Session';
        stopSimulation();
    }
});

document.getElementById('btnClearLog').addEventListener('click', () => {
    document.getElementById('logTableBody').innerHTML = '';
    state.detections = [];
    document.getElementById('logCount').textContent = '0 entries';
});

// Slider handlers
document.getElementById('motorSpeed').addEventListener('input', (e) => {
    document.getElementById('motorSpeedVal').textContent = e.target.value + '%';
});

document.getElementById('servoAngle').addEventListener('input', (e) => {
    document.getElementById('servoAngleVal').innerHTML = e.target.value + '&deg;';
});

document.getElementById('launchInterval').addEventListener('input', (e) => {
    document.getElementById('launchIntervalVal').textContent = e.target.value + 's';
});

document.getElementById('adaptiveMode').addEventListener('change', (e) => {
    document.getElementById('adaptiveLabel').textContent = e.target.checked ? 'Aktif' : 'Nonaktif';
    document.getElementById('adaptiveLabel').style.color = e.target.checked ? 'var(--accent-green)' : 'var(--text-muted)';
});

// --- Initialize ---
renderCanvases();
startSimulation();
updateMetrics();
