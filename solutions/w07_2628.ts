// src/appstore/types.ts
export interface PluginMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  homepage?: string;
  repository?: string;
  categories: string[];
  tags: string[];
  readme: string;
  changelog: string;
  screenshots: string[];
  dependencies: Record<string, string>;
  platforms: Record<string, PlatformSupport>;
  indicators: Indicator[];
  score: number;
  downloads: number;
  updatedAt: string;
  createdAt: string;
}

export interface PlatformSupport {
  supported: boolean;
  tested: boolean;
  minVersion?: string;
  maxVersion?: string;
}

export interface Indicator {
  name: string;
  value: number;
  maxValue: number;
  color: string;
  label: string;
}

export interface PluginRegistryEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  repository: string;
  categories: string[];
  tags: string[];
  readme: string;
  changelog: string;
  screenshots: string[];
  dependencies: Record<string, string>;
  platforms: Record<string, PlatformSupport>;
  indicators: Indicator[];
  score: number;
  downloads: number;
  updatedAt: string;
  createdAt: string;
}

// src/appstore/registry.ts
import axios from 'axios';
import { PluginRegistryEntry } from './types';

const REGISTRY_URL = 'https://dirkwa.github.io/signalk-plugin-registry/registry.json';

export class PluginRegistry {
  private cache: Map<string, PluginRegistryEntry> = new Map();
  private cacheTimestamp: number = 0;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  async fetchRegistry(): Promise<PluginRegistryEntry[]> {
    const now = Date.now();
    if (this.cache.size > 0 && now - this.cacheTimestamp < this.cacheTTL) {
      return Array.from(this.cache.values());
    }

    try {
      const response = await axios.get<PluginRegistryEntry[]>(REGISTRY_URL);
      const entries = response.data;
      
      this.cache.clear();
      entries.forEach(entry => {
        this.cache.set(entry.id, entry);
      });
      this.cacheTimestamp = now;
      
      return entries;
    } catch (error) {
      console.error('Failed to fetch plugin registry:', error);
      throw error;
    }
  }

  async getPlugin(id: string): Promise<PluginRegistryEntry | undefined> {
    await this.fetchRegistry();
    return this.cache.get(id);
  }

  async searchPlugins(query: string): Promise<PluginRegistryEntry[]> {
    const entries = await this.fetchRegistry();
    const lowerQuery = query.toLowerCase();
    
    return entries.filter(entry => 
      entry.name.toLowerCase().includes(lowerQuery) ||
      entry.description.toLowerCase().includes(lowerQuery) ||
      entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      entry.categories.some(cat => cat.toLowerCase().includes(lowerQuery))
    );
  }

  async getPluginsByCategory(category: string): Promise<PluginRegistryEntry[]> {
    const entries = await this.fetchRegistry();
    return entries.filter(entry => 
      entry.categories.includes(category)
    );
  }

  async getTopRatedPlugins(limit: number = 10): Promise<PluginRegistryEntry[]> {
    const entries = await this.fetchRegistry();
    return entries
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getMostDownloadedPlugins(limit: number = 10): Promise<PluginRegistryEntry[]> {
    const entries = await this.fetchRegistry();
    return entries
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }
}

// src/appstore/plugin-manager.ts
import { EventEmitter } from 'events';
import { PluginMetadata, PluginRegistryEntry } from './types';
import { PluginRegistry } from './registry';

export class PluginManager extends EventEmitter {
  private registry: PluginRegistry;
  private installedPlugins: Map<string, PluginMetadata> = new Map();
  private installationQueue: string[] = [];

  constructor() {
    super();
    this.registry = new PluginRegistry();
  }

  async initialize(): Promise<void> {
    await this.registry.fetchRegistry();
    this.loadInstalledPlugins();
  }

  private loadInstalledPlugins(): void {
    // Load from local storage or database
    const stored = localStorage.getItem('installedPlugins');
    if (stored) {
      const plugins = JSON.parse(stored);
      plugins.forEach((plugin: PluginMetadata) => {
        this.installedPlugins.set(plugin.id, plugin);
      });
    }
  }

  private saveInstalledPlugins(): void {
    const plugins = Array.from(this.installedPlugins.values());
    localStorage.setItem('installedPlugins', JSON.stringify(plugins));
  }

  async getAvailablePlugins(): Promise<PluginRegistryEntry[]> {
    return this.registry.fetchRegistry();
  }

