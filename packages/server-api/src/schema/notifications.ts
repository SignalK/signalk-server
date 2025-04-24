import { FullValue } from './values'

export type NotificationCategory =
  | 'mob'
  | 'fire'
  | 'sinking'
  | 'flooding'
  | 'collision'
  | 'grounding'
  | 'listing'
  | 'adrift'
  | 'piracy'
  | 'abandon'

/**
 * Notifications currently raised. Major categories have well-defined names, but the tree can be extended by any hierarchical structure
 */
export type Notifications = Partial<
  Record<NotificationCategory | string, FullValue<Notification>>
>

/**
 * A zone used to define the display and alarm state when the value is in between bottom and top.
 */
export interface Zone {
  /** The lowest number in this zone */
  lower?: number
  /** The highest value in this zone */
  upper?: number
  state: NotificationState
  /** The message to display for the alarm. */
  message?: string
}

export type NotificationMethod = 'visual' | 'sound'
export type NotificationState =
  | 'nominal'
  | 'normal'
  | 'alert'
  | 'warn'
  | 'alarm'
  | 'emergency'

export interface Notification {
  /** Method to use to raise notifications */
  method: NotificationMethod[]
  /** The state when the value is in this zone. */
  state: NotificationState
  /** Message to display or speak */
  message: string
}

/** @deprecated use {@link NotificationState} */
export enum ALARM_STATE {
  nominal = 'nominal',
  normal = 'normal',
  alert = 'alert',
  warn = 'warn',
  alarm = 'alarm',
  emergency = 'emergency'
}

/** @deprecated use {@link NotificationMethod} */
export enum ALARM_METHOD {
  visual = 'visual',
  sound = 'sound'
}
