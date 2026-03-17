# `@meta-ux/composer` Implementation Guide

This guide explains how developers can use the `@meta-ux/composer` package to orchestrate and load micro frontends in a host application.

The standard approach uses [Qiankun](https://qiankun.umijs.org/) under the hood and provides two ways to consume micro apps:

1. **Programmatic Orchestration** (via [createOrchestrator()](file:///home/gaian/development/micro-frontends/meta-ux-composer/packages/composer/src/index.ts#9-12))
2. **Declarative Web Components** (via `<micro-app-loader>`)

---

## 1. Installation

Install the package alongside the core types:

```bash
npm install @meta-ux/composer @meta-ux/types @meta-ux/core
```

---

## 2. Programmatic Orchestration

The [createOrchestrator()](file:///home/gaian/development/micro-frontends/meta-ux-composer/packages/composer/src/index.ts#9-12) function returns a `MicroOrchestrator` instance. It provides APIs to configure, register, and start your micro frontends as part of a single-page application (SPA) shell.

### Initialization

First, create the orchestrator instance:

```typescript
import { createOrchestrator } from '@meta-ux/composer'

const orchestrator = createOrchestrator()
```

### Registering and Starting Micro Apps

Use the [register](file:///home/gaian/development/micro-frontends/meta-ux-composer/packages/composer/src/qiankun/adapter.ts#23-57) method to define the micro apps you want to orchestrate. You can pass an array of micro apps and an optional set of lifecycle hooks.

```typescript
// 1. Register micro apps
orchestrator.register(
    [
        {
            name: 'react-app', // Unique name for the app
            entry: '//localhost:3001', // HTML entry point
            container: '#micro-app-container', // Element ID where the app will mount
            activeRule: '/react', // Route pattern that activates this app
            props: {
                // Optional custom props to pass to the micro app
                theme: 'dark',
            },
        },
        {
            name: 'vue-app',
            entry: '//localhost:3002',
            container: '#micro-app-container',
            activeRule: '/vue',
        },
    ],
    {
        // Optional Lifecycle Hooks
        beforeLoad: (app) =>
            Promise.resolve(console.log('Before load', app.name)),
        afterMount: (app) =>
            Promise.resolve(console.log('After mount', app.name)),
    }
)

// 2. Set the default micro app route (Optional)
orchestrator.setDefault('/react')

// 3. Handle global errors (Optional)
orchestrator.onError((err) => {
    console.error('Micro App Global Error:', err)
})

// 4. Start the Orchestrator
orchestrator.start({
    prefetch: 'all', // Preload apps when idle ('all', true, or false)
    sandbox: { experimentalStyleIsolation: true }, // Shadow DOM / CSS isolation settings
})
```

### Routing & Navigation

When navigating between micro frontends within your shell app, use the orchestrator's router adapter. The adapter intelligently handles push state and notifies Qiankun.

```typescript
// Check if a path belongs to a registered micro frontend
if (orchestrator.isMicroAppRoute('/react/dashboard')) {
    console.log('This is a micro app route!')
}

// Programmatic navigation
orchestrator.navigateTo('/react/dashboard')
```

### Manual App Loading

If you prefer to mount a micro frontend manually without layout routing (e.g., placing a widget anywhere on the screen arbitrarily), use [loadApp](file:///home/gaian/development/micro-frontends/meta-ux-composer/packages/composer/src/qiankun/adapter.ts#98-124):

```typescript
const instance = orchestrator.loadApp(
    {
        name: 'standalone-widget',
        entry: '//localhost:3003',
        container: document.getElementById('widget-container'),
    },
    {
        props: { userId: 123 }, // Options / props to inject
        sandbox: { experimentalStyleIsolation: true },
    }
)

// Returns an instance with lifecycle controls:
// await instance.mount();
// await instance.unmount();
// await instance.update({ userId: 456 });
```

---

## 3. Web Component (Declarative) Approach

Instead of mapping rules, you can use the custom `<micro-app-loader>` HTML element for a declarative approach. This automatically uses the manual `loadMicroApp` underlying strategy.

### Registering the Web Component

Before using the component, register it to the browser's custom elements registry from your host application's entry file.

```typescript
import { registerMicroAppLoader } from '@meta-ux/composer'

// Registers <micro-app-loader> with the browser
registerMicroAppLoader()
```

### Using `<micro-app-loader>`

Once registered, you can use `<micro-app-loader>` anywhere in your DOM, React, Vue, or Angular applications.

**Basic Usage:**

```html
<!-- The component automatically creates a mount slot and loads the remote entry -->
<micro-app-loader
    app-name="my-widget"
    entry="http://localhost:3005"
></micro-app-loader>
```

**Passing Props to the Element (via JavaScript):**

```typescript
const loader = document.querySelector('micro-app-loader')

// The micro frontend will receive these props upon mounting,
// and will trigger the `update` lifecycle when props change!
loader.props = {
    userToken: 'abc-123',
    theme: 'light',
}
```

**Listening to Native Events:**

The Web Component emits standard DOM events based on the micro app's lifecycle phases:

```typescript
loader.addEventListener('micro-app-mounted', () => {
    console.log('App successfully mounted in the DOM!')
})

loader.addEventListener('micro-app-unmounted', () => {
    console.log('App unmounted and removed.')
})

loader.addEventListener('micro-app-error', (event) => {
    console.error('Failed to load micro frontend:', event.detail.error)
})
```

### How `<micro-app-loader>` Attributes Work under the Hood

- **`app-name`**: Determines the localized name of the loaded app.
- **`entry`**: The remote URL of the micro frontend to fetch.
  When the component connects to the DOM, it automatically appends a dedicated `#mountSlot` div. Any changes directly made to the `app-name` or `entry` attributes will safely trigger an unmount, followed by a new mount cycle using Qiankun. Everything is handled implicitly.

---

> **Tip:** Make sure that the remote application being consumed exposes the mandatory Qiankun lifecycle hooks (`bootstrap`, [mount](file:///home/gaian/development/micro-frontends/meta-ux-composer/packages/composer/src/qiankun/adapter.ts#117-118), [unmount](file:///home/gaian/development/micro-frontends/meta-ux-composer/packages/composer/src/qiankun/adapter.ts#118-119), and optionally [update](file:///home/gaian/development/micro-frontends/meta-ux-composer/packages/composer/src/qiankun/adapter.ts#119-121)).