  async getPluginDetails(id: string): Promise<PluginRegistryEntry | undefined> {
    return this.registry.getPlugin(id);
  }

  async searchPlugins(query: string): Promise<PluginRegistryEntry[]> {
    return this.registry.searchPlugins(query);
  }

  async installPlugin(id: string): Promise<boolean> {
    if (this.installationQueue.includes(id)) {
      throw new Error('Plugin is already being installed');
    }

    const plugin = await this.registry.getPlugin(id);
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    // Check dependencies
    const missingDeps = await this.checkDependencies(plugin.dependencies);
    if (missingDeps.length > 0) {
      throw new Error(`Missing dependencies: ${missingDeps.join(', ')}`);
    }

    this.installationQueue.push(id);
    this.emit('install:start', id);

    try {
      // Simulate installation process
      await this.performInstallation(plugin);
      
      const metadata: PluginMetadata = {
        ...plugin,
        installedAt: new Date().toISOString()
      };
      
      this.installedPlugins.set(id, metadata);
      this.saveInstalledPlugins();
      
      this.installationQueue = this.installationQueue.filter(p => p !== id);
      this.emit('install:complete', id);
      
      return true;
    } catch (error) {
      this.installationQueue = this.installationQueue.filter(p => p !== id);
      this.emit('install:error', id, error);
      throw error;
    }
  }

  async uninstallPlugin(id: string): Promise<boolean> {
    if (!this.installedPlugins.has(id)) {
      throw new Error('Plugin is not installed');
    }

    this.emit('uninstall:start', id);

    try {
      // Perform uninstallation
      await this.performUninstallation(id);
      
      this.installedPlugins.delete(id);
      this.saveInstalledPlugins();
      
      this.emit('uninstall:complete', id);
      return true;
    } catch (error) {
      this.emit('uninstall:error', id, error);
      throw error;
    }
  }

  async updatePlugin(id: string): Promise<boolean> {
    const installed = this.installedPlugins.get(id);
    if (!installed) {
      throw new Error('Plugin is not installed');
    }

    const available = await this.registry.getPlugin(id);
    if (!available) {
      throw new Error('Plugin not found in registry');
    }

    if (available.version === installed.version) {
      throw new Error('Plugin is already up to date');
    }

    return this.installPlugin(id);
  }

  getInstalledPlugins(): PluginMetadata[] {
    return Array.from(this.installedPlugins.values());
  }

  isPluginInstalled(id: string): boolean {
    return this.installedPlugins.has(id);
  }

  private async checkDependencies(dependencies: Record<string, string>): Promise<string[]> {
    const missing: string[] = [];
    
    for (const [depId, depVersion] of Object.entries(dependencies)) {
      const installed = this.installedPlugins.get(depId);
      if (!installed) {
        missing.push(depId);
      } else if (installed.version !== depVersion) {
        // Check version compatibility
        if (!this.isVersionCompatible(installed.version, depVersion)) {
          missing.push(`${depId} (required: ${depVersion}, installed: ${installed.version})`);
        }
      }
    }
    
    return missing;
  }

  private isVersionCompatible(installed: string, required: string): boolean {
    // Simple version comparison - can be enhanced
    const installedParts = installed.split('.').map(Number);
    const requiredParts = required.split('.').map(Number);
    
    for (let i = 0; i < Math.max(installedParts.length, requiredParts.length); i++) {
      const installedPart = installedParts[i] || 0;
      const requiredPart = requiredParts[i] || 0;
      
      if (installedPart < requiredPart) return false;
      if (installedPart > requiredPart) return true;
    }
    
    return true;
  }

  private async performInstallation(plugin: PluginRegistryEntry): Promise<void> {
    // Simulate installation delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Here you would actually download and install the plugin
    console.log(`Installing plugin: ${plugin.name} v${plugin.version}`);
  }

  private async performUninstallation(id: string): Promise<void> {
    // Simulate uninstallation delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Here you would actually remove the plugin
    console.log(`Uninstalling plugin: ${id}`);
  }
}

// src/appstore/components/PluginDetailPage.tsx
import React, { useState, useEffect } from 'react';
import { PluginMetadata, PluginRegistryEntry } from '../types';
import { PluginManager } from '../plugin-manager';

interface PluginDetailPageProps {
  pluginId: string;
  pluginManager: PluginManager;
  onBack: () => void;
}

export const PluginDetailPage: React.FC<PluginDetailPageProps> = ({ pluginId, pluginManager, onBack }) => {
  const [plugin, setPlugin] = useState<PluginRegistryEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'readme' | 'changelog' | 'indicators'>('readme');
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScreenshot, setShowScreenshot] = useState<string | null>(null);

