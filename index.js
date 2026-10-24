/**
 * Host half of @local/dsh-desktop-notify.
 *
 * The whole capability lives in the browser (Client) half: the DSH Web GUI runs
 * inside Electron, where the page may raise native Windows toast notifications
 * and navigate on click. This Host row exists only so the bundle appears in the
 * Loader / Plugin inventory; it registers nothing host-side.
 */
export function apply() {}
