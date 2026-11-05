import { defineConfig } from 'vite'

/**
 * base: '/<nome-do-repo>/'  ->  OBRIGATORIO bater com o nome do repositorio.
 * Ver docs/GITHUB_PAGES.md. Errar aqui = "funciona local, 404 no Pages".
 * Em dev (vite serve) a base e '/' para o preview local funcionar.
 *
 * No CI lemos GITHUB_REPOSITORY: se o repo for renomeado de novo, o build
 * acompanha sozinho em vez de publicar assets em /nome-antigo/. Localmente
 * cai no nome atual (SitesForSchoolFR/Granny — o repo ja se chamou
 * Granny-Inspiration-IG, e esse nome antigo ainda redireciona).
 */
const REPO_NAME = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'Granny'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : `/${REPO_NAME}/`,

  publicDir: 'public',

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // O preview roda num host *.e2b.app: o Vite bloqueia hosts nao listados
    // (HTTP 403). Isto aceita qualquer host — nunca vai para o build.
    allowedHosts: true,
  },

  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },

  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    cssCodeSplit: false,
    // Assets pequenos viram data-uri: menos requests no Pages.
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // three.js em chunk separado: muda com menos frequencia que o nosso
        // codigo, entao o cache do navegador sobrevive a updates do jogo.
        // (Vite 8 = rolldown: advancedChunks no lugar do antigo manualChunks.)
        advancedChunks: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 100 }],
        },
      },
    },
  },
}))
