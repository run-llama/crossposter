import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { TwitterApi } from 'twitter-api-v2';
import { PrismaClient } from '@prisma/client';

export async function POST(req: Request, res: Response) {

  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prisma = new PrismaClient();

    const user = await prisma.users.findUnique({
      where: { email: session.user?.email }
    });

    if (!user || !user.twitter_token) {
      return NextResponse.json({ error: 'Twitter token not found' }, { status: 400 });
    }

    const formData = await req.formData();
    const text = formData.get('text') as string;
    const media = formData.get('media') as File;

    console.log("Attached Media", media)

    const twitterClient = new TwitterApi(user.twitter_token);

    console.log("Twitter user", await twitterClient.v2.me())

    let mediaBuffer;
    let mediaIds = []
    if (media) {
      const arrayBuffer = await media.arrayBuffer();
      mediaBuffer = Buffer.from(arrayBuffer);

      mediaIds = await twitterClient.v1.uploadMedia(mediaBuffer, { mimeType: 'image/png' })
    }

    console.log("Media IDs", mediaIds)

    let result = await twitterClient.v2.tweet({
      text: text,
      media: { media_ids: mediaIds }  
    });

    // console.log("Tweet result", result);

    return NextResponse.json(result)
  } catch (error) {
    console.log("Error posting tweet", error)
    return NextResponse.json({ message: 'Error posting tweet', error: error.message }, { status: 500 })
  }
}
