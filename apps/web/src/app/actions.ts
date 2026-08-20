"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { createHmac } from "crypto";

const prisma = new PrismaClient();
const COOKIE_SECRET = process.env.COOKIE_SECRET || "default_dev_secret_key_change_in_prod";

function signUserId(id: string) {
  const hmac = createHmac("sha256", COOKIE_SECRET);
  hmac.update(id);
  return `${id}.${hmac.digest("hex")}`;
}

function verifyUserId(signedValue: string | undefined): string | null {
  if (!signedValue || !signedValue.includes(".")) return null;
  const [id, signature] = signedValue.split(".");
  const hmac = createHmac("sha256", COOKIE_SECRET);
  hmac.update(id);
  if (hmac.digest("hex") === signature) {
    return id;
  }
  return null;
}

export async function createSessionAction() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get("userId")?.value;
  let userId = verifyUserId(rawCookie);

  if (!userId) {
    const user = await prisma.user.create({
      data: {
        email: `guest_${Date.now()}@reelmind.ai`,
        api_credits: 10
      }
    });
    userId = user.id;
    
    // Set secure signed cookie
    cookieStore.set("userId", signUserId(userId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });
  }

  const session = await prisma.session.create({
    data: {
      user_id: userId,
      title: "New Analysis"
    }
  });

  return session.id;
}

export async function getHistoryAction() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get("userId")?.value;
  const userId = verifyUserId(rawCookie);

  if (!userId) {
    return [];
  }

  const sessions = await prisma.session.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    include: {
      jobs: {
        select: {
          id: true,
          label: true,
          title: true,
          thumbnail_url: true,
          status: true,
          platform: true,
          views: true,
        }
      }
    }
  });

  return sessions.filter(s => s.jobs && s.jobs.length > 0);
}

export async function getUserDataAction() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get("userId")?.value;
  const userId = verifyUserId(rawCookie);

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      api_credits: true,
      email: true
    }
  });

  return user;
}
