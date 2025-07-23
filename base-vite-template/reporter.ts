(function (window) {
	function post({ type, payload }: { type: string; payload: object }) {
		window.parent.postMessage(
			{
				type,
				payload,
			},
			"*",
		);
	}
	function notifyNavigationChange() {
		post({
			type: "navigation",
			payload: {
				url: window.location.href,
				title: window.document.title,
			},
		});
	}
	function notifyLoaded() {
		post({
			type: "loaded",
			payload: {
				url: window.location.href,
				title: window.document.title,
			},
		});
	}

	const origPushState = window.history.pushState;
	window.history.pushState = function (...args) {
		origPushState.apply(this, args);
		notifyNavigationChange();
	};

	const origReplaceState = window.history.replaceState;
	window.history.replaceState = function (...args) {
		origReplaceState.apply(this, args);
		notifyNavigationChange();
	};

	window.addEventListener("popstate", notifyNavigationChange);
	window.addEventListener("error", function (event) {
		post({
			type: "error",
			payload: {
				message: event.message,
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
				error: event.error
					? {
							message: event.error.message,
							name: event.error.name,
							stack: event.error.stack,
						}
					: null,
			},
		});
	});

	window.addEventListener("unhandledrejection", function (event) {
		post({
			type: "unhandledrejection",
			payload: {
				reason:
					event.reason && typeof event.reason === "object"
						? {
								message: event.reason.message,
								name: event.reason.name,
								stack: event.reason.stack,
							}
						: event.reason,
			},
		});
	});

	if (
		window.document.readyState === "complete" ||
		window.document.readyState === "interactive"
	) {
		// DOMContentLoaded already fired
		notifyLoaded();
	} else {
		window.addEventListener("DOMContentLoaded", function () {
			notifyLoaded();
		});
	}

	window.addEventListener("load", function () {
		notifyLoaded();
	});

	// Report initial navigation
	notifyNavigationChange();
})(window);
