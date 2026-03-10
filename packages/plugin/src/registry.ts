import type { Plugin } from './definePlugin'

const plugins = new Map<string, Plugin>()

export const registry = {
  register(plugin: Plugin) {
    plugins.set(plugin.name, plugin)
  },
  get(name: string): Plugin | undefined {
    return plugins.get(name)
  },
  getAll(): Plugin[] {
    return Array.from(plugins.values())
  },
}
