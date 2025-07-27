from transformers import pipeline
from TTS.api import TTS
import os
import platform

# Load T5 sentence generator
t5 = pipeline("text2text-generation", model="mrm8488/t5-base-finetuned-common_gen")

# Load Coqui TTS model only once
tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False, gpu=False)

def play_audio(file_path):
    system = platform.system()
    if system == "Windows":
        os.system(f'start {file_path}')
    elif system == "Darwin":  # macOS
        os.system(f'afplay {file_path}')
    else:  # Linux
        os.system(f'aplay {file_path}')

def build_sentence(predicted_words, speak=False):
    if not predicted_words:
        return ""

    # Remove duplicates, preserve order, and keep last few
    cleaned_words = list(dict.fromkeys(predicted_words))[-7:]

    prompt = " ".join(cleaned_words)
    result = t5(prompt, max_length=30, num_beams=4, clean_up_tokenization_spaces=True)
    sentence = result[0]['generated_text'].strip()

    # Format sentence
    sentence = sentence[0].upper() + sentence[1:]
    if not sentence.endswith((".", "!", "?")):
        sentence += "."

    # Use TTS if requested
    if speak:
        tts.tts_to_file(text=sentence, file_path="output.wav")
        play_audio("output.wav")

    return sentence
