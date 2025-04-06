import { DefaultThemeRenderContext /*, PageEvent, Reflection, RenderTemplate */ } from 'typedoc';
import { toolbar } from './partials/toolbar.js';

export class SignalKThemeContext extends DefaultThemeRenderContext {
	override toolbar = toolbar.bind(undefined, this);

	// Remove settings from the sidebar
	override pageSidebar = this.pageNavigation
}
