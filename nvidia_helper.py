"""
Helper script that calls NVIDIA API via curl.exe.
Runs as a subprocess to avoid Python SSL renegotiation hangs.
Called by rag_engine.py with payload on stdin, outputs response on stdout.
"""
import sys, json, subprocess, os

payload_str = sys.stdin.read()
key_to_use = os.environ.get("NVIDIA_API_KEY", "")

if not key_to_use:
    key_to_use = "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"

# Write payload to temp file for curl
tmp_path = os.path.join(os.environ.get("TEMP", "."), "nvidia_payload.json")
with open(tmp_path, "w", encoding="utf-8") as f:
    f.write(payload_str)

try:
    curl_args = [
        "curl.exe", "-s", "-N",
        "-X", "POST",
        "https://integrate.api.nvidia.com/v1/chat/completions",
        "-H", "Authorization: Bearer " + key_to_use,
        "-H", "Content-Type: application/json",
        "-H", "Accept: text/event-stream",
        "-d", "@" + tmp_path,
        "--max-time", "25",
    ]

    proc = subprocess.Popen(curl_args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    for raw_line in iter(proc.stdout.readline, b''):
        line = raw_line.decode('utf-8', errors='ignore').strip()
        if line.startswith("data: "):
            data = line[6:].strip()
            if data == "[DONE]":
                break
            try:
                td = json.loads(data)
                token = td.get("choices", [{}])[0].get("delta", {}).get("content")
                if token:
                    sys.stdout.write(token)
                    sys.stdout.flush()
            except:
                continue

    proc.stdout.close()
    proc.wait(timeout=5)
    if proc.returncode != 0:
        err = proc.stderr.read().decode('utf-8', errors='ignore') if proc.stderr else ""
        # Bulletproof: catch "Cannot read" error and return clean message
        if "Cannot read" in err and "does not support" in err:
            sys.stderr.write("text contains image-like content not supported by this model")
        else:
            sys.stderr.write(err[:500])
        sys.exit(proc.returncode)
finally:
    try:
        os.unlink(tmp_path)
    except:
        pass
