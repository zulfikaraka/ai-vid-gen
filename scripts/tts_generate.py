#!/usr/bin/env python3
"""
Proof & Myth — Natural Indonesian AI TTS + Word-Level Timestamp Generator
Supports:
  1. Gemini TTS (gemini-2.5-flash-preview-tts) + local faster-whisper word timestamps
     Env: GEMINI_API_KEY (can be placed in .env)
  2. ElevenLabs API (native word timestamps)
     Env: ELEVENLABS_API_KEY, optional ELEVENLABS_VOICE_ID

Usage:
  .venv/bin/python scripts/tts_generate.py episodes/ep01_mitos_charging_hp --provider gemini --voice Puck
  .venv/bin/python scripts/tts_generate.py episodes/ep01_mitos_charging_hp --provider elevenlabs
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import urllib.request
import wave
from pathlib import Path


def load_dotenv(root: Path) -> None:
    candidates = [
        root / ".env",
        Path(os.path.expandvars(r"%LOCALAPPDATA%\hermes\.env")),
    ]
    for env_file in candidates:
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def collect_segments(episode: dict) -> list[dict]:
    segments = []
    if episode.get("intro"):
        segments.append({"id": "intro", "beats": episode["intro"].get("beats", [])})
    for mod in episode.get("modules", []):
        segments.append({"id": mod["id"], "beats": mod.get("beats", [])})
    if episode.get("outro"):
        segments.append({"id": "outro", "beats": episode["outro"].get("beats", [])})
    return segments


def probe_duration(audio_path: Path) -> float:
    res = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(res.stdout.strip())


def wav_to_mp3(wav_path: Path, mp3_path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(wav_path),
            "-af", "silenceremove=start_periods=1:start_silence=0.1:start_threshold=-45dB:detection=peak",
            "-codec:a", "libmp3lame", "-qscale:a", "2",
            str(mp3_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def concat_mp3s(mp3_list: list[Path], out_mp3: Path) -> None:
    list_file = out_mp3.parent / "_concat_list.txt"
    lines = [f"file '{p.resolve()}'" for p in mp3_list]
    list_file.write_text("\n".join(lines), encoding="utf-8")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c", "copy", str(out_mp3)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    list_file.unlink(missing_ok=True)


def generate_gemini_beat(client, text: str, out_mp3: Path, voice_name: str, style_prompt: str) -> float:
    from google.genai import types

    prompt = f"{style_prompt}\n\n{text}"
    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=voice_name,
                    )
                )
            ),
        ),
    )

    audio_bytes = response.candidates[0].content.parts[0].inline_data.data
    tmp_wav = out_mp3.with_suffix(".wav")
    with wave.open(str(tmp_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(audio_bytes)

    wav_to_mp3(tmp_wav, out_mp3)
    tmp_wav.unlink(missing_ok=True)
    return probe_duration(out_mp3)


def generate_edge_beat(text: str, out_mp3: Path, voice: str, rate: str) -> float:
    import asyncio
    import edge_tts

    raw_mp3 = out_mp3.with_suffix(".raw.mp3")

    async def _run():
        comm = edge_tts.Communicate(text, voice=voice, rate=rate)
        await comm.save(str(raw_mp3))

    asyncio.run(_run())
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(raw_mp3),
            "-af", "silenceremove=start_periods=1:start_silence=0.08:start_threshold=-45dB:detection=peak",
            "-codec:a", "libmp3lame", "-qscale:a", "2",
            str(out_mp3),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    raw_mp3.unlink(missing_ok=True)
    return probe_duration(out_mp3)


def extract_words_whisper(mp3_path: Path, offset_sec: float, whisper_model) -> list[dict]:
    segments, _ = whisper_model.transcribe(
        str(mp3_path),
        language="id",
        word_timestamps=True,
        vad_filter=True,
    )
    words = []
    for seg in segments:
        for w in (seg.words or []):
            token = w.word.strip()
            if not token:
                continue
            words.append({
                "word": token,
                "start": round(w.start + offset_sec, 3),
                "end": round(w.end + offset_sec, 3),
            })
    return words


def chars_to_words(alignment: dict, offset_sec: float = 0.0) -> list[dict]:
    chars = alignment.get("characters", [])
    starts = alignment.get("character_start_times_seconds", [])
    ends = alignment.get("character_end_times_seconds", [])
    words, buf = [], []
    w_start, w_end = None, None
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if buf:
                words.append({"word": "".join(buf), "start": round(w_start + offset_sec, 3), "end": round(w_end + offset_sec, 3)})
                buf, w_start = [], None
        else:
            if w_start is None:
                w_start = s
            w_end = e
            buf.append(ch)
    if buf:
        words.append({"word": "".join(buf), "start": round(w_start + offset_sec, 3), "end": round(w_end + offset_sec, 3)})
    return words


def generate_elevenlabs_beat(
    text: str,
    out_mp3: Path,
    voice_id: str,
    api_key: str,
    model_id: str = "eleven_multilingual_v2",
) -> tuple[float, list[dict]]:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
    payload = json.dumps({
        "text": text,
        "model_id": model_id,
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.78, "style": 0.35, "use_speaker_boost": True},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"xi-api-key": api_key, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    out_mp3.write_bytes(base64.b64decode(data["audio_base64"]))
    return probe_duration(out_mp3), chars_to_words(data.get("alignment", {}))


def main() -> None:
    load_dotenv(Path.cwd())

    parser = argparse.ArgumentParser(description="Generate natural Indonesian VO + words.json")
    parser.add_argument("episode_dir", help="Path to episode directory containing episode.json")
    parser.add_argument("--tier", choices=["free", "paid"], default=None,
                        help="Shortcut: free = Gemini TTS, paid = ElevenLabs TTS")
    parser.add_argument("--provider", choices=["gemini", "edge", "elevenlabs"], default=None,
                        help="Explicit TTS provider (overrides default if --tier is not set)")
    parser.add_argument("--model", default="eleven_multilingual_v2",
                        help="ElevenLabs model_id (e.g. eleven_multilingual_v2 or eleven_flash_v2_5)")
    parser.add_argument("--voice", default=None,
                        help="Voice name: Gemini (Puck/Kore/Charon), Edge (id-ID-ArdiNeural), or ElevenLabs voice ID")
    parser.add_argument("--rate", default="+6%", help="Edge TTS speech rate adjustment (e.g. +6%, +0%)")
    parser.add_argument("--whisper-model", default="small", help="faster-whisper model size (tiny, base, small, medium)")
    parser.add_argument("--force", action="store_true", help="Regenerate beats even if cached MP3 exists")
    parser.add_argument("--sync-durations", action="store_true", default=True, help="Auto-update beat durations in episode.json to match real VO")
    args = parser.parse_args()

    # Resolve provider from --tier (free -> gemini, paid -> elevenlabs) or --provider (default: gemini)
    if args.tier == "paid":
        provider = "elevenlabs"
    elif args.tier == "free":
        provider = "gemini"
    elif args.provider:
        provider = args.provider
    else:
        provider = "gemini"

    if not args.voice:
        if provider == "gemini":
            args.voice = "Puck"
        elif provider == "elevenlabs":
            args.voice = os.environ.get("ELEVENLABS_VOICE_ID", "wvv6DzcHyOVTDgDY7SMW")  # Andi - Clear and confident
        else:
            args.voice = "id-ID-ArdiNeural"

    ep_dir = Path(args.episode_dir).resolve()
    ep_json = ep_dir / "episode.json"
    if not ep_json.exists():
        sys.exit(f"episode.json not found in {ep_dir}")

    episode = json.loads(ep_json.read_text(encoding="utf-8"))
    audio_dir = ep_dir / "audio"
    beats_dir = audio_dir / "beats"
    beats_dir.mkdir(parents=True, exist_ok=True)

    segments = collect_segments(episode)
    total_chars = sum(
        len((b.get("narration") or "").strip())
        for seg in segments
        for b in seg["beats"]
    )
    if provider == "elevenlabs":
        mult = 0.5 if ("flash" in args.model or "turbo" in args.model) else 1.0
        est_credits = int(round(total_chars * mult))
        print(f"[TTS] Tier=PAID (ElevenLabs) | model={args.model} | voice={args.voice} | {total_chars} chars (~{est_credits} credits)", flush=True)
    elif provider == "gemini":
        print(f"[TTS] Tier=FREE (Gemini TTS) | voice={args.voice} | {total_chars} chars (0 ElevenLabs credits)", flush=True)
    else:
        print(f"[TTS] Provider=Edge | voice={args.voice} | {total_chars} chars", flush=True)

    all_words = []
    all_beat_mp3s = []
    cursor = 0.0

    if provider == "gemini":
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            sys.exit("Missing GEMINI_API_KEY. Set it in .env or export GEMINI_API_KEY=...")

        from google import genai
        from faster_whisper import WhisperModel

        client = genai.Client(api_key=api_key, http_options={"api_version": "v1beta"})
        print(f"Loading faster-whisper ({args.whisper_model}) for Indonesian word-level timestamps...")
        whisper_model = WhisperModel(args.whisper_model, device="cpu", compute_type="int8")

        style_prompt = (
            "Bacakan kalimat berikut dalam bahasa Indonesia dengan intonasi narator edukasi sains yang "
            "santai, antusias, artikulasi jelas, dan ritme pas seperti kreator YouTube modern:"
        )

        for seg in segments:
            seg_mp3s = []
            for b_idx, beat in enumerate(seg["beats"]):
                narration = (beat.get("narration") or "").strip()
                if not narration:
                    cursor += float(beat.get("duration", 4))
                    continue
                beat_mp3 = beats_dir / f"{seg['id']}_b{b_idx:02d}.mp3"
                if not args.force and beat_mp3.exists() and beat_mp3.stat().st_size > 1000:
                    print(f"  [Cached] {seg['id']} beat {b_idx}")
                    dur = probe_duration(beat_mp3)
                else:
                    print(f"  [Gemini TTS:{args.voice}] {seg['id']} beat {b_idx} ...")
                    dur = generate_gemini_beat(client, narration, beat_mp3, args.voice, style_prompt)
                words = extract_words_whisper(beat_mp3, cursor, whisper_model)
                all_words.extend(words)
                if args.sync_durations:
                    beat["duration"] = round(dur, 3)
                seg_mp3s.append(beat_mp3)
                all_beat_mp3s.append(beat_mp3)
                cursor += dur

            if seg_mp3s:
                seg_out = audio_dir / f"vo_{seg['id']}.mp3"
                concat_mp3s(seg_mp3s, seg_out)

    elif provider == "edge":
        from faster_whisper import WhisperModel

        print(f"Loading faster-whisper ({args.whisper_model}) for Indonesian word-level timestamps...")
        whisper_model = WhisperModel(args.whisper_model, device="cpu", compute_type="int8")

        for seg in segments:
            seg_mp3s = []
            for b_idx, beat in enumerate(seg["beats"]):
                narration = (beat.get("narration") or "").strip()
                if not narration:
                    cursor += float(beat.get("duration", 4))
                    continue
                beat_mp3 = beats_dir / f"{seg['id']}_b{b_idx:02d}.mp3"
                if not args.force and beat_mp3.exists() and beat_mp3.stat().st_size > 1000:
                    print(f"  [Cached] {seg['id']} beat {b_idx}")
                    dur = probe_duration(beat_mp3)
                else:
                    print(f"  [Edge TTS:{args.voice}] {seg['id']} beat {b_idx} ...")
                    dur = generate_edge_beat(narration, beat_mp3, args.voice, args.rate)
                words = extract_words_whisper(beat_mp3, cursor, whisper_model)
                all_words.extend(words)
                if args.sync_durations:
                    beat["duration"] = round(dur, 3)
                seg_mp3s.append(beat_mp3)
                all_beat_mp3s.append(beat_mp3)
                cursor += dur

            if seg_mp3s:
                seg_out = audio_dir / f"vo_{seg['id']}.mp3"
                concat_mp3s(seg_mp3s, seg_out)

    else:
        api_key = os.environ.get("ELEVENLABS_API_KEY")
        if not api_key:
            sys.exit("Missing ELEVENLABS_API_KEY. Set it in .env or export ELEVENLABS_API_KEY=...")
        voice_id = args.voice

        for seg in segments:
            seg_mp3s = []
            for b_idx, beat in enumerate(seg["beats"]):
                narration = (beat.get("narration") or "").strip()
                if not narration:
                    cursor += float(beat.get("duration", 4))
                    continue
                beat_mp3 = beats_dir / f"{seg['id']}_b{b_idx:02d}.mp3"
                print(f"  [ElevenLabs:{args.model}] {seg['id']} beat {b_idx} ...")
                dur, words = generate_elevenlabs_beat(narration, beat_mp3, voice_id, api_key, args.model)
                for w in words:
                    all_words.append({
                        "word": w["word"],
                        "start": round(w["start"] + cursor, 3),
                        "end": round(w["end"] + cursor, 3),
                    })
                if args.sync_durations:
                    beat["duration"] = round(dur, 3)
                seg_mp3s.append(beat_mp3)
                all_beat_mp3s.append(beat_mp3)
                cursor += dur

            if seg_mp3s:
                seg_out = audio_dir / f"vo_{seg['id']}.mp3"
                concat_mp3s(seg_mp3s, seg_out)

    if all_beat_mp3s:
        master_mp3 = audio_dir / "vo_master.mp3"
        concat_mp3s(all_beat_mp3s, master_mp3)
        (audio_dir / "words.json").write_text(json.dumps(all_words, indent=2, ensure_ascii=False), encoding="utf-8")
        if args.sync_durations:
            ep_json.write_text(json.dumps(episode, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\nDone! Master VO: {master_mp3} ({cursor:.2f}s) | Words: {len(all_words)}")
        print("Beat durations in episode.json have been synced to exact VO lengths.")


if __name__ == "__main__":
    main()
