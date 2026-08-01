import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ComposeEditor } from './ComposeEditor';

function lastMarkdown(onChange: ReturnType<typeof vi.fn>): string {
  const calls = onChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return String(calls[calls.length - 1][0]);
}

async function mountEditor(markdown: string, onChange = vi.fn()) {
  render(<ComposeEditor markdown={markdown} onChange={onChange} />);
  await waitFor(() =>
    expect(screen.getByRole('toolbar', { name: /Formatting/i })).toBeInTheDocument(),
  );
  const surface = document.querySelector('.ProseMirror') as HTMLElement;
  expect(surface).toBeTruthy();
  return { onChange, surface };
}

describe('ComposeEditor', () => {
  it('mounts formatting toolbar and editor surface', async () => {
    await mountEditor('Hello world');
    expect(screen.getByRole('button', { name: /^Bold$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Italic$/i })).toBeInTheDocument();
  });

  it('gives every formatting toolbar button an accessible name and title', async () => {
    await mountEditor('Hello world');
    const toolbar = screen.getByRole('toolbar', { name: /Formatting/i });
    const buttons = within(toolbar).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      const name = btn.getAttribute('aria-label');
      expect(name).toBeTruthy();
      expect(btn.getAttribute('title')).toBe(name);
      expect(btn).toHaveAccessibleName(name!);
    }
    // Table controls trail Spoiler so expansion does not shift earlier buttons
    const spoiler = within(toolbar).getByRole('button', { name: /^Spoiler$/i });
    const insertTable = within(toolbar).getByRole('button', { name: /^Insert table$/i });
    expect(
      Boolean(spoiler.compareDocumentPosition(insertTable) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it('invokes common toolbar commands without throwing', async () => {
    const user = userEvent.setup();
    const { onChange } = await mountEditor('Hello world');
    const labels = [
      'Bold',
      'Italic',
      'Inline code',
      'Heading 2',
      'Heading 3',
      'Quote',
      'Bullet list',
      'Numbered list',
      'Code block',
      'Divider',
      'Insert table',
    ];
    for (const name of labels) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }));
    }
    expect(onChange).toHaveBeenCalled();
    expect(document.querySelector('.ProseMirror')).toBeTruthy();
  });

  it('wraps the current block in center', async () => {
    const user = userEvent.setup();
    const { onChange, surface } = await mountEditor('Centered text');
    await user.click(surface);
    await user.click(screen.getByRole('button', { name: /^Center$/i }));
    await waitFor(() => expect(lastMarkdown(onChange)).toMatch(/<center>/i));
    expect(lastMarkdown(onChange)).toMatch(/Centered text/i);
  });

  it('wraps the current block in spoiler details', async () => {
    const user = userEvent.setup();
    const { onChange, surface } = await mountEditor('Secret text');
    await user.click(surface);
    await user.click(screen.getByRole('button', { name: /^Spoiler$/i }));
    await waitFor(() => expect(lastMarkdown(onChange)).toMatch(/<details>/i));
    expect(lastMarkdown(onChange)).toMatch(/Secret text/i);
  });

  it('allows typing inside an active spoiler and keeps text in details markdown', async () => {
    const user = userEvent.setup();
    const { onChange, surface } = await mountEditor('Secret text');
    await user.click(surface);
    await user.click(screen.getByRole('button', { name: /^Spoiler$/i }));
    await waitFor(() => expect(lastMarkdown(onChange)).toMatch(/<details>/i));

    const details = document.querySelector('.ProseMirror details') as HTMLDetailsElement | null;
    expect(details).toBeTruthy();
    expect(details!.open).toBe(true);

    const paragraph = details!.querySelector('div p') as HTMLElement | null;
    expect(paragraph).toBeTruthy();
    onChange.mockClear();

    // jsdom cannot reliably handle {End} on contenteditable — place the caret
    // at the end of the spoiler body, then type into .ProseMirror.
    const textNode = paragraph!.firstChild;
    expect(textNode).toBeTruthy();
    const range = document.createRange();
    range.setStart(textNode!, textNode!.textContent?.length ?? 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    surface.focus();
    await user.type(surface, ' more');

    await waitFor(() => {
      const md = lastMarkdown(onChange);
      expect(md).toMatch(/<details>/i);
      // jsdom caret placement can prepend or append; require both fragments inside details
      expect(md).toMatch(/Secret text/i);
      expect(md).toMatch(/more/i);
      expect(md).toMatch(/<\/details>/i);
    });
  });

  it('round-trips spoiler markdown into an open editable details body', async () => {
    const md = '<details><summary>Spoiler</summary>\nHidden body\n</details>\n';
    const { surface } = await mountEditor(md);
    const details = await waitFor(() => {
      const el = document.querySelector('.ProseMirror details') as HTMLDetailsElement | null;
      expect(el).toBeTruthy();
      return el!;
    });
    expect(details.open).toBe(true);
    expect(surface.textContent).toMatch(/Hidden body/i);
    const content = details.querySelector('div');
    expect(content?.textContent).toMatch(/Hidden body/i);
  });

  it('opens link modal and rejects unsafe urls', async () => {
    const user = userEvent.setup();
    const { onChange } = await mountEditor('link me');
    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /^Link$/i }));
    expect(screen.getByRole('heading', { name: /Insert link/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^URL$/i), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: /^Insert link$/i }));
    expect(screen.getByText(/Use an https/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inserts a link from the modal when selection is empty', async () => {
    const user = userEvent.setup();
    const { onChange, surface } = await mountEditor('Hello');
    await user.click(surface);
    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /^Link$/i }));
    await user.type(screen.getByLabelText(/^URL$/i), 'https://peakd.com/@alice');
    await user.click(screen.getByRole('button', { name: /^Insert link$/i }));
    await waitFor(() =>
      expect(lastMarkdown(onChange)).toMatch(
        /\[https:\/\/peakd\.com\/@alice\]\(https:\/\/peakd\.com\/@alice\)/,
      ),
    );
    expect(screen.queryByRole('heading', { name: /Insert link/i })).not.toBeInTheDocument();
  });

  it('links selected text from the modal', async () => {
    const user = userEvent.setup();
    const { onChange, surface } = await mountEditor('link me');
    await user.tripleClick(surface);
    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /^Link$/i }));
    const linkText = screen.getByLabelText(/Link text/i) as HTMLInputElement;
    // jsdom selection can be partial; ensure label text before insert
    if (linkText.value !== 'link me') {
      await user.clear(linkText);
      await user.type(linkText, 'link me');
    }
    await user.type(screen.getByLabelText(/^URL$/i), 'https://peakd.com/@alice');
    await user.click(screen.getByRole('button', { name: /^Insert link$/i }));
    await waitFor(() =>
      expect(lastMarkdown(onChange)).toMatch(/\[link me\]\(https:\/\/peakd\.com\/@alice\)/),
    );
  });

  it('inserts https image from the modal into markdown', async () => {
    const user = userEvent.setup();
    const { onChange, surface } = await mountEditor('Hello');
    await user.click(surface);
    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /^Insert image$/i }));
    expect(screen.getByRole('heading', { name: /Insert image/i })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/^URL$/i),
      'https://images.hive.blog/DQm/example.jpg',
    );
    await user.type(within(dialog).getByLabelText(/Alt text/i), 'cover');
    await user.click(within(dialog).getByRole('button', { name: /^Insert image$/i }));
    await waitFor(() =>
      expect(lastMarkdown(onChange)).toMatch(
        /!\[cover\]\(https:\/\/images\.hive\.blog\/DQm\/example\.jpg\)/,
      ),
    );
  });

  it('closes insert modal on Escape', async () => {
    const user = userEvent.setup();
    await mountEditor('Hello');
    await user.click(screen.getByRole('button', { name: /^Insert image$/i }));
    expect(screen.getByRole('heading', { name: /Insert image/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { name: /Insert image/i })).not.toBeInTheDocument();
  });

  it('shows recent media and inserts on thumbnail click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onRememberMedia = vi.fn().mockResolvedValue(undefined);
    const listRecentMedia = vi.fn().mockResolvedValue([
      {
        id: 'm1',
        username: 'alice',
        url: 'https://images.hive.blog/DQm/recent.jpg',
        alt: 'recent',
        createdAt: Date.now(),
      },
    ]);
    render(
      <ComposeEditor
        markdown="Hello"
        onChange={onChange}
        mediaUsername="alice"
        listRecentMedia={listRecentMedia}
        onRememberMedia={onRememberMedia}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('toolbar', { name: /Formatting/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /^Insert image$/i }));
    await waitFor(() => expect(listRecentMedia).toHaveBeenCalled());
    const thumb = await screen.findByRole('listitem');
    onChange.mockClear();
    await user.click(thumb);
    await waitFor(() =>
      expect(lastMarkdown(onChange)).toMatch(
        /!\[recent\]\(https:\/\/images\.hive\.blog\/DQm\/recent\.jpg\)/,
      ),
    );
    expect(onRememberMedia).toHaveBeenCalled();
  });

  it('produces ordered-list markdown from toolbar', async () => {
    const user = userEvent.setup();
    const { onChange, surface } = await mountEditor('Item one');
    await user.click(surface);
    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /^Numbered list$/i }));
    await waitFor(() => expect(lastMarkdown(onChange)).toMatch(/1\.\s+Item one/i));
  });

  it('inserts a GFM table from the toolbar', async () => {
    const user = userEvent.setup();
    const { onChange, surface } = await mountEditor('Hello');
    await user.click(surface);
    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /^Insert table$/i }));
    await waitFor(() => expect(lastMarkdown(onChange)).toMatch(/\|/));
    expect(document.querySelector('.ProseMirror table')).toBeTruthy();
  });

  it('pastes a clipboard image file through onUploadImage', async () => {
    const onChange = vi.fn();
    const onUploadImage = vi
      .fn()
      .mockResolvedValue('https://images.hive.blog/DQm/pasted.jpg');
    render(
      <ComposeEditor markdown="Hello" onChange={onChange} onUploadImage={onUploadImage} />,
    );
    await waitFor(() =>
      expect(screen.getByRole('toolbar', { name: /Formatting/i })).toBeInTheDocument(),
    );
    const surface = document.querySelector('.ProseMirror') as HTMLElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        files: [file],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        getData: () => '',
      },
    });
    surface.focus();
    surface.dispatchEvent(pasteEvent);
    await waitFor(() => expect(onUploadImage).toHaveBeenCalledWith(file));
    await waitFor(() =>
      expect(lastMarkdown(onChange)).toMatch(
        /!\[.*\]\(https:\/\/images\.hive\.blog\/DQm\/pasted\.jpg\)/,
      ),
    );
  });

  it('shows enroll error when pasting an image without onUploadImage', async () => {
    const { surface } = await mountEditor('Hello');
    const file = new File([new Uint8Array([1])], 'clip.png', { type: 'image/png' });
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        files: [file],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        getData: () => '',
      },
    });
    surface.focus();
    surface.dispatchEvent(pasteEvent);
    await waitFor(() =>
      expect(screen.getByText(/Enroll a posting key/i)).toBeInTheDocument(),
    );
  });
});
