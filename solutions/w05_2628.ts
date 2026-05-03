// src/appstore/AppStore.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Switch, Link, useParams } from 'react-router-dom';
import { Card, Row, Col, Tabs, Tag, Button, Modal, Image, Spin, Alert, Progress, Tooltip } from 'antd';
import { StarFilled, DownloadOutlined, SafetyCertificateOutlined, ExperimentOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const REGISTRY_URL = 'https://dirkwa.github.io/signalk-plugin-registry/registry.json';

const AppStore = () => {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPlugins();
  }, []);

  const fetchPlugins = async () => {
    try {
      const response = await fetch(REGISTRY_URL);
      if (!response.ok) throw new Error('Failed to fetch registry');
      const data = await response.json();
      setPlugins(data.plugins || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  if (error) return <Alert message="Error" description={error} type="error" showIcon />;

  return (
    <Router>
      <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
        <Switch>
          <Route exact path="/">
            <PluginGrid plugins={plugins} />
          </Route>
          <Route path="/plugin/:id">
            <PluginDetail plugins={plugins} />
          </Route>
        </Switch>
      </div>
    </Router>
  );
};

const PluginGrid = ({ plugins }) => {
  return (
    <div>
      <h1 style={{ marginBottom: '24px', color: '#1890ff' }}>Signal K App Store</h1>
      <Row gutter={[16, 16]}>
        {plugins.map(plugin => (
          <Col key={plugin.id} xs={24} sm={12} md={8} lg={6}>
            <Link to={`/plugin/${plugin.id}`}>
              <Card
                hoverable
                cover={
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                    <ScoreRing score={plugin.score || 0} />
                  </div>
                }
              >
                <Card.Meta
                  title={plugin.name}
                  description={
                    <div>
                      <Tag color={plugin.verified ? 'green' : 'orange'}>
                        {plugin.verified ? 'Verified' : 'Community'}
                      </Tag>
                      <div style={{ marginTop: '8px' }}>
                        <StarFilled style={{ color: '#fadb14' }} /> {plugin.stars || 0}
                      </div>
                    </div>
                  }
                />
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </div>
  );
};

const ScoreRing = ({ score }) => {
  const percent = Math.min(100, Math.max(0, score * 100));
  const color = percent > 80 ? '#52c41a' : percent > 50 ? '#faad14' : '#f5222d';

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Progress
        type="circle"
        percent={percent}
        strokeColor={color}
        width={80}
        format={() => `${(score * 10).toFixed(1)}`}
      />
      <div style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>Score</div>
    </div>
  );
};

const PluginDetail = ({ plugins }) => {
  const { id } = useParams();
  const plugin = plugins.find(p => p.id === id);
  const [activeTab, setActiveTab] = useState('readme');
  const [screenshots, setScreenshots] = useState([]);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [installModalVisible, setInstallModalVisible] = useState(false);
  const [dependencies, setDependencies] = useState([]);

  if (!plugin) return <Alert message="Plugin not found" type="warning" showIcon />;

  useEffect(() => {
    if (plugin.screenshots) {
      setScreenshots(plugin.screenshots);
    }
    if (plugin.dependencies) {
      setDependencies(plugin.dependencies);
    }
  }, [plugin]);

  const handleInstall = () => {
    setInstallModalVisible(true);
  };

  const confirmInstall = () => {
    // Simulate installation
    console.log('Installing plugin:', plugin.id);
    setInstallModalVisible(false);
    message.success('Plugin installed successfully');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'readme':
        return (
          <div className="markdown-content">
            <ReactMarkdown
              children={plugin.readme || 'No README available'}
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <SyntaxHighlighter style={dark} language={match[1]} PreTag="div" {...props}>
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            />
          </div>
        );
      case 'changelog':
        return (
          <div>
            <h3>Changelog</h3>
            <ReactMarkdown children={plugin.changelog || 'No changelog available'} />
          </div>
        );
      case 'indicators':
        return (
          <div>
            <h3>Plugin Indicators</h3>
            <Row gutter={[16, 16]}>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="Score"
                    value={plugin.score ? (plugin.score * 10).toFixed(1) : 'N/A'}
                    prefix={<StarFilled />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="Downloads"
                    value={plugin.downloads || 0}
                    prefix={<DownloadOutlined />}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="Verified"
                    value={plugin.verified ? 'Yes' : 'No'}
                    prefix={plugin.verified ? <SafetyCertificateOutlined /> : <ExperimentOutlined />}
                  />
                </Card>
              </Col>
            </Row>
            <div style={{ marginTop: '24px' }}>
              <h4>Platform Compatibility</h4>
              <PluginCIMatrix plugin={plugin} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <Link to="/" style={{ marginBottom: '16px', display: 'block' }}>← Back to App Store</Link>
      
      <Card>
        <Row gutter={24}>
          <Col span={6}>
            <ScoreRing score={plugin.score || 0} />
            <div style={{ marginTop: '16px' }}>
              <Button type="primary" size="large" block onClick={handleInstall}>
                Install Plugin
              </Button>
            </div>
          </Col>
          <Col span={18}>
            <h1>{plugin.name}</h1>
            <p style={{ color: '#666' }}>{plugin.description}</p>
            <div style={{ marginBottom: '16px' }}>
              <Tag color="blue">{plugin.category || 'Uncategorized'}</Tag>
              <Tag>{plugin.version || '1.0.0'}</Tag>
              <Tag color={plugin.verified ? 'green' : 'orange'}>
                {plugin.verified ? 'Verified' : 'Community'}
              </Tag>
            </div>
          </Col>
        </Row>
      </Card>

      <Card style={{ marginTop: '16px' }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab="README" key="readme" />
          <Tabs.TabPane tab="Changelog" key="changelog" />
          <Tabs.TabPane tab="Indicators" key="indicators" />
        </Tabs>
        {renderTabContent()}
      </Card>

      {screenshots.length > 0 && (
        <Card title="Screenshots" style={{ marginTop: '16px' }}>
          <Row gutter={[16, 16]}>
            {screenshots.map((screenshot, index) => (
              <Col key={index} span={6}>
                <Image
                  src={screenshot}
                  alt={`Screenshot ${index + 1}`}
                  style={{ cursor: 'pointer', maxHeight: '200px', objectFit: 'cover' }}
                  preview={{
                    visible: lightboxVisible && lightboxIndex === index,
                    onVisibleChange: (visible) => {
                      setLightboxVisible(visible);
                      setLightboxIndex(index);
                    }
                  }}
                />
              </Col>
            ))}
          </Row>
        </Card>
      )}

      <Modal
        title="Install Plugin"
        visible={installModalVisible}
        onOk={confirmInstall}
        onCancel={() => setInstallModalVisible(false)}
      >
        <p>You are about to install: <strong>{plugin.name}</strong></p>
        {dependencies.length > 0 && (
          <div>
            <h4>Dependencies:</h4>
            <ul>
              {dependencies.map((dep, index) => (
                <li key={index}>{dep.name} ({dep.version || 'latest'})</li>
              ))}
            </ul>
          </div>
        )}
        <p>This will install the plugin and all its dependencies.</p>
      </Modal>
    </div>
  );
};

const PluginCIMatrix = ({ plugin }) => {
  const platforms = ['linux', 'macos', 'windows', 'raspberry-pi'];
  const statuses = ['passing', 'failing', 'unknown'];

  const getStatus = (platform) => {
    if (plugin.ci && plugin.ci[platform]) {
      return plugin.ci[platform];
    }
    return 'unknown';
  };

  return (
    <div>
      <h4>CI Status Matrix</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: '8px' }}>Platform</th>
            <th style={{ border: '1px solid #ddd', padding: '8px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {platforms.map(platform => (
            <tr key={platform}>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>{platform}</td>
              <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                <Tag color={getStatus(platform) === 'passing' ? 'green' : getStatus(platform) === 'failing' ? 'red' : 'default'}>
                  {getStatus(platform)}
                </Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AppStore;
