let crackChart = null;
let pieChart = null;
let tries = [];
let times = [];

const statusConsole = document.getElementById('status');
const progressPercentLabel = document.getElementById('progress-percent');

function logLine(text, cls) {
    const line = document.createElement('span');
    line.className = 'line' + (cls ? ' ' + cls : '');
    line.textContent = text;
    statusConsole.appendChild(line);
    statusConsole.scrollTop = statusConsole.scrollHeight;
}

function clearConsole() {
    statusConsole.innerHTML = '';
}

/* ---------- Dropzone ---------- */

const dropzone = document.getElementById('dropzone');
const fileInputEl = document.getElementById('file');
const dzFiles = document.getElementById('dz-files');

function renderFileNames() {
    if (fileInputEl.files.length === 0) {
        dzFiles.textContent = '';
        return;
    }
    const names = Array.from(fileInputEl.files).map(f => f.name);
    dzFiles.textContent = names.join(', ');
}

fileInputEl.addEventListener('change', renderFileNames);

['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
});

['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
    });
});

dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) {
        fileInputEl.files = e.dataTransfer.files;
        renderFileNames();
    }
});

/* ---------- Chart theme ---------- */

const CHART_COLORS = {
    accent: '#2fd9c7',
    accentDim: 'rgba(47, 217, 199, 0.15)',
    warn: '#ffb020',
    danger: '#ff5f6d',
    grid: 'rgba(139, 147, 165, 0.15)',
    text: '#8b93a5'
};

function baseChartOptions(extra) {
    return Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: CHART_COLORS.text, font: { family: 'Inter', size: 11 } }
            }
        }
    }, extra || {});
}

/* ---------- Form submit ---------- */

