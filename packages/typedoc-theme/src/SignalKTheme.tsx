import { cpSync } from 'fs';
import { dirname, resolve } from 'path';
import type { PageEvent, Reflection, Renderer } from 'typedoc';
import { MarkdownEvent, PageKind, DefaultTheme, JSX, RendererEvent } from 'typedoc';
import { fileURLToPath } from 'url';
import { SignalKThemeContext } from './SignalKThemeContext.js';

export class SignalKTheme extends DefaultTheme {
	constructor(renderer: Renderer) {
		super(renderer);

		const assets = [
			{ from: "../src/assets/", to: "assets/" },
			{ from: "../../../public/signal-k-logo-image-text.svg", to: "assets/logo.svg" }
		]

		// copy the complete assets
		renderer.on(RendererEvent.END, () => {
			assets.forEach(({ from, to }) => {
				const src = resolve(dirname(fileURLToPath(import.meta.url)), from);
				const dest = resolve(this.application.options.getValue('out'), to);
				cpSync(src, dest, { recursive: true });
			});
		});

		// Only show h2 and h3 in the page TOC
		renderer.on(MarkdownEvent.PARSE, ({ page }) => {
			if (page.pageKind === PageKind.Document) {
				page.pageSections.forEach((section) => {
					section.headings = section.headings.filter((heading) => {
						return [2, 3].includes(heading.level ?? 0);
					});
				});
			}
		});

		// link the css file
		renderer.hooks.on('head.end', (event) => {
			return <>
				<script src={event.relativeURL('assets/themeToggle.js')}></script>
				<link rel="stylesheet" href={event.relativeURL('assets/theme.css')} />
			</>
		}, -1);

		// set the code highlight theme
		renderer.application.on('bootstrapEnd', () => {
			if (!this.application.options.isSet('lightHighlightTheme')) {
				this.application.options.setValue('lightHighlightTheme', 'github-light-default');
			}

			if (!this.application.options.isSet('darkHighlightTheme')) {
				this.application.options.setValue('darkHighlightTheme', 'github-dark-default');
			}
		});
	}

	getRenderContext(pageEvent: PageEvent<Reflection>) {
		return new SignalKThemeContext(this.router, this, pageEvent, this.application.options);
	}
}
