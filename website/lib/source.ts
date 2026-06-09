import { loader } from 'fumadocs-core/source';
import { docs } from '@/.source';

const raw = docs.toFumadocsSource();
// fumadocs-mdx 11.10 hands `files` back as a lazy function; fumadocs-core 15.8's loader
// expects a resolved array. Resolve it while keeping the original (typed) source spread,
// so page data typing (body/toc/structuredData) is preserved.
const lazyFiles = raw.files as unknown;
const files = typeof lazyFiles === 'function' ? (lazyFiles as () => typeof raw.files)() : raw.files;

export const source = loader({ ...raw, files }, { baseUrl: '/docs' });
