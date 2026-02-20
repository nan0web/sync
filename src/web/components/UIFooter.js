import { LitElement, html, css } from 'lit'

export class UIFooter extends LitElement {
	static properties = {
		license: { type: String },
		licenseUrl: { type: String },
		year: { type: String },
		platform: { type: String },
		platformUrl: { type: String },
		cai: { type: String },
		caiUrl: { type: String },
	}

	static styles = css`
		:host {
			display: block;
			text-align: center;
			padding: 3rem 0 2rem;
			margin-top: 5rem;
			border-top: 1px solid var(--border);
			color: var(--text-secondary);
			font-size: 0.85rem;
		}
		.grid {
			display: grid;
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}
		@media (min-width: 768px) {
			.grid {
				grid-template-columns: repeat(3, 1fr);
				align-items: center;
			}
		}
		.license {
			font-weight: bold;
		}
		.cai {
			opacity: 0.5;
			font-size: 0.8rem;
			margin-top: 1.5rem;
		}
		a {
			color: inherit;
			text-decoration: none;
			transition: color 0.2s;
		}
		a:hover {
			color: var(--text-primary);
		}
	`

	render() {
		return html`
			<div class="grid">
				<div class="license">
					${this.licenseUrl
						? html`<a href="${this.licenseUrl}" target="_blank" rel="noopener"
								>${this.license || 'ISC License'}</a
							>`
						: this.license || 'ISC License'}
				</div>
				<div>
					&copy; ${this.year || new Date().getFullYear()}
					${this.platformUrl
						? html`<a href="${this.platformUrl}" target="_blank" rel="noopener"
								>${this.platform || 'NaN•Web Platform'}</a
							>`
						: this.platform || 'NaN•Web Platform'}
				</div>
				<div>All rights reserved.</div>
			</div>
			${this.cai
				? html`<div class="cai">
						${this.caiUrl
							? html`<a href="${this.caiUrl}" target="_blank" rel="noopener">${this.cai}</a>`
							: this.cai}
					</div>`
				: ''}
		`
	}
}

customElements.define('ui-footer', UIFooter)
