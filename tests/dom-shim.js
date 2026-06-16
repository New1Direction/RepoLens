// tests/dom-shim.js
// A tiny, dependency-free DOM sufficient to exercise canvas-engine.js under
// Vitest WITHOUT pulling in jsdom (the repo intentionally ships no DOM dep and
// `npm install` is off-limits). It implements only the surface canvas-engine
// and its spec touch: element creation (HTML + SVG namespace), append,
// innerHTML reset, dataset, classList, attributes, textContent, addEventListener,
// and `[attr]` / `[attr="value"]` query selectors. It is NOT a general DOM.
//
// Paired with tests/dom-environment.js, which registers this as the Vitest
// environment named in tests/canvas-engine.test.js.

const ATTR_RE = /\[([a-zA-Z0-9-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/;

class ClassList {
  constructor(el) { this._el = el; this._set = new Set(); }
  _sync() { this._el._attrs.class = [...this._set].join(' '); }
  add(...names) { for (const n of names) this._set.add(n); this._sync(); }
  remove(...names) { for (const n of names) this._set.delete(n); this._sync(); }
  toggle(name, force) {
    const on = force === undefined ? !this._set.has(name) : !!force;
    if (on) this._set.add(name); else this._set.delete(name);
    this._sync();
    return on;
  }
  contains(name) { return this._set.has(name); }
}

class El {
  constructor(tag, ns = null) {
    this.tagName = String(tag).toUpperCase();
    this.localName = String(tag);
    this.namespaceURI = ns;
    this.childNodes = [];
    this.parentNode = null;
    this._attrs = Object.create(null);
    this._text = '';
    this._listeners = Object.create(null);
    this.classList = new ClassList(this);
    this.dataset = new Proxy(Object.create(null), {
      set: (t, prop, value) => {
        t[prop] = String(value);
        this._attrs['data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())] = String(value);
        return true;
      },
      get: (t, prop) => t[prop],
    });
  }

  setAttribute(name, value) {
    if (name === 'class') {
      this.classList._set = new Set(String(value).split(/\s+/).filter(Boolean));
    }
    this._attrs[name] = String(value);
  }
  getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; }
  removeAttribute(name) { delete this._attrs[name]; }
  hasAttribute(name) { return name in this._attrs; }

  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) node.parentNode._remove(node);
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  _remove(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) this.childNodes.splice(i, 1);
    node.parentNode = null;
  }

  set innerHTML(v) {
    // canvas-engine only ever assigns '' to wipe the host; support that.
    if (v === '' || v == null) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes = [];
    } else {
      throw new Error('dom-shim: innerHTML only supports clearing with ""');
    }
  }
  get innerHTML() { return ''; }

  set textContent(v) { this._text = String(v); for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; }
  get textContent() {
    if (this.childNodes.length === 0) return this._text;
    return this.childNodes.map((c) => c.textContent).join('');
  }

  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const list = this._listeners[type];
    if (list) this._listeners[type] = list.filter((f) => f !== fn);
  }

  setPointerCapture() {}
  releasePointerCapture() {}

  _matches(attr, value) {
    if (!(attr in this._attrs)) return false;
    if (value === undefined) return true;
    return this._attrs[attr] === value;
  }

  _walk(out) {
    for (const c of this.childNodes) {
      out.push(c);
      if (c._walk) c._walk(out);
    }
    return out;
  }

  querySelectorAll(selector) {
    const m = ATTR_RE.exec(selector);
    if (!m) return [];
    const attr = m[1];
    const value = m[2] ?? m[3] ?? m[4];
    return this._walk([]).filter((node) => node._matches && node._matches(attr, value));
  }
  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length ? all[0] : null;
  }
}

export function createDocument() {
  const document = {
    createElement: (tag) => new El(tag, 'http://www.w3.org/1999/xhtml'),
    createElementNS: (ns, tag) => new El(tag, ns),
  };
  document.body = new El('body', 'http://www.w3.org/1999/xhtml');
  document.documentElement = new El('html', 'http://www.w3.org/1999/xhtml');
  return document;
}
