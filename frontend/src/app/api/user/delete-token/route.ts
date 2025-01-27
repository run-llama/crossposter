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
  const provider = formData.get('provider');

  // Validate required parameters
  if (!provider) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  try {
    // Delete token from database
    // Ensure user exists in users table
    if (!session.user?.email) {
      throw new Error("User email not found in session");
    }

    const prisma = new PrismaClient();

    let result
    switch (provider) {
      case 'twitter':
        result = await prisma.users.update({
          where: { email: session.user.email },
        data: { 'twitter_token': null }
      });
      break;
    case 'bluesky':
      result =await prisma.users.update({
        where: { email: session.user.email },
        data: { 'bluesky_token': null }
      });
      break;
    case 'linkedin':
      result = await prisma.users.update({
        where: { email: session.user.email },
        data: { 'linkedin_token': null }
      });
      break;
    }

    console.log("Result", result)

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving token:", error.stack);
    return NextResponse.json(
      { error: "Failed to save token" },
      { status: 500 }
    );
  }
}
