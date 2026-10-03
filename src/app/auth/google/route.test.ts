import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
const oauth = vi.hoisted(() => vi.fn(async () => ({ data: { url: 'https://example.supabase.co/auth/v1/authorize' }, error: null })))
vi.mock('@supabase/ssr', () => ({ createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[]) => void } }) => {
    options.cookies.setAll([{ name: 'sb-test-auth-token-code-verifier', value: 'test-verifier', options: { path: '/', sameSite: 'lax' } }])
    return { auth: { signInWithOAuth: oauth } }
} }))
describe('server Google sign-in', () => {
    it('sends the verifier cookie before leaving and preserves the destination', async () => {
        const response = await GET(new NextRequest('http://localhost:3000/auth/google?next=%2Fadmin%3Ftab%3Dgenerations'))
        expect(response.status).toBe(307)
        expect(response.cookies.get('sb-test-auth-token-code-verifier')?.value).toBe('test-verifier')
        expect(decodeURIComponent(response.cookies.get('aidh_auth_next')!.value)).toBe('/admin?tab=generations')
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(oauth).toHaveBeenLastCalledWith({ provider: 'google', options: { redirectTo: 'http://localhost:3000/auth/callback', skipBrowserRedirect: true } })
    })
    it('does not preserve an external post-login redirect', async () => {
        const response = await GET(new NextRequest('http://localhost:3000/auth/google?next=https%3A%2F%2Fevil.example'))
        expect(decodeURIComponent(response.cookies.get('aidh_auth_next')!.value)).toBe('/')
    })
})
