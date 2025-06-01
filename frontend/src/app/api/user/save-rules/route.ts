import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { PrismaClient } from '@prisma/client'

export async function POST(request: NextRequest) {
  // Verify user is authenticated
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get utm_rules from request body
  const body = await request.json();
  const { utm_rules } = body;

  if (!utm_rules) {
    return NextResponse.json(
      { error: "Missing utm_rules in request body" },
      { status: 400 }
    );
  }

  try {
    // Save utm_rules to database
    // Ensure user exists in users table
    if (!session.user?.email) {
      throw new Error("User email not found in session");
    }

    const prisma = new PrismaClient();

    // Update the utm_rules field
    await prisma.users.update({
      where: { email: session.user.email },
      data: { utm_rules: JSON.stringify(utm_rules) }
    });

    return NextResponse.json({ utm_rules, success: true }, { status: 200 });
  } catch (error) {
    console.error("Error saving utm_rules:", (error as Error).stack);
    return NextResponse.json(
      { error: "Failed to save utm_rules" },
      { status: 500 }
    );
  }
}
