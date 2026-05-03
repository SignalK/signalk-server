// src/appstore/types.ts
export interface PluginMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  repository: string;
  keywords: string[];
  categories: string[];
  readme: string;
  changelog: string;
  screenshots: string[];
  indicators: Indicator[];
  score: number;
  downloads: number;
  stars: number;
  dependencies: string[];
  platforms: PlatformSupport;
  lastUpdated: string;
  createdAt: string;
}

export interface Indicator {
  name: string;
  value: number;
  maxValue: number;
  color: string;
  label: string;
}

export interface PlatformSupport {
  linux: boolean;
  macos: boolean;
  windows: boolean;
  raspberryPi: boolean;
  docker: boolean;
}

export interface PluginCIStatus {
  pluginId: string;
  platform: string;
  status: 'passing' | 'failing' | 'unknown';
  lastBuild: string;
  buildUrl: string;
}

// src/appstore/registry.ts
import axios from 'axios';
import { PluginMetadata, PluginCIStatus } from './types';

const REGISTRY_URL = 'https://dirkwa.github.io/signalk-plugin-registry/';

export class PluginRegistry {
  private cache: Map<string, PluginMetadata> = new Map();
  private ciCache: Map<string, PluginCIStatus[]> = new Map();

  async fetchAllPlugins(): Promise<PluginMetadata[]> {
    try {
      const response = await axios.get(`${REGISTRY_URL}plugins.json`);
      const plugins: PluginMetadata[] = response.data;
      plugins.forEach(plugin => this.cache.set(plugin.id, plugin));
      return plugins;
    } catch (error) {
      console.error('Failed to fetch plugins from registry:', error);
      return [];
    }
  }

  async fetchPlugin(id: string): Promise<PluginMetadata | null> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }
    try {
      const response = await axios.get(`${REGISTRY_URL}plugins/${id}.json`);
      const plugin: PluginMetadata = response.data;
      this.cache.set(id, plugin);
      return plugin;
    } catch (error) {
      console.error(`Failed to fetch plugin ${id}:`, error);
      return null;
    }
  }

  async fetchPluginCIStatus(pluginId: string): Promise<PluginCIStatus[]> {
    if (this.ciCache.has(pluginId)) {
      return this.ciCache.get(pluginId)!;
    }
    try {
      const response = await axios.get(`${REGISTRY_URL}ci/${pluginId}.json`);
      const statuses: PluginCIStatus[] = response.data;
      this.ciCache.set(pluginId, statuses);
      return statuses;
    } catch (error) {
      console.error(`Failed to fetch CI status for ${pluginId}:`, error);
      return [];
    }
  }

  async searchPlugins(query: string): Promise<PluginMetadata[]> {
    const allPlugins = await this.fetchAllPlugins();
    const lowerQuery = query.toLowerCase();
    return allPlugins.filter(plugin => 
      plugin.name.toLowerCase().includes(lowerQuery) ||
      plugin.description.toLowerCase().includes(lowerQuery) ||
      plugin.keywords.some(k => k.toLowerCase().includes(lowerQuery))
    );
  }
}

// src/appstore/AppStore.tsx
import React, { useState, useEffect } from 'react';
import { PluginRegistry } from './registry';
import { PluginMetadata, PluginCIStatus } from './types';
import PluginDetailPage from './components/PluginDetailPage';
import PluginGrid from './components/PluginGrid';
import Sidebar from './components/Sidebar';

const registry = new PluginRegistry();

const AppStore: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginMetadata[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginMetadata | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    setLoading(true);
    const allPlugins = await registry.fetchAllPlugins();
    setPlugins(allPlugins);
    setLoading(false);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      loadPlugins();
    } else {
      const results = await registry.searchPlugins(query);
      setPlugins(results);
    }
  };

  const handlePluginSelect = (plugin: PluginMetadata) => {
    setSelectedPlugin(plugin);
  };

  const handleBack = () => {
    setSelectedPlugin(null);
  };

  if (loading) {
    return <div className="app-store-loading">Loading App Store...</div>;
  }

  return (
    <div className="app-store-container">
      <Sidebar 
        onSearch={handleSearch}
        searchQuery={searchQuery}
      />
      <main className="app-store-main">
        {selectedPlugin ? (
          <PluginDetailPage 
            plugin={selectedPlugin}
            onBack={handleBack}
          />
        ) : (
          <PluginGrid 
            plugins={plugins}
            onPluginSelect={handlePluginSelect}
          />
        )}
      </main>
    </div>
  );
};

export default AppStore;

// src/appstore/components/PluginGrid.tsx
import React from 'react';
import { PluginMetadata } from '../types';
import ScoreRing from './ScoreRing';

interface PluginGridProps {
  plugins: PluginMetadata[];
  onPluginSelect: (plugin: PluginMetadata) => void;
}

