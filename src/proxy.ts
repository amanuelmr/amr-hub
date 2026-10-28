import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

const publicRoutes = new Set([
  "/",
  "/forgot-password",
  "/forgot-password/recovery-code",
  "/reset-password",
  "/login",
  "/signup",
  "/setup",
  "/two-factor",
]);

export function isPublicPath(pathname: string) {
  return (
    publicRoutes.has(pathname) ||
    pathname.startsWith("/invite/") ||
    pathname === "/guides" ||
    pathname.startsWith("/guides/")
  );
}

export function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = "https:";
    return NextResponse.redirect(httpsUrl, 308);
  }

  const pathname = request.nextUrl.pathname;
  const isPublicRoute = isPublicPath(pathname);
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|og.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
