"""
Create (or promote) an admin account without typing a password into a script.

    python manage.py ensure_admin you@example.com

With $ADMIN_PASSWORD set (Render, where the free plan has no shell), that is
the account's password, also for an account that already exists: to change
it, edit ADMIN_PASSWORD in the dashboard and redeploy.

Without it, a new account gets a random password, printed once; an existing
account is promoted to admin and its password is left alone.
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
            chosen = os.environ.get("ADMIN_PASSWORD", "").strip()  # a pasted value often brings a stray space
            password = chosen or secrets.token_urlsafe(12)
            user = User.objects.create_user(
                username=email, email=email, password=password, is_staff=True, is_superuser=True
            )
            Profile.objects.update_or_create(user=user, defaults={"role": Role.ADMIN, "display_name": name})
            self.stdout.write(self.style.SUCCESS(f"Created admin {email}"))
            if not chosen:
                self.stdout.write(f"  password: {password}   (shown once — change it after signing in)")
        else:
            user.is_staff = user.is_superuser = user.is_active = True
            chosen = os.environ.get("ADMIN_PASSWORD", "").strip()  # a pasted value often brings a stray space
            if chosen:
                user.set_password(chosen)
            user.save()
            Profile.objects.update_or_create(user=user, defaults={"role": Role.ADMIN})
            note = "password set from ADMIN_PASSWORD" if chosen else "password unchanged"
            self.stdout.write(self.style.SUCCESS(f"{email} already existed — now an admin ({note})"))
