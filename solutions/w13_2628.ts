// src/appstore/types.ts
export interface PluginMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  repository: string;
  homepage?: string;
  keywords: string[];
  categories: string[];
  readme: string;
  changelog: string;
  screenshots: string[];
  score: number;
  scoreBreakdown: {
    quality: number;
    popularity: number;
    maintenance: number;
  };
  dependencies: string[];
  platforms: {
    [key: string]: {
      supported: boolean;
      tested: boolean;
      ciStatus: 'passing' | 'failing' | 'unknown';
    };
  };
  downloads: number;
  lastUpdated: string;
  createdAt: string;
}

export interface AppStoreState {
  plugins: PluginMetadata[];
  selectedPlugin: PluginMetadata | null;
  activeTab: 'readme' | 'changelog' | 'indicators';
  searchQuery: string;
  categoryFilter: string;
  sortBy: 'score' | 'downloads' | 'name' | 'updated';
  loading: boolean;
  error: string | null;
  lightboxOpen: boolean;
  lightboxIndex: number;
  installQueue: string[];
  installProgress: { [key: string]: number };
}
