from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Profile, Role


@receiver(post_save, sender=get_user_model())
def ensure_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.get_or_create(
            user=instance,
            defaults={
                "role": Role.ADMIN if instance.is_superuser else Role.STUDENT,
                "display_name": instance.get_full_name() or instance.get_username().split("@")[0],
            },
        )
