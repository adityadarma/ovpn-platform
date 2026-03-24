import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
  ],
  format: ['esm'],
  target: 'node24',
  noExternal: [/.*/], // Bundle all dependencies
  clean: true,
  outExtension() {
    return {
      js: '.js',
    }
  },
})
