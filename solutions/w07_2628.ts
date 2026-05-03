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
  platforms: string[];
  dependencies: Record<string, string>;
  indicators: Indicator[];
  score: number;
  downloads: number;
  updatedAt: string;
  createdAt: string;
  readme: string;
  changelog: string;
  screenshots: string[];
  ciMatrix: Record<string, CIMatrixEntry>;
}

export interface Indicator {
  name: string;
  value: number;
  maxValue: number;
  color: string;
  label: string;
}

export interface CIMatrixEntry {
  platform: string;
  nodeVersion: string;
  status: 'passing' | 'failing' | 'unknown';
  lastRun: string;
  duration: number;
}

export interface PluginRegistryResponse {
  plugins: PluginMetadata[];
  total: number;
  page: number;
  pageSize: number;
}

// src/appstore/registry.ts
import axios from 'axios';
import { PluginMetadata, PluginRegistryResponse } from './types';

const REGISTRY_URL = 'https://dirkwa.github.io/signalk-plugin-registry/registry.json';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class PluginRegistry {
  private cache: Map<string, { data: PluginMetadata[]; timestamp: number }> = new Map();

  async getAllPlugins(): Promise<PluginMetadata[]> {
    const cached = this.cache.get('all');
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const response = await axios.get<PluginRegistryResponse>(REGISTRY_URL);
    const plugins = response.data.plugins;
    
    this.cache.set('all', { data: plugins, timestamp: Date.now() });
    return plugins;
  }

  async getPluginById(id: string): Promise<PluginMetadata | null> {
    const plugins = await this.getAllPlugins();
    return plugins.find(p => p.id === id) || null;
  }

  async getPluginsByCategory(category: string): Promise<PluginMetadata[]> {
    const plugins = await this.getAllPlugins();
    return plugins.filter(p => p.categories.includes(category));
  }

  async searchPlugins(query: string): Promise<PluginMetadata[]> {
    const plugins = await this.getAllPlugins();
    const lowerQuery = query.toLowerCase();
    return plugins.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.keywords.some(k => k.toLowerCase().includes(lowerQuery))
    );
  }

  invalidateCache(): void {
    this.cache.clear();
  }
}

export const pluginRegistry = new PluginRegistry();

// src/appstore/components/PluginDetailPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PluginMetadata } from '../types';
import { pluginRegistry } from '../registry';
import ScoreRing from './ScoreRing';
import ScreenshotLightbox from './ScreenshotLightbox';
import DependencyInstallFlow from './DependencyInstallFlow';
import CIMatrix from './CIMatrix';
import IndicatorGrid from './IndicatorGrid';

