const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const wordEl = document.getElementById('word');
const sentenceEl = document.getElementById('sentence');
const wordList = [];

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
            wordEl.textContent = wordList.join(", ");
        }

        // if (data.sentence) {
        //     sentenceEl.textContent = data.sentence;
        // }
    });
}, 66);

document.getElementById('generateBtn').addEventListener('click', () => {
    fetch('/generate_sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: wordList })
    })
    .then(res => res.json())
    .then(data => {
        sentenceEl.textContent = data.sentence;
    });
});

function clearWords() {
    wordList.length = 0;
    wordEl.textContent = "-";
    sentenceEl.textContent = "-";

    fetch('/clear', {
        method: 'POST'
    });
}


document.getElementById('speakBtn').addEventListener('click', () => {
    fetch('/generate_sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: wordList, speak: false })  // just generate, no TTS
    })
    .then(res => res.json())
    .then(data => {
        const sentence = data.sentence;
        sentenceEl.textContent = sentence;

        // Now speak the freshly generated sentence
        if (sentence && sentence !== '-') {
            const utterance = new SpeechSynthesisUtterance(sentence);
            utterance.lang = 'en-US';
            utterance.rate = 1;
            speechSynthesis.speak(utterance);
        }
    });
});

