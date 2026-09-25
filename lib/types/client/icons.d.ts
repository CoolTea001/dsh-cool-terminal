/**
 * The plugin's own icon set, rendered from the SVG artwork under
 * `src/client/assets/`. The client bundle is one JS file the platform's
 * module loader evaluates, so sibling asset files would never be fetched;
 * tsdown.config.ts inlines the artwork at build time as the `__DSH_CT_ICONS__`
 * string map this module consumes (keyed by asset filename stem).
 *
 * The artwork is 24-unit Feather-style stroke markup riding `currentColor`,
 * so every glyph tints with the surrounding CSS. `.dsh-ct-svg` keeps a glyph
 * on the 16px square the action buttons, the menu icon slot, and the sidebar
 * markers all expect; pass `className` to override that seat.
 */
import * as React from 'react';
/** Props shared by the plugin's icon components. */
export interface DshCtIconProps {
    /** Extra class for layout placement; defaults to the shared 16px seat. */
    className?: string | undefined;
}
/** A console's leading mark (assets/terminal.svg). */
export declare const IconTerminal: ({ className }: DshCtIconProps) => React.ReactElement;
/** Sidebar group marker when a Workspace is collapsed (assets/folder-closed.svg). */
export declare const IconFolderClosed: ({ className }: DshCtIconProps) => React.ReactElement;
/** Sidebar group marker when a Workspace is expanded (assets/folder-opened.svg). */
export declare const IconFolderOpened: ({ className }: DshCtIconProps) => React.ReactElement;
/** Row overflow trigger glyph (assets/more.svg). */
export declare const IconMore: ({ className }: DshCtIconProps) => React.ReactElement;
/** Add a console (assets/plus.svg). */
export declare const IconPlus: ({ className }: DshCtIconProps) => React.ReactElement;
/** Rename a console (the menu's row glyph, assets/edit.svg). */
export declare const IconEdit: ({ className }: DshCtIconProps) => React.ReactElement;
/** Delete a console (the menu's destructive row glyph, assets/trash.svg). */
export declare const IconTrash: ({ className }: DshCtIconProps) => React.ReactElement;
//# sourceMappingURL=icons.d.ts.map