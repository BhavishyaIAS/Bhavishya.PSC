from django.conf import settings
from django.db import models


class Role(models.TextChoices):
    ADMIN = "admin", "Admin"
    STUDENT = "student", "Student"


class Profile(models.Model):
    """One profile per user. `role` is the single source of truth for authorization."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.STUDENT)
    display_name = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return f"{self.display_name or self.user.get_username()} ({self.role})"


def is_admin(user) -> bool:
    """Admin = superuser, or a profile with role=admin. Anonymous users are never admins."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    profile = getattr(user, "profile", None)
    return bool(profile and profile.role == Role.ADMIN)
