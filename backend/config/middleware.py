class ApiTrailingSlashMiddleware:
    """
    The Next.js rewrite (`/api/:path*`) drops trailing slashes, while every API
    route here ends in "/". Re-add the slash internally instead of redirecting
    (a redirect would turn POSTs into GETs). File-like paths (`…/x.png`) are left alone.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path_info
        if path.startswith("/api/") and not path.endswith("/") and "." not in path.rsplit("/", 1)[-1]:
            request.path_info = path + "/"
            request.path = request.path + "/"
        return self.get_response(request)
