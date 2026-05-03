// src/appstore/AppStore.js
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Badge, Spinner, Alert, Nav, Tab, Modal, Button, ProgressBar } from 'react-bootstrap';
import { Star, Download, Info, Image, List, Grid, Search, Filter, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { appStoreService } from './appStoreService';
import { PluginDetail } from './PluginDetail';
import { ScoreRing } from './ScoreRing';
import { PluginCIMatrix } from './PluginCIMatrix';
import { ScreenshotLightbox } from './ScreenshotLightbox';
import { DependencyInstallFlow } from './DependencyInstallFlow';

export const AppStore = () => {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedPlugin, setSelectedPlugin] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [lightboxImages, setLightboxImages] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [installQueue, setInstallQueue] = useState([]);
  const [showInstallFlow, setShowInstallFlow] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  useEffect(() => {
    fetchPlugins();
  }, []);

  const fetchPlugins = async () => {
    try {
      setLoading(true);
      const data = await appStoreService.getPlugins();
      setPlugins(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredPlugins = plugins.filter(plugin => {
    const matchesSearch = plugin.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                         plugin.description?.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || plugin.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...new Set(plugins.map(p => p.category).filter(Boolean))];

  const handlePluginClick = (plugin) => {
    setSelectedPlugin(plugin);
    setShowDetail(true);
  };

  const handleInstall = async (plugin) => {
    const deps = await appStoreService.getDependencies(plugin);
    if (deps.length > 0) {
      setInstallQueue([plugin, ...deps]);
      setShowInstallFlow(true);
    } else {
      await appStoreService.installPlugin(plugin);
    }
  };

  const handleScreenshotClick = (images, index) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setShowLightbox(true);
  };

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>Error loading App Store</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid className="app-store">
      {/* Header */}
      <Row className="mb-4">
        <Col>
          <h1 className="display-4">App Store</h1>
          <p className="text-muted">Discover and install plugins for your Signal K server</p>
        </Col>
      </Row>

      {/* Search and Filters */}
      <Row className="mb-4">
        <Col md={6}>
          <div className="search-bar">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              placeholder="Search plugins..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control search-input"
            />
          </div>
        </Col>
        <Col md={4}>
          <select
            className="form-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </Col>
        <Col md={2}>
          <div className="view-toggle btn-group">
            <button
              className={`btn ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={18} />
            </button>
            <button
              className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setViewMode('list')}
            >
              <List size={18} />
            </button>
          </div>
        </Col>
      </Row>

      {/* Plugin Grid/List */}
      <Row>
        {filteredPlugins.length === 0 ? (
          <Col>
            <Alert variant="info">No plugins found matching your criteria.</Alert>
          </Col>
        ) : viewMode === 'grid' ? (
          filteredPlugins.map(plugin => (
            <Col key={plugin.id} xs={12} sm={6} md={4} lg={3} className="mb-4">
              <Card
                className="plugin-card h-100"
                onClick={() => handlePluginClick(plugin)}
                style={{ cursor: 'pointer' }}
              >
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <Card.Title className="mb-1">{plugin.name}</Card.Title>
                      <Badge bg="secondary">{plugin.category || 'Uncategorized'}</Badge>
                    </div>
                    <ScoreRing score={plugin.score || 0} size={48} />
                  </div>
                  <Card.Text className="text-muted small">
                    {plugin.description?.substring(0, 100)}...
                  </Card.Text>
                  <div className="d-flex justify-content-between align-items-center mt-3">
                    <div className="d-flex align-items-center">
                      <Star size={16} className="text-warning me-1" />
                      <small>{plugin.stars || 0}</small>
                      <Download size={16} className="ms-2 me-1" />
                      <small>{plugin.downloads || 0}</small>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstall(plugin);
                      }}
                    >
                      Install
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))
        ) : (
          <Col>
            <ListGroup>
              {filteredPlugins.map(plugin => (
                <ListGroup.Item
                  key={plugin.id}
                  action
                  onClick={() => handlePluginClick(plugin)}
                  className="d-flex justify-content-between align-items-center"
                >
                  <div>
                    <h6 className="mb-1">{plugin.name}</h6>
                    <small className="text-muted">{plugin.description}</small>
                  </div>
                  <div className="d-flex align-items-center">
                    <ScoreRing score={plugin.score || 0} size={32} className="me-3" />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstall(plugin);
                      }}
                    >
                      Install
                    </Button>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Col>
        )}
      </Row>

      {/* Plugin Detail Modal */}
      <Modal
        show={showDetail}
        onHide={() => setShowDetail(false)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>{selectedPlugin?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedPlugin && (
            <PluginDetail
              plugin={selectedPlugin}
              onInstall={handleInstall}
              onScreenshotClick={handleScreenshotClick}
            />
          )}
        </Modal.Body>
      </Modal>

      {/* Screenshot Lightbox */}
      <ScreenshotLightbox
        show={showLightbox}
        onHide={() => setShowLightbox(false)}
        images={lightboxImages}
        currentIndex={lightboxIndex}
        onNavigate={setLightboxIndex}
      />

      {/* Dependency Install Flow */}
      <DependencyInstallFlow
        show={showInstallFlow}
        onHide={() => setShowInstallFlow(false)}
        installQueue={installQueue}
        onComplete={() => {
          setShowInstallFlow(false);
          setInstallQueue([]);
        }}
      />
    </Container>
  );
};
