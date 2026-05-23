"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";

const prisma = new PrismaClient();

export async function createSessionAction() {
  const cookieStore = await cookies();
  let userId = cookieStore.get("userId")?.value;

  if (!userId) {
    const user = await prisma.user.create({
      data: {
        email: `guest_${Date.now()}@reelmind.ai`,
        api_credits: 10
      }
    });
    userId = user.id;
    cookieStore.set("userId", userId!);
  }

  const session = await prisma.session.create({
    data: {
      user_id: userId,
      title: "New Analysis"
    }
  });

  return session.id;
}
