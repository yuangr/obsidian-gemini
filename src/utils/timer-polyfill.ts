declare global {
	interface Number {
		unref?(): this;
		ref?(): this;
	}
}

/**
 * In Electron's renderer process (Obsidian), `window.setTimeout` and `window.setInterval`
 * return integer timer IDs, unlike Node.js where they return `Timeout` objects with
 * `.unref()` and `.ref()` methods.
 *
 * Node-targeted libraries like `@modelcontextprotocol/sdk` call `setTimeout(...).unref()`,
 * which throws `TypeError: setTimeout(...).unref is not a function` in browser/Electron
 * renderer environments.
 *
 * By attaching non-enumerable `unref` and `ref` methods to `Number.prototype`, any
 * numeric timer ID can safely be chained with `.unref()` or `.ref()` without throwing.
 */
export function installTimerPolyfill(): void {
	if (typeof Number.prototype.unref !== 'function') {
		Object.defineProperty(Number.prototype, 'unref', {
			value: function (this: number): number {
				return this;
			},
			writable: true,
			configurable: true,
			enumerable: false,
		});
	}
	if (typeof Number.prototype.ref !== 'function') {
		Object.defineProperty(Number.prototype, 'ref', {
			value: function (this: number): number {
				return this;
			},
			writable: true,
			configurable: true,
			enumerable: false,
		});
	}
}

// Automatically invoke on module load so importing this module is sufficient.
installTimerPolyfill();
