let crackChart = null;
let pieChart = null;
let tries = [];
let times = [];

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
    resultBox.innerHTML = '';
    progressBar.style.width = '0%';
    tries = [];
    times = [];

    if (crackChart) crackChart.destroy();
    if (pieChart) pieChart.destroy();

    const formData = new FormData();
    formData.append('password', password);
    formData.append('hash_algorithm', hashAlgorithm);
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('file', fileInput.files[i]);
    }

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
                    return;
                }

                const text = decoder.decode(value, { stream: true });
                const events = text.split('\n\n');

                for (let event of events) {
                    if (event.startsWith('data:')) {
                        const content = event.replace('data:', '');

                        if (content.startsWith('progress:')) {
                            const percent = content.split(':')[1];
                            progressBar.style.width = percent + '%';

                            if (pieChart) pieChart.destroy();
                            pieChart = new Chart(pieChartCanvas, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Fatto', 'Rimanente'],
                                    datasets: [{
                                        data: [parseInt(percent), 100 - parseInt(percent)],
                                        backgroundColor: ['lime', 'gray']
                                    }]
                                }
                            });
                        }

                        if (content.startsWith('stats:')) {
                            const json = content.replace('stats:', '');
                            const stats = JSON.parse(json);

                            tries.push(stats.tries);
                            times.push(stats.avg_time);

                            // Colori per il grafico a torta finale
                            let pieData, pieColors;

                            if (stats.status === "found") {
                                pieData = [100, 0];
                                pieColors = ['lime', 'gray'];
                            } else {
                                pieData = [0, 100];
                                pieColors = ['red', 'gray'];
                            }

                            progressBar.style.width = '100%';
                            if (pieChart) pieChart.destroy();
                            pieChart = new Chart(pieChartCanvas, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Fatto', 'Rimanente'],
                                    datasets: [{
                                        data: pieData,
                                        backgroundColor: pieColors
                                    }]
                                }
                            });

                            // Mostra risultato
                            if (stats.status === "found") {
                                resultBox.innerHTML = `
                                    ✅ <strong>Password trovata:</strong> ${stats.password}<br>
                                    🔣 Password codificata: ${stats.passwordc}<br>
                                    🔁 Tentativi: ${stats.tries}<br>
                                    ⏱️ Tempo totale: ${stats.total_time}s<br>
                                    ⚙️ Tempo medio per tentativo: ${stats.avg_time}s
                                `;
                            } else {
                                resultBox.innerHTML = `
                                    ❌ <strong>Password non trovata</strong><br>
                                      🔣 Password codificata: ${stats.passwordc}<br>
                                    🔁 Tentativi: ${stats.tries}<br>
                                    ⏱️ Tempo totale: ${stats.total_time}s<br>
                                    ⚙️ Tempo medio per tentativo: ${stats.avg_time}s
                                `;
                            }

                            // Line chart
                            if (crackChart) crackChart.destroy();
                            crackChart = new Chart(crackChartCanvas, {
                                type: 'line',
                                data: {
                                    labels: Array.from({ length: tries.length }, (_, i) => i + 1),
                                    datasets: [{
                                        label: 'Tempo medio per tentativo',
                                        data: times,
                                        borderColor: 'lime',
                                        borderWidth: 2,
                                        fill: false
                                    }]
                                }
                            });
                        }
                    }
                }

                read();
            });
        }

        read();
    }).catch((error) => {
        resultBox.innerHTML = `<strong>Errore durante il cracking!</strong><br>Dettagli: ${error.message}`;
    }).finally(() => {
        submitButton.disabled = false;
    });
});

// 🎯 Download da endpoint Flask
document.getElementById('downloadJSON').addEventListener('click', () => {
    window.location.href = '/download/json';
});

document.getElementById('downloadCSV').addEventListener('click', () => {
    window.location.href = '/download/csv';
});
