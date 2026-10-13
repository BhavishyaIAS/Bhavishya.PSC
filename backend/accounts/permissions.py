from rest_framework.permissions import BasePermission

from .models import is_admin


class IsAdminRole(BasePermission):
    message = "Admin access required."

    def has_permission(self, request, view):
        return is_admin(request.user)
