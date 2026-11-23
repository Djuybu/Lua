import React, { createContext, useContext } from "react";
import type { SnapshotManifest } from "./catalog";
import seed from "./catalog.json";

const CatalogContext = createContext<SnapshotManifest>(seed as SnapshotManifest);

export function CatalogProvider({
  manifest,
  children,
}: {
  manifest: SnapshotManifest;
  children: React.ReactNode;
}) {
  return (
    <CatalogContext.Provider value={manifest}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  return useContext(CatalogContext);
}

