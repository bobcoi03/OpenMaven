"use client";

import { SourcesView } from "@/components/sources-view";
import { useAppData } from "@/lib/data-context";

export default function SourcesPage() {
  const { refresh } = useAppData();
  return <SourcesView onIngestComplete={refresh} />;
}
