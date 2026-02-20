import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { cpSync, mkdirSync, createReadStream, existsSync } from 'node:fs'

export default defineConfig({
	root: '.',
	base: '/packages/sync/',
	build: {
		outDir: 'dist/web',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: resolve(import.meta.dirname, 'index.html'),
				uk: resolve(import.meta.dirname, 'uk/index.html'),
				en: resolve(import.meta.dirname, 'en/index.html'),
			},
		},
	},
	server: {
		port: 3333,
	},
	plugins: [
		{
			name: 'copy-docs',
			writeBundle() {
				mkdirSync('dist/web/docs/uk', { recursive: true })
				cpSync('docs/uk/README.md', 'dist/web/docs/uk/README.md')
			},
			configureServer(server) {
				server.middlewares.use('/packages/sync/docs', (req, res, next) => {
					const filePath = resolve('docs', req.url.slice(1))
					if (!existsSync(filePath)) return next()
					res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
					createReadStream(filePath).pipe(res)
				})
			},
		},
	],
})
