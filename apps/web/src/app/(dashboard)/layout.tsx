"use client";

import { DataProvider } from "@/lib/data-context";
import { MapLayerProvider } from "@/lib/map-layer-context";
import { AppShell } from "@/components/app-shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DataProvider>
      <MapLayerProvider>
        <AppShell>{children}</AppShell>
      </MapLayerProvider>
    </DataProvider>
  );
}
