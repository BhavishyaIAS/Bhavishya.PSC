"""Upload validation: extension allow-list, size limit, and a magic-byte sniff."""

from pathlib import Path

from django.conf import settings
from rest_framework.exceptions import ValidationError

MATERIAL_TYPES = {
    ".pdf": ("application/pdf", [b"%PDF"]),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", [b"PK\x03\x04"]),
    ".pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", [b"PK\x03\x04"]),
    ".xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [b"PK\x03\x04"]),
    ".epub": ("application/epub+zip", [b"PK\x03\x04"]),
    ".png": ("image/png", [b"\x89PNG"]),
    ".jpg": ("image/jpeg", [b"\xff\xd8\xff"]),
    ".jpeg": ("image/jpeg", [b"\xff\xd8\xff"]),
    ".webp": ("image/webp", [b"RIFF"]),
    ".txt": ("text/plain", None),
    ".md": ("text/markdown", None),
}
IMAGE_TYPES = {k: v for k, v in MATERIAL_TYPES.items() if v[0].startswith("image/")}
IMAGE_TYPES[".gif"] = ("image/gif", [b"GIF8"])


def _check(upload, allowed, max_mb):
    ext = Path(upload.name or "").suffix.lower()
    if ext not in allowed:
        raise ValidationError({"file": f"File type not allowed. Use: {', '.join(sorted(allowed))}"})
    if upload.size > max_mb * 1024 * 1024:
        raise ValidationError({"file": f"File is too large (max {max_mb} MB)."})
    if upload.size == 0:
        raise ValidationError({"file": "File is empty."})
    content_type, magics = allowed[ext]
    head = upload.read(8)
    upload.seek(0)
    if magics and not any(head.startswith(m) for m in magics):
        raise ValidationError({"file": f"File content doesn't match its {ext} extension."})
    return ext, content_type


def validate_material_file(upload):
    return _check(upload, MATERIAL_TYPES, settings.MATERIAL_MAX_UPLOAD_MB)[1]


def validate_image(upload):
    return _check(upload, IMAGE_TYPES, settings.IMAGE_MAX_UPLOAD_MB)[0]
