/**
 * Package-owned stylesheet for the terminal tab.
 *
 * Colors read the active theme tokens, so the tab follows the appearance the
 * user selected (including third-party theme presets) instead of forcing a
 * fixed dark terminal look. The sidebar mirrors the shipped sidebar's row
 * rhythm (28px headers, 26px rows, 8px radii, hover/active tokens) so the two
 * surfaces read as one product.
 *
 * xterm's own stylesheet is inlined too; it arrives as a build-time `define`
 * (see tsdown.config.ts) because the platform module loader loads this package
 * as a single JS file and would never fetch a sibling `.css` asset.
 */
export declare const TERMINAL_CSS: string;
/**
 * Insert the stylesheet once for the plugin lifetime.
 *
 * @returns disposer that removes exactly this element.
 */
export declare function insertTerminalStyles(): () => void;
//# sourceMappingURL=styles.d.ts.map