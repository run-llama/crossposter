import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import TwitterProvider from "next-auth/providers/twitter";
import LinkedInProvider from 'next-auth/providers/linkedin'

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
        TwitterProvider({
            clientId: process.env.TWITTER_OAUTH_1_KEY!,
            clientSecret: process.env.TWITTER_OAUTH_1_SECRET!,
            // clientId: process.env.TWITTER_CLIENT_ID!,
            // clientSecret: process.env.TWITTER_CLIENT_SECRET!,
            // version: "2.0",
            // authorization: {
            //     params: {
            //         scope: "tweet.read tweet.write users.read offline.access"
            //     }
            // }
        }),
        LinkedInProvider({
            clientId: process.env.LINKEDIN_CLIENT_ID!,
            clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
            authorization: { params: { scope: 'profile email openid w_member_social w_organization_social' } },
            issuer: 'https://www.linkedin.com/oauth',
            jwks_endpoint: "https://www.linkedin.com/oauth/openid/jwks",
            async profile(profile) {
                return {
                    id: profile.sub,
                    name: profile.name,
                    firstname: profile.given_name,
                    lastname: profile.family_name,
                    email: profile.email
                }
            },
        }),
    ],
    callbacks: {
        async signIn({ user, account }) {
            if (account && account.provider !== 'google') {
                let token = account.access_token
                let secret = null
                if (account.provider === 'twitter') {
                    token = account.oauth_token
                    secret = account.oauth_token_secret
                }

                // This value will be available in the client's signIn() callback
                return `/api/user/save-token?provider=${account.provider}&token=${token}&secret=${secret}`
            }
            return true
        },
        async session({ session, token }) {
            // Add token to session so it's available via getSession
            if (session.user?.email) {
                session.accessToken = token.accessToken
            }
            return session
        },
        async jwt({ token, account }) {
            // Persist the access token to the token right after signin
            if (account?.provider === 'google') {
                token.accessToken = account.access_token
                token.provider = account.provider
            }
            return token
        }
    },
    secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
