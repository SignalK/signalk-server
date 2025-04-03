import { DefaultThemeRenderContext /*, PageEvent, Reflection, RenderTemplate */ } from 'typedoc';
import { toolbar } from './partials/toolbar.js';
import { settings } from './partials/settings.js';

export class SignalKThemeContext extends DefaultThemeRenderContext {
	override toolbar = toolbar.bind(undefined, this);

	// Custom settings
	override settings = settings;

	// Remove settings from the sidebar
	override pageSidebar = this.pageNavigation
}
