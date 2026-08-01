import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

export const Center = Node.create({
  name: 'center',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'center' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['center', mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * Hive spoiler (`<details>` / `<summary>`).
 *
 * Kept open while editing: a closed `<details>` hides the content hole, so the
 * caret cannot be placed in the body. Summary is non-editable and clicks on it
 * are prevented from toggling closed.
 */
export const Spoiler = Node.create({
  name: 'spoiler',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [
      {
        tag: 'details',
        contentElement(node) {
          const el = node as HTMLElement;
          const div = el.querySelector(':scope > div');
          if (div) return div as HTMLElement;
          // Markdown islands may omit the wrapper div — skip <summary>.
          const wrap = el.ownerDocument.createElement('div');
          Array.from(el.childNodes).forEach((child) => {
            if ((child as HTMLElement).tagName === 'SUMMARY') return;
            wrap.appendChild(child.cloneNode(true));
          });
          return wrap;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'details',
      // Always open in the editor so the content hole stays visible/editable.
      mergeAttributes(HTMLAttributes, { open: '' }),
      ['summary', { contenteditable: 'false' }, 'Spoiler'],
      ['div', {}, 0],
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click(view, event) {
              const target = event.target as HTMLElement | null;
              if (!target) return false;
              const summary = target.closest('summary');
              const details = summary?.closest('details');
              if (!summary || !details || !view.dom.contains(details)) return false;
              // Prevent native toggle-closed; keep body editable.
              event.preventDefault();
              details.open = true;
              return true;
            },
          },
        },
      }),
    ];
  },
});

export const PullLeft = Node.create({
  name: 'pullLeft',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div.pull-left' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'pull-left' }), 0];
  },
});

export const PullRight = Node.create({
  name: 'pullRight',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div.pull-right' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'pull-right' }), 0];
  },
});