const PluginGrid: React.FC<PluginGridProps> = ({ plugins, onPluginSelect }) => {
  return (
    <div className="plugin-grid">
      <div className="plugin-grid-header">
        <h2>Available Plugins ({plugins.length})</h2>
      </div>
      <div className="plugin-grid-cards">
        {plugins.map(plugin => (
          <div 
            key={plugin.id} 
            className="plugin-card"
            onClick={() => onPluginSelect(plugin)}
          >
            <div className="plugin-card-header">
              <h3>{plugin.name}</h3>
              <ScoreRing score={plugin.score} size={60} />
            </div>
            <p className="plugin-card-description">{plugin.description}</p>
            <div className="plugin-card-meta">
              <span className="plugin-version">v{plugin.version}</span>
              <span className="plugin-downloads">{plugin.downloads} downloads</span>
              <span className="plugin-stars">★ {plugin.stars}</span>
            </div>
            <div className="plugin-card-categories">
              {plugin.categories.slice(0, 3).map(cat => (
                <span key={cat} className="plugin-category-tag">{cat}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PluginGrid;

// src/appstore/components/ScoreRing.tsx
import React from 'react';

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

const ScoreRing: React.FC<ScoreRingProps> = ({ 
  score, 
  size = 80, 
  strokeWidth = 8 
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score / 100;
  const offset = circumference - progress * circumference;
  
  const getColor = (score: number) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FFC107';
    if (score >= 40) return '#FF9800';
    return '#F44336';
  };

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring-text">
        <span className="score-value">{Math.round(score)}</span>
      </div>
    </div>
  );
};

export default ScoreRing;

// src/appstore/components/PluginDetailPage.tsx
import React, { useState, useEffect } from 'react';
import { PluginMetadata, PluginCIStatus } from '../types';
import { PluginRegistry } from '../registry';
import ScoreRing from './ScoreRing';
import ScreenshotLightbox from './ScreenshotLightbox';
import PluginCIMatrix from './PluginCIMatrix';
import DependencyInstallFlow from './DependencyInstallFlow';

interface PluginDetailPageProps {
  plugin: PluginMetadata;
  onBack: () => void;
}

const registry = new PluginRegistry();

const PluginDetailPage: React.FC<PluginDetailPageProps> = ({ plugin, onBack }) => {
  const [activeTab, setActiveTab] = useState<'readme' | 'changelog' | 'indicators'>('readme');
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [ciStatuses, setCiStatuses] = useState<PluginCIStatus[]>([]);
  const [showInstallFlow, setShowInstallFlow] = useState(false);

  useEffect(() => {
    loadCIStatus();
  }, [plugin.id]);

  const loadCIStatus = async () => {
    const statuses = await registry.fetchPluginCIStatus(plugin.id);
    setCiStatuses(statuses);
  };

  const handleScreenshotClick = (index: number) => {
    setLightboxIndex(index);
    setShowLightbox(true);
  };

  const handleInstall = () => {
    setShowInstallFlow(true);
  };

  return (
    <div className="plugin-detail-page">
      <button className="back-button" onClick={onBack}>
        ← Back to App Store
      </button>
      
      <div className="plugin-detail-header">
        <div className="plugin-detail-info">
          <h1>{plugin.name}</h1>
          <p className="plugin-detail-description">{plugin.description}</p>
          <div className="plugin-detail-meta">
            <span>by {plugin.author}</span>
            <span>v{plugin.version}</span>
            <span>{plugin.downloads} downloads</span>
            <span>★ {plugin.stars}</span>
          </div>
          <button className="install-button" onClick={handleInstall}>
            Install Plugin
          </button>
        </div>
        <ScoreRing score={plugin.score} size={120} />
      </div>

      <div className="plugin-detail-tabs">
        <button 
          className={`tab ${activeTab === 'readme' ? 'active' : ''}`}
          onClick={() => setActiveTab('readme')}
        >
          README
        </button>
        <button 
          className={`tab ${activeTab === 'changelog' ? 'active' : ''}`}
          onClick={() => setActiveTab('changelog')}
        >
          Changelog
        </button>
        <button 
          className={`tab ${activeTab === 'indicators' ? 'active' : ''}`}
          onClick={() => setActiveTab('indicators')}
        >
          Indicators
        </button>
      </div>

      <div className="plugin-detail-content">
        {activeTab === 'readme' && (
          <div className="plugin-readme" dangerouslySetInnerHTML={{ __html: plugin.readme }} />
        )}
        {activeTab === 'changelog' && (
          <div className="plugin-changelog" dangerouslySetInnerHTML={{ __html: plugin.changelog }} />
        )}
        {activeTab === 'indicators' && (
          <div className="plugin-indicators">
            {plugin.indicators.map((indicator, index) => (
              <div key={index} className="indicator-item">
                <div className="indicator-header">
                  <span className="indicator-name">{indicator.name}</span>
                  <span className="indicator-value">{indicator.value}/{indicator.maxValue}</span>
                </div>
                <div className="indicator-bar">
                  <div 
                    className="indicator-bar-fill"
                    style={{ 
                      width: `${(indicator.value / indicator.maxValue) * 100}%`,
                      backgroundColor: indicator.color 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {plugin.screenshots.length > 0 && (
        <div className="plugin-screenshots">
          <h3>Screenshots</h3>
          <div className="screenshot-gallery">
            {plugin.screenshots.map((screenshot, index) => (
              <img 
                key={index}
                src={screenshot}
                alt={`Screenshot ${index + 1}`}
                onClick={() => handleScreenshotClick(index)}
                className="screenshot-thumbnail"
              />
            ))}
          </div>
        </div>
      )}

      <PluginCIMatrix ciStatuses={ciStatuses} />

      {showLightbox && (
        <ScreenshotLightbox 
          screenshots={plugin.screenshots}
          currentIndex={lightboxIndex}
          onClose={() => setShowLightbox(false)}
          onNavigate={setLightboxIndex}
        />
      )}

      {showInstallFlow && (
        <DependencyInstallFlow 
          plugin={plugin}
          onClose={() => setShowInstallFlow(false)}
        />
      )}
    </div>
  );
};

export default PluginDetailPage;

// src/appstore/components/ScreenshotLightbox.tsx
import React from 'react';

interface ScreenshotLightboxProps {
  screenshots: string[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const ScreenshotLightbox: React.FC<ScreenshotLightboxProps> = ({
  screenshots,
  currentIndex,
  onClose,
  onNavigate
}) => {
  return (
    <div className="screenshot-lightbox-overlay" onClick={onClose}>
      <div className="screenshot-lightbox" onClick={e => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose}>×</button>
        <button 
          className="lightbox-nav lightbox-prev"
          onClick={() => onNavigate(currentIndex > 0 ? currentIndex - 1 : screenshots.length - 1)}
        >
          ‹
        </button>
        <img 
          src={screenshots[currentIndex]} 
          alt={`Screenshot ${currentIndex + 1}`}
          className="lightbox-image"
        />
        <button 
          className="lightbox-nav lightbox-next"
          onClick={() => onNavigate(currentIndex < screenshots.length - 1 ? currentIndex + 1 : 0)}
        >
          ›
        </button>
        <div className="lightbox-counter">
          {currentIndex + 1} / {screenshots.length}
        </div>
      </div>
    </div>
  );
};

export default ScreenshotLightbox;

// src/appstore/components/PluginCIMatrix.tsx
import React from 'react';
import { PluginCIStatus } from '../types';

interface PluginCIMatrixProps {
  ciStatuses: PluginCIStatus[];
}

const PluginCIMatrix: React.FC<PluginCIMatrixProps> = ({ ciStatuses }) => {
  const platforms = ['linux', 'macos', 'windows', 'raspberryPi', 'docker'];
  const platformLabels: Record<string, string> = {
    linux: 'Linux',
    macos: 'macOS',
    windows: 'Windows',
    raspberryPi: 'Raspberry Pi',
    docker: 'Docker'
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passing': return '✓';
      case 'failing': return '✗';
      default: return '?';
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'passing': return 'status-passing';
      case 'failing': return 'status-failing';
      default: return 'status-unknown';
    }
  };

  return (
    <div className="plugin-ci-matrix">
      <h3>CI Status Matrix</h3>
      <div className="ci-matrix-grid">
        <div className="ci-matrix-header">
          <div className="ci-matrix-cell">Platform</div>
          <div className="ci-matrix-cell">Status</div>
          <div className="ci-matrix-cell">Last Build</div>
        </div>
        {platforms.map(platform => {
          const status = ciStatuses.find(s => s.platform === platform);
          return (
            <div key={platform} className="ci-matrix-row">
              <div className="ci-matrix-cell">{platformLabels[platform]}</div>
              <div className={`ci-matrix-cell ${getStatusClass(status?.status || 'unknown')}`}>
                {getStatusIcon(status?.status || 'unknown')}
              </div>
              <div className="ci-matrix-cell">
                {status?.lastBuild ? new Date(status.lastBuild).toLocaleDateString() : 'N/A'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PluginCIMatrix;

// src/appstore/components/DependencyInstallFlow.tsx
import React, { useState, useEffect } from 'react';
import { PluginMetadata } from '../types';
import { PluginRegistry } from '../registry';

interface DependencyInstallFlowProps {
  plugin: PluginMetadata;
  onClose: () => void;
}

const registry = new PluginRegistry();

const DependencyInstallFlow: React.FC<DependencyInstallFlowProps> = ({ plugin, onClose }) => {
  const [dependencies, setDependencies] = useState<PluginMetadata[]>([]);
  const [installStep, setInstallStep] = useState<'check' | 'confirm