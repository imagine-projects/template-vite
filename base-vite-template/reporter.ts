(function (window) {
  function report({ type, payload }: { type: string; payload: object }) {
    console.debug({ type, payload });
    window.parent.postMessage(
      {
        type,
        payload,
      },
      "*",
    );
  }

  function formatErrorForLLM(error: unknown): string {
    if (!error) return "Unknown error";

    if (typeof error === "string") return error;

    if (error instanceof Error) {
      let errorString = "";
      if (error.name) errorString += `${error.name}: `;
      if (error.message) errorString += error.message;
      if (error.stack) errorString += `\n\nStack trace:\n${error.stack}`;

      return errorString;
    }

    return "Unknown error format";
  }

  function notifyNavigationChange() {
    report({
      type: "navigation",
      payload: {
        url: window.location.href,
        title: window.document.title,
      },
    });
  }
  function notifyLoaded() {
    report({
      type: "loaded",
      payload: {
        url: window.location.href,
        title: window.document.title,
      },
    });
  }

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : input.toString();
    const method = init?.method || "GET";

    try {
      const response = await origFetch(input, init);
      report({
        type: "fetch",
        payload: {
          url,
          method,
          status: "completed",
          statusCode: response.status,
          statusText: response.statusText,
          ok: response.ok,
        },
      });
      return response;
    } catch (error) {
      report({
        type: "fetch",
        payload: {
          url,
          method,
          status: "error",
          error: formatErrorForLLM(error),
        },
      });
      throw error;
    }
  };

  ["log", "warn", "error"].forEach((method) => {
    if (typeof console[method] === "function") {
      const originalMethod = console[method];
      console[method] = function (...args: unknown[]) {
        // Call the original method first
        originalMethod(...args);

        // Format arguments for reporting
        const formattedArgs = args.map((arg) => {
          if (typeof arg === "string") return arg;
          if (arg === null) return "null";
          if (arg === undefined) return "undefined";
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        });

        report({
          type: "console",
          payload: {
            method,
            args: formattedArgs,
            message: formattedArgs.join(" "),
            timestamp: Date.now(),
          },
        });
      };
    }
  });

  const origPushState = window.history.pushState;
  window.history.pushState = function (...args) {
    origPushState(...args);
    notifyNavigationChange();
  };

  const origReplaceState = window.history.replaceState;
  window.history.replaceState = function (...args) {
    origReplaceState(...args);
    notifyNavigationChange();
  };

  window.addEventListener("popstate", notifyNavigationChange);
  window.addEventListener("error", function (event) {
    report({
      type: "error",
      payload: {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: formatErrorForLLM(event.error),
        summary: `Error at ${event.filename}:${event.lineno}:${event.colno} - ${event.message}`,
      },
    });
  });

  window.addEventListener("unhandledrejection", function (event) {
    report({
      type: "unhandledrejection",
      payload: {
        reason: formatErrorForLLM(event.reason),
        summary: `Unhandled Promise Rejection: ${formatErrorForLLM(event.reason)}`,
      },
    });
  });

  window.addEventListener("load", function () {
    notifyLoaded();
  });

  // Report initial navigation
  notifyNavigationChange();
})(window);
