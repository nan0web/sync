import './components/UIHeader.js'
import './components/UIHero.js'
import './components/UIFeatureGrid.js'
import './components/UIAdapters.js'
import './components/UICodeBlock.js'
import './components/UIFooter.js'
import yaml from 'js-yaml'

/* ── Theme ─────────────────────────────────────────── */

const THEMES = {
	dark: {
		'--bg-page': '#0a0a0a',
		'--bg-surface': '#141414',
		'--bg-hover': 'rgba(255,255,255,0.06)',
		'--text-primary': '#f0f0f0',
		'--text-secondary': 'rgba(255,255,255,0.6)',
		'--accent': '#00ffaa',
		'--accent-bg': 'rgba(0,255,170,0.1)',
		'--border': 'rgba(255,255,255,0.1)',
		'--code-bg': '#111',
	},
	light: {
		'--bg-page': '#fafafa',
		'--bg-surface': '#ffffff',
		'--bg-hover': 'rgba(0,0,0,0.04)',
		'--text-primary': '#111',
		'--text-secondary': 'rgba(0,0,0,0.6)',
		'--accent': '#00995e',
		'--accent-bg': 'rgba(0,153,94,0.1)',
		'--border': 'rgba(0,0,0,0.1)',
		'--code-bg': '#f0f0f0',
	},
}

function resolveTheme(choice) {
	if (choice === 'auto') {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
	}
	return choice
}

function applyTheme(choice) {
	const resolved = resolveTheme(choice)
	const vars = THEMES[resolved]
	for (const [k, v] of Object.entries(vars)) {
		document.documentElement.style.setProperty(k, v)
	}
	document.body.style.backgroundColor = vars['--bg-page']
	document.body.style.color = vars['--text-primary']

	// Apply smooth tech background layer
	const bgUrl = import.meta.env.BASE_URL + 'bg.png'
	if (resolved === 'dark') {
		document.body.style.backgroundImage = `
			radial-gradient(circle at top right, rgba(0, 255, 170, 0.05), transparent 40%),
			radial-gradient(circle at bottom left, rgba(0, 255, 170, 0.02), transparent 40%),
			url(${bgUrl})
		`
	} else {
		document.body.style.backgroundImage = `
			linear-gradient(rgba(250, 250, 250, 0.96), rgba(250, 250, 250, 0.96)),
			url(${bgUrl})
		`
	}
	document.body.style.backgroundAttachment = 'fixed'
	document.body.style.backgroundSize = 'cover'
	document.body.style.backgroundPosition = 'center'
}

/* ── Locale from URL ──────────────────────────────── */

const SUPPORTED_LOCALES = ['uk', 'en']

function detectLocaleFromURL() {
	// /uk/index.html => uk,  /en/index.html => en
	const match = location.pathname.match(/\/(uk|en)(\/|$)/)
	return match ? match[1] : null
}

/* ── ID from heading text ──────────────────────────── */

function slugify(text) {
	return text
		.toLowerCase()
		.replace(/[^\wа-яіїєґ\s-]/gi, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
}

/* ── Minimal Markdown Parser ─────────────────────── */

function parseMarkdown(md) {
	const blocks = []
	const lines = md.split('\n')
	let currentP = []
	let inCode = false
	let codeStr = ''
	let codeLang = ''

	function flushP() {
		if (currentP.length) {
			let text = currentP.join(' ')
			// Naive inline formatters
			text = text.replace(
				/\[([^\]]+)\]\(([^)]+)\)/g,
				'<a href="$2" target="_blank" style="color:var(--accent)">$1</a>',
			)
			text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			text = text.replace(
				/`([^`]+)`/g,
				'<code style="background:var(--code-bg);padding:2px 4px;border-radius:4px;font-family:monospace;font-size:0.9em;color:var(--accent)">$1</code>',
			)
			// Lists
			text = text.replace(/^- (.*)/gm, '• $1<br>')
			blocks.push({ p: text })
			currentP = []
		}
	}

	let capture = false
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]

		if (line.startsWith('## Installation') || line.startsWith('## Інсталяція')) capture = true
		if (
			line.startsWith('## License') ||
			line.startsWith('## Contributing') ||
			line.startsWith('## Внесок') ||
			line.startsWith('## Ліцензія')
		)
			capture = false

		if (!capture) continue

		if (line.startsWith('```')) {
			if (inCode) {
				blocks.push({ 'ui-code-block': { language: codeLang || 'text', code: codeStr } })
				inCode = false
			} else {
				flushP()
				inCode = true
				codeLang = line.replace('```', '').trim()
				codeStr = ''
			}
			continue
		}
		if (inCode) {
			codeStr += line + '\n'
			continue
		}
		if (line.startsWith('## ')) {
			flushP()
			blocks.push({ h2: line.replace('## ', '').trim() })
			continue
		}
		if (line.startsWith('### ')) {
			flushP()
			blocks.push({ h3: line.replace('### ', '').trim() })
			continue
		}
		if (line.trim() === '') {
			flushP()
			continue
		}
		currentP.push(line)
	}
	flushP()
	return blocks
}

