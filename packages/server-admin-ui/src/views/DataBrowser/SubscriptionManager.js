/**
 * SubscriptionManager - Delegates to GranularSubscriptionManager
 *
 * This is a thin wrapper that delegates to GranularSubscriptionManager
 * for backward compatibility with existing cleanup calls.
 */
import granularSubscriptionManager from './GranularSubscriptionManager'

class SubscriptionManager {
  constructor() {
    this.webSocket = null
  }

  setWebSocket(ws) {
    this.webSocket = ws
  }

  /**
   * Unsubscribe from all paths - delegates to granular manager
   */
  unsubscribeAll() {
    granularSubscriptionManager.unsubscribeAll()
  }
}

const subscriptionManager = new SubscriptionManager()

export default subscriptionManager
