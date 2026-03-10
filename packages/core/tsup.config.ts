import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: true,
    target: 'esnext',
    outDir: 'dist',
    treeshake: true,
    bundle: true,
    splitting: false,
})
