import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Перевіряємо, чи користувач намагається отримати доступ до захищених сторінок
  const isAuthPage = request.nextUrl.pathname === '/login'
  const isProtectedPage = request.nextUrl.pathname === '/' || 
                         request.nextUrl.pathname.startsWith('/api/chat')

  // Отримуємо токен авторизації з cookies або localStorage (через заголовки)
  const authToken = request.cookies.get('auth-token')?.value
  const isAuthenticated = authToken === 'authenticated'

  // Якщо користувач не авторизований і намагається отримати доступ до захищеної сторінки
  if (!isAuthenticated && isProtectedPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Якщо користувач авторизований і намагається зайти на сторінку логіну
  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
