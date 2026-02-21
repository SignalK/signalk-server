const express = require('express')
const fs = require('fs')
const path = require('path')
const busboy = require('busboy')
const { compile } = require('mathjs')
const { createDebug } = require('../debug')
const debug = createDebug('signalk-server:unitpreferences-api')

/**
 * Validate a formula string by attempting to compile it with mathjs
 * @param {string} formula - The formula to validate
 * @returns {string|null} - Error message if invalid, null if valid
 */
function validateFormula(formula) {
  try {
    compile(formula)
    return null
  } catch (e) {
    return e.message
  }
}

/**
 * Validate all formulas in a unit definitions object
 * @param {object} definitions - The unit definitions to validate
 * @returns {string|null} - Error message if any formula is invalid, null if all valid
 */
function validateDefinitions(definitions) {
  for (const [siUnit, def] of Object.entries(definitions)) {
    if (def.conversions) {
      for (const [targetUnit, conversion] of Object.entries(def.conversions)) {
        if (conversion.formula) {
          const error = validateFormula(conversion.formula)
          if (error) {
            return `Invalid formula for ${siUnit} -> ${targetUnit}: ${error}`
          }
        }
        if (conversion.inverseFormula) {
          const error = validateFormula(conversion.inverseFormula)
          if (error) {
            return `Invalid inverseFormula for ${siUnit} -> ${targetUnit}: ${error}`
          }
        }
      }
    }
  }
  return null
}

/**
 * Validate a preset JSON structure thoroughly
 * @param {object} preset - The preset object to validate
 * @param {object} definitions - Unit definitions for validation
 * @returns {string|null} - Error message if invalid, null if valid
 */
function validatePreset(preset, definitions) {
  const errors = []

  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
    return 'Preset must be a JSON object'
  }
  if (!preset.version || typeof preset.version !== 'string') {
    return 'Missing or invalid "version"'
  }
  if (!preset.name || typeof preset.name !== 'string') {
    return 'Missing or invalid "name"'
  }
  if (
    !preset.categories ||
    typeof preset.categories !== 'object' ||
    Array.isArray(preset.categories)
  ) {
    return 'Missing or invalid "categories"'
  }
  if (Object.keys(preset.categories).length === 0) {
    return 'categories cannot be empty'
  }

  for (const [name, cat] of Object.entries(preset.categories)) {
    if (!cat || typeof cat !== 'object') {
      errors.push(`"${name}": must be an object`)
      continue
    }
    if (!cat.baseUnit) {
      errors.push(`"${name}": missing baseUnit`)
      continue
    }
    if (!cat.targetUnit) {
      errors.push(`"${name}": missing targetUnit`)
      continue
    }

    // Skip datetime validation for now - datetime formats are handled differently
    const datetimeBaseUnits = [
      'RFC 3339 (UTC)',
      'ISO-8601 (UTC)',
      'Epoch Seconds'
    ]
    if (datetimeBaseUnits.includes(cat.baseUnit)) {
      continue
    }

    const unitDef = definitions[cat.baseUnit]
    if (!unitDef) {
      errors.push(`"${name}": unknown baseUnit "${cat.baseUnit}"`)
      continue
    }
    // targetUnit same as baseUnit means no conversion, which is valid
    if (cat.targetUnit !== cat.baseUnit) {
      if (!unitDef.conversions || !unitDef.conversions[cat.targetUnit]) {
        const available = Object.keys(unitDef.conversions || {}).join(', ')
        errors.push(
          `"${name}": "${cat.targetUnit}" not in ${cat.baseUnit} conversions. Available: ${available}`
        )
      }
    }
  }

  if (errors.length > 0) {
    return errors.join('\n')
  }
  return null
}

/**
 * Check if a preset name already exists
 * @param {string} presetName - The preset filename (without .json)
 * @returns {object|null} - { type: 'builtin'|'custom' } if exists, null if not
 */