let isInitialized = false
let currentLocale = null

async function bootstrap(forcedLocale = null) {
	const locale = forcedLocale || detectLocaleFromURL()
	currentLocale = locale

	// If we're on root / without locale — this page is handled by its own index.html (redirect/chooser)
	// app.js should only run on /uk/ or /en/
	if (!locale) return

	if (!isInitialized) {
		document.body.style.margin = '0'
		document.body.style.fontFamily = 'system-ui, -apple-system, sans-serif'
		document.body.style.transition = 'background-color 0.3s, color 0.3s'
		document.documentElement.style.scrollBehavior = 'smooth'
	}

	document.documentElement.lang = locale

	// Save locale preference
	localStorage.setItem('nan0sync-locale', locale)

	const themeChoice = localStorage.getItem('nan0sync-theme') || 'auto'
	applyTheme(themeChoice)

	// Load YAML data
	const res = await fetch(`${import.meta.env.BASE_URL}data/${locale}/index.yaml?t=${Date.now()}`)
	if (!res.ok) {
		console.error(`Failed to load data/${locale}/index.yaml`)
		return
	}
	const data = yaml.load(await res.text())

	// Collect nav items from YAML h2 only (before source expansion)
	const navItems = []
	for (const block of data.content || []) {
		if (block.h2 && typeof block.h2 === 'string') {
			navItems.push({ id: slugify(block.h2), label: block.h2 })
		}
	}

	// Resolve dynamic markdown content
	const finalContent = []
	for (const block of data.content || []) {
		if (block.source) {
			try {
				const mdRes = await fetch(`${import.meta.env.BASE_URL}${block.source}?t=${Date.now()}`)
				if (mdRes.ok) {
					const mdText = await mdRes.text()
					finalContent.push(...parseMarkdown(mdText))
				}
			} catch (e) {
				console.error(`Failed to load ${block.source}`, e)
			}
		} else {
			finalContent.push(block)
		}
	}
	data.content = finalContent

	document.title = data.title || 'NaN•Sync'

	const appDiv = document.getElementById('app')
	appDiv.innerHTML = ''

	const container = document.createElement('div')
	container.style.maxWidth = '1200px'
	container.style.margin = '0 auto'
	container.style.padding = '0 1.5rem'

	// The alternate locale to link to
	const altLocale = locale === 'uk' ? 'en' : 'uk'

	data.content.forEach((block) => {
		for (const [key, value] of Object.entries(block)) {
			// Simple HTML elements
			if (key === 'h1' || key === 'h2' || key === 'h3' || key === 'p') {
				const el = document.createElement(key.startsWith('h') ? key : 'p')
				el.innerHTML = value
				el.style.color = 'var(--text-primary)'
				if (key === 'h1') {
					el.style.fontSize = '2.5rem'
					el.style.marginTop = '0'
				}
				if (key === 'h2') {
					el.id = slugify(value)
					el.style.fontSize = '1.75rem'
					el.style.marginTop = '4rem'
					el.style.borderBottom = '1px solid var(--border)'
					el.style.paddingBottom = '0.75rem'
					el.style.scrollMarginTop = '5rem'
				}
				if (key === 'h3') {
					el.id = slugify(value)
					el.style.fontSize = '1.25rem'
					el.style.marginTop = '2.5rem'
					el.style.scrollMarginTop = '5rem'
				}
				if (key === 'p') {
					el.style.color = 'var(--text-secondary)'
					el.style.lineHeight = '1.6'
				}
				container.appendChild(el)
				continue
			}

			// Lit web components
			if (key.startsWith('ui-')) {
				const el = document.createElement(key)

				if (key === 'ui-header') {
					el.nav = navItems
					el.locale = locale
					el.locales = SUPPORTED_LOCALES
					el.localeUrls = {
						uk: import.meta.env.BASE_URL + 'uk/index.html',
						en: import.meta.env.BASE_URL + 'en/index.html',
					}
				}

				for (const [prop, propVal] of Object.entries(value)) {
					el[prop] = propVal
				}

				container.appendChild(el)
			}
		}
	})

	appDiv.appendChild(container)

	if (!isInitialized) {
		isInitialized = true

		// Listen for theme change from UIHeader
		document.addEventListener('theme-change', (e) => {
			applyTheme(e.detail)
		})

		// Listen for locale change from UIHeader
		document.addEventListener('locale-change', (e) => {
			const { locale: newLoc, url: newUrl } = e.detail
			if (newLoc !== currentLocale) {
				history.pushState({ locale: newLoc }, '', newUrl)
				bootstrap(newLoc)
			}
		})

		// Listen for browser back/forward buttons
		window.addEventListener('popstate', (e) => {
			if (e.state && e.state.locale) {
				bootstrap(e.state.locale)
			} else {
				// Fallback to URL detection if no state
				bootstrap()
			}
		})

		// OS auto-theme
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
			const tc = localStorage.getItem('nan0sync-theme') || 'auto'
			if (tc === 'auto') applyTheme('auto')
		})

		// Initial history state replacement
		history.replaceState({ locale }, '', window.location.href)
	}
}

bootstrap()
