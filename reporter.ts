(function (window) {
  interface NetworkRequestData {
    url: string;
    method: string;
    status?: number;
    statusText?: string;
    responseBody?: string;
    requestBody?: string;
    timestamp: string;
    duration: number;
    origin: string;
    headers: Record<string, string>;
    error?: {
      message: string;
      stack?: string;
    };
  }

  interface ElementLocation {
    filePath: string;
    lineNumber: number;
    col: number;
  }

  interface SerializedElementData {
    id: string;
    filePath: string;
    fileName: string;
    lineNumber: number;
    col: number;
    elementType: string;
    content: string;
    children: SerializedElementData[];
    className: string;
    textContent: string;
    attrs: Record<string, string>;
  }

  interface DomNodeData {
    type: "node" | "text";
    children?: DomNodeData[];
    attrs?: Record<string, string>;
    tagName?: string;
    data?: SerializedElementData;
    textContent?: string;
  }

  interface MessagePayload {
    type: string;
    payload?: unknown;
    level?: string;
    message?: string;
    logged_at?: string;
    raw?: unknown[];
    request?: Partial<NetworkRequestData>;
    error?: {
      message: string;
      stack?: string;
      lineno?: number;
      colno?: number;
      filename?: string;
    };
    tree?: DomNodeData;
    isMultiSelect?: boolean;
  }


  function isWhitelistedOrigin(origin: string) {
    if (CONFIG.ALLOWED_ORIGINS.includes("*")) {
      return true;
    }

    return CONFIG.ALLOWED_ORIGINS.includes(origin);
  }

  const CONFIG = {
    HIGHLIGHT_COLOR: "#0da2e7",
    HIGHLIGHT_BG: "#0da2e71a",
    ALLOWED_ORIGINS: ["*"],
    DEBOUNCE_DELAY: 10,
    Z_INDEX: 10000,
    TOOLTIP_OFFSET: 25,
    MAX_TOOLTIP_WIDTH: 200,
    SCROLL_DEBOUNCE: 420,
    FULL_WIDTH_TOOLTIP_OFFSET: "12px",
    HIGHLIGHT_STYLE: {
      FULL_WIDTH: { OFFSET: "-5px", STYLE: "solid" },
      NORMAL: { OFFSET: "0", STYLE: "solid" },
    },
    SELECTED_ATTR: "data-imagine-selected",
    HOVERED_ATTR: "data-imagine-hovered",
    OVERRIDE_STYLESHEET_ID: "imagine-override",
  };

  /**
   * Sends a message to all allowed origins via postMessage
   * @param message - The message payload to send
   */
  function sendMessageToAllowedOrigins(message: MessagePayload): void {
    CONFIG.ALLOWED_ORIGINS.forEach((origin) => {
      try {
        if (!window.parent) return;
        if (!message || typeof message !== "object") {
          console.error("Invalid message format");
          return;
        }
        window.parent.postMessage(message, origin);
      } catch (error) {
        console.error(`Failed to send message to ${origin}:`, error);
      }
    });
  }

  /**
   * Waits for the document to be in a ready state
   * @returns Promise that resolves when document is ready
   */
  function waitForDocumentReady(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (document.readyState !== "loading") {
        resolve();
        return;
      }
      requestIdleCallback(() => {
        resolve();
      });
    });
  }

  /**
   * Waits for React or HMR to settle before proceeding
   * @returns Promise that resolves when React has settled
   */
  async function waitForReactToSettle(): Promise<void> {
    await waitForDocumentReady();
    // @ts-expect-error no need to expect type here
    const hotModule = import.meta.hot;
    if (hotModule) {
      await new Promise<void>((resolve) => {
        const checkPending = (): void => {
          if (!hotModule.data.pending) {
            resolve();
            return;
          }
          setTimeout(checkPending, 50);
        };
        checkPending();
      });
    }
  }

  /**
   * Waits for the #root element to be populated with child elements
   * @returns Promise that resolves when root element has children
   */
  function waitForRootElement(): Promise<void> {
    return new Promise<void>((resolve) => {
      const rootElement = document.getElementById("root");
      if (rootElement && rootElement.children.length > 0) {
        resolve();
        return;
      }
      const observer = new MutationObserver((_mutations, obs) => {
        const root = document.getElementById("root");
        if (root && root.children.length > 0) {
          obs.disconnect();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  /**
   * Instruments the global fetch function to capture network requests
   */
  function instrumentFetch(): void {
    const originalFetch = window.fetch;
    window.fetch = async function (
      ...args: Parameters<typeof fetch>
    ): Promise<Response> {
      const startTime = Date.now();
      try {
        let requestBody: string | undefined;
        if (args[1] && args[1].body) {
          try {
            if (typeof args[1].body === "string") {
              requestBody = args[1].body;
            } else if (args[1].body instanceof FormData) {
              requestBody =
                "FormData: " +
                Array.from(args[1].body.entries())
                  .map(([key, value]) => `${key}=${value}`)
                  .join("&");
            } else if (args[1].body instanceof URLSearchParams) {
              requestBody = args[1].body.toString();
            } else {
              requestBody = JSON.stringify(args[1].body);
            }
          } catch {
            requestBody = "Could not serialize request body";
          }
        }
        const response = await originalFetch(...args);

        console.log(
          `[Console Capture] Network request to ${
            args[0] || response.url
          }, status: ${response.status}`
        );

        const requestData: NetworkRequestData = {
          url: args[0]?.toString() || response.url,
          method: (args[1] && args[1].method) || "GET",
          status: response.status,
          statusText: response.statusText,
          responseBody: response.clone
            ? await response.clone().text()
            : undefined,
          requestBody,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          origin: window.location.origin,
          headers:
            args[1] && args[1].headers
              ? Object.fromEntries(new Headers(args[1].headers))
              : {},
        };

        sendMessageToAllowedOrigins({
          type: "NETWORK_REQUEST",
          request: requestData,
        });

        return response;
      } catch (error) {
        let requestBody: string | undefined;
        if (args[1] && args[1].body) {
          try {
            if (typeof args[1].body === "string") {
              requestBody = args[1].body;
            } else if (args[1].body instanceof FormData) {
              requestBody =
                "FormData: " +
                Array.from(args[1].body.entries())
                  .map(([key, value]) => `${key}=${value}`)
                  .join("&");
            } else if (args[1].body instanceof URLSearchParams) {
              requestBody = args[1].body.toString();
            } else {
              requestBody = JSON.stringify(args[1].body);
            }
          } catch {
            requestBody = "Could not serialize request body";
          }
        }
        const requestData: Partial<NetworkRequestData> = {
          url: args[0]?.toString(),
          method: (args[1] && args[1].method) || "GET",
          origin: window.location.origin,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          headers:
            args[1] && args[1].headers
              ? Object.fromEntries(new Headers(args[1].headers))
              : {},
          requestBody,
        };
        const errorData: Partial<NetworkRequestData> = {
          ...requestData,
          error: {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          },
        };

        sendMessageToAllowedOrigins({
          type: "NETWORK_REQUEST",
          request: errorData,
        });

        throw error;
      }
    };
  }

  /**
   * Initializes global error handlers for uncaught errors and promise rejections
   * @returns Function to initialize error handlers (singleton pattern)
   */
  const initializeErrorHandlers = ((): (() => void) => {
    let errorHandlersInitialized = false;

    /**
     * Formats an error event into a standardized object
     * @param errorEvent - The error event to format
     * @returns Formatted error object
     */
    function formatError(errorEvent: ErrorEvent): {
      message: string;
      lineno?: number;
      colno?: number;
      filename?: string;
      stack?: string;
    } {
      return {
        message: errorEvent.message,
        lineno: errorEvent.lineno,
        colno: errorEvent.colno,
        filename: errorEvent.filename,
        stack: errorEvent.error?.stack,
      };
    }

    return function initErrorHandlers(): void {
      console.log("[Console Capture] Initializing error handlers");
      if (errorHandlersInitialized) return;
      const errorSet = new Set<string>();

      /**
       * Generates a unique key for an error event to prevent duplicates
       * @param errorEvent - The error event
       * @returns Unique error key
       */
      function generateErrorKey(errorEvent: ErrorEvent): string {
        return `${errorEvent.message}|${errorEvent.filename}|${errorEvent.lineno}|${errorEvent.colno}`;
      }

      instrumentFetch();

      /**
       * Handles error events and sends them to allowed origins
       * @param errorEvent - The error event to handle
       */
      function errorListener(errorEvent: ErrorEvent): void {
        console.log("[Console Capture] Error event:", errorEvent);
        const errorKey = generateErrorKey(errorEvent);
        console.log("[Console Capture] Error key:", errorKey);
        if (errorSet.has(errorKey)) return;
        errorSet.add(errorKey);
        setTimeout(() => errorSet.delete(errorKey), 5000);
        const formattedError = formatError(errorEvent);
        console.log("[Console Capture] Runtime error:", formattedError);
        sendMessageToAllowedOrigins({
          type: "RUNTIME_ERROR",
          error: formattedError,
        });
      }

      window.addEventListener("error", errorListener);
      window.addEventListener("unhandledrejection", (event) => {
        if (!event.reason?.stack) return;
        const errorKey =
          event.reason?.stack || event.reason?.message || String(event.reason);
        if (errorSet.has(errorKey)) return;
        errorSet.add(errorKey);
        setTimeout(() => errorSet.delete(errorKey), 5000);
        const errorData = {
          message: event.reason?.message || "Unhandled promise rejection",
          stack: event.reason?.stack || String(event.reason),
        };
        sendMessageToAllowedOrigins({
          type: "UNHANDLED_PROMISE_REJECTION",
          error: errorData,
        });
      });
      errorHandlersInitialized = true;
    };
  })();

  /**
   * Represents a circular reference in serialized data
   */
  class CircularReference {
    public message: string;

    constructor(ref: string) {
      this.message = `[Circular Reference to ${ref}]`;
    }
  }

  /**
   * Represents a serialized type with metadata
   */
  class SerializedType {
    public _type: string;
    public value: unknown;

    constructor(type: string, value: unknown) {
      this._type = type;
      this.value = value;
    }
  }

  interface SerializerConfig {
    maxDepth: number;
    indent: number;
    includeSymbols: boolean;
    preserveTypes: boolean;
    maxStringLength: number;
    maxArrayLength: number;
    maxObjectKeys: number;
  }

  const SERIALIZER_CONFIG: SerializerConfig = {
    maxDepth: 10,
    indent: 2,
    includeSymbols: true,
    preserveTypes: true,
    maxStringLength: 1e4,
    maxArrayLength: 100,
    maxObjectKeys: 100,
  };

  /**
   * Serializes a value with circular reference detection and type preservation
   * @param value - The value to serialize
   * @param options - Serialization options
   * @param seen - WeakMap for circular reference detection
   * @param path - Current object path for debugging
   * @returns Serialized value
   */
  function serializeValue(
    value: unknown,
    options: Partial<SerializerConfig> = {},
    seen = new WeakMap<object, string>(),
    path = "root"
  ): unknown {
    const config: SerializerConfig = { ...SERIALIZER_CONFIG, ...options };

    if (path.split(".").length > config.maxDepth) {
      return new SerializedType(
        "MaxDepthReached",
        `[Max depth of ${config.maxDepth} reached]`
      );
    }

    if (value === undefined)
      return new SerializedType("undefined", "undefined");
    if (value === null) return null;
    if (typeof value === "string") {
      return value.length > config.maxStringLength
        ? new SerializedType(
            "String",
            `${value.slice(0, config.maxStringLength)}... [${
              value.length - config.maxStringLength
            } more characters]`
          )
        : value;
    }
    if (typeof value === "number") {
      return Number.isNaN(value)
        ? new SerializedType("Number", "NaN")
        : Number.isFinite(value)
          ? value
          : new SerializedType("Number", value > 0 ? "Infinity" : "-Infinity");
    }
    if (typeof value === "boolean") return value;
    if (typeof value === "bigint")
      return new SerializedType("BigInt", value.toString());
    if (typeof value === "symbol")
      return new SerializedType("Symbol", value.toString());
    if (typeof value === "function") {
      return new SerializedType("Function", {
        name: value.name || "anonymous",
        stringValue: value.toString().slice(0, config.maxStringLength),
      });
    }
    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return new CircularReference(seen.get(value) || "unknown");
      }
      seen.set(value, path);
    }
    if (value instanceof Error) {
      const errorData: Record<string, unknown> = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      for (const prop of Object.getOwnPropertyNames(value)) {
        if (!errorData[prop]) {
          errorData[prop] = serializeValue(
            (value as unknown as Record<string, unknown>)[prop],
            config,
            seen,
            `${path}.${prop}`
          );
        }
      }
      return new SerializedType("Error", errorData);
    }
    if (value instanceof Date) {
      return new SerializedType("Date", {
        iso: value.toISOString(),
        value: value.valueOf(),
        local: value.toString(),
      });
    }
    if (value instanceof RegExp) {
      return new SerializedType("RegExp", {
        source: value.source,
        flags: value.flags,
        string: value.toString(),
      });
    }
    if (value instanceof Promise) {
      return new SerializedType("Promise", "[Promise]");
    }
    if (value instanceof WeakMap || value instanceof WeakSet) {
      return new SerializedType(
        value.constructor.name,
        `[${value.constructor.name}]`
      );
    }
    if (value instanceof Set) {
      const setValues = Array.from(value);
      if (setValues.length > config.maxArrayLength) {
        return new SerializedType("Set", {
          values: setValues
            .slice(0, config.maxArrayLength)
            .map((item, index) =>
              serializeValue(item, config, seen, `${path}.Set[${index}]`)
            ),
          truncated: setValues.length - config.maxArrayLength,
        });
      } else {
        return new SerializedType("Set", {
          values: setValues.map((item, index) =>
            serializeValue(item, config, seen, `${path}.Set[${index}]`)
          ),
        });
      }
    }
    if (value instanceof Map) {
      const mapEntries: Record<string, unknown> = {};
      let truncatedCount = 0;
      let keysCount = 0;
      for (const [key, val] of value.entries()) {
        if (keysCount >= config.maxObjectKeys) {
          truncatedCount++;
          continue;
        }
        const keyStr =
          typeof key === "object"
            ? JSON.stringify(
                serializeValue(key, config, seen, `${path}.MapKey`)
              )
            : String(key);
        mapEntries[keyStr] = serializeValue(
          val,
          config,
          seen,
          `${path}.Map[${keyStr}]`
        );
        keysCount++;
      }
      return new SerializedType("Map", {
        entries: mapEntries,
        truncated: truncatedCount || undefined,
      });
    }
    if (ArrayBuffer.isView(value)) {
      const view = value as Uint8Array;
      return new SerializedType(value.constructor.name, {
        length: view.length,
        byteLength: view.byteLength,
        sample: Array.from(view.slice(0, 10)),
      });
    }
    if (Array.isArray(value)) {
      if (value.length > config.maxArrayLength) {
        return value
          .slice(0, config.maxArrayLength)
          .map((item, index) =>
            serializeValue(item, config, seen, `${path}[${index}]`)
          )
          .concat([`... ${value.length - config.maxArrayLength} more items`]);
      } else {
        return value.map((item, index) =>
          serializeValue(item, config, seen, `${path}[${index}]`)
        );
      }
    }
    const objectResult: Record<string, unknown> = {};
    const keys = [...Object.getOwnPropertyNames(value)];
    if (config.includeSymbols) {
      keys.push(
        ...Object.getOwnPropertySymbols(value).map((sym) => sym.toString())
      );
    }
    keys.slice(0, config.maxObjectKeys).forEach((key) => {
      try {
        objectResult[key] = serializeValue(
          (value as Record<string, unknown>)[key],
          config,
          seen,
          `${path}.${key}`
        );
      } catch (error) {
        objectResult[key] = new SerializedType(
          "Error",
          `[Unable to serialize: ${error instanceof Error ? error.message : "Unknown error"}]`
        );
      }
    });
    if (keys.length > config.maxObjectKeys) {
      const extraKeys = keys.length - config.maxObjectKeys;
      objectResult["..."] = `${extraKeys} more properties`;
    }
    return objectResult;
  }

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  const consoleLevelMapping: Record<string, string> = {
    log: "info",
    warn: "warning",
    error: "error",
  };

  /**
   * Patches console methods to capture output and send to allowed origins
   * @returns Function to patch console methods (singleton pattern)
   */
  const patchConsoleMethods = ((): (() => void) => {
    let patched = false;
    return function patch(): void {
      console.log("[Console Capture] Patching console methods");
      if (patched) return;

      /**
       * Wraps a console method to capture its output
       * @param methodName - The console method name to wrap
       */
      function wrapConsoleMethod(methodName: "log" | "warn" | "error"): void {
        console[methodName] = (...args: unknown[]) => {
          originalConsole[methodName].apply(console, args);
          let additionalStack: string | null = null;
          if (methodName === "warn" || methodName === "error") {
            const error = new Error();
            if (error.stack) {
              additionalStack = error.stack.split("\n").slice(2).join("\n");
            }
          }
          const serializedArgs = args.map((arg) =>
            serializeValue(arg, {
              maxDepth: 5,
              includeSymbols: true,
              preserveTypes: true,
            })
          );
          const message =
            serializedArgs
              .map((arg) =>
                typeof arg === "string" ? arg : JSON.stringify(arg, null, 2)
              )
              .join(" ") + (additionalStack ? "\n" + additionalStack : "");
          sendMessageToAllowedOrigins({
            type: "CONSOLE_OUTPUT",
            level: consoleLevelMapping[methodName],
            message,
            logged_at: new Date().toISOString(),
            raw: serializedArgs,
          });
        };
      }
      wrapConsoleMethod("log");
      wrapConsoleMethod("warn");
      wrapConsoleMethod("error");
      patched = true;
    };
  })();

  /**
   * Serializes a DOM element into a structured object
   * @param element - The HTML element to serialize
   * @returns Serialized DOM node data
   */
  function serializeDomNode(element: HTMLElement): DomNodeData {
    const nodeData: DomNodeData = {
      type: "node",
      children: [],
      attrs: [...element.attributes].reduce(
        (acc: Record<string, string>, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        },
        {}
      ),
      tagName: element.tagName,
      data: serializeElementData(element),
    };

    [...element.childNodes].forEach((child) => {
      if (child instanceof HTMLElement) {
        nodeData.children!.push(serializeDomNode(child));
      } else if (child instanceof Text) {
        nodeData.children!.push({
          type: "text",
          textContent: child.textContent || "",
        });
      }
    });
    return nodeData;
  }

  /**
   * Sends the component tree based on the #root element
   */
  async function sendComponentTree(): Promise<void> {
    await waitForReactToSettle();
    const rootElement = document.querySelector("#root") as HTMLElement;
    const tree = serializeDomNode(rootElement);
    console.log("[Console Capture] Sending component tree");
    sendMessageToAllowedOrigins({
      type: "COMPONENT_TREE",
      payload: { tree },
    });
  }

  /**
   * Initializes keyboard event listeners for selector interactions
   */
  function initializeKeyBindings(): void {
    console.log("[Console Capture] Initializing keybindings");
    window.addEventListener(
      "keydown",
      (event) => {
        const keys: string[] = [];
        if (event.metaKey) keys.push("Meta");
        if (event.ctrlKey) keys.push("Ctrl");
        if (event.altKey) keys.push("Alt");
        if (event.shiftKey) keys.push("Shift");
        const keyName = !["Meta", "Control", "Alt", "Shift"].includes(event.key)
          ? event.key
          : "";
        const compositeKey = [...keys, keyName].filter(Boolean).join("+");
        if (["Meta+z", "Meta+Backspace", "Meta+d"].includes(compositeKey)) {
          event.preventDefault();
        }
        if (compositeKey) {
          sendMessageToAllowedOrigins({
            type: "KEYBIND",
            payload: {
              compositeKey,
              rawEvent: {
                key: event.key,
                code: event.code,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
              },
              timestamp: Date.now(),
            },
          });
        }
      },
      { passive: true }
    );
  }

  /**
   * Checks if an element is selectable (has required data attributes)
   * @param element - The element to check
   * @returns True if element is selectable
   */
  function isSelectableElement(element: Element): boolean {
    return (
      element.hasAttribute("data-imagine-id") ||
      element.hasAttribute("data-component-path")
    );
  }

  /**
   * Parses an element ID string into its components
   * @param idString - String in format "filePath:lineNumber:col"
   * @returns Parsed element location
   */
  function parseElementId(idString: string): Partial<ElementLocation> {
    if (!idString) return {};
    const [filePath, lineNumber, col] = idString.split(":");
    return {
      filePath,
      lineNumber: parseInt(lineNumber || "0", 10),
      col: parseInt(col || "0", 10),
    };
  }

  /**
   * Extracts location information from element attributes
   * @param element - The element to get location from
   * @returns Element location data
   */
  function getElementLocation(element: Element): ElementLocation {
    const idAttr = element.getAttribute("data-imagine-id") || "";
    if (idAttr) {
      const parsed = parseElementId(idAttr);
      return {
        filePath: parsed.filePath || "",
        lineNumber: parsed.lineNumber || 0,
        col: parsed.col || 0,
      };
    }
    const componentPath = element.getAttribute("data-component-path") || "";
    const componentLine = element.getAttribute("data-component-line") || "";
    return {
      filePath: componentPath || "",
      lineNumber: parseInt(componentLine, 10) || 0,
      col: 0,
    };
  }

  /**
   * Serializes element data into a structured object
   * @param element - The element to serialize
   * @returns Serialized element data
   */
  function serializeElementData(element: Element): SerializedElementData {
    const idAttr = element.getAttribute("data-imagine-id") || "";
    const { filePath } = parseElementId(idAttr);
    const tagName = element.tagName.toLowerCase();
    const componentContent =
      element.getAttribute("data-component-content") || null;

    const childElements = Array.from(element.children)
      .filter(
        (child): child is Element =>
          isSelectableElement(child) &&
          getElementLocation(child).filePath !== filePath
      )
      .filter(
        (child, index, self) =>
          index ===
          self.findIndex(
            (el) =>
              getElementLocation(el).filePath ===
              getElementLocation(child).filePath
          )
      )
      .map(
        (child): SerializedElementData => ({
          id: child.getAttribute("data-imagine-id") || "",
          filePath: getElementLocation(child).filePath,
          fileName: getElementLocation(child).filePath?.split("/").pop() || "",
          lineNumber: getElementLocation(child).lineNumber,
          col: getElementLocation(child).col,
          elementType: child.tagName.toLowerCase(),
          content: child.getAttribute("data-component-content") || "",
          className: child.getAttribute("class") || "",
          textContent: (child as HTMLElement).innerText,
          attrs: { src: child.getAttribute("src") || "" },
          children: [],
        })
      );

    return {
      id: element.getAttribute("data-imagine-id") || "",
      filePath: getElementLocation(element).filePath,
      fileName: getElementLocation(element).filePath?.split("/").pop() || "",
      lineNumber: getElementLocation(element).lineNumber,
      col: getElementLocation(element).col,
      elementType: tagName,
      content: componentContent || "",
      children: childElements,
      className: element.getAttribute("class") || "",
      textContent: (element as HTMLElement).innerText,
      attrs: { src: element.getAttribute("src") || "" },
    };
  }

  /**
   * Initializes the element selector functionality
   */
  function initializeElementSelector(): void {
    class SelectorState {
      public hoveredElement: HTMLElement | null = null;
      public isActive = false;
      public tooltip: HTMLElement | null = null;
      public scrollTimeout: number | null = null;
      public mouseX = 0;
      public mouseY = 0;
      public styleElement: HTMLStyleElement | null = null;

      reset(): void {
        this.hoveredElement = null;
        this.scrollTimeout = null;
      }
    }
    const selectorState = new SelectorState();

    /**
     * Debounces function calls to prevent excessive execution
     * @param fn - Function to debounce
     * @param delay - Delay in milliseconds
     * @returns Debounced function
     */
    function debounce<T extends unknown[]>(
      fn: (...args: T) => void,
      delay: number
    ): (...args: T) => void {
      let timeoutId: number | null = null;
      return (...args: T) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
      };
    }

    initializeKeyBindings();

    /**
     * Creates tooltip element and injects CSS styles for highlighting
     */
    function createTooltipAndStyle(): void {
      selectorState.tooltip = document.createElement("div");
      selectorState.tooltip.className = "imagine-selector-tooltip";
      selectorState.tooltip.setAttribute("role", "tooltip");
      document.body.appendChild(selectorState.tooltip);

      const styleElement = document.createElement("style");
      styleElement.textContent = `
      .imagine-selector-tooltip {
        position: fixed;
        z-index: ${CONFIG.Z_INDEX};
        pointer-events: none;
        background-color: ${CONFIG.HIGHLIGHT_COLOR};
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: bold;
        line-height: 1;
        white-space: nowrap;
        display: none;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        transition: opacity 0.2s ease-in-out;
        margin: 0;
      }
      [${CONFIG.HOVERED_ATTR}] {
        position: relative;
      }
      [${CONFIG.HOVERED_ATTR}]::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: 0px;
        outline: 1px dashed ${CONFIG.HIGHLIGHT_COLOR} !important;
        outline-offset: ${CONFIG.HIGHLIGHT_STYLE.NORMAL.OFFSET} !important;
        background-color: ${CONFIG.HIGHLIGHT_BG} !important;
        z-index: ${CONFIG.Z_INDEX};
        pointer-events: none;
      }
      [${CONFIG.SELECTED_ATTR}] {
        position: relative;
      }
      [${CONFIG.SELECTED_ATTR}]::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: 0px;
        outline: 1px dashed ${CONFIG.HIGHLIGHT_COLOR} !important;
        outline-offset: 3px !important;
        transition: outline-offset 0.2s ease-in-out;
        z-index: ${CONFIG.Z_INDEX};
        pointer-events: none;
      }
      [${CONFIG.SELECTED_ATTR}][contenteditable] {
        outline: none !important;
      }
      [${CONFIG.HOVERED_ATTR}][data-full-width]::before,
      [${CONFIG.SELECTED_ATTR}][data-full-width]::before {
        outline-offset: ${CONFIG.HIGHLIGHT_STYLE.FULL_WIDTH.OFFSET} !important;
      }
    `;
      document.head.appendChild(styleElement);
    }

    /**
     * Updates tooltip position and content based on target element
     * @param targetElement - The element to position tooltip for
     */
    function updateTooltip(targetElement: HTMLElement | null): void {
      if (!selectorState.tooltip || !targetElement) return;
      try {
        const rect = targetElement.getBoundingClientRect();
        const tagName = targetElement.tagName.toLowerCase();
        const isFullWidth = Math.abs(rect.width - window.innerWidth) < 5;
        selectorState.tooltip.style.maxWidth = `${CONFIG.MAX_TOOLTIP_WIDTH}px`;
        if (isFullWidth) {
          selectorState.tooltip.style.left = CONFIG.FULL_WIDTH_TOOLTIP_OFFSET;
          selectorState.tooltip.style.top = CONFIG.FULL_WIDTH_TOOLTIP_OFFSET;
        } else {
          const topPosition = Math.max(0, rect.top - CONFIG.TOOLTIP_OFFSET);
          selectorState.tooltip.style.left = `${Math.max(0, rect.left)}px`;
          selectorState.tooltip.style.top = `${topPosition}px`;
        }
        selectorState.tooltip.textContent = tagName;
      } catch (error) {
        console.error("Error updating tooltip:", error);
        hideTooltip();
      }
    }

    /**
     * Applies visual highlighting to an element when hovered
     * @param element - The element to highlight
     */
    function applyHoveredHighlight(element: HTMLElement): void {
      const isFullWidth =
        Math.abs(element.getBoundingClientRect().width - window.innerWidth) < 5;
      element.setAttribute(CONFIG.HOVERED_ATTR, "true");
      if (isFullWidth) {
        element.setAttribute("data-full-width", "true");
      }
    }

    /**
     * Removes visual highlighting from an element
     * @param element - The element to remove highlighting from
     */
    function removeHoveredHighlight(element: Element): void {
      element.removeAttribute(CONFIG.HOVERED_ATTR);
      element.removeAttribute("data-full-width");
      if (element instanceof HTMLElement) {
        element.style.cursor = "";
      }
    }

    /**
     * Checks if an element is within an SVG context
     * @param element - The element to check
     * @returns True if element is inside SVG but not the SVG itself
     */
    function isInSvgContext(element: Element): boolean {
      const isSvgTag = element.tagName.toLowerCase() === "svg";
      const isInsideSvg = element.closest("svg") !== null;
      return !isSvgTag && isInsideSvg;
    }

    const handleMouseOver = debounce((event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        !selectorState.isActive ||
        !isSelectableElement(target) ||
        target.tagName.toLowerCase() === "html" ||
        isInSvgContext(target)
      ) {
        return;
      }
      if (selectorState.hoveredElement) {
        findElementsByLocation(
          getElementLocation(selectorState.hoveredElement)
        ).forEach((el) => {
          if (!el.classList.contains("imagine-selected-element")) {
            removeHoveredHighlight(el);
          }
        });
      }
      selectorState.hoveredElement = target;
      const relatedElements = findElementsByLocation(
        getElementLocation(selectorState.hoveredElement)
      );
      if (relatedElements) {
        relatedElements.forEach((el) => {
          if (!el.classList.contains("imagine-selected-element")) {
            applyHoveredHighlight(el);
          }
        });
      }
      updateTooltip(selectorState.hoveredElement);
      if (selectorState.tooltip) {
        selectorState.tooltip.style.display = "block";
        selectorState.tooltip.style.opacity = "1";
      }
    }, CONFIG.DEBOUNCE_DELAY);

    const handleMouseOut = debounce(() => {
      if (selectorState.isActive) {
        if (selectorState.hoveredElement) {
          const relatedElements = findElementsByLocation(
            getElementLocation(selectorState.hoveredElement)
          );
          if (relatedElements) {
            relatedElements.forEach((el) => {
              if (!el.hasAttribute(CONFIG.SELECTED_ATTR)) {
                removeHoveredHighlight(el);
              }
            });
          }
          selectorState.hoveredElement = null;
        }
        hideTooltip();
      }
    }, CONFIG.DEBOUNCE_DELAY);

    /**
     * Hides the tooltip element
     */
    function hideTooltip(): void {
      if (selectorState.tooltip) {
        selectorState.tooltip.style.opacity = "0";
        selectorState.tooltip.style.display = "none";
      }
    }

    /**
     * Handles scroll events and updates element highlighting
     */
    function handleScroll(): void {
      if (selectorState.scrollTimeout)
        clearTimeout(selectorState.scrollTimeout);
      hideTooltip();
      if (
        selectorState.hoveredElement &&
        !selectorState.hoveredElement.classList.contains(
          "imagine-selected-element"
        )
      ) {
        removeHoveredHighlight(selectorState.hoveredElement);
      }
      selectorState.scrollTimeout = window.setTimeout(() => {
        selectorState.scrollTimeout = null;
        const elementUnderCursor = document.elementFromPoint(
          selectorState.mouseX,
          selectorState.mouseY
        );
        if (elementUnderCursor && selectorState.isActive) {
          const syntheticEvent = {
            target: elementUnderCursor,
            preventDefault: () => {},
            stopPropagation: () => {},
          } as unknown as MouseEvent;
          handleMouseOver(syntheticEvent);
        }
      }, CONFIG.SCROLL_DEBOUNCE);
    }

    /**
     * Prevents default behavior on form inputs when selector is active
     * @param event - The mouse event
     */
    function handleMouseDown(event: MouseEvent): void {
      if (
        selectorState.isActive &&
        event.target instanceof HTMLElement &&
        ["input", "textarea", "select"].includes(
          event.target.tagName.toLowerCase()
        )
      ) {
        event.preventDefault();
      }
    }

    /**
     * Prevents events when selector is active
     * @param event - The event to prevent
     * @returns False if event was prevented
     */
    function preventEvent(event: Event): boolean | void {
      if (selectorState.isActive) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    }

    /**
     * Adds all event listeners for selector functionality
     */
    function addSelectorEventListeners(): void {
      document.addEventListener("mouseover", handleMouseOver);
      document.addEventListener("mouseout", handleMouseOut);
      document.addEventListener("click", handleElementClick, true);
      document.addEventListener("dblclick", handleElementDoubleClick, true);
      window.addEventListener("scroll", handleScroll, { passive: true });
      document.addEventListener("mousedown", handleMouseDown, true);

      const scrollStyle = document.createElement("style");
      scrollStyle.textContent = `* { scroll-behavior: auto !important; }`;
      document.head.appendChild(scrollStyle);
      selectorState.styleElement = scrollStyle;
      document.addEventListener("click", preventEvent, true);
      document.addEventListener("submit", preventEvent, true);
      document.addEventListener("touchstart", preventEvent, true);
      document.addEventListener("touchend", preventEvent, true);
    }

    /**
     * Removes all selector event listeners and cleans up styles
     */
    function removeSelectorEventListeners(): void {
      document.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("click", handleElementClick);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("click", preventEvent, true);
      document.removeEventListener("submit", preventEvent, true);
      document.removeEventListener("touchstart", preventEvent, true);
      document.removeEventListener("touchend", preventEvent, true);
      if (selectorState.styleElement) {
        selectorState.styleElement.remove();
        selectorState.styleElement = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      (
        document.body.style as CSSStyleDeclaration & {
          msUserSelect?: string;
          mozUserSelect?: string;
        }
      ).msUserSelect = "";
      (
        document.body.style as CSSStyleDeclaration & {
          msUserSelect?: string;
          mozUserSelect?: string;
        }
      ).mozUserSelect = "";
      if (selectorState.hoveredElement) {
        if (!selectorState.hoveredElement.hasAttribute(CONFIG.SELECTED_ATTR)) {
          removeHoveredHighlight(selectorState.hoveredElement);
        }
        selectorState.hoveredElement = null;
      }
      hideTooltip();
    }

    /**
     * Finds elements by their location data attributes
     * @param location - The element location to search for
     * @returns NodeList of matching elements
     */
    function findElementsByLocation(
      location: ElementLocation
    ): NodeListOf<HTMLElement> {
      const selector = `[data-imagine-id="${location.filePath}:${location.lineNumber}:${location.col || "0"}"]`;
      console.log(`Attempting to find elements with selector: ${selector}`);
      let elements = document.querySelectorAll<HTMLElement>(selector);
      console.log(
        `Found ${elements.length} elements with selector: ${selector}`
      );
      if (elements.length > 0) return elements;
      const alternateSelector = `[data-component-path="${location.filePath}"][data-component-line="${location.lineNumber}"]`;
      console.log(
        `Attempting to find elements with alternate selector: ${alternateSelector}`
      );
      elements = document.querySelectorAll<HTMLElement>(alternateSelector);
      console.log(
        `Found ${elements.length} elements with alternate selector: ${alternateSelector}`
      );
      return elements;
    }

    /**
     * Handles incoming message events from parent window
     * @param event - The message event
     */
    function handleMessageEvent(event: MessageEvent): void {

      try {
        if (
          !event?.origin ||
          !event?.data?.type ||
          !isWhitelistedOrigin(event.origin)
        )
          return;
        switch (event.data.type) {
          case "TOGGLE_SELECTOR": {
            const activate = !!event.data.payload;
            if (selectorState.isActive !== activate) {
              selectorState.isActive = activate;
              if (selectorState.isActive) {
                addSelectorEventListeners();
                waitForRootElement().then(() => {
                  document
                    .querySelectorAll("button[disabled]")
                    .forEach((button) => {
                      button.removeAttribute("disabled");
                      button.setAttribute("data-imagine-disabled", "");
                    });
                });
              } else {
                removeSelectorEventListeners();
                document
                  .querySelectorAll("[data-imagine-disabled]")
                  .forEach((button) => {
                    button.removeAttribute("data-imagine-disabled");
                    button.setAttribute("disabled", "");
                  });
                document
                  .querySelectorAll(
                    `[${CONFIG.HOVERED_ATTR}], [data-full-width]`
                  )
                  .forEach((element) => {
                    if (!element.hasAttribute(CONFIG.SELECTED_ATTR)) {
                      removeHoveredHighlight(element);
                      if (element instanceof HTMLElement) {
                        element.style.cursor = "";
                      }
                    }
                  });
                selectorState.reset();
              }
            }
            break;
          }
          case "UPDATE_SELECTED_ELEMENTS": {
            if (!Array.isArray(event.data.payload)) {
              console.error("Invalid payload for UPDATE_SELECTED_ELEMENTS");
              return;
            }
            document
              .querySelectorAll(
                `[${CONFIG.SELECTED_ATTR}], [${CONFIG.HOVERED_ATTR}]`
              )
              .forEach((element) => {
                element.removeAttribute(CONFIG.SELECTED_ATTR);
                element.removeAttribute(CONFIG.HOVERED_ATTR);
                element.removeAttribute("data-full-width");
              });
            (event.data.payload as ElementLocation[]).forEach((item) => {
              if (!item?.filePath || !item?.lineNumber) {
                console.error("Invalid element data:", item);
                return;
              }
              findElementsByLocation({
                filePath: item.filePath,
                lineNumber: item.lineNumber,
                col: item.col,
              }).forEach((element) => {
                element.setAttribute(CONFIG.SELECTED_ATTR, "true");
                if (
                  Math.abs(
                    element.getBoundingClientRect().width - window.innerWidth
                  ) < 5
                ) {
                  element.setAttribute("data-full-width", "true");
                }
              });
            });
            break;
          }
          case "GET_SELECTOR_STATE":
            sendMessageToAllowedOrigins({
              type: "SELECTOR_STATE_RESPONSE",
              payload: { isActive: selectorState.isActive },
            });
            break;
          case "SET_ELEMENT_CONTENT": {
            console.log("Setting element content:", event.data.payload);
            const { id, content } = event.data.payload as {
              id: ElementLocation;
              content: string;
            };
            console.log(
              `Setting element content for ${id.filePath}:${id.lineNumber}:${id.col}`
            );
            findElementsByLocation({
              filePath: id.filePath,
              lineNumber: id.lineNumber,
              col: id.col,
            }).forEach((element) => {
              element.innerHTML = content;
            });
            break;
          }
          case "SET_ELEMENT_ATTRS": {
            const { id, attrs } = event.data.payload as {
              id: ElementLocation;
              attrs: Record<string, string>;
            };
            findElementsByLocation({
              filePath: id.filePath,
              lineNumber: id.lineNumber,
              col: id.col,
            }).forEach((element) => {
              Object.keys(attrs).forEach((attrName) => {
                element.setAttribute(attrName, attrs[attrName]);
              });
            });
            break;
          }
          case "DUPLICATE_ELEMENT_REQUESTED": {
            const { id } = event.data.payload as { id: ElementLocation };
            findElementsByLocation({
              filePath: id.filePath,
              lineNumber: id.lineNumber,
              col: id.col,
            }).forEach((element) => {
              const clone = element.cloneNode(true) as typeof element;
              clone.setAttribute("data-imagine-id", "x");
              clone.setAttribute("data-imagine-tmp", "true");
              element.parentElement?.appendChild(clone);
            });
            break;
          }
          case "SET_STYLESHEET": {
            const { stylesheet } = event.data.payload as { stylesheet: string };
            let stylesheetElement = document.getElementById(
              CONFIG.OVERRIDE_STYLESHEET_ID
            );
            if (stylesheetElement) {
              stylesheetElement.innerHTML = stylesheet;
            } else {
              const head = document.getElementsByTagName("head")[0];
              stylesheetElement = document.createElement("style");
              stylesheetElement.id = CONFIG.OVERRIDE_STYLESHEET_ID;
              stylesheetElement.innerHTML = stylesheet;
              head.appendChild(stylesheetElement);
            }
            break;
          }
          case "EDIT_TEXT_REQUESTED": {
            const { id } = event.data.payload as { id: ElementLocation };
            findElementsByLocation({
              filePath: id.filePath,
              lineNumber: id.lineNumber,
              col: id.col,
            }).forEach((element) => {
              if (!(element instanceof HTMLElement)) return;
              element.setAttribute("contenteditable", "true");
              element.focus();
              const inputHandler = (): void => {
                sendMessageToAllowedOrigins({
                  type: "ELEMENT_TEXT_UPDATED",
                  payload: { id, content: element.innerText },
                });
              };
              const blurHandler = (): void => {
                element.removeAttribute("contenteditable");
                element.removeEventListener("input", inputHandler);
                element.removeEventListener("blur", blurHandler);
              };
              element.addEventListener("input", inputHandler);
              element.addEventListener("blur", blurHandler);
            });
            break;
          }
          case "HOVER_ELEMENT_REQUESTED": {
            const { id } = event.data.payload as { id: ElementLocation };
            document
              .querySelectorAll(`[${CONFIG.HOVERED_ATTR}]`)
              .forEach((element) => {
                element.removeAttribute(CONFIG.HOVERED_ATTR);
              });
            findElementsByLocation({
              filePath: id.filePath,
              lineNumber: id.lineNumber,
              col: id.col,
            }).forEach((element) => {
              element.setAttribute(CONFIG.HOVERED_ATTR, "true");
            });
            break;
          }
          case "UNHOVER_ELEMENT_REQUESTED": {
            const { id } = event.data.payload as { id: ElementLocation };
            findElementsByLocation({
              filePath: id.filePath,
              lineNumber: id.lineNumber,
              col: id.col,
            }).forEach((element) => {
              element.removeAttribute(CONFIG.HOVERED_ATTR);
            });
            break;
          }
          case "GET_PARENT_ELEMENT": {
            const { id } = event.data.payload as { id: ElementLocation };
            const parentElement = findElementsByLocation({
              filePath: id.filePath,
              lineNumber: id.lineNumber,
              col: id.col,
            })[0]?.parentElement;
            if (
              !parentElement ||
              parentElement.id === "root" ||
              ["HTML", "BODY"].includes(parentElement.tagName)
            ) {
              sendMessageToAllowedOrigins({
                type: "PARENT_ELEMENT",
                payload: null,
              });
            } else {
              sendMessageToAllowedOrigins({
                type: "PARENT_ELEMENT",
                payload: serializeElementData(parentElement),
              });
            }
            break;
          }
          case "REQUEST_COMPONENT_TREE":
            sendComponentTree();
            break;
          case "RELOAD_PAGE": {
            window.location.reload();
            break;
          }
          case "CONSOLE_OUTPUT": {
            break;
          }
          default:
            console.warn("Unknown message type:", event.data.type);
        }
      } catch (error) {
        console.error("Error handling message:", error);
        removeSelectorEventListeners();
        selectorState.reset();
      }
    }

    /**
     * Updates mouse position for scroll-related updates
     * @param event - The mouse event
     */
    function updateMousePosition(event: MouseEvent): void {
      selectorState.mouseX = event.clientX;
      selectorState.mouseY = event.clientY;
    }

    /**
     * Requests the current picker state and selected elements
     */
    function requestSelectorState(): void {
      sendMessageToAllowedOrigins({ type: "REQUEST_PICKER_STATE" });
      sendMessageToAllowedOrigins({ type: "REQUEST_SELECTED_ELEMENTS" });
    }

    createTooltipAndStyle();
    window.addEventListener("message", handleMessageEvent);
    document.addEventListener("mousemove", updateMousePosition);
    sendMessageToAllowedOrigins({
      type: "SELECTOR_SCRIPT_LOADED",
      payload: {
        // @ts-expect-error no need to type this
        version: window.IMAGINE_SELECTOR_SCRIPT_VERSION,
      },
    });
    waitForRootElement().then(() => {
      requestSelectorState();
    });

    /**
     * Handles element click events for selection
     * @param event - The mouse event
     */
    function handleElementClick(event: MouseEvent): void {
      if (
        selectorState.isActive &&
        isSelectableElement(event.target as Element) &&
        (event.target as HTMLElement).tagName.toLowerCase() !== "html" &&
        !isInSvgContext(event.target as Element)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (selectorState.hoveredElement) {
          const elementData = serializeElementData(
            selectorState.hoveredElement
          );
          selectorState.hoveredElement.setAttribute(
            CONFIG.SELECTED_ATTR,
            "true"
          );
          if (
            Math.abs(
              selectorState.hoveredElement.getBoundingClientRect().width -
                window.innerWidth
            ) < 5
          ) {
            selectorState.hoveredElement.setAttribute(
              "data-full-width",
              "true"
            );
          }
          sendMessageToAllowedOrigins({
            type: "ELEMENT_CLICKED",
            payload: elementData,
            isMultiSelect: event.metaKey || event.ctrlKey,
          });
        }
      }
    }

    /**
     * Handles element double-click events for interaction
     * @param event - The mouse event
     */
    function handleElementDoubleClick(event: MouseEvent): void {
      if (
        !selectorState.isActive ||
        !isSelectableElement(event.target as Element) ||
        (event.target as HTMLElement).tagName.toLowerCase() === "html" ||
        isInSvgContext(event.target as Element)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const elementData = serializeElementData(event.target as Element);
      sendMessageToAllowedOrigins({
        type: "ELEMENT_DOUBLE_CLICKED",
        payload: elementData,
      });
    }
  }

  /**
   * Initializes URL change observer to detect navigation
   */
  function initializeUrlChangeObserver(): void {
    /**
     * Sets up mutation observer to detect URL changes
     */
    function onLoad(): void {
      let currentUrl = document.location.href;
      const bodyElement = document.querySelector("body");
      const observer = new MutationObserver(() => {
        if (currentUrl !== document.location.href) {
          currentUrl = document.location.href;
          if (window.top) {
            window.top.postMessage(
              { type: "URL_CHANGED", url: document.location.href },
              "*"
            );
          }
        }
      });
      if (bodyElement) {
        observer.observe(bodyElement, { childList: true, subtree: true });
      }
    }
    window.addEventListener("load", onLoad);
  }
  /**
   * Main initialization function that sets up all functionality
   */
  function initializeScript(): void {
    console.log("[Console Capture] Initializing script");
    initializeUrlChangeObserver();
    patchConsoleMethods();
    initializeErrorHandlers();
    initializeElementSelector();
  }

  initializeScript();
})(window);
