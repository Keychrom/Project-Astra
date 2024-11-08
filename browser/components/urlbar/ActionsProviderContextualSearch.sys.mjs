/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UrlbarUtils } from "resource:///modules/UrlbarUtils.sys.mjs";

import {
  ActionsProvider,
  ActionsResult,
} from "resource:///modules/ActionsProvider.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  OpenSearchEngine: "resource://gre/modules/OpenSearchEngine.sys.mjs",
  loadAndParseOpenSearchEngine:
    "resource://gre/modules/OpenSearchLoader.sys.mjs",
  UrlbarPrefs: "resource:///modules/UrlbarPrefs.sys.mjs",
  UrlbarSearchUtils: "resource:///modules/UrlbarSearchUtils.sys.mjs",
});

const ENABLED_PREF = "contextualSearch.enabled";

const INSTALLED_ENGINE = "installed-engine";
const OPEN_SEARCH_ENGINE = "opensearch-engine";
const CONTEXTUAL_SEARCH_ENGINE = "contextual-search-engine";

/**
 * A provider that returns an option for using the search engine provided
 * by the active view if it utilizes OpenSearch.
 */
class ProviderContextualSearch extends ActionsProvider {
  constructor() {
    super();
    this.engines = new Map();
  }

  get name() {
    return "ActionsProviderContextualSearch";
  }

  isActive(queryContext) {
    return (
      queryContext.trimmedSearchString &&
      lazy.UrlbarPrefs.get(ENABLED_PREF) &&
      !queryContext.searchMode
    );
  }

  async queryActions(queryContext) {
    let instance = this.queryInstance;
    const hostname = URL.parse(queryContext.currentPage)?.hostname;

    // This happens on about pages, which won't have associated engines
    if (!hostname) {
      return null;
    }

    let { engine } = await this.fetchEngineDetails();
    let icon = engine?.icon || (await engine?.getIconURL?.());
    let defaultEngine = lazy.UrlbarSearchUtils.getDefaultEngine();

    if (
      !engine ||
      engine.name === defaultEngine?.name ||
      instance != this.queryInstance
    ) {
      return null;
    }

    return [
      new ActionsResult({
        key: "contextual-search",
        l10nId: "urlbar-result-search-with",
        l10nArgs: { engine: engine.name || engine.title },
        icon,
        onPick: (context, controller) => {
          this.pickAction(context, controller);
        },
      }),
    ];
  }

  async fetchEngineDetails() {
    let browser =
      lazy.BrowserWindowTracker.getTopWindow().gBrowser.selectedBrowser;
    let hostname;
    try {
      // currentURI.host will throw on pages without a host ("about:" pages).
      hostname = browser.currentURI.host;
    } catch (e) {
      return null;
    }

    if (this.engines.has(hostname)) {
      return { type: INSTALLED_ENGINE, engine: this.engines.get(hostname) };
    }

    // Strip www. to allow for partial matches when looking for an engine.
    const [host] = UrlbarUtils.stripPrefixAndTrim(hostname, {
      stripWww: true,
    });
    let engines = await lazy.UrlbarSearchUtils.enginesForDomainPrefix(host, {
      matchAllDomainLevels: true,
    });

    if (engines.length) {
      return { type: INSTALLED_ENGINE, engine: engines[0] };
    }

    let contextualEngineConfig =
      await Services.search.findContextualSearchEngineByHost(host);
    if (contextualEngineConfig) {
      return {
        type: CONTEXTUAL_SEARCH_ENGINE,
        engine: contextualEngineConfig,
      };
    }

    if (browser?.engines?.length) {
      return { type: OPEN_SEARCH_ENGINE, engine: browser.engines[0] };
    }

    return {};
  }

  async pickAction(queryContext, controller, _element) {
    let { type, engine } = await this.fetchEngineDetails();
    let enterSeachMode = true;
    let engineObj;

    if (
      (type == CONTEXTUAL_SEARCH_ENGINE || type == OPEN_SEARCH_ENGINE) &&
      !queryContext.isPrivate
    ) {
      engineObj = await this.#installEngine({ type, engine }, controller);
    } else if (type == OPEN_SEARCH_ENGINE) {
      let openSearchEngineData = await lazy.loadAndParseOpenSearchEngine(
        Services.io.newURI(engine.uri)
      );
      engineObj = new lazy.OpenSearchEngine({
        engineData: openSearchEngineData,
      });
      enterSeachMode = false;
    } else if (type == INSTALLED_ENGINE || type == CONTEXTUAL_SEARCH_ENGINE) {
      engineObj = engine;
    }

    this.#performSearch(
      engineObj,
      queryContext.searchString,
      controller.input,
      enterSeachMode
    );
  }

  async #installEngine({ type, engine }, controller) {
    let engineObj;
    if (type == CONTEXTUAL_SEARCH_ENGINE) {
      await Services.search.addContextualSearchEngine(engine);
      engineObj = engine;
    } else {
      engineObj = await Services.search.addOpenSearchEngine(
        engine.uri,
        engine.icon,
        controller.input.browsingContext
      );
    }
    engineObj.setAttr("auto-installed", true);
    return engineObj;
  }

  async #performSearch(engine, search, input, enterSearchMode) {
    const [url] = UrlbarUtils.getSearchQueryUrl(engine, search);
    if (enterSearchMode) {
      input.search(search, { searchEngine: engine });
    }
    input.window.gBrowser.fixupAndLoadURIString(url, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    input.window.gBrowser.selectedBrowser.focus();
  }

  resetForTesting() {
    this.engines = new Map();
  }
}

export var ActionsProviderContextualSearch = new ProviderContextualSearch();
