"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/api";

const prisma = new PrismaClient();

export async function createSessionAction() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get("session_token")?.value;
  const userId = await verifyToken(rawCookie || "");

  if (!userId) {
    throw new Error("UNAUTHORIZED");
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
  const rawCookie = cookieStore.get("session_token")?.value;
  const userId = await verifyToken(rawCookie || "");

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
  const rawCookie = cookieStore.get("session_token")?.value;
  const userId = await verifyToken(rawCookie || "");

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      api_credits: true,
      email: true,
      name: true,
      avatar_url: true,
    }
  });

  return user;
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("session_token");
}
