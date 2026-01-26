import { constants } from 'fs'
import { access, mkdir } from 'fs/promises'
import path from 'path'
import { WithConfig } from '../../app'

import { DatabaseSync } from 'node:sqlite'
import { Alarm } from './alarm'

const SERVERSTATE_DIR_NAME = 'serverState'
const DB_NAME = 'notifications'

const ALARMS_TABLE = 'alarms'
const NOTI_KEYS_TABLE = 'noti_keys'

export class DbStore {
  private dbFilePath = ''
  private initPromise: Promise<void> | null = null
  private db?: DatabaseSync

  constructor(server: WithConfig) {
    this.dbFilePath = path.join(server.config.configPath, SERVERSTATE_DIR_NAME)
    this.initPromise = this.init()
      .then(() => this.initDb())
      .catch((error) => {
        console.log(`Could not initialise ${path.join(this.dbFilePath)}`)
        console.log(error)
      })
  }

  close() {
    this.db?.close()
  }

  // Wait for initialization to complete before performing operations
  private async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
    }
  }

  // Initialise DB path
  private async init() {
    try {
      /* tslint:disable:no-bitwise */
      await access(this.dbFilePath, constants.R_OK | constants.W_OK)
    } catch {
      try {
        await mkdir(this.dbFilePath, { recursive: true })
      } catch (error) {
        console.log(`Error: Unable to create ${this.dbFilePath}`)
        console.log(error)
      }
    }
  }

  // initialise database
  private initDb() {
    const dbFile = path.join(this.dbFilePath, `${DB_NAME}.sqlite`)
    this.db = new DatabaseSync(dbFile)
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${ALARMS_TABLE} (
          key TEXT PRIMARY KEY,
          value BLOB NOT NULL
        )
      `)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${NOTI_KEYS_TABLE} (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `)
    } catch (err) {
      console.error(err)
    }
  }

  // List Alarm records
  async listAlarms(): Promise<Array<{ id: string; value: Alarm }>> {
    await this.waitForInit()
    try {
      if (this.db) {
        const q = this.db.prepare(
          `SELECT key, json_extract(value, '$') AS value FROM ${ALARMS_TABLE}`
        )
        const r = q.all()
        return r?.map((i) => {
          return {
            id: i.key as string,
            value: JSON.parse(i.value as string) as Alarm
          }
        })
      } else {
        return []
      }
    } catch {
      return []
    }
  }

  // Retrieve Alarm record
  async getAlarm(key: string): Promise<Alarm | undefined> {
    await this.waitForInit()
    try {
      if (this.db && key) {
        const q = this.db.prepare(
          `SELECT json_extract(value, '$') AS value FROM ${ALARMS_TABLE} WHERE key = ?`
        )
        const r = q.get(key)
        return JSON.parse(r?.value as string) as Alarm
      } else {
        throw new Error('Key NOT provided!')
      }
    } catch (err) {
      console.log(err)
      return undefined
    }
  }

  // Set Alarm record
  async setAlarm(key: string, value: Alarm) {
    await this.waitForInit()
    try {
      if (this.db && key) {
        const jvalue = typeof value !== 'string' ? JSON.stringify(value) : value
        const c = this.db
          .prepare(`INSERT INTO ${ALARMS_TABLE} (key, value) VALUES (?, jsonb(?))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        c.run(key, jvalue)
      } else {
        throw new Error('Key NOT provided!')
      }
    } catch (err) {
      console.log(err)
      throw err
    }
  }

  // Delete Alarm record(s)
  async deleteAlarm(key: string | string[]) {
    await this.waitForInit()
    try {
      if (this.db && key) {
        if (Array.isArray(key)) {
          const placeholders = key.map(() => '?').join(',')
          const q = this.db.prepare(`
            DELETE FROM ${ALARMS_TABLE} WHERE key IN (${placeholders})
          `)
          q.run(...key)
        } else {
          const q = this.db.prepare(`
            DELETE FROM ${ALARMS_TABLE} WHERE key = ?
          `)
          q.run(key)
        }
      } else {
        throw new Error('Key NOT provided!')
      }
    } catch (err) {
      console.log(err)
      throw err
    }
  }

  // Delete ALL Alarm records
  async purgeAlarms() {
    await this.waitForInit()
    try {
      if (this.db) {
        this.db.exec(`DELETE FROM ${ALARMS_TABLE}`)
      } else {
        throw new Error('Datastore NOT available!')
      }
    } catch (err) {
      console.log(err)
      throw err
    }
  }

  // List Notification Key records
  async listNotis(): Promise<Record<string, string>[]> {
    await this.waitForInit()
    try {
      if (this.db) {
        const q = this.db.prepare(`SELECT * FROM ${NOTI_KEYS_TABLE}`)
        const r = q.all()
        return r?.map((i) => {
          return { id: i.key as string, value: i.value as string }
        })
      } else {
        return []
      }
    } catch {
      return []
    }
  }

  // Retrieve Notification Key record
  async getNoti(key: string): Promise<string | undefined> {
    await this.waitForInit()
    try {
      if (this.db && key) {
        const q = this.db.prepare(
          `SELECT value FROM ${NOTI_KEYS_TABLE} WHERE key = ?`
        )
        const r = q.get(key)
        return r?.value as string
      } else {
        throw new Error('Key NOT provided!')
      }
    } catch (err) {
      console.log(err)
      return undefined
    }
  }

  // Set Notification Key record
  async setNoti(key: string, value: string) {
    await this.waitForInit()
    try {
      if (this.db && key) {
        const c = this.db
          .prepare(`INSERT INTO ${NOTI_KEYS_TABLE} (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        c.run(key, value)
      } else {
        throw new Error('Key NOT provided!')
      }
    } catch (err) {
      console.log(err)
      throw err
    }
  }

  // Delete Notification Key record(s)
  async deleteNoti(key: string | string[]) {
    await this.waitForInit()
    try {
      if (this.db && key) {
        if (Array.isArray(key)) {
          const placeholders = key.map(() => '?').join(',')
          const q = this.db.prepare(`
            DELETE FROM ${NOTI_KEYS_TABLE} WHERE key IN (${placeholders})
          `)
          q.run(...key)
        } else {
          const q = this.db.prepare(`
            DELETE FROM ${NOTI_KEYS_TABLE} WHERE key = ?
          `)
          q.run(key)
        }
      } else {
        throw new Error('Key NOT provided!')
      }
    } catch (err) {
      console.log(err)
      throw err
    }
  }

  // Delete ALL Notification Key records
  async purgeNotis() {
    await this.waitForInit()
    try {
      if (this.db) {
        this.db.exec(`DELETE FROM ${NOTI_KEYS_TABLE}`)
      } else {
        throw new Error('Datastore NOT available!')
      }
    } catch (err) {
      console.log(err)
      throw err
    }
  }
}
