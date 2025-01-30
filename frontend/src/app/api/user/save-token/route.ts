import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { PrismaClient } from '@prisma/client'

export async function GET(request: NextRequest) {
  // Verify user is authenticated
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get query parameters
  const searchParams = request.nextUrl.searchParams;
  const provider = searchParams.get("provider");
  const token = searchParams.get("token");
  const secret = searchParams.get("secret");

  // Validate required parameters
  if (!provider || !token) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  try {
    // Save token to database
    // Ensure user exists in users table
    if (!session.user?.email) {
      throw new Error("User email not found in session");
    }

    const prisma = new PrismaClient();

    await prisma.users.upsert({
      where: { email: session.user.email },
      update: {},
      create: { email: session.user.email }
    });

    // Update the appropriate token field based on provider
    const tokenField = `${provider}_token` as 'twitter_token' | 'linkedin_token' | 'bluesky_token' | 'mastodon_token';
    
    if (provider === 'twitter') {
      await prisma.users.update({
        where: { email: session.user.email },
        data: { [tokenField]: JSON.stringify({ token, secret }) }
      });
    } else if (provider === 'bluesky') {
      await prisma.users.update({
        where: { email: session.user.email },
        data: { [tokenField]: JSON.stringify({ identifier: token, password: secret }) }
      });
    } else {
      await prisma.users.update({
        where: { email: session.user.email },
        data: { [tokenField]: token }
      });
    }

    return NextResponse.redirect(new URL('/', process.env.BASE_URL));
  } catch (error) {
    console.error("Error saving token:", (error as Error).stack);
    return NextResponse.json(
      { error: "Failed to save token" },
      { status: 500 }
    );
  }
}
