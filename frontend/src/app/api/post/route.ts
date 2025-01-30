import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { TwitterApi } from 'twitter-api-v2';
import { PrismaClient } from '@prisma/client';
import LinkedinPostShare from '@/util/linkedinPostShare';
import BlueSkyPoster from '@/util/blueSkyPoster';
export async function POST(req: Request, res: Response) {

  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const prisma = new PrismaClient();

    if (!session.user?.email) {
      return NextResponse.json({ error: 'User email not found' }, { status: 400 });
    }

    const user = await prisma.users.findUnique({
      where: { email: session.user?.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }

    const formData = await req.formData();
    const text = formData.get('text') as string;
    const media = formData.get('media') as File;
    const platform = formData.get('platform') as string;

    console.log("Attached Media", media)

    let result = null;
    switch (platform) {
      case "twitter":
        if (!user.twitter_token) {
          return NextResponse.json({ error: 'Twitter token not found' }, { status: 400 });
        }

        const twitterToken = JSON.parse(user.twitter_token)

        if (!twitterToken.token || !twitterToken.secret) {
          return NextResponse.json({ error: 'Twitter secrets not found' }, { status: 400 });
        }

        const twitterClient = new TwitterApi({
          appKey: process.env.TWITTER_OAUTH_1_KEY!,
          appSecret: process.env.TWITTER_OAUTH_1_SECRET!,
          accessToken: twitterToken.token,
          accessSecret: twitterToken.secret,
        } as any); // typescript thinks appKey and appSecret don't exist but they do
    
        console.log("Twitter user", await twitterClient.v2.me())
    
        let twitterMediaBuffer;
        let mediaIds = []
        if (media) {
          const arrayBuffer = await media.arrayBuffer();
          twitterMediaBuffer = Buffer.from(arrayBuffer);
    
          console.log("About to call upload media")
          mediaIds.push(await twitterClient.v1.uploadMedia(twitterMediaBuffer, { mimeType: 'image/png', target: 'tweet' }))
        }
    
        console.log("Media IDs", mediaIds)
    
        result = await twitterClient.v2.tweet({
          text: text,
          media: { media_ids: mediaIds as [string] }  
        });
        break;
      case "linkedin":

        const linkedInToken = user.linkedin_token

        if (!linkedInToken) {
          return NextResponse.json({ error: 'LinkedIn token not found' }, { status: 400 });
        }
        
        const post = text;
        let imageAlt;

        let linkedInMediaBuffer;
        if (media) {
          const arrayBuffer = await media.arrayBuffer();
          linkedInMediaBuffer = Buffer.from(arrayBuffer);
        }

        if (!linkedInMediaBuffer) {
          return NextResponse.json({ error: 'LinkedIn media not found' }, { status: 400 });
        }
        
        const linkedinPostShare = new LinkedinPostShare(linkedInToken);
        if (user.linkedin_company) {
          result = await linkedinPostShare.createPostWithImageForOrganization(post, linkedInMediaBuffer, imageAlt, user.linkedin_company);
        } else {
          result = await linkedinPostShare.createPostWithImage(post, linkedInMediaBuffer, imageAlt);
        }
        
        if (result) {
          console.log("Post shared successfully!");
        } else {
          console.log("Failed to share post.");
        }

        break;
      case "bluesky":

        const blueSkyAuth = user.bluesky_token ? JSON.parse(user.bluesky_token) : null

        if (!blueSkyAuth) {
          return NextResponse.json({ error: 'Bluesky auth not found' }, { status: 400 });
        }

        const blueSkyPoster = new BlueSkyPoster(blueSkyAuth)
        await blueSkyPoster.login()

        let blueSkyMediaBuffer;
        if (media) {
          const arrayBuffer = await media.arrayBuffer();
          blueSkyMediaBuffer = Buffer.from(arrayBuffer);
        } else {
          throw new Error("No media attached")
        }       

        result = await blueSkyPoster.post(text, blueSkyMediaBuffer)

        if (result) {
          console.log("Post shared successfully!");
        } else {
          console.log("Failed to share post.");
        }

        // add a URL for the post to the result
        // the profile name is the identifier; it can be a barename or a domain
        // if it's a barename, we need to add the domain
        let profileName = blueSkyAuth.identifier
        if (!profileName.includes('.')) {
          profileName = `${profileName}.bsky.social`
        }
        // the post ID is the last part of the URI
        const postId = result.uri.split('/').pop()
        result = { ...result, url: `https://bsky.app/profile/${profileName}/post/${postId}` }

        break;
      default:
        return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    console.log("Result", result)
    return NextResponse.json(result)
  } catch (error) {
    console.log(`Error posting to socials`, error)
    return NextResponse.json({ message: 'Error posting', error: error }, { status: 500 })
  }
}
