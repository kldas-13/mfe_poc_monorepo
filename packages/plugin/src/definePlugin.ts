import { logger } from '@meta-ux/core'

export interface Plugin {
  name: string
  version: string
  setup: () => void | Promise<void>
}

export function definePlugin(plugin: Plugin): Plugin {
  logger.info(`Plugin registered: ${plugin.name}@${plugin.version}`)
  return plugin
}
