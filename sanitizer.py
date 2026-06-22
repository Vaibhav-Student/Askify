"""
sanitizer.py — Centralized content sanitization for all text sent to NVIDIA API.

Ensures no garbled binary, base64-like image data, or non-printable content
ever reaches the model — eliminating "Cannot read image.png" errors.
"""
import re

# Patterns that indicate image/binary content (NVIDIA API rejects these)
_IMAGE_PATTERNS = [
    r'data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+',
    r'data:image\/[a-zA-Z]+;base64,',
    r'\[Image file:.*?\]',
    r'\[image\]',
    r'image\.(?:png|jpg|jpeg|gif|bmp|webp|svg|ico|tiff?)',
    r'\bbase64\b',
    r'data:image',
]

# Compiled regex for speed
_IMAGE_RE = re.compile('|'.join(_IMAGE_PATTERNS), re.IGNORECASE)

# Non-printable character range (control chars except newline/carriage return)
_NON_PRINTABLE_RE = re.compile(r'[^\x20-\x7E\x0A\x0D\u0080-\uFFFF]')


def sanitize_text(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)

    text = _NON_PRINTABLE_RE.sub('', text)
    text = _IMAGE_RE.sub('', text)

    if len(text) > 32000:
        text = text[:32000]

    return text.strip()


def sanitize_document(doc_text: str, filename: str = "") -> str:
    text = sanitize_text(doc_text)
    if len(text) < 20:
        return f"[The file '{filename}' contains visual content that cannot be processed as text.]"
    if text and len(text) > 50:
        alpha_ratio = sum(1 for c in text if c.isalpha()) / max(len(text), 1)
        if alpha_ratio < 0.3:
            return f"[The file '{filename}' appears to be an image or binary file.]"
    return text