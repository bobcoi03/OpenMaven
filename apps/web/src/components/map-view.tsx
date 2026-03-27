"use client";

import dynamic from "next/dynamic";
import type { Company } from "@/lib/mock-data";

interface MapViewProps {
  onMarkerClick?: (company: Company) => void;
  selectedId?: string | null;
  className?: string;
  style?: "dark" | "satellite" | "positron";
  companies?: Company[];
}

const MapViewInner = dynamic(() => import("./map-view-inner").then((m) => m.MapViewInner), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0e1a] text-slate-600 text-xs">
      Loading map...
    </div>
  ),
});

export function MapView(props: MapViewProps) {
  return <MapViewInner {...props} />;
}