document.getElementById('cracker-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const password = document.getElementById('password').value;
    const fileInput = document.getElementById('file');
    const hashAlgorithm = document.getElementById('hash_algorithm').value;
    const resultBox = document.getElementById('results');
    const progressBar = document.getElementById('progress-fill');
    const submitButton = document.getElementById('submitButton');
    const crackChartCanvas = document.getElementById('crackChart').getContext('2d');
    const pieChartCanvas = document.getElementById('pieChart').getContext('2d');

    // Reset
    submitButton.disabled = true;
    submitButton.textContent = 'Cracking in corso…';
    resultBox.innerHTML = '';
    resultBox.classList.remove('not-found');
    progressBar.style.width = '0%';
    progressPercentLabel.textContent = '0%';
    tries = [];
    times = [];
    clearConsole();
    logLine('> avvio simulazione — algoritmo ' + hashAlgorithm.toUpperCase());
    logLine('> estrazione dizionario dai file caricati…');

    if (crackChart) crackChart.destroy();
    if (pieChart) pieChart.destroy();

    document.querySelector('.box-graphic').style.display = 'none';
    document.querySelector('.box-download').style.display = 'none';

    const formData = new FormData();
    formData.append('password', password);
    formData.append('hash_algorithm', hashAlgorithm);
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('file', fileInput.files[i]);
    }

    let loggedStart = false;

    fetch('/crack', {
        method: 'POST',
        body: formData
    }).then(response => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        function read() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Avvia cracking';
                    return;
                }

                const text = decoder.decode(value, { stream: true });
                const events = text.split('\n\n');

                for (let event of events) {
                    if (event.startsWith('data:')) {
                        const content = event.replace('data:', '');

                        if (content.startsWith('progress:')) {
                            if (!loggedStart) {
                                logLine('> confronto hash in corso…');
                                loggedStart = true;
                            }
                            const percent = content.split(':')[1];
                            progressBar.style.width = percent + '%';
                            progressPercentLabel.textContent = percent + '%';

                            if (pieChart) pieChart.destroy();
                            pieChart = new Chart(pieChartCanvas, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Completato', 'Rimanente'],
                                    datasets: [{
                                        data: [parseInt(percent), 100 - parseInt(percent)],
                                        backgroundColor: [CHART_COLORS.accent, 'rgba(139,147,165,0.15)'],
                                        borderWidth: 0
                                    }]
                                },
                                options: baseChartOptions()
                            });
                        }

                        if (content.startsWith('stats:')) {
                            const json = content.replace('stats:', '');
                            const stats = JSON.parse(json);

                            tries.push(stats.tries);
                            times.push(stats.avg_time);

                            let pieData, pieColors;

                            if (stats.status === "found") {
                                pieData = [100, 0];
                                pieColors = [CHART_COLORS.accent, 'rgba(139,147,165,0.15)'];
                                logLine('> password trovata dopo ' + stats.tries + ' tentativi', 'ok');
                            } else {
                                pieData = [0, 100];
                                pieColors = [CHART_COLORS.danger, 'rgba(139,147,165,0.15)'];
                                logLine('> nessuna corrispondenza nel dizionario (' + stats.tries + ' tentativi)', 'warn');
                            }

                            progressBar.style.width = '100%';
                            progressPercentLabel.textContent = '100%';

                            if (pieChart) pieChart.destroy();
                            pieChart = new Chart(pieChartCanvas, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Completato', 'Rimanente'],
                                    datasets: [{
                                        data: pieData,
                                        backgroundColor: pieColors,
                                        borderWidth: 0
                                    }]
                                },
                                options: baseChartOptions()
                            });

                            if (stats.status === "found") {
                                resultBox.classList.remove('not-found');
                                resultBox.innerHTML = `
                                    <strong>✓ Password trovata:</strong> ${stats.password}<br>
                                    Hash: ${stats.passwordc}<br>
                                    Tentativi: ${stats.tries}<br>
                                    Tempo totale: ${stats.total_time}s<br>
                                    Tempo medio/tentativo: ${stats.avg_time}s
                                `;
                            } else {
                                resultBox.classList.add('not-found');
                                resultBox.innerHTML = `
                                    <strong>✗ Password non trovata</strong><br>
                                    Hash cercato: ${stats.passwordc}<br>
                                    Tentativi: ${stats.tries}<br>
                                    Tempo totale: ${stats.total_time}s<br>
                                    Tempo medio/tentativo: ${stats.avg_time}s
                                `;
                            }

                            if (crackChart) crackChart.destroy();
                            crackChart = new Chart(crackChartCanvas, {
                                type: 'line',
                                data: {
                                    labels: Array.from({ length: tries.length }, (_, i) => i + 1),
                                    datasets: [{
                                        label: 'Tempo medio per tentativo',
                                        data: times,
                                        borderColor: CHART_COLORS.accent,
                                        backgroundColor: CHART_COLORS.accentDim,
                                        borderWidth: 2,
                                        fill: true,
                                        tension: 0.3
                                    }]
                                },
                                options: baseChartOptions({
                                    scales: {
                                        x: { ticks: { color: CHART_COLORS.text }, grid: { color: CHART_COLORS.grid } },
                                        y: { ticks: { color: CHART_COLORS.text }, grid: { color: CHART_COLORS.grid } }
                                    }
                                })
                            });

                            document.querySelector('.box-graphic').style.display = 'flex';
                            document.querySelector('.box-download').style.display = 'flex';
                        }
                    }
                }

                read();
            });
        }

        read();
    }).catch((error) => {
        logLine('> errore: ' + error.message, 'warn');
        resultBox.classList.add('not-found');
        resultBox.innerHTML = `<strong>Errore durante il cracking!</strong><br>Dettagli: ${error.message}`;
    }).finally(() => {
        submitButton.disabled = false;
        submitButton.textContent = 'Avvia cracking';
    });
});

// Download da endpoint Flask
document.getElementById('downloadJSON').addEventListener('click', () => {
    window.location.href = '/download/json';
});

document.getElementById('downloadCSV').addEventListener('click', () => {
    window.location.href = '/download/csv';
});
