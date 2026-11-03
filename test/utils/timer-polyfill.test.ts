import { describe, it, expect } from 'vitest';
import { installTimerPolyfill } from '../../src/utils/timer-polyfill';

describe('timer-polyfill', () => {
	it('defines unref and ref on Number.prototype', () => {
		installTimerPolyfill();
		expect(typeof (123 as any).unref).toBe('function');
		expect(typeof (123 as any).ref).toBe('function');
	});

	it('returns the number itself when unref/ref are called', () => {
		installTimerPolyfill();
		const id = 42;
		expect((id as any).unref().valueOf()).toBe(42);
		expect((id as any).ref().valueOf()).toBe(42);
	});

	it('allows setTimeout(...).unref() when setTimeout returns a number', () => {
		installTimerPolyfill();
		// In browser/renderer environments, setTimeout returns a number
		const timerId = 9999;
		expect(() => {
			(timerId as any).unref();
		}).not.toThrow();
	});

	it('is idempotent when called multiple times', () => {
		installTimerPolyfill();
		installTimerPolyfill();
		expect(typeof (123 as any).unref).toBe('function');
	});
});
