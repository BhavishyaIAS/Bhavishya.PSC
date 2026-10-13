from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import TokenAuthentication

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


class CookieTokenAuthentication(TokenAuthentication):
    """
    Token auth that accepts either `Authorization: Token <key>` (server-to-server
    calls from Next.js) or the httpOnly `bp_session` cookie (browser calls that
    Next.js rewrites to this API).

    Cookie-authenticated unsafe requests must carry `X-Requested-With`. Browsers
    can't add custom headers cross-site without a CORS preflight (which this API
    never grants), so this blocks CSRF.
    Tokens expire after AUTH_TOKEN_TTL_DAYS.
    """

    def authenticate(self, request):
        header_result = super().authenticate(request)
        if header_result is not None:
            return header_result

        key = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if not key:
            return None
        if request.method not in SAFE_METHODS and request.headers.get("X-Requested-With") != "XMLHttpRequest":
            raise exceptions.PermissionDenied("Missing X-Requested-With header.")
        try:
            return self.authenticate_credentials(key)
        except exceptions.AuthenticationFailed:
            # A stale cookie should behave like being logged out, not like an error.
            return None

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if token.created < timezone.now() - timedelta(days=settings.AUTH_TOKEN_TTL_DAYS):
            token.delete()
            raise exceptions.AuthenticationFailed("Session expired.")
        return user, token
