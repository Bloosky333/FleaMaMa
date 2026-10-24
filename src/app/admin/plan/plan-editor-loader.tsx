"use client";

import dynamic from "next/dynamic";

// Konva needs the browser canvas: never render the editor on the server.
const PlanEditor = dynamic(() => import("./plan-editor"), {
  ssr: false,
  loading: () => <div className="h-[60vh] animate-pulse rounded-lg bg-stone-200" />,
});

export default PlanEditor;
