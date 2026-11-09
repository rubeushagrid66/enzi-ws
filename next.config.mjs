/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The viewer/detail pages are client components that fetch their data
    // in a mount effect. With the default dynamic stale time (30s),
    // navigating back to a page you just left restores it from the
    // client router cache WITHOUT remounting — so the mount effect never
    // re-runs and the page shows stale data until a manual reload or a
    // tab switch (the focus listener). Setting dynamic to 0 means every
    // back-navigation re-renders and re-fetches, so changes always show
    // up. This is also what Next.js 15 made the default.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
