import fs from 'node:fs'
import path from 'node:path'

const readmeText = fs.readFileSync(path.resolve('README.md'), 'utf-8')

function parseMarkdown(md) {
	const blocks = []
	const lines = md.split('\n')
	let currentP = []
	let inCode = false
	let codeStr = ''
	let codeLang = ''

	function flushP() {
		if (currentP.length) {
			let text = currentP.join('\n')
			// Extremely naive link formatter
			text = text.replace(
				/\[([^\]]+)\]\(([^)]+)\)/g,
				'<a href="$2" target="_blank" style="color:var(--accent)">$1</a>',
			)
			// Formatter for bold
			text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			// Formatter for inline code
			text = text.replace(
				/`([^`]+)`/g,
				'<code style="background:var(--bg-hover);padding:2px 4px;border-radius:4px;font-family:monospace;font-size:0.9em;color:var(--accent)">$1</code>',
			)
			// Formatter for lists
			text = text.replace(/^- (.*)/gm, '• $1<br>')

			blocks.push({ p: text })
			currentP = []
		}
	}

	for (let i = 0; i < lines.length; i++) {
		let line = lines[i]

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

// Ensure the parser grabs relevant portions
// Let's filter out only sections from "## Installation" down
const blocks = parseMarkdown(readmeText)

let capture = false
const extractedBlocks = []

for (const b of blocks) {
	if (b.h2 === 'Installation') capture = true
	// Stop at ## License
	if (b.h2 === 'License' || b.h2 === 'Contributing') capture = false

	if (capture) {
		extractedBlocks.push(b)
	}
}

// Convert extracted blocks to JSON string to put into `data/*/readme.json`
const output = JSON.stringify(extractedBlocks, null, 2)
fs.writeFileSync(path.resolve('data/en/readme.json'), output)
fs.writeFileSync(path.resolve('data/uk/readme.json'), output) // fallback copy for now

console.info('Successfully parsed README.md and generated data/en/readme.json')
