"use client";

import dynamic from "next/dynamic";

// Konva needs the browser canvas: never render the map on the server.
const StatusMap = dynamic(() => import("./status-map"), {
  ssr: false,
  loading: () => <div className="h-[60vh] animate-pulse rounded-lg bg-stone-200" />,
});

export default StatusMap;