  useEffect(() => {
    loadPlugin();
  }, [pluginId]);

  useEffect(() => {
    if (plugin) {
      setIsInstalled(pluginManager.isPluginInstalled(plugin.id));
    }
  }, [plugin, pluginManager]);

  const loadPlugin = async () => {
    try {
      const details = await pluginManager.getPluginDetails(pluginId);
      setPlugin(details || null);
    } catch (err) {
      setError('Failed to load plugin details');
    }
  };

  const handleInstall = async () => {
    if (!plugin) return;
    
    setIsInstalling(true);
    setError(null);
    
    try {
      await pluginManager.installPlugin(plugin.id);
      setIsInstalled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!plugin) return;
    
    setIsInstalling(true);
    setError(null);
    
    try {
      await pluginManager.uninstallPlugin(plugin.id);
      setIsInstalled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uninstallation failed');
    } finally {
      setIsInstalling(false);
    }
  };

  if (!plugin) {
    return (
      <div className="plugin-detail-loading">
        <div className="spinner"></div>
        <p>Loading plugin details...</p>
      </div>
    );
  }

  return (
    <div className="plugin-detail-page">
      <button className="back-button" onClick={onBack}>
        ← Back to App Store
      </button>

      <div className="plugin-header">
        <div className="plugin-icon">
          {plugin.name.charAt(0).toUpperCase()}
        </div>
        <div className="plugin-info">
          <h1>{plugin.name}</h1>
          <p className="plugin-author">by {plugin.author}</p>
          <div className="plugin-meta">
            <span className="version">v{plugin.version}</span>
            <span className="license">{plugin.license}</span>
            <span className="downloads">{plugin.downloads.toLocaleString()} downloads</span>
          </div>
          <div className="plugin-categories">
            {plugin.categories.map(cat => (
              <span key={cat} className="category-badge">{cat}</span>
            ))}
          </div>
        </div>
        <div className="plugin-actions">
          <div className="score-ring">
            <svg viewBox="0 0 36 36" className="score-ring-svg">
              <path
                className="score-ring-bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="score-ring-fill"
                strokeDasharray={`${plugin.score}, 100`}
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <text x="18" y="20.35" className="score-ring-text">
                {plugin.score}
              </text>
            </svg>
          </div>
          {isInstalled ? (
            <button 
              className="btn btn-danger"
              onClick={handleUninstall}
              disabled={isInstalling}
            >
              {isInstalling ? 'Uninstalling...' : 'Uninstall'}
            </button>
          ) : (
            <button 
              className="btn btn-primary"
              onClick={handleInstall}
              disabled={isInstalling}
            >
              {isInstalling ? 'Installing...' : 'Install'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="plugin-tabs">
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

      <div className="plugin-content">
        {activeTab === 'readme' && (
          <div className="readme-content">
            <div className="markdown-content">
              {plugin.readme.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'changelog' && (
          <div className="changelog-content">
            <div className="markdown-content">
              {plugin.changelog.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'indicators' && (
          <div className="indicators-content">
            <div className="indicators-grid">
              {plugin.indicators.map((indicator, index) => (
                <div key={index} className="indicator-card">
                  <div className="indicator-header">
                    <h3>{indicator.name}</h3>
                    <span className="indicator-value">
                      {indicator.value}/{indicator.maxValue}
                    </span>
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
                  <p className="indicator-label">{indicator.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {plugin.screenshots.length > 0 && (
        <div className="screenshots-section">
          <h2>Screenshots</h2>
          <div className="screenshots-grid">
            {plugin.screenshots.map((screenshot, index) => (
              <div 
                key={index} 
                className="screenshot-thumbnail"
                onClick={() => setShowScreenshot(screenshot)}
              >
                <img src={screenshot} alt={`Screenshot ${index + 1}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {showScreenshot && (
        <div className="screenshot-lightbox" onClick={() => setShowScreenshot(null)}>
          <img src={showScreenshot} alt="Screenshot" />
          <button className="close-button" onClick={() => setShowScreenshot(null)}>
            ×
          </button>
        </div>
      )}

      <div className="plugin-ci-matrix">
        <h2>Platform Support</h2>
        <table className="ci-matrix-table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Supported</th>
              <th>Tested</th>
              <th>Min Version</