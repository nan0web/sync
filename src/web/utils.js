import { getIcon } from './icons.js'

export function detectLang() {
	const parts = location.pathname.replace(/\/+$/, '').split('/')
	const last = parts[parts.length - 1]
	return /^[a-z]{2}$/.test(last) ? last : 'en'
}

export const currentLang = detectLang()

export function markdownInline(text) {
	if (!text) return ''
	return text
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

export function el(tag, props = {}, ...children) {
	const element = document.createElement(tag)
	for (const [key, value] of Object.entries(props)) {
		if (key === 'onclick') {
			element.onclick = value
		} else if (key.startsWith('data-')) {
			element.setAttribute(key, value)
		} else if (key === 'innerHTML') {
			element.innerHTML = value
		} else {
			element[key] = value
		}
	}
	for (const child of children) {
		if (typeof child === 'string') {
			element.appendChild(document.createTextNode(child))
		} else if (child) {
			element.appendChild(child)
		}
	}
	return element
}
