import type { NextConfig } from "next";
import withLlamaIndex from "llamaindex/next";
import createMDX from '@next/mdx'
import dotenv from 'dotenv';
 
/** @type {import('next').NextConfig} */
dotenv.config();

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  env: {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    TWITTER_OAUTH_1_KEY: process.env.TWITTER_OAUTH_1_KEY,
    TWITTER_OAUTH_1_SECRET: process.env.TWITTER_OAUTH_1_SECRET,
    LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID,
    LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  },
};

const withMDX = createMDX({})

export default withMDX(withLlamaIndex(nextConfig));
