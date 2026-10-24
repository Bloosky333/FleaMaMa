"use client";

import dynamic from "next/dynamic";

// Konva needs the browser canvas: never render the map on the server.
const RequestMap = dynamic(() => import("./request-map"), {
  ssr: false,
  loading: () => <div className="h-[50vh] animate-pulse rounded-lg bg-stone-200" />,
});

export default RequestMap;
