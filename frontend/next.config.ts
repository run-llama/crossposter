import type { NextConfig } from "next";
import withLlamaIndex from "llamaindex/next";
import createMDX from '@next/mdx'
 
/** @type {import('next').NextConfig} */

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
};

const withMDX = createMDX({})

export default withMDX(withLlamaIndex(nextConfig));
