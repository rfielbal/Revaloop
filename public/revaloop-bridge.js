(function revaloopBridge() {
  "use strict";

  var script = document.currentScript;
  var configuredOrigin =
    script && script.getAttribute("data-revaloop-origin");

  if (!configuredOrigin || window.parent === window) {
    return;
  }

  var parentOrigin;

  try {
    parentOrigin = new URL(configuredOrigin).origin;
  } catch {
    return;
  }

  function publishContext() {
    window.parent.postMessage(
      {
        type: "revaloop:context",
        path: window.location.pathname,
        title: document.title,
      },
      parentOrigin,
    );
  }

  function wrapHistoryMethod(name) {
    var original = window.history[name];

    window.history[name] = function wrappedHistoryMethod() {
      var result = original.apply(window.history, arguments);
      window.setTimeout(publishContext, 0);
      return result;
    };
  }

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  window.addEventListener("popstate", publishContext);
  window.addEventListener("hashchange", publishContext);
  window.addEventListener("pageshow", publishContext);

  var title = document.querySelector("title");
  if (title && "MutationObserver" in window) {
    new MutationObserver(publishContext).observe(title, {
      childList: true,
      subtree: true,
    });
  }

  publishContext();
})();
