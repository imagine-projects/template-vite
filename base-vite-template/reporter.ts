(function (window) {
	function post({ type, payload }: { type: string; payload: object }) {
		console.log({ type, payload });
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
			payload: { url: window.location.href },
		});
	}

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

	notifyNavigationChange()
})(window);
