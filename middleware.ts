import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'ds_session';

function parseSession(raw: string | undefined) {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as {
      id: string;
      role: string;
    };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  const session = parseSession(raw);
  const path = request.nextUrl.pathname;

  // Root: redirect logged-in users to their page
  if (path === '/') {
    if (session) {
      const dest =
        session.role === 'admin' ? '/admin' :
        session.role === 'mentor' ? '/mentor' :
        '/student';
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  // Protected routes: require login
  if (!session) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Role guards
  if (path.startsWith('/admin') && session.role !== 'admin') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (path.startsWith('/mentor') && session.role !== 'mentor') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (path.startsWith('/student') && session.role !== 'student') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
