const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const wordEl = document.getElementById('word');
const sentenceEl = document.getElementById('sentence');
const wordList = [];

function renderWords() {                                     
  wordEl.textContent = wordList.length ? wordList.join(", ") : "-";
}


navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => { video.srcObject = stream; });

setInterval(() => {
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Flip horizontally
    context.save();
    context.scale(-1, 1); // mirror flip
    context.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    context.restore();

    const dataUrl = canvas.toDataURL('image/jpeg');

    fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
    })
    .then(res => res.json())
    .then(data => {
        if (data.word) {
            if (!wordList.includes(data.word)) {
                wordList.unshift(data.word); // add new word to front
                if (wordList.length > 10) wordList.pop(); // limit list size
            }
            renderWords();                         // ← use helper
        }

        // if (data.sentence) {
        //     sentenceEl.textContent = data.sentence;
        // }
    });
}, 66);

function clearWords() {
    wordList.length = 0;
    renderWords();                         // ← use helper
    sentenceEl.textContent = "-";

    fetch('/clear', {
        method: 'POST'
    });
}

function speak(text) {
  // normalize multiple spaces to one
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return;
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'en-US';
  utterance.rate = 1;
  speechSynthesis.speak(utterance);
}

// Make the editable sentence behave well
sentenceEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.preventDefault();   // no newlines
});
sentenceEl.addEventListener('blur', () => {
  const t = sentenceEl.textContent.replace(/\s+/g, ' ').trim();
  sentenceEl.textContent = t || '-';
});

document.getElementById('speakBtn').addEventListener('click', () => {
  // Prefer whatever is currently edited in the UI
  let edited = sentenceEl.textContent.replace(/\s+/g, ' ').trim();

  if (edited && edited !== '-') {
    // Log the edited + (optionally) the last generated
    fetch('/log_sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'speak',
        words: wordList,
        generated_sentence: lastGenerated,
        edited_sentence: edited
      })
    });

    // Speak the edited text
    speak(edited);
    return;
  }

  // Fallback: generate from words, then speak + log both
  fetch('/generate_sentence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words: wordList, speak: false })
  })
  .then(res => res.json())
  .then(data => {
    const sentence = (data.sentence || '').trim();
    sentenceEl.textContent = sentence || '-';
    lastGenerated = sentence;

    // Log: no manual edit in this fallback path
    fetch('/log_sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'speak',
        words: wordList,
        generated_sentence: sentence,
        edited_sentence: ''
      })
    });

    if (sentence) speak(sentence);
  });
});


// add near your other DOM listeners
document.getElementById('deleteBtn').addEventListener('click', () => {
  if (!wordList.length) return;
  const removed = wordList.shift();     // newest is at the front
  renderWords();                        // refresh "Detected Words" display
  // (optional) tell server so its `res` list matches the browser
  fetch('/delete_last', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word: removed })
  }).catch(() => {}); // best-effort; UI already updated
});

let lastGenerated = ""; // cache the server's generated sentence
document.getElementById('generateBtn').addEventListener('click', () => {
  fetch('/generate_sentence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ words: wordList })
  })
  .then(res => res.json())
  .then(data => {
    lastGenerated = (data.sentence || '').trim();
    sentenceEl.textContent = lastGenerated || '-';

    // Log the generation
    fetch('/log_sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'generate',
        words: wordList,
        generated_sentence: lastGenerated,
        edited_sentence: ''
      })
    });
  });
});

