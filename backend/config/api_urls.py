from django.conf import settings
from django.urls import include, path, re_path
from django.views.static import serve
from rest_framework.routers import DefaultRouter

from accounts import api as auth_api
from content import views_manage as manage
from content import views_read as read

router = DefaultRouter(trailing_slash=True)
router.register("papers", manage.PaperViewSet, basename="papers")
router.register("subjects", manage.SubjectViewSet, basename="subjects")
router.register("topics", manage.TopicViewSet, basename="topics")
router.register("micro-themes", manage.MicroThemeViewSet, basename="micro-themes")
router.register("videos", manage.VideoViewSet, basename="videos")
router.register("glossary", manage.GlossaryViewSet, basename="glossary")
router.register("questions", manage.QuestionViewSet, basename="questions")
router.register("materials", manage.MaterialViewSet, basename="materials")
router.register("users", manage.UserViewSet, basename="users")

TRACK = "tracks/<slug:commission>/<slug:group>/"

urlpatterns = [
    # Auth
    path("auth/signup/", auth_api.signup),
    path("auth/login/", auth_api.login),
    path("auth/logout/", auth_api.logout),
    path("auth/me/", auth_api.me),
    # Catalog (public)
    path("commissions/", read.commissions),
    path(TRACK, read.track_detail),
    # Study (authenticated)
    path(TRACK + "syllabus/", read.syllabus_tree),
    path(TRACK + "coverage/", read.coverage),
    path(TRACK + "questions/", read.track_questions),
    path(TRACK + "question-facets/", read.question_facets),
    path(TRACK + "materials/", read.track_materials),
    path(TRACK + "notes/", read.track_notes),
    path(TRACK + "micro-themes/<str:code>/", read.micro_theme_detail),
    path(TRACK + "micro-themes/<str:code>/progress/", read.micro_theme_progress),
    path("coverage/", read.coverage_overview),
    path("search/", read.search),
    path("materials/<int:pk>/link/", read.material_link),
    path("files/m/<str:token>/", read.material_download),
    # Admin
    path("manage/stats/", manage.stats),
    path("manage/commissions/<int:pk>/", manage.commission_status),
    path("manage/reorder/", manage.reorder),
    path("manage/status/", manage.set_status),
    path("manage/questions/import/", manage.import_questions),
    path("manage/import-reference/", manage.import_reference),
    path("manage/tags/", manage.tags),
    path("manage/uploads/image/", manage.upload_image),
    path("manage/", include(router.urls)),
    # Public media (note images only — private material files are never served from here)
    re_path(r"^media/(?P<path>public/.+)$", serve, {"document_root": settings.MEDIA_ROOT}),
]
