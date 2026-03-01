/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    typescript: {
        ignoreBuildErrors: true,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'mc-heads.net',
            },
            {
                protocol: 'https',
                hostname: 'map.earthmc.net',
            }
        ],
    },
};

export default nextConfig;
