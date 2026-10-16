import crypto from "crypto"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
    const state = crypto.randomBytes(16).toString('hex')

    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URL!,
        response_type: "code",
        scope: "openid email profile",
        state: state,
        prompt: "select_account"
    });

    const url = new URL(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)

    const response = NextResponse.redirect(url)

    response.cookies.set("oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "lax",
        maxAge: 60 * 10,
        path: "/"
    })

    return response;
}