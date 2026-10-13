from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .authentication import CookieTokenAuthentication
from .models import Profile, Role, is_admin

User = get_user_model()


def serialize_user(user):
    profile = getattr(user, "profile", None)
    return {
        "id": user.id,
        "email": user.email,
        "display_name": (profile.display_name if profile else "") or user.get_username(),
        "role": Role.ADMIN if is_admin(user) else Role.STUDENT,
    }


def _session_response(user, status_code=status.HTTP_200_OK):
    Token.objects.filter(user=user).delete()  # rotate on every login
    token = Token.objects.create(user=user)
    response = Response({"user": serialize_user(user)}, status=status_code)
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        token.key,
        max_age=settings.AUTH_TOKEN_TTL_DAYS * 86400,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite="Lax",
        path="/",
    )
    return response


def _require_xhr(request):
    # Login/signup are cookie-setting endpoints; demand the same header the
    # authenticated API demands so a cross-site form can't drive them.
    return request.headers.get("X-Requested-With") == "XMLHttpRequest"


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    display_name = serializers.CharField(max_length=120, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(username__iexact=value).exists() or User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        try:
            password_validation.validate_password(attrs["password"], User(username=attrs["email"], email=attrs["email"]))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def signup(request):
    if not _require_xhr(request):
        return Response({"detail": "Bad request."}, status=400)
    ser = SignupSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data
    with transaction.atomic():
        user = User.objects.create_user(username=data["email"], email=data["email"], password=data["password"])
        # Self-registration always yields a student; admins are promoted explicitly.
        Profile.objects.update_or_create(
            user=user,
            defaults={"role": Role.STUDENT, "display_name": data.get("display_name") or data["email"].split("@")[0]},
        )
    return _session_response(user, status.HTTP_201_CREATED)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def login(request):
    if not _require_xhr(request):
        return Response({"detail": "Bad request."}, status=400)
    email = str(request.data.get("email", "")).strip().lower()
    password = str(request.data.get("password", ""))
    user = authenticate(request, username=email, password=password)
    if user is None or not user.is_active:
        return Response({"detail": "Invalid email or password."}, status=status.HTTP_400_BAD_REQUEST)
    return _session_response(user)


@api_view(["POST"])
@authentication_classes([CookieTokenAuthentication])
@permission_classes([AllowAny])
def logout(request):
    if request.auth is not None:
        request.auth.delete()
    response = Response({"ok": True})
    response.delete_cookie(settings.AUTH_COOKIE_NAME, path="/", samesite="Lax")
    return response


@api_view(["GET"])
def me(request):
    return Response({"user": serialize_user(request.user)})
