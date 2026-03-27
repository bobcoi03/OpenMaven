/**
 * Adapters: convert ontology instances to the flat shapes the UI currently uses.
 * This lets us swap the data source without changing every component at once.
 */

import type { ObjectInstance } from "./api-types";
import type { Company, Founder } from "./mock-data";

export function objectToCompany(obj: ObjectInstance): Company {
  const p = obj.properties;
  const coords = p.coordinates as { lat: number; lng: number } | undefined;
  return {
    id: obj.rid,
    name: (p.name as string) ?? "",
    batch: "",
    industry: "",
    status: (p.status as Company["status"]) ?? "Active",
    location: (p.location as string) ?? "",
    lat: coords?.lat ?? 0,
    lng: coords?.lng ?? 0,
    employees: (p.employees as number) ?? 0,
    description: (p.description as string) ?? "",
    founded: (p.founded as number) ?? 0,
    founders: [],
    tags: (p.tags as string[]) ?? [],
    hiring: (p.hiring as boolean) ?? false,
    url: (p.url as string) ?? "",
  };
}

export function objectToFounder(obj: ObjectInstance): Founder {
  const p = obj.properties;
  return {
    id: obj.rid,
    name: (p.name as string) ?? "",
    companyId: "",
    role: (p.role as string) ?? "",
    linkedin: (p.linkedin as string) ?? "",
  };
}

/**
 * Enrich companies with batch/industry/founder data derived from links.
 * This resolves the flat fields (batch, industry, founders[]) that the UI expects.
 */
export function enrichCompanies(
  companies: Company[],
  allObjects: ObjectInstance[],
  links: Array<{ source_rid: string; target_rid: string; link_type: string }>,
): Company[] {
  const objectMap = new Map(allObjects.map((o) => [o.rid, o]));

  return companies.map((company) => {
    const companyLinks = links.filter((l) => l.source_rid === company.id);

    const batchLink = companyLinks.find((l) => l.link_type === "IN_BATCH");
    const batchObj = batchLink ? objectMap.get(batchLink.target_rid) : undefined;
    const batch = (batchObj?.properties.name as string) ?? "";

    const industryLink = companyLinks.find((l) => l.link_type === "IN_INDUSTRY");
    const industryObj = industryLink ? objectMap.get(industryLink.target_rid) : undefined;
    const industry = (industryObj?.properties.name as string) ?? "";

    const founderLinks = companyLinks.filter((l) => l.link_type === "FOUNDED_BY");
    const founders = founderLinks
      .map((l) => objectMap.get(l.target_rid))
      .filter(Boolean)
      .map((f) => (f!.properties.name as string) ?? "");

    return { ...company, batch, industry, founders };
  });
}
