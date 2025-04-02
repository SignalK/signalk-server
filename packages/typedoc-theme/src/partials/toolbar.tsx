import { i18n, JSX } from "typedoc";
import type { SignalKThemeContext } from "../SignalKThemeContext.js";
import type { Reflection, PageEvent } from "typedoc";

export const toolbar = (context: SignalKThemeContext, props: PageEvent<Reflection>) => (
  <header class="tsd-page-toolbar">
    <div class="tsd-toolbar-contents container">
      <a href={context.options.getValue("titleLink") || context.relativeURL("index.html")} class="title">
        {props.project.name}
      </a>
      <button id="tsd-search-trigger" class="tsd-widget" aria-label={i18n.theme_search()}>
        {context.icons.search()}
        <span>{i18n.theme_search()}</span>
      </button>
      <dialog id="tsd-search" aria-label={i18n.theme_search()}>
        <input
          role="combobox"
          id="tsd-search-input"
          aria-controls="tsd-search-results"
          aria-autocomplete="list"
          aria-expanded="true"
          spellcheck={false}
          autocapitalize="off"
          autocomplete="off"
          placeholder={i18n.theme_search_placeholder()}
          maxLength={100}
        />

        <ul role="listbox" id="tsd-search-results"></ul>
        <div id="tsd-search-status" aria-live="polite" aria-atomic="true">
          <div>{i18n.theme_preparing_search_index()}</div>
        </div>
      </dialog>

      <div id="tsd-toolbar-links">
        {Object.entries(context.options.getValue("navigationLinks")).map(([label, url]) => (
          <a href={url}>{label}</a>
        ))}
        <a
          href="#"
          class="tsd-widget menu"
          id="tsd-toolbar-menu-trigger"
          data-toggle="menu"
          aria-label={i18n.theme_menu()}
        >
          {context.icons.menu()}
        </a>
      </div>
    </div>
  </header>
);
