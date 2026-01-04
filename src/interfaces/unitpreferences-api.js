const express = require('express')
const fs = require('fs')
const path = require('path')
const { createDebug } = require('../debug')
const debug = createDebug('signalk-server:unitpreferences-api')
const {
  getConfig,
  getCategories,
  getActivePreset,
  getMergedDefinitions,
  reloadPreset
} = require('../unitpreferences')

const UNITPREFS_DIR = path.join(__dirname, '../../unitpreferences')

module.exports = function (app) {
  const router = express.Router()

  // GET /signalk/v1/unitpreferences/config
  router.get('/config', (req, res) => {
    try {
      const config = getConfig()
      res.json(config)
    } catch (err) {
      debug('Error getting config:', err)
      res.status(500).json({ error: 'Failed to get config' })
    }
  })

  // PUT /signalk/v1/unitpreferences/config
  router.put('/config', (req, res) => {
    try {
      const configPath = path.join(UNITPREFS_DIR, 'config.json')
      fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2))
      reloadPreset()
      res.json({ success: true })
    } catch (err) {
      debug('Error saving config:', err)
      res.status(500).json({ error: 'Failed to save config' })
    }
  })

  // GET /signalk/v1/unitpreferences/categories
  router.get('/categories', (req, res) => {
    try {
      const categories = getCategories()
      res.json(categories)
    } catch (err) {
      debug('Error getting categories:', err)
      res.status(500).json({ error: 'Failed to get categories' })
    }
  })

  // GET /signalk/v1/unitpreferences/definitions
  router.get('/definitions', (req, res) => {
    try {
      const definitions = getMergedDefinitions()
      res.json(definitions)
    } catch (err) {
      debug('Error getting definitions:', err)
      res.status(500).json({ error: 'Failed to get definitions' })
    }
  })

  // PUT /signalk/v1/unitpreferences/custom-definitions
  router.put('/custom-definitions', (req, res) => {
    try {
      const customPath = path.join(UNITPREFS_DIR, 'custom-units-definitions.json')
      fs.writeFileSync(customPath, JSON.stringify(req.body, null, 2))
      res.json({ success: true })
    } catch (err) {
      debug('Error saving custom definitions:', err)
      res.status(500).json({ error: 'Failed to save custom definitions' })
    }
  })

  // GET /signalk/v1/unitpreferences/presets
  router.get('/presets', (req, res) => {
    try {
      const presetsDir = path.join(UNITPREFS_DIR, 'presets')
      const customDir = path.join(presetsDir, 'custom')

      const builtIn = []
      const custom = []

      // List built-in presets
      const builtInFiles = fs.readdirSync(presetsDir)
      for (const file of builtInFiles) {
        if (file.endsWith('.json')) {
          const presetPath = path.join(presetsDir, file)
          const preset = JSON.parse(fs.readFileSync(presetPath, 'utf-8'))
          builtIn.push({
            name: file.replace('.json', ''),
            displayName: preset.name,
            description: preset.description
          })
        }
      }

      // List custom presets
      if (fs.existsSync(customDir)) {
        const customFiles = fs.readdirSync(customDir)
        for (const file of customFiles) {
          if (file.endsWith('.json')) {
            const presetPath = path.join(customDir, file)
            const preset = JSON.parse(fs.readFileSync(presetPath, 'utf-8'))
            custom.push({
              name: file.replace('.json', ''),
              displayName: preset.name,
              description: preset.description
            })
          }
        }
      }

      res.json({ builtIn, custom })
    } catch (err) {
      debug('Error listing presets:', err)
      res.status(500).json({ error: 'Failed to list presets' })
    }
  })

  // GET /signalk/v1/unitpreferences/presets/:name
  router.get('/presets/:name', (req, res) => {
    try {
      const presetName = req.params.name

      // Check custom first
      const customPath = path.join(UNITPREFS_DIR, 'presets/custom', `${presetName}.json`)
      if (fs.existsSync(customPath)) {
        const preset = JSON.parse(fs.readFileSync(customPath, 'utf-8'))
        res.json(preset)
        return
      }

      // Fall back to built-in
      const builtInPath = path.join(UNITPREFS_DIR, 'presets', `${presetName}.json`)
      if (fs.existsSync(builtInPath)) {
        const preset = JSON.parse(fs.readFileSync(builtInPath, 'utf-8'))
        res.json(preset)
        return
      }

      res.status(404).json({ error: 'Preset not found' })
    } catch (err) {
      debug('Error getting preset:', err)
      res.status(500).json({ error: 'Failed to get preset' })
    }
  })

  // PUT /signalk/v1/unitpreferences/presets/custom/:name
  router.put('/presets/custom/:name', (req, res) => {
    try {
      const presetName = req.params.name

      // Validate preset name
      if (!/^[a-zA-Z0-9_-]+$/.test(presetName)) {
        res.status(400).json({ error: 'Invalid preset name' })
        return
      }

      // Prevent overwriting built-in presets
      const builtInNames = ['metric', 'imperial-us', 'imperial-uk']
      if (builtInNames.includes(presetName)) {
        res.status(400).json({ error: 'Cannot overwrite built-in preset' })
        return
      }

      const customDir = path.join(UNITPREFS_DIR, 'presets/custom')
      if (!fs.existsSync(customDir)) {
        fs.mkdirSync(customDir, { recursive: true })
      }

      const presetPath = path.join(customDir, `${presetName}.json`)
      fs.writeFileSync(presetPath, JSON.stringify(req.body, null, 2))
      res.json({ success: true })
    } catch (err) {
      debug('Error saving custom preset:', err)
      res.status(500).json({ error: 'Failed to save custom preset' })
    }
  })

  // DELETE /signalk/v1/unitpreferences/presets/custom/:name
  router.delete('/presets/custom/:name', (req, res) => {
    try {
      const presetName = req.params.name
      const presetPath = path.join(UNITPREFS_DIR, 'presets/custom', `${presetName}.json`)

      if (!fs.existsSync(presetPath)) {
        res.status(404).json({ error: 'Preset not found' })
        return
      }

      fs.unlinkSync(presetPath)
      res.json({ success: true })
    } catch (err) {
      debug('Error deleting preset:', err)
      res.status(500).json({ error: 'Failed to delete preset' })
    }
  })

  // GET /signalk/v1/unitpreferences/active
  router.get('/active', (req, res) => {
    try {
      const preset = getActivePreset()
      res.json(preset)
    } catch (err) {
      debug('Error getting active preset:', err)
      res.status(500).json({ error: 'Failed to get active preset' })
    }
  })

  return {
    start: function () {
      app.use('/signalk/v1/unitpreferences', router)
      debug('Unit preferences API mounted at /signalk/v1/unitpreferences')
    }
  }
}
