"""
Create (or promote) an admin account without typing a password into a script.

    python manage.py ensure_admin you@example.com

A new account gets the password in $ADMIN_PASSWORD if set (e.g. on Render),
otherwise a random one, printed once; sign in and change it
under Django admin, or run `manage.py changepassword you@example.com`. An
existing account is promoted to admin and its password is left alone.
"""

import os
import secrets

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError

from accounts.models import Profile, Role


class Command(BaseCommand):
    help = "Create or promote an admin account (prints a generated password for new accounts)."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("--name", default="Admin")

    def handle(self, email, name, **opts):
        email = email.strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            raise CommandError(f"Not an email address: {email}")
        User = get_user_model()
        user = User.objects.filter(username__iexact=email).first()
        if user is None:
            chosen = os.environ.get("ADMIN_PASSWORD", "")
            password = chosen or secrets.token_urlsafe(12)
            user = User.objects.create_user(
                username=email, email=email, password=password, is_staff=True, is_superuser=True
            )
            Profile.objects.update_or_create(user=user, defaults={"role": Role.ADMIN, "display_name": name})
            self.stdout.write(self.style.SUCCESS(f"Created admin {email}"))
            if not chosen:
                self.stdout.write(f"  password: {password}   (shown once — change it after signing in)")
        else:
            user.is_staff = user.is_superuser = True
            user.save(update_fields=["is_staff", "is_superuser"])
            Profile.objects.update_or_create(user=user, defaults={"role": Role.ADMIN})
            self.stdout.write(self.style.SUCCESS(f"{email} already existed — now an admin (password unchanged)"))
