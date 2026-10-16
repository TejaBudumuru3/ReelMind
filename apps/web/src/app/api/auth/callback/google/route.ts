import { createPayload } from "@/lib/api";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
const prisma = new PrismaClient()

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code");
    const state = searchParams.get("state")
    const cookieStore = await cookies()
    const savedState = cookieStore.get("oauth_state")?.value;

    if (!code || !state || !savedState || state !== savedState)
        return new Response("Invalid OAuth state", { status: 400 })

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code: code,
            client_id: process.env.CLIENT_ID!,
            client_secret: process.env.CLIENT_KEY!,
            redirect_uri: process.env.GOOGLE_REDIRECT_URL!,
            grant_type: "authorization_code"
        }).toString()
    })

    const tokens = await res.json()
    if (!res.ok || !tokens.access_token) {
        return new Response("Failed to retrive access token from Google", {
            status: 400
        })
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const profile = await userRes.json()


    const country = request.headers.get("x-vercel-ip-country");
    const city = request.headers.get("x-vercel-ip-city");
    const region = request.headers.get("x-vercel-ip-country-region");
    const timezone = request.headers.get("x-vercel-ip-timezone");
    const location = (city && country) ? `${city}, ${country}` : (country || "Localhost");
    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [
                { google_id: profile.sub },
                { email: profile.email }
            ]
        }
    });

    let user;
    if (existingUser) {
        user = await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                name: profile.name,
                avatar_url: profile.picture,
                google_id: profile.sub,
                location: location,
                region: region,
                timezone: timezone,
                last_login: new Date()
            }
        });
    } else {
        user = await prisma.user.create({
            data: {
                email: profile.email,
                avatar_url: profile.picture,
                name: profile.name,
                google_id: profile.sub,
                api_credits: 10,
                location: location,
                region: region,
                timezone: timezone,
                last_login: new Date()
            }
        });
    }

    const token = await createPayload({ userId: user.id, email: user.email })
    const response = NextResponse.redirect(new URL("/", request.url))
    response.cookies.set("session_token", token, {
        httpOnly: true,
        path: '/',
        maxAge: 60 * 60 * 7 * 24
    })

    response.cookies.delete("oauth_state")

    return response
}