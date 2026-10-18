"""
Django settings for the Bhavishya exam-preparation API.

Every deploy-specific value comes from environment variables (or a `.env`
file next to manage.py). See `.env.example`.
"""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["localhost", "127.0.0.1"]),
    COOKIE_SECURE=(bool, False),
    AUTH_TOKEN_TTL_DAYS=(int, 14),
    MATERIAL_MAX_UPLOAD_MB=(int, 25),
    IMAGE_MAX_UPLOAD_MB=(int, 5),
    DOWNLOAD_LINK_TTL_SECONDS=(int, 300),
    CSRF_TRUSTED_ORIGINS=(list, []),
    SECURE_SSL_REDIRECT=(bool, False),
    SECURE_HSTS_SECONDS=(int, 0),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="dev-only-insecure-key-change-me")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "rest_framework.authtoken",
    "accounts",
    "content",
]

MIDDLEWARE = [
    "config.middleware.ApiTrailingSlashMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Serves the Django admin's static files where there's no nginx in front (e.g. Render).
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://bhavishya:bhavishya@localhost:5432/bhavishya",
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# Media is split in two: `public/` (note images — safe to serve directly) and
# `private/` (study material files — only reachable through signed links).
MEDIA_ROOT = Path(env("MEDIA_ROOT", default=str(BASE_DIR / "media")))
MEDIA_URL = "/media/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["accounts.authentication.CookieTokenAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "content.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "EXCEPTION_HANDLER": "rest_framework.views.exception_handler",
}

# Auth cookie (httpOnly) carrying the API token. The Next.js server reads it to
# make server-side requests; the browser sends it automatically on same-origin
# `/api/*` calls that Next.js rewrites to this service.
AUTH_COOKIE_NAME = "bp_session"
AUTH_COOKIE_SECURE = env("COOKIE_SECURE")
AUTH_TOKEN_TTL_DAYS = env("AUTH_TOKEN_TTL_DAYS")

MATERIAL_MAX_UPLOAD_MB = env("MATERIAL_MAX_UPLOAD_MB")
IMAGE_MAX_UPLOAD_MB = env("IMAGE_MAX_UPLOAD_MB")
DOWNLOAD_LINK_TTL_SECONDS = env("DOWNLOAD_LINK_TTL_SECONDS")
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024  # JSON bodies for bulk import
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# ── Behind Nginx in production ──────────────────────────────────────────
# Nginx terminates HTTPS and says so in X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# The full site origin(s), e.g. https://example.com — needed for the Django admin's POSTs.
CSRF_TRUSTED_ORIGINS = env("CSRF_TRUSTED_ORIGINS")
# Secure cookies are never sent over plain HTTP, so these follow COOKIE_SECURE:
# leave it false while the site is served on a bare IP, true once HTTPS is on.
SESSION_COOKIE_SECURE = AUTH_COOKIE_SECURE
CSRF_COOKIE_SECURE = AUTH_COOKIE_SECURE
SECURE_SSL_REDIRECT = env("SECURE_SSL_REDIRECT")
SECURE_HSTS_SECONDS = env("SECURE_HSTS_SECONDS")
SECURE_REDIRECT_EXEMPT = [r"^api/"]  # the Next.js server talks to the API over local HTTP

# Errors go to stderr, which systemd keeps in the journal (journalctl -u bhavishya-api).
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
}
