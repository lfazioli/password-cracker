import os
import csv
import time
import json
import hashlib
import tempfile
import zipfile
import tarfile
from flask import Flask, request, Response, render_template, send_file
from werkzeug.utils import secure_filename

app = Flask(__name__, template_folder="../templates", static_folder="../public")
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()


def hash_password(password, algorithm='sha256'):
    password_bytes = password.encode()
    if algorithm == 'md5':
        return hashlib.md5(password_bytes).hexdigest()
    elif algorithm == 'sha1':
        return hashlib.sha1(password_bytes).hexdigest()
    elif algorithm == 'sha256':
        return hashlib.sha256(password_bytes).hexdigest()
    elif algorithm == 'sha512':
        return hashlib.sha512(password_bytes).hexdigest()
    elif algorithm == 'blake2b':
        return hashlib.blake2b(password_bytes).hexdigest()
    elif algorithm == 'blake2s':
        return hashlib.blake2s(password_bytes).hexdigest()
    else:
        raise ValueError("Algoritmo non supportato")


def extract_passwords_from_files(files):
    all_passwords = []

    for file in files:
        filename = secure_filename(file.filename)
        temp_path = os.path.join(tempfile.gettempdir(), filename)
        file.save(temp_path)

        if filename.endswith('.zip'):
            with zipfile.ZipFile(temp_path, 'r') as zip_ref:
                for inner_file in zip_ref.namelist():
                    if inner_file.endswith('.txt'):
                        with zip_ref.open(inner_file) as f:
                            content = f.read().decode(errors='ignore')
                            all_passwords.extend(content.splitlines())
        elif filename.endswith('.tar.gz') or filename.endswith('.tgz'):
            with tarfile.open(temp_path, 'r:gz') as tar:
                for member in tar.getmembers():
                    if member.isfile() and member.name.endswith('.txt'):
                        f = tar.extractfile(member)
                        if f:
                            content = f.read().decode(errors='ignore')
                            all_passwords.extend(content.splitlines())
        elif filename.endswith('.txt'):
            with open(temp_path, 'r', encoding='utf-8', errors='ignore') as f:
                all_passwords.extend(f.readlines())

    return [pw.strip() for pw in all_passwords if pw.strip()]


def save_stats(stats):
    filename = os.path.join(tempfile.gettempdir(), "stats_log.json")
    try:
        if os.path.exists(filename):
            with open(filename, "r") as f:
                data = json.load(f)
        else:
            data = []

        data.append(stats)

        with open(filename, "w") as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print(f"Errore nel salvataggio: {e}")


def generate(target_password, passwords, hash_algorithm):
    total = len(passwords)
    start_time = time.time()
    target_hash = hash_password(target_password, hash_algorithm)

    for i, word in enumerate(passwords):
        hashed = hash_password(word, hash_algorithm)
        percent = int((i + 1) / total * 100)
        yield f"data:progress:{percent}\n\n"
        if hashed == target_hash:
            total_time = time.time() - start_time
            avg_time = total_time / (i + 1)
            stats = {
                "passwordc": hashed,
                "status": "found",
                "password": word,
                "tries": i + 1,
                "total_time": round(total_time, 4),
                "avg_time": round(avg_time, 6)
            }
            save_stats(stats)
            yield f"data:stats:{json.dumps(stats)}\n\n"
            break

        time.sleep(0.01)

    else:
        total_time = time.time() - start_time
        avg_time = total_time / total if total > 0 else 0
        stats = {
            "status": "not_found",
            "tries": total,
            "total_time": round(total_time, 4),
            "avg_time": round(avg_time, 6)
        }
        save_stats(stats)
        yield f"data:stats:{json.dumps(stats)}\n\n"


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/crack', methods=['POST'])
def crack():
    password = request.form.get('password')
    hash_algorithm = request.form.get('hash_algorithm')
    files = request.files.getlist('file')

    if not password or not hash_algorithm or not files:
        return "Input non valido", 400

    password_list = extract_passwords_from_files(files)
    return Response(generate(password, password_list, hash_algorithm), content_type='text/event-stream')


@app.route('/download/json')
def download_json():
    path = os.path.join(tempfile.gettempdir(), "stats_log.json")
    return send_file(path, as_attachment=True)


@app.route('/download/csv')
def download_csv():
    json_path = os.path.join(tempfile.gettempdir(), "stats_log.json")
    csv_path = os.path.join(tempfile.gettempdir(), "stats_log.csv")

    with open(json_path, 'r') as f:
        data = json.load(f)

    with open(csv_path, 'w', newline='') as csvfile:
        fieldnames = ['status', 'password', 'tries', 'total_time', 'avg_time']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()

        for row in data:
            writer.writerow({
                'status': row.get('status', 'N/A'),
                'password': row.get('password', 'N/A'),
                'tries': row.get('tries', 0),
                'total_time': row.get('total_time', 0),
                'avg_time': row.get('avg_time', 0)
            })

    return send_file(csv_path, as_attachment=True)

# Per Vercel (usato quando deployi su serverless)
from mangum import Mangum
handler = Mangum(app)

