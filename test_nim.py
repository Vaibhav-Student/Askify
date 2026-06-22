import os
import json
import requests

api_key = "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"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
    "Accept": "text/event-stream"
}

payload = {
    "model": "google/Gemma-4-3db-it",
    "messages": [
        {"role": "user", "content": "Hello! Introduce yourself briefly."}
    ],
    "temperature": 0.5,
    "max_tokens": 100,
    "stream": True
}

url = "https://integrate.api.nvidia.com/v1/chat/completions"

try:
    response = requests.post(url, json=payload, headers=headers, stream=True)
    print(f"Status Code: {response.status_code}")
    for line in response.iter_lines():
        if line:
            decoded = line.decode('utf-8')
            print(decoded)
except Exception as e:
    print(f"Error: {e}")
