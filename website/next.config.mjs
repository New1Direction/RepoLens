import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// On GitHub Pages a project site is served under /<repo>/, so CI sets
// NEXT_PUBLIC_BASE_PATH=/repolens. Locally it's unset (served at root).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'export',            // static HTML export — hostable on GitHub Pages / any static host
  images: { unoptimized: true }, // required by `output: export`
  basePath,
  trailingSlash: false,        // rely on GitHub Pages serving `foo.html` for `/foo`
};

export default withMDX(config);