function checkPresetExists(presetName) {
  const builtInPath = path.join(UNITPREFS_DIR, 'presets', `${presetName}.json`)
  if (fs.existsSync(builtInPath)) {
    return { type: 'builtin' }
  }
  const customPath = path.join(
    UNITPREFS_DIR,
    'presets/custom',
    `${presetName}.json`
  )
  if (fs.existsSync(customPath)) {
    return { type: 'custom' }
  }
  return null
}
const {
  getConfig,
  getCategories,
  getCustomCategories,
  getActivePreset,
  getMergedDefinitions,
  reloadPreset,
  reloadCustomDefinitions,
  reloadCustomCategories,
  getDefaultCategory
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
      app.emit('unitpreferencesChanged', { type: 'global' })
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

  // GET /signalk/v1/unitpreferences/custom-definitions
  router.get('/custom-definitions', (req, res) => {
    try {
      const customPath = path.join(
        UNITPREFS_DIR,
        'custom-units-definitions.json'
      )
      if (fs.existsSync(customPath)) {
        const data = JSON.parse(fs.readFileSync(customPath, 'utf-8'))
        res.json(data)
      } else {
        res.json({})
      }
    } catch (err) {
      debug('Error getting custom definitions:', err)
      res.status(500).json({ error: 'Failed to get custom definitions' })
    }
  })

  // PUT /signalk/v1/unitpreferences/custom-definitions
  router.put('/custom-definitions', (req, res) => {
    try {
      // Validate all formulas before saving
      const validationError = validateDefinitions(req.body)
      if (validationError) {
        res.status(400).json({ error: validationError })
        return
      }

      const customPath = path.join(
        UNITPREFS_DIR,
        'custom-units-definitions.json'
      )
      fs.writeFileSync(customPath, JSON.stringify(req.body, null, 2))
      reloadCustomDefinitions()
      app.emit('unitpreferencesChanged', { type: 'global' })
      res.json({ success: true })
    } catch (err) {
      debug('Error saving custom definitions:', err)
      res.status(500).json({ error: 'Failed to save custom definitions' })
    }
  })

  // GET /signalk/v1/unitpreferences/custom-categories
  router.get('/custom-categories', (req, res) => {
    try {
      const customCats = getCustomCategories()
      res.json(customCats)
    } catch (err) {
      debug('Error getting custom categories:', err)
      res.status(500).json({ error: 'Failed to get custom categories' })
    }
  })

  // PUT /signalk/v1/unitpreferences/custom-categories
  router.put('/custom-categories', (req, res) => {
    try {
      const customPath = path.join(UNITPREFS_DIR, 'custom-categories.json')
      fs.writeFileSync(customPath, JSON.stringify(req.body, null, 2))
      reloadCustomCategories()
      app.emit('unitpreferencesChanged', { type: 'global' })
      res.json({ success: true })
    } catch (err) {
      debug('Error saving custom categories:', err)
      res.status(500).json({ error: 'Failed to save custom categories' })
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
      const customPath = path.join(
        UNITPREFS_DIR,
        'presets/custom',
        `${presetName}.json`
      )
      if (fs.existsSync(customPath)) {
        const preset = JSON.parse(fs.readFileSync(customPath, 'utf-8'))
        res.json(preset)
        return
      }

      // Fall back to built-in
      const builtInPath = path.join(
        UNITPREFS_DIR,
        'presets',
        `${presetName}.json`
      )
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

      // Validate preset structure
      const definitions = getMergedDefinitions()
      const validationError = validatePreset(req.body, definitions)
      if (validationError) {
        res.status(400).json({ error: validationError })
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
      const presetPath = path.join(
        UNITPREFS_DIR,
        'presets/custom',
        `${presetName}.json`
      )

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

  // GET /signalk/v1/unitpreferences/default-categories
  // Returns the full default-categories.json data
  router.get('/default-categories', (req, res) => {
    try {
      const defaultCatPath = path.join(UNITPREFS_DIR, 'default-categories.json')
      if (fs.existsSync(defaultCatPath)) {
        const data = JSON.parse(fs.readFileSync(defaultCatPath, 'utf-8'))
        res.json(data)
      } else {
        res.json({ categories: {} })
      }
    } catch (err) {
      debug('Error getting default categories:', err)
      res.status(500).json({ error: 'Failed to get default categories' })
    }
  })

  // GET /signalk/v1/unitpreferences/default-category/:path
  // Returns the default category for a specific SignalK path
  router.get('/default-category/*', (req, res) => {
    try {
      const signalkPath = req.params[0]
      const category = getDefaultCategory(signalkPath)
      res.json({ path: signalkPath, category: category || null })
    } catch (err) {
      debug('Error getting default category:', err)
      res.status(500).json({ error: 'Failed to get default category' })
    }
  })

  // POST /signalk/v1/unitpreferences/presets/custom/upload
  // Upload a custom preset file (admin only)
  const MAX_PRESET_SIZE = 100 * 1024 // 100KB

  router.post('/presets/custom/upload', (req, res) => {
    let responseSent = false

    const sendResponse = (status, body) => {
      if (responseSent) return
      responseSent = true
      res.status(status).json(body)
    }

    try {
      const bb = busboy({
        headers: req.headers,
        limits: { fileSize: MAX_PRESET_SIZE }
      })
      let fileData = ''
      let fileName = ''
      let fileTruncated = false

      bb.on('file', (fieldname, file, info) => {
        fileName = info.filename || ''

        if (!fileName.endsWith('.json')) {
          sendResponse(400, { error: 'File must have .json extension' })
          file.resume()
          return
        }

        file.on('data', (data) => {
          fileData += data.toString()
        })

        file.on('limit', () => {
          fileTruncated = true
        })
      })

      bb.on('finish', () => {
        if (responseSent) return

        if (fileTruncated) {
          sendResponse(400, {
            error: `File too large. Maximum size is ${MAX_PRESET_SIZE / 1024}KB`
          })
          return
        }

        if (!fileData) {
          sendResponse(400, { error: 'No file uploaded' })
          return
        }

        // Parse JSON
        let preset
        try {
          preset = JSON.parse(fileData)
        } catch (e) {
          sendResponse(400, { error: `Invalid JSON: ${e.message}` })
          return
        }

        // Validate preset structure
        const definitions = getMergedDefinitions()
        const validationError = validatePreset(preset, definitions)
        if (validationError) {
          sendResponse(400, { error: validationError })
          return
        }

        // Derive preset name from filename or preset.name
        let presetName = fileName.replace('.json', '')
        if (!/^[a-zA-Z0-9_-]+$/.test(presetName)) {
          // Fall back to sanitized preset.name
          presetName = preset.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
        }

        // Check for existing preset with same name
        const existing = checkPresetExists(presetName)
        if (existing) {
          if (existing.type === 'builtin') {
            sendResponse(400, {
              error: `Cannot overwrite built-in preset "${presetName}"`
            })
            return
          } else {
            sendResponse(409, {
              error: `duplicate`,
              existingName: presetName
            })
            return
          }
        }

        // Ensure custom directory exists
        const customDir = path.join(UNITPREFS_DIR, 'presets/custom')
        if (!fs.existsSync(customDir)) {
          fs.mkdirSync(customDir, { recursive: true })
        }

        // Save the preset
        const presetPath = path.join(customDir, `${presetName}.json`)
        fs.writeFileSync(presetPath, JSON.stringify(preset, null, 2))

        debug(`Custom preset uploaded: ${presetName}`)
        sendResponse(200, {
          success: true,
          name: presetName,
          displayName: preset.name,
          isCustom: true
        })
      })

      bb.on('error', (err) => {
        debug('Error uploading preset:', err)
        sendResponse(500, { error: 'Upload failed' })
      })

      req.pipe(bb)
    } catch (err) {
      debug('Error in preset upload:', err)
      sendResponse(500, { error: 'Failed to upload preset' })
    }
  })

  return {
    start: function () {
      if (!app.securityStrategy.isDummy()) {
        // Add admin-only middleware for custom preset endpoints
        app.securityStrategy.addAdminWriteMiddleware(
          '/signalk/v1/unitpreferences/presets/custom/upload'
        )
        app.securityStrategy.addAdminWriteMiddleware(
          '/signalk/v1/unitpreferences/presets/custom/:name'
        )
      }
      app.use('/signalk/v1/unitpreferences', router)
      debug('Unit preferences API mounted at /signalk/v1/unitpreferences')
    }
  }
}
