import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

// Static search index so the docs export to plain HTML (`output: export`) for
// GitHub Pages. The client (app/layout.tsx) is configured for static search.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source);
