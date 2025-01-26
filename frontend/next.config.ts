import type { NextConfig } from "next";
import withLlamaIndex from "llamaindex/next";
 
/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  /* config options here */
};

export default withLlamaIndex(nextConfig);
