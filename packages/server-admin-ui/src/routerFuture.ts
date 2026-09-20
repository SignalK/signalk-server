import type { FutureConfig } from 'react-router-dom'

/**
 * React Router v7 behaviours opted into early so the v6 upgrade warnings stay
 * silent and the app already runs the semantics it will get on v7.
 *
 * Shared with the tests so their routers match the one in `bootstrap.tsx`;
 * a router configured differently would not exercise the real behaviour.
 */
export const ROUTER_FUTURE_FLAGS: Partial<FutureConfig> = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
}
