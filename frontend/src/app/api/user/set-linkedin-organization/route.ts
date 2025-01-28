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

  // Get form data
  const formData = await request.formData();
  const organization = formData.get('organization'); // blank is okay

  try {
    // Set linkedin_company in users table
    if (!session.user?.email) {
      throw new Error("User email not found in session");
    }

    const prisma = new PrismaClient();

    const result = await prisma.users.update({
      where: { email: session.user.email },
      data: { 'linkedin_company': organization }
    });

    console.log("Result", result)

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving organization:", error.stack);
    return NextResponse.json(
      { error: "Failed to save organization" },
      { status: 500 }
    );
  }
}