const PluginDetailPage: React.FC = () => {
  const { pluginId } = useParams<{ pluginId: string }>();
  const [plugin, setPlugin] = useState<PluginMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'readme' | 'changelog' | 'indicators'>('readme');
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    const fetchPlugin = async () => {
      if (!pluginId) return;
      const data = await pluginRegistry.getPluginById(pluginId);
      setPlugin(data);
      setLoading(false);
    };
    fetchPlugin();
  }, [pluginId]);

  if (loading) return <div className="loading-spinner">Loading plugin details...</div>;
  if (!plugin) return <div className="error-message">Plugin not found</div>;

  return (
    <div className="plugin-detail-page">
      <div className="plugin-header">
        <div className="plugin-title-section">
          <h1>{plugin.name}</h1>
          <span className="plugin-version">v{plugin.version}</span>
          <span className="plugin-author">by {plugin.author}</span>
        </div>
        <div className="plugin-score-section">
          <ScoreRing score={plugin.score} size={120} />
          <div className="download-count">
            <i className="fas fa-download"></i>
            <span>{plugin.downloads.toLocaleString()} downloads</span>
          </div>
        </div>
      </div>

      <div className="plugin-description">
        <p>{plugin.description}</p>
      </div>

      <div className="plugin-tabs">
        <button 
          className={`tab-button ${activeTab === 'readme' ? 'active' : ''}`}
          onClick={() => setActiveTab('readme')}
        >
          README
        </button>
        <button 
          className={`tab-button ${activeTab === 'changelog' ? 'active' : ''}`}
          onClick={() => setActiveTab('changelog')}
        >
          Changelog
        </button>
        <button 
          className={`tab-button ${activeTab === 'indicators' ? 'active' : ''}`}
          onClick={() => setActiveTab('indicators')}
        >
          Indicators
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'readme' && (
          <div className="readme-content" dangerouslySetInnerHTML={{ __html: plugin.readme }} />
        )}
        {activeTab === 'changelog' && (
          <div className="changelog-content" dangerouslySetInnerHTML={{ __html: plugin.changelog }} />
        )}
        {activeTab === 'indicators' && (
          <IndicatorGrid indicators={plugin.indicators} />
        )}
      </div>

      {plugin.screenshots.length > 0 && (
        <div className="screenshots-section">
          <h2>Screenshots</h2>
          <div className="screenshot-grid">
            {plugin.screenshots.map((url, index) => (
              <img
                key={index}
                src={url}
                alt={`Screenshot ${index + 1}`}
                onClick={() => {
                  setLightboxIndex(index);
                  setShowLightbox(true);
                }}
                className="screenshot-thumbnail"
              />
            ))}
          </div>
        </div>
      )}

      {showLightbox && (
        <ScreenshotLightbox
          images={plugin.screenshots}
          currentIndex={lightboxIndex}
          onClose={() => setShowLightbox(false)}
          onNavigate={setLightboxIndex}
        />
      )}

      <div className="plugin-details-section">
        <h2>Details</h2>
        <div className="details-grid">
          <div className="detail-item">
            <label>License</label>
            <span>{plugin.license}</span>
          </div>
          <div className="detail-item">
            <label>Repository</label>
            <a href={plugin.repository} target="_blank" rel="noopener noreferrer">
              {plugin.repository}
            </a>
          </div>
          <div className="detail-item">
            <label>Categories</label>
            <div className="category-tags">
              {plugin.categories.map(cat => (
                <span key={cat} className="category-tag">{cat}</span>
              ))}
            </div>
          </div>
          <div className="detail-item">
            <label>Platforms</label>
            <div className="platform-tags">
              {plugin.platforms.map(platform => (
                <span key={platform} className="platform-tag">{platform}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DependencyInstallFlow plugin={plugin} />

      <CIMatrix ciMatrix={plugin.ciMatrix} />
    </div>
  );
};

export default PluginDetailPage;

// src/appstore/components/ScoreRing.tsx
import React from 'react';

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

const ScoreRing: React.FC<ScoreRingProps> = ({ score, size = 100, strokeWidth = 8 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  
  const getColor = (score: number): string => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    if (score >= 40) return '#FF5722';
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
          className="score-ring-progress"
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="score-text"
          fontSize={size * 0.25}
          fill="#333"
        >
          {Math.round(score)}
        </text>
      </svg>
    </div>
  );
};

export default ScoreRing;

// src/appstore/components/ScreenshotLightbox.tsx
import React from 'react';

interface ScreenshotLightboxProps {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const ScreenshotLightbox: React.FC<ScreenshotLightboxProps> = ({
  images,
  currentIndex,
  onClose,
  onNavigate
}) => {
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
        
        <button 
          className="lightbox-nav lightbox-prev"
          onClick={() => onNavigate((currentIndex - 1 + images.length) % images.length)}
          disabled={images.length <= 1}
        >
          <i className="fas fa-chevron-left"></i>
        </button>

        <img
          src={images[currentIndex]}
          alt={`Screenshot ${currentIndex + 1}`}
          className="lightbox-image"
        />

        <button 
          className="lightbox-nav lightbox-next"
          onClick={() => onNavigate((currentIndex + 1) % images.length)}
          disabled={images.length <= 1}
        >
          <i className="fas fa-chevron-right"></i>
        </button>

        <div className="lightbox-counter">
          {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  );
};

export default ScreenshotLightbox;

// src/appstore/components/DependencyInstallFlow.tsx
import React, { useState, useEffect } from 'react';
import { PluginMetadata } from '../types';
import { pluginRegistry } from '../registry';

interface DependencyInstallFlowProps {
  plugin: PluginMetadata;
}

const DependencyInstallFlow: React.FC<DependencyInstallFlowProps> = ({ plugin }) => {
  const [dependencies, setDependencies] = useState<PluginMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [installStep, setInstallStep] = useState<'check' | 'install' | 'complete'>('check');

  useEffect(() => {
    const fetchDependencies = async () => {
      const depPlugins: PluginMetadata[] = [];
      for (const [depId, version] of Object.entries(plugin.dependencies)) {
        const depPlugin = await pluginRegistry.getPluginById(depId);
        if (depPlugin) {
          depPlugins.push(depPlugin);
        }
      }
      setDependencies(depPlugins);
      setLoading(false);
    };
    fetchDependencies();
  }, [plugin.dependencies]);

  const handleInstall = async () => {
    setInstallStep('install');
    // Simulate installation process
    await new Promise(resolve => setTimeout(resolve, 2000));
    setInstallStep('complete');
  };

  if (loading) return <div className="loading-dependencies">Checking dependencies...</div>;

  return (
    <div className="dependency-install-flow">
      <h2>Installation</h2>
      
      {dependencies.length > 0 && (
        <div className="dependencies-section">
          <h3>Dependencies</h3>
          <div className="dependency-list">
            {dependencies.map(dep => (
              <div key={dep.id} className="dependency-item">
                <div className="dependency-info">
                  <span className="dependency-name">{dep.name}</span>
                  <span className="dependency-version">v{dep.version}</span>
                  <span className="dependency-status">
                    {dep.score >= 70 ? (
                      <i className="fas fa-check-circle text-success"></i>
                    ) : (
                      <i className="fas fa-exclamation-triangle text-warning"></i>
                    )}
                  </span>
                </div>
                <ScoreRing score={dep.score} size={40} strokeWidth={4} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="install-actions">
        {installStep === 'check' && (
          <button className="btn btn-primary" onClick={handleInstall}>
            Install Plugin
          </button>
        )}
        {installStep === 'install' && (
          <div className="install-progress">
            <div className="progress-bar">
              <div className="progress-fill"></div>
            </div>
            <span>Installing dependencies...</span>
          </div>
        )}
        {installStep === 'complete' && (
          <div className="install-complete">
            <i className="fas fa-check-circle text-success"></i>
            <span>Plugin installed successfully!</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DependencyInstallFlow;

// src/appstore/components/CIMatrix.tsx
import React from 'react';
import { CIMatrixEntry } from '../types';

interface CIMatrixProps {
  ciMatrix: Record<string, CIMatrixEntry>;
}

const CIMatrix: React.FC<CIMatrixProps> = ({ ciMatrix }) => {
  const entries = Object.values(ciMatrix);
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passing':
        return <i className="fas fa-check-circle text-success"></i>;
      case 'failing':
        return <i className="fas fa-times-circle text-danger"></i>;
      default:
        return <i className="fas fa-question-circle text-muted"></i>;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'passing':
        return 'status-passing';
      case 'failing':
        return 'status-failing';
      default:
        return 'status-unknown';
    }
  };

  return (
    <div className="ci-matrix">
      <h2>CI Matrix</h2>
      <div className="ci-matrix-table">
        <div className="ci-matrix-header">
          <div className="ci-cell">Platform</div>
          <div className="ci-cell">Node Version</div>
          <div className="ci-cell">Status</div>
          <div className="ci-cell">Last Run</div>
          <div className="ci-cell">Duration</div>
        </div>
        {entries.map((entry, index) => (
          <div key={index} className={`ci-matrix-row ${getStatusClass(entry.status)}`}>
            <div className="ci-cell">{entry.platform}</div>
            <div className="ci-cell">{entry.nodeVersion}</div>
            <div className="ci-cell">{getStatusIcon(entry.status)}</div>
            <div className="ci-cell">{new Date(entry.lastRun).toLocaleDateString()}</div>
            <div className="ci-cell">{entry.duration}s</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CIMatrix;

// src/appstore/components/IndicatorGrid.tsx
import React from 'react';
import { Indicator } from '../types';

interface IndicatorGridProps {
  indicators: Indicator[];
}

const IndicatorGrid: React.FC<IndicatorGridProps> = ({ indicators }) => {
  return (
    <div className="indicator-grid">
      <h2>Plugin Indicators</h2>
      <div className="indicator-cards">
        {indicators.map((indicator, index) => (
          <div key={index} className="indicator-card">
            <div className="indicator-header">
              <span className="indicator-name">{indicator.name}</span>
              <span className="indicator-label">{indicator.label}</span>
            </div>
            <div className="indicator-value-container">
              <div 
                className="indicator-bar"
                style={{
                  width: `${(indicator.value / indicator.maxValue) * 100}%`,
                  backgroundColor: indicator.color
                }}
              />
              <span className="indicator-value">
                {indicator.value}/{indicator.maxValue}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IndicatorGrid;

// src/appstore/components/PluginCard.tsx
import React from '