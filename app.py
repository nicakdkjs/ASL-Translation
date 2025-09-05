from flask import Flask, render_template, request, jsonify
import numpy as np
import cv2
import base64
from src.backbone import TFLiteModel, get_model
from src.landmarks_extraction import mediapipe_detection, extract_coordinates, load_json_file
from src.config import SEQ_LEN, THRESH_HOLD
import mediapipe as mp
import io
import csv, os, json, datetime
import re

LOG_DIR = "logs"
LOG_PATH = os.path.join(LOG_DIR, "sentence_edits.csv")

app = Flask(__name__)

# Load models once
model = get_model()
model.load_weights('./models/islr-fp16-192-8-seed_all42-foldall-last.h5')
asl = TFLiteModel(islr_models=[model])
mp_holistic = mp.solutions.holistic.Holistic(
    static_image_mode=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)
s2p_map = {k.lower(): v for k, v in load_json_file("src/sign_to_prediction_index_map.json").items()}
p2s_map = {v: k for k, v in s2p_map.items()}

sequence_data = []
res = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    global sequence_data, res
    data = request.json['image']
    encoded = data.split(',')[1]
    nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    image, results = mediapipe_detection(frame, mp_holistic)

    try:
        landmarks = extract_coordinates(results)
    except:
        landmarks = np.zeros((468 + 21 + 33 + 21, 3))

    sequence_data.append(landmarks)

    word = ''
    if len(sequence_data) >= SEQ_LEN:
        input_seq = np.array(sequence_data[-SEQ_LEN:], dtype=np.float32)
        pred = asl(input_seq)["outputs"].numpy()
        if np.max(pred) > THRESH_HOLD:
            word_id = np.argmax(pred)
            word = p2s_map.get(word_id)
            if word and word not in res:
                res.insert(0, word)
        sequence_data = []

    # if len(res) >= 3:
    #     sentence = build_sentence(res[::-1], speak=False)

    return jsonify({'word': word})

@app.route('/generate_sentence', methods=['POST'])
def generate_sentence():
    from src.sentence_constructor_tts import build_sentence

    data = request.get_json()
    words = data.get("words", [])
    speak = data.get("speak", False)

    if speak:
        sentence, audio_path = build_sentence(words[::-1], speak=True)
        return jsonify({"sentence": sentence, "audio_url": f"/{audio_path}"})
    else:
        sentence = build_sentence(words[::-1], speak=False)
        return jsonify({"sentence": sentence})

@app.route('/clear', methods=['POST'])
def clear():
    global sequence_data, res
    sequence_data.clear()
    res.clear()
    return jsonify({"status": "cleared"})

@app.route('/delete_last', methods=['POST'])
def delete_last():
    global res
    data = request.get_json(silent=True) or {}
    w = data.get("word")
    if res:
        # Prefer removing the front item (latest); fall back to value match
        if w and res[0] == w:
            res.pop(0)
        elif w in res:
            res.remove(w)
        else:
            res.pop(0)
    return jsonify({"status": "ok", "remaining": res})

def ensure_logfile():
    os.makedirs(LOG_DIR, exist_ok=True)
    header = ["timestamp_iso", "event", "words_json", "generated_sentence", "edited_sentence", "client_id"]
    if not os.path.exists(LOG_PATH):
        with open(LOG_PATH, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(header)

def _norm(s: str) -> str:
    # collapse whitespace, lowercase, strip outer punctuation spaces
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    return s.lower()

@app.route('/log_sentence', methods=['POST'])
def log_sentence():
    ensure_logfile()
    data = request.get_json(force=True) or {}
    event = data.get("event", "")
    words = data.get("words", [])
    generated = (data.get("generated_sentence") or "").strip()
    edited = (data.get("edited_sentence") or "").strip()
    client_id = request.remote_addr or "unknown"

    # ONLY log if edited exists and is different from generated
    if not edited or _norm(edited) == _norm(generated):
        return jsonify({"status": "skipped", "reason": "no_edit"})

    with open(LOG_PATH, "a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow([
            datetime.datetime.utcnow().isoformat(),
            (event or "edit"),
            json.dumps(words, ensure_ascii=False),
            generated,
            edited,
            client_id,
        ])
    return jsonify({"status": "logged"})

if __name__ == '__main__':
    app.run(debug=True)